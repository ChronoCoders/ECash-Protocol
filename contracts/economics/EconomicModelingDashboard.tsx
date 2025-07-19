// Economic simulation engine
  const runEconomicSimulation = useCallback(async (scenarioId: string) => {
    if (!currentParameters) {
      toast.error('Economic parameters not loaded')
      return
    }

    const scenario = MARKET_SCENARIOS.find(s => s.id === scenarioId)
    if (!scenario) {
      toast.error('Scenario not found')
      return
    }

    setIsSimulating(true)
    toast.info(`Running simulation: ${scenario.name}`)

    try {
      const results: SimulationResult[] = []
      let currentSupply = 1000000 // Initial supply: 1M tokens
      let consecutiveRebases = 0
      let stabilityDuration = 0
      let lastRebaseTime = 0
      
      // Calculate time step (scenario duration divided by price sequence length)
      const timeStep = (scenario.duration * 3600) / scenario.priceSequence.length // in seconds
      
      for (let i = 0; i < scenario.priceSequence.length; i++) {
        const currentTime = i * timeStep
        const currentPrice = scenario.priceSequence[i]
        const deviation = Math.abs(currentPrice - 1.0) / 1.0 // Deviation from $1.00
        
        // Determine stability band
        const band = getStabilityBand(deviation, currentParameters.stabilityBands)
        
        // Calculate dynamic cooldown
        const volatilityScore = getVolatilityScore(scenario.priceSequence, i)
        const dynamicCooldown = calculateDynamicCooldown(
          deviation,
          volatilityScore,
          currentParameters,
          consecutiveRebases,
          stabilityDuration
        )
        
        // Check if rebase should occur
        let rebaseAmount = 0
        let bandUsed = 0
        
        if (currentTime - lastRebaseTime >= dynamicCooldown && deviation > 0.005) { // 0.5% minimum threshold
          // Calculate rebase amount
          const rawRebaseAmount = currentSupply * deviation
          rebaseAmount = rawRebaseAmount * band.dampingFactor
          
          // Enforce maximum rebase amount
          const maxRebase = currentSupply * band.maxRebaseAmount
          if (Math.abs(rebaseAmount) > maxRebase) {
            rebaseAmount = Math.sign(rebaseAmount) * maxRebase
          }
          
          // Apply rebase direction
          rebaseAmount = currentPrice > 1.0 ? rebaseAmount : -rebaseAmount
          
          // Update supply
          currentSupply += rebaseAmount
          
          // Update tracking variables
          lastRebaseTime = currentTime
          consecutiveRebases++
          stabilityDuration = 0
          bandUsed = band.level
        } else {
          // No rebase occurred
          if (deviation <= 0.01) { // Within 1% is considered stable
            stabilityDuration += timeStep
          }
          if (currentTime - lastRebaseTime >= dynamicCooldown * 2) {
            consecutiveRebases = 0 // Reset if enough time has passed
          }
        }
        
        // Calculate stability score (0-100)
        const stabilityScore = Math.max(0, 100 - (deviation * 100))
        
        // Calculate economic efficiency
        const economicEfficiency = calculateEconomicEfficiency(
          deviation,
          volatilityScore,
          stabilityScore,
          consecutiveRebases
        )
        
        results.push({
          timestamp: currentTime,
          price: currentPrice,
          supply: currentSupply,
          deviation: deviation,
          rebaseAmount: rebaseAmount,
          cooldownUsed: dynamicCooldown / 3600, // Convert to hours
          bandUsed: bandUsed,
          stabilityScore: stabilityScore,
          economicEfficiency: economicEfficiency
        })
        
        // Simulate delay for visual effect
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      
      setSimulationResults(results)
      
      // Generate optimization recommendations
      const optimizations = generateOptimizationRecommendations(results, currentParameters)
      setOptimizationTargets(optimizations)
      
      toast.success(`Simulation completed: ${scenario.name}`)
      
    } catch (error) {
      console.error('Simulation failed:', error)
      toast.error('Simulation failed')
    } finally {
      setIsSimulating(false)
    }
  }, [currentParameters])

  // Helper functions for simulation
  const getStabilityBand = useCallback((deviation: number, bands: StabilityBand[]): StabilityBand => {
    for (const band of bands) {
      if (deviation <= band.threshold) {
        return band
      }
    }
    return bands[bands.length - 1] // Return highest band if no match
  }, [])

  const getVolatilityScore = useCallback((priceSequence: number[], currentIndex: number): number => {
    const lookback = Math.min(5, currentIndex + 1) // Look at last 5 data points
    if (lookback < 2) return 0
    
    let volatility = 0
    for (let i = currentIndex - lookback + 2; i <= currentIndex; i++) {
      const change = Math.abs(priceSequence[i] - priceSequence[i - 1]) / priceSequence[i - 1]
      volatility += change
    }
    
    return Math.min(100, (volatility / (lookback - 1)) * 100) // Normalize to 0-100
  }, [])

  const calculateDynamicCooldown = useCallback((
    deviation: number,
    volatility: number,
    params: EconomicParameters,
    consecutiveRebases: number,
    stabilityDuration: number
  ): number => {
    let cooldown = params.baseRebaseCooldown
    
    // Adjust for volatility (higher volatility = shorter cooldown)
    if (volatility > params.volatilityThreshold * 100) {
      const volatilityFactor = volatility / (params.volatilityThreshold * 100)
      cooldown = cooldown / volatilityFactor
    }
    
    // Adjust for stability duration (longer stability = longer cooldown)
    if (stabilityDuration > 86400) { // 1 day
      const stabilityBonus = (stabilityDuration / 86400) * params.stabilityPremium
      cooldown = cooldown * (1 + stabilityBonus)
    }
    
    // Adjust for consecutive rebases (more rebases = longer cooldown)
    if (consecutiveRebases > 2) {
      const rebasePenalty = (consecutiveRebases - 2) * 0.2 // 20% penalty per extra rebase
      cooldown = cooldown * (1 + rebasePenalty)
    }
    
    // Enforce bounds
    return Math.max(params.minRebaseCooldown, Math.min(params.maxRebaseCooldown, cooldown))
  }, [])

  const calculateEconomicEfficiency = useCallback((
    deviation: number,
    volatility: number,
    stabilityScore: number,
    consecutiveRebases: number
  ): number => {
    // Combine multiple factors for overall efficiency
    const deviationScore = Math.max(0, 100 - (deviation * 100))
    const volatilityScore = Math.max(0, 100 - volatility)
    const rebaseEfficiency = Math.max(0, 100 - (consecutiveRebases * 10))
    
    return (deviationScore + volatilityScore + stabilityScore + rebaseEfficiency) / 4
  }, [])

  // Generate optimization recommendations based on simulation results
  const generateOptimizationRecommendations = useCallback((
    results: SimulationResult[],
    params: EconomicParameters
  ): OptimizationTarget[] => {
    const recommendations: OptimizationTarget[] = []
    
    // Analyze average deviation
    const avgDeviation = results.reduce((sum, r) => sum + r.deviation, 0) / results.length
    const avgStability = results.reduce((sum, r) => sum + r.stabilityScore, 0) / results.length
    const avgEfficiency = results.reduce((sum, r) => sum + r.economicEfficiency, 0) / results.length
    
    // Rebase frequency optimization
    const totalRebases = results.filter(r => r.rebaseAmount !== 0).length
    const rebaseFrequency = totalRebases / results.length
    
    if (rebaseFrequency > 0.3) { // More than 30% of time periods had rebases
      recommendations.push({
        parameter: 'baseRebaseCooldown',
        currentValue: params.baseRebaseCooldown / 3600,
        suggestedValue: (params.baseRebaseCooldown * 1.2) / 3600,
        improvement: 15,
        reasoning: 'High rebase frequency detected. Increasing cooldown may improve stability.'
      })
    } else if (rebaseFrequency < 0.1 && avgDeviation > 0.02) {
      recommendations.push({
        parameter: 'baseRebaseCooldown',
        currentValue: params.baseRebaseCooldown / 3600,
        suggestedValue: (params.baseRebaseCooldown * 0.8) / 3600,
        improvement: 10,
        reasoning: 'Low rebase frequency with high deviation. Reducing cooldown may improve responsiveness.'
      })
    }
    
    // Stability band optimization
    const band1Usage = results.filter(r => r.bandUsed === 1).length
    const band4Usage = results.filter(r => r.bandUsed === 4).length
    
    if (band4Usage > results.length * 0.2) { // More than 20% extreme band usage
      recommendations.push({
        parameter: 'volatilityThreshold',
        currentValue: params.volatilityThreshold * 100,
        suggestedValue: params.volatilityThreshold * 80, // Reduce by 20%
        improvement: 20,
        reasoning: 'High extreme volatility usage. Lowering threshold may trigger earlier interventions.'
      })
    }
    
    // Dampening factor optimization
    if (avgStability < 70) {
      recommendations.push({
        parameter: 'dampingFactor_band2',
        currentValue: params.stabilityBands[1].dampingFactor * 100,
        suggestedValue: params.stabilityBands[1].dampingFactor * 120, // Increase by 20%
        improvement: 12,
        reasoning: 'Low stability score. Increasing dampening for medium deviations may help.'
      })
    }
    
    return recommendations
  }, [])

  // Apply optimization recommendation
  const applyOptimization = useCallback(async (optimization: OptimizationTarget) => {
    try {
      // In real implementation, this would call the smart contract
      toast.info(`Applying optimization: ${optimization.parameter}`)
      
      // Update local parameters for immediate simulation
      if (currentParameters) {
        const updatedParams = { ...currentParameters }
        
        switch (optimization.parameter) {
          case 'baseRebaseCooldown':
            updatedParams.baseRebaseCooldown = optimization.suggestedValue * 3600
            break
          case 'volatilityThreshold':
            updatedParams.volatilityThreshold = optimization.suggestedValue / 100
            break
          // Add other parameter updates as needed
        }
        
        setCurrentParameters(updatedParams)
      }
      
      // Remove applied optimization
      setOptimizationTargets(prev => prev.filter(opt => opt.parameter !== optimization.parameter))
      
      toast.success(`Optimization applied: ${optimization.parameter}`)
    } catch (error) {
      console.error('Failed to apply optimization:', error)
      toast.error('Failed to apply optimization')
    }
  }, [currentParameters])

  // Memoized chart data for performance
  const chartData = useMemo(() => {
    return simulationResults.map((result, index) => ({
      time: index,
      timeLabel: `${(result.timestamp / 3600).toFixed(1)}h`,
      price: result.price,
      supply: result.supply / 1000000, // Convert to millions
      deviation: result.deviation * 100, // Convert to percentage
      rebaseAmount: Math.abs(result.rebaseAmount) / 1000, // Convert to thousands
      stabilityScore: result.stabilityScore,
      economicEfficiency: result.economicEfficiency,
      cooldown: result.cooldownUsed
    }))
  }, [simulationResults])

  const scenarioStats = useMemo(() => {
    if (simulationResults.length === 0) return null
    
    const totalRebases = simulationResults.filter(r => r.rebaseAmount !== 0).length
    const avgDeviation = simulationResults.reduce((sum, r) => sum + r.deviation, 0) / simulationResults.length
    const maxDeviation = Math.max(...simulationResults.map(r => r.deviation))
    const avgStability = simulationResults.reduce((sum, r) => sum + r.stabilityScore, 0) / simulationResults.length
    const finalSupply = simulationResults[simulationResults.length - 1]?.supply || 0
    const supplyChange = ((finalSupply - 1000000) / 1000000) * 100
    
    return {
      totalRebases,
      avgDeviation: avgDeviation * 100,
      maxDeviation: maxDeviation * 100,
      avgStability,
      supplyChange
    }
  }, [simulationResults])

  if (!isActive) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Economic Modeling</h2>
        <div className="text-center py-8 text-gray-500">
          <div className="mb-4">Economic modeling is inactive</div>
          <div className="text-sm">Connect wallet and deploy contracts to access economic tools</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Economic Modeling & Analysis</h2>
          <p className="text-gray-600">Simulate market scenarios and optimize economic parameters</p>
        </div>
        <div className="flex items-center space-x-4">
          {isSimulating && (
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-blue-600">Simulating...</span>
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {[
            { id: 'scenarios', label: 'Market Scenarios' },
            { id: 'optimization', label: 'Parameter Optimization' },
            { id: 'analysis', label: 'Economic Analysis' },
            { id: 'parameters', label: 'Current Parameters' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Scenarios Tab */}
      {activeTab === 'scenarios' && (
        <div className="space-y-6">
          {/* Scenario Selection */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Market Scenarios</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {MARKET_SCENARIOS.map(scenario => (
                <div
                  key={scenario.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedScenario === scenario.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedScenario(scenario.id)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-gray-900">{scenario.name}</h4>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      scenario.volatilityProfile === 'low' ? 'bg-green-100 text-green-800' :
                      scenario.volatilityProfile === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      scenario.volatilityProfile === 'high' ? 'bg-orange-100 text-orange-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {scenario.volatilityProfile.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{scenario.description}</p>
                  <div className="text-xs text-gray-500">
                    Duration: {scenario.duration} hours • {scenario.priceSequence.length} price points
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Simulation Controls */}
          <div className="flex space-x-4">
            <button
              onClick={() => runEconomicSimulation(selectedScenario)}
              disabled={isSimulating || !currentParameters}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              Run Simulation
            </button>
            {simulationResults.length > 0 && (
              <button
                onClick={() => setSimulationResults([])}
                className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Clear Results
              </button>
            )}
          </div>

          {/* Simulation Results Stats */}
          {scenarioStats && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Total Rebases</h4>
                <div className="text-2xl font-bold text-blue-600">{scenarioStats.totalRebases}</div>
              </div>

              <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Avg Deviation</h4>
                <div className="text-2xl font-bold text-green-600">{scenarioStats.avgDeviation.toFixed(2)}%</div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Max Deviation</h4>
                <div className="text-2xl font-bold text-yellow-600">{scenarioStats.maxDeviation.toFixed(2)}%</div>
              </div>

              <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Avg Stability</h4>
                <div className="text-2xl font-bold text-purple-600">{scenarioStats.avgStability.toFixed(1)}</div>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Supply Change</h4>
                <div className={`text-2xl font-bold ${
                  scenarioStats.supplyChange >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {scenarioStats.supplyChange >= 0 ? '+' : ''}{scenarioStats.supplyChange.toFixed(2)}%
                </div>
              </div>
            </div>
          )}

          {/* Simulation Charts */}
          {chartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Price and Deviation Chart */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Price & Deviation</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timeLabel" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="price" domain={[0.5, 2.0]} tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="deviation" orientation="right" domain={[0, 50]} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Line yAxisId="price" type="monotone" dataKey="price" stroke="#3B82F6" strokeWidth={2} name="Price ($)" />
                      <Line yAxisId="deviation" type="monotone" dataKey="deviation" stroke="#EF4444" strokeWidth={2} name="Deviation (%)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Supply Changes Chart */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Supply Evolution</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timeLabel" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}M`, 'Supply']} />
                      <Area type="monotone" dataKey="supply" stroke="#10B981" fill="#10B981" fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Stability and Efficiency Chart */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900 mb-4">System Performance</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timeLabel" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="stabilityScore" stroke="#8B5CF6" strokeWidth={2} name="Stability Score" />
                      <Line type="monotone" dataKey="economicEfficiency" stroke="#F59E0B" strokeWidth={2} name="Economic Efficiency" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Rebase Activity Chart */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Rebase Activity</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timeLabel" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}K`, 'Rebase Amount']} />
                      <Bar dataKey="rebaseAmount" fill="#F59E0B" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Optimization Tab */}
      {activeTab === 'optimization' && (
        <div className="space-y-6">
          <h3 className="text-lg font-medium text-gray-900">Parameter Optimization Recommendations</h3>
          
          {optimizationTargets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="mb-4">No optimization recommendations available</div>
              <div className="text-sm">Run a market scenario simulation to generate recommendations</div>
            </div>
          ) : (
            <div className="space-y-4">
              {optimizationTargets.map((target, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 mb-2">{target.parameter.replace(/_/g, ' ').toUpperCase()}</h4>
                      <p className="text-gray-600 mb-4">{target.reasoning}</p>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <span className="text-sm text-gray-500">Current Value</span>
                          <div className="font-medium">{target.currentValue.toFixed(2)}</div>
                        </div>
                        <div>
                          <span className="text-sm text-gray-500">Suggested Value</span>
                          <div className="font-medium text-blue-600">{target.suggestedValue.toFixed(2)}</div>
                        </div>
                        <div>
                          <span className="text-sm text-gray-500">Expected Improvement</span>
                          <div className="font-medium text-green-600">+{target.improvement}%</div>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => applyOptimization(target)}
                      className="ml-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Analysis Tab */}
      {activeTab === 'analysis' && (
        <div className="space-y-6">
          <h3 className="text-lg font-medium text-gray-900">Economic Analysis</h3>
          
          {simulationResults.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="mb-4">No simulation data available</div>
              <div className="text-sm">Run a market scenario to view detailed analysis</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Rebase Frequency Analysis */}
              <div className="bg-gray-50 p-6 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-4">Rebase Frequency Analysis</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Rebases:</span>
                    <span className="font-medium">{simulationResults.filter(r => r.rebaseAmount !== 0).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Cooldown Used:</span>
                    <span className="font-medium">
                      {(simulationResults.reduce((sum, r) => sum + r.cooldownUsed, 0) / simulationResults.length).toFixed(1)}h
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Band Usage:</span>
                    <div className="text-right">
                      {[1, 2, 3, 4].map(band => {
                        const usage = simulationResults.filter(r => r.bandUsed === band).length
                        const percentage = (usage / simulationResults.length) * 100
                        return (
                          <div key={band} className="text-sm">
                            Band {band}: {percentage.toFixed(1)}%
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Economic Efficiency Breakdown */}
              <div className="bg-gray-50 p-6 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-4">Efficiency Metrics</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Economic Efficiency:</span>
                    <span className="font-medium">
                      {(simulationResults.reduce((sum, r) => sum + r.economicEfficiency, 0) / simulationResults.length).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Price Stability:</span>
                    <span className="font-medium">
                      {(simulationResults.filter(r => r.deviation <= 0.01).length / simulationResults.length * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">System Responsiveness:</span>
                    <span className="font-medium">
                      {(simulationResults.filter(r => r.deviation > 0.02 && r.rebaseAmount !== 0).length / 
                        simulationResults.filter(r => r.deviation > 0.02).length * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Parameters Tab */}
      {activeTab === 'parameters' && currentParameters && (
        <div className="space-y-6">
          <h3 className="text-lg font-medium text-gray-900">Current Economic Parameters</h3>
          
          {/* Core Parameters */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gray-50 p-6 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-4">Rebase Parameters</h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Base Cooldown:</span>
                  <span className="font-medium">{(currentParameters.baseRebaseCooldown / 3600).toFixed(1)} hours</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Min Cooldown:</span>
                  <span className="font-medium">{(currentParameters.minRebaseCooldown / 3600).toFixed(1)} hours</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Max Cooldown:</span>
                  <span className="font-medium">{(currentParameters.maxRebaseCooldown / 3600).toFixed(1)} hours</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Volatility Threshold:</span>
                  <span className="font-medium">{(currentParameters.volatilityThreshold * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Stability Premium:</span>
                  <span className="font-medium">{(currentParameters.stabilityPremium * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-6 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-4">Stability Bands</h4>
              <div className="space-y-4">
                {currentParameters.stabilityBands.map(band => (
                  <div key={band.level} className="border border-gray-200 rounded p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">Band {band.level}</span>
                      <span className="text-sm text-gray-500">
                        ≤ {(band.threshold * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-600">Dampening:</span>
                        <span className="ml-1 font-medium">{(band.dampingFactor * 100).toFixed(0)}%</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Max Rebase:</span>
                        <span className="ml-1 font-medium">{(band.maxRebaseAmount * 100).toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Min Cooldown:</span>
                        <span className="ml-1 font-medium">{(band.minCooldown / 3600).toFixed(1)}h</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Parameter Update Interface */}
          <div className="border border-gray-200 rounded-lg p-6">
            <h4 className="font-medium text-gray-900 mb-4">Parameter Updates</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Base Rebase Cooldown (hours)
                </label>
                <input
                  type="number"
                  min="1"
                  max="48"
                  step="0.5"
                  defaultValue={(currentParameters.baseRebaseCooldown / 3600).toFixed(1)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Volatility Threshold (%)
                </label>
                <input
                  type="number"
                  min="5"
                  max="50"
                  step="1"
                  defaultValue={(currentParameters.volatilityThreshold * 100).toFixed(0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Stability Premium (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.5"
                  defaultValue={(currentParameters.stabilityPremium * 100).toFixed(1)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            
            <div className="mt-4 flex space-x-4">
              <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                Update Parameters
              </button>
              <button className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition-colors">
                Reset to Defaults
              </button>
            </div>
          </div>

          {/* Economic Impact Visualization */}
          <div className="bg-gray-50 p-6 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-4">Parameter Impact Visualization</h4>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Cooldown Impact Chart */}
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-2">Rebase Frequency vs Cooldown</h5>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={[
                      { cooldown: 1, frequency: 85 },
                      { cooldown: 6, frequency: 60 },
                      { cooldown: 12, frequency: 40 },
                      { cooldown: 18, frequency: 25 },
                      { cooldown: 24, frequency: 15 }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="cooldown" label={{ value: 'Cooldown (hours)', position: 'insideBottom', offset: -5 }} />
                      <YAxis label={{ value: 'Rebase Frequency (%)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="frequency" stroke="#3B82F6" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Dampening Impact Chart */}
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-2">Stability vs Dampening Factor</h5>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart data={[
                      { dampening: 10, stability: 60 },
                      { dampening: 25, stability: 75 },
                      { dampening: 50, stability: 85 },
                      { dampening: 70, stability: 90 },
                      { dampening: 90, stability: 95 }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dampening" label={{ value: 'Dampening Factor (%)', position: 'insideBottom', offset: -5 }} />
                      <YAxis label={{ value: 'Stability Score', angle: -90, position: 'insideLeft' }} />
                      <Tooltip />
                      <Scatter dataKey="stability" fill="#10B981" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, AreaChart, Area, BarChart, Bar } from "recharts"
import { toast } from "react-toastify"

interface EconomicModelingProps {
  contracts: any
  isActive: boolean
}

interface EconomicParameters {
  baseRebaseCooldown: number
  minRebaseCooldown: number
  maxRebaseCooldown: number
  volatilityThreshold: number
  stabilityPremium: number
  stabilityBands: StabilityBand[]
}

interface StabilityBand {
  level: number
  threshold: number
  dampingFactor: number
  minCooldown: number
  maxRebaseAmount: number
}

interface MarketScenario {
  id: string
  name: string
  description: string
  priceSequence: number[]
  duration: number // in hours
  volatilityProfile: 'low' | 'medium' | 'high' | 'extreme'
}

interface SimulationResult {
  timestamp: number
  price: number
  supply: number
  deviation: number
  rebaseAmount: number
  cooldownUsed: number
  bandUsed: number
  stabilityScore: number
  economicEfficiency: number
}

interface OptimizationTarget {
  parameter: string
  currentValue: number
  suggestedValue: number
  improvement: number
  reasoning: string
}

const MARKET_SCENARIOS: MarketScenario[] = [
  {
    id: 'stable_market',
    name: 'Stable Market',
    description: 'Low volatility with minor price fluctuations around $1.00',
    priceSequence: [1.00, 1.01, 0.99, 1.00, 1.01, 0.99, 1.00],
    duration: 168, // 1 week
    volatilityProfile: 'low'
  },
  {
    id: 'moderate_volatility',
    name: 'Moderate Volatility',
    description: 'Normal market conditions with 5-10% price swings',
    priceSequence: [1.00, 1.05, 0.95, 1.08, 0.92, 1.03, 0.97, 1.00],
    duration: 72, // 3 days
    volatilityProfile: 'medium'
  },
  {
    id: 'high_volatility',
    name: 'High Volatility',
    description: 'Stressed market with 10-20% price movements',
    priceSequence: [1.00, 1.15, 0.85, 1.20, 0.80, 1.10, 0.90, 1.05],
    duration: 48, // 2 days
    volatilityProfile: 'high'
  },
  {
    id: 'market_crash',
    name: 'Market Crash',
    description: 'Extreme downward pressure with recovery',
    priceSequence: [1.00, 0.90, 0.70, 0.50, 0.60, 0.75, 0.85, 0.95],
    duration: 24, // 1 day
    volatilityProfile: 'extreme'
  },
  {
    id: 'bubble_burst',
    name: 'Bubble Burst',
    description: 'Rapid appreciation followed by crash',
    priceSequence: [1.00, 1.20, 1.50, 1.80, 1.20, 0.90, 1.00, 1.05],
    duration: 36, // 1.5 days
    volatilityProfile: 'extreme'
  },
  {
    id: 'gradual_appreciation',
    name: 'Gradual Appreciation',
    description: 'Slow upward trend testing upper stability',
    priceSequence: [1.00, 1.02, 1.04, 1.06, 1.08, 1.10, 1.08, 1.05],
    duration: 120, // 5 days
    volatilityProfile: 'medium'
  }
]

export default function EconomicModelingDashboard({ contracts, isActive }: EconomicModelingProps) {
  const [currentParameters, setCurrentParameters] = useState<EconomicParameters | null>(null)
  const [selectedScenario, setSelectedScenario] = useState<string>('stable_market')
  const [simulationResults, setSimulationResults] = useState<SimulationResult[]>([])
  const [isSimulating, setIsSimulating] = useState(false)
  const [optimizationTargets, setOptimizationTargets] = useState<OptimizationTarget[]>([])
  const [activeTab, setActiveTab] = useState<'scenarios' | 'optimization' | 'analysis' | 'parameters'>('scenarios')

  // Load current economic parameters
  useEffect(() => {
    if (contracts.economicParameterManager && isActive) {
      loadEconomicParameters()
    }
  }, [contracts, isActive])

  const loadEconomicParameters = useCallback(async () => {
    try {
      if (!contracts.economicParameterManager) return

      // Mock loading parameters - in real implementation would call contract
      const mockParameters: EconomicParameters = {
        baseRebaseCooldown: 12 * 3600, // 12 hours
        minRebaseCooldown: 1 * 3600,   // 1 hour
        maxRebaseCooldown: 24 * 3600,  // 24 hours
        volatilityThreshold: 0.20,     // 20%
        stabilityPremium: 0.05,        // 5%
        stabilityBands: [
          { level: 1, threshold: 0.01, dampingFactor: 0.15, minCooldown: 8 * 3600, maxRebaseAmount: 0.005 },
          { level: 2, threshold: 0.05, dampingFactor: 0.30, minCooldown: 6 * 3600, maxRebaseAmount: 0.02 },
          { level: 3, threshold: 0.10, dampingFactor: 0.50, minCooldown: 4 * 3600, maxRebaseAmount: 0.05 },
          { level: 4, threshold: 0.20, dampingFactor: 0.70, minCooldown: 2 * 3600, maxRebaseAmount: 0.08 }
        ]
      }

      setCurrentParameters(mockParameters)
    } catch (error) {
      console.error('Failed to load economic parameters:', error)
      toast.error('Failed to load economic parameters')
    }
  }, [contracts])

  // Economic simulation engine
  const runEconomic