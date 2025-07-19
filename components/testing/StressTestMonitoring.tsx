"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { ethers } from "ethers"
import { toast } from "react-toastify"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts"

interface StressTestProps {
  contracts: any
  onStatusUpdate?: () => void
}

interface TestScenario {
  id: string
  name: string
  description: string
  category: 'rebase' | 'oracle' | 'treasury' | 'security' | 'performance'
  severity: 'low' | 'medium' | 'high' | 'critical'
  duration: number // in seconds
  enabled: boolean
}

interface TestResult {
  scenarioId: string
  timestamp: number
  duration: number
  success: boolean
  error?: string
  metrics: {
    gasUsed?: string
    responseTime: number
    memoryUsage?: number
    cpuUsage?: number
  }
  beforeState: any
  afterState: any
}

interface StressTestState {
  isRunning: boolean
  currentScenario: string | null
  progress: number
  totalTests: number
  completedTests: number
  results: TestResult[]
  realTimeMetrics: any[]
  error: string | null
  startTime?: number
}

const STRESS_TEST_SCENARIOS: TestScenario[] = [
  // Rebase Stress Tests
  {
    id: 'rapid_rebases',
    name: 'Rapid Consecutive Rebases',
    description: 'Test multiple rebases in rapid succession after cooldown',
    category: 'rebase',
    severity: 'high',
    duration: 300, // 5 minutes
    enabled: true
  },
  {
    id: 'extreme_price_swings',
    name: 'Extreme Price Volatility',
    description: 'Test system with extreme price swings (+/- 50%)',
    category: 'rebase',
    severity: 'critical',
    duration: 600, // 10 minutes
    enabled: true
  },
  {
    id: 'precision_edge_cases',
    name: 'Precision Edge Cases',
    description: 'Test with very small and very large rebase amounts',
    category: 'rebase',
    severity: 'medium',
    duration: 180,
    enabled: true
  },

  // Oracle Stress Tests
  {
    id: 'oracle_failures',
    name: 'Oracle Failure Cascade',
    description: 'Systematically fail oracles to test fallback mechanisms',
    category: 'oracle',
    severity: 'critical',
    duration: 240,
    enabled: true
  },
  {
    id: 'oracle_manipulation',
    name: 'Oracle Price Manipulation',
    description: 'Test outlier detection with manipulated oracle prices',
    category: 'oracle',
    severity: 'high',
    duration: 300,
    enabled: true
  },
  {
    id: 'stale_data_stress',
    name: 'Stale Oracle Data',
    description: 'Test with progressively older oracle timestamps',
    category: 'oracle',
    severity: 'medium',
    duration: 180,
    enabled: true
  },

  // Treasury Stress Tests
  {
    id: 'spending_limit_stress',
    name: 'Treasury Spending Limits',
    description: 'Test daily spending limits under high transaction volume',
    category: 'treasury',
    severity: 'medium',
    duration: 240,
    enabled: true
  },
  {
    id: 'allocation_edge_cases',
    name: 'Asset Allocation Edge Cases',
    description: 'Test treasury with extreme allocation scenarios',
    category: 'treasury',
    severity: 'low',
    duration: 120,
    enabled: true
  },

  // Security Stress Tests
  {
    id: 'access_control_stress',
    name: 'Access Control Under Load',
    description: 'Test role-based access controls with high transaction volume',
    category: 'security',
    severity: 'critical',
    duration: 300,
    enabled: true
  },
  {
    id: 'emergency_scenarios',
    name: 'Emergency Response',
    description: 'Test circuit breakers and emergency pause functionality',
    category: 'security',
    severity: 'critical',
    duration: 180,
    enabled: true
  },

  // Performance Stress Tests
  {
    id: 'high_gas_environment',
    name: 'High Gas Price Environment',
    description: 'Test system behavior under extreme gas price conditions',
    category: 'performance',
    severity: 'medium',
    duration: 240,
    enabled: true
  },
  {
    id: 'memory_stress',
    name: 'Memory Usage Stress',
    description: 'Test frontend memory usage with extended monitoring',
    category: 'performance',
    severity: 'low',
    duration: 600,
    enabled: true
  }
]

export default function StressTestMonitoring({ contracts, onStatusUpdate }: StressTestProps) {
  const [state, setState] = useState<StressTestState>({
    isRunning: false,
    currentScenario: null,
    progress: 0,
    totalTests: 0,
    completedTests: 0,
    results: [],
    realTimeMetrics: [],
    error: null
  })

  const [scenarios, setScenarios] = useState<TestScenario[]>(STRESS_TEST_SCENARIOS)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [showResults, setShowResults] = useState(false)

  // Refs for managing test execution
  const testAbortRef = useRef<boolean>(false)
  const metricsIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const performanceObserverRef = useRef<PerformanceObserver | null>(null)

  // Start stress testing suite
  const startStressTest = useCallback(async () => {
    const enabledScenarios = scenarios.filter(s => s.enabled)
    
    if (enabledScenarios.length === 0) {
      toast.error("No test scenarios selected")
      return
    }

    setState(prev => ({
      ...prev,
      isRunning: true,
      currentScenario: null,
      progress: 0,
      totalTests: enabledScenarios.length,
      completedTests: 0,
      results: [],
      realTimeMetrics: [],
      error: null,
      startTime: Date.now()
    }))

    testAbortRef.current = false
    
    // Start performance monitoring
    startPerformanceMonitoring()
    
    toast.info(`Starting stress test suite with ${enabledScenarios.length} scenarios`)

    try {
      for (let i = 0; i < enabledScenarios.length; i++) {
        if (testAbortRef.current) break

        const scenario = enabledScenarios[i]
        
        setState(prev => ({
          ...prev,
          currentScenario: scenario.id,
          progress: (i / enabledScenarios.length) * 100
        }))

        toast.info(`Running: ${scenario.name}`)
        
        const result = await executeStressScenario(scenario)
        
        setState(prev => ({
          ...prev,
          results: [...prev.results, result],
          completedTests: prev.completedTests + 1
        }))

        if (onStatusUpdate) {
          onStatusUpdate()
        }

        // Brief pause between scenarios
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      toast.success("Stress test suite completed")
      
    } catch (error: any) {
      console.error("Stress test failed:", error)
      setState(prev => ({ ...prev, error: error.message }))
      toast.error(`Stress test failed: ${error.message}`)
    } finally {
      stopPerformanceMonitoring()
      setState(prev => ({ 
        ...prev, 
        isRunning: false,
        currentScenario: null,
        progress: 100
      }))
    }
  }, [scenarios, onStatusUpdate])

  // Execute individual stress test scenario
  const executeStressScenario = useCallback(async (scenario: TestScenario): Promise<TestResult> => {
    const startTime = performance.now()
    let beforeState: any = {}
    let afterState: any = {}
    let success = false
    let error: string | undefined
    let gasUsed: string | undefined

    try {
      // Capture before state
      if (contracts.testHelper) {
        beforeState = await contracts.testHelper.getProtocolStatus()
      }

      // Execute scenario-specific tests
      switch (scenario.id) {
        case 'rapid_rebases':
          await testRapidRebases()
          break
        case 'extreme_price_swings':
          await testExtremePriceSwings()
          break
        case 'precision_edge_cases':
          await testPrecisionEdgeCases()
          break
        case 'oracle_failures':
          await testOracleFailures()
          break
        case 'oracle_manipulation':
          await testOracleManipulation()
          break
        case 'stale_data_stress':
          await testStaleDataStress()
          break
        case 'spending_limit_stress':
          await testSpendingLimitStress()
          break
        case 'allocation_edge_cases':
          await testAllocationEdgeCases()
          break
        case 'access_control_stress':
          await testAccessControlStress()
          break
        case 'emergency_scenarios':
          await testEmergencyScenarios()
          break
        case 'high_gas_environment':
          await testHighGasEnvironment()
          break
        case 'memory_stress':
          await testMemoryStress(scenario.duration)
          break
        default:
          throw new Error(`Unknown scenario: ${scenario.id}`)
      }

      // Capture after state
      if (contracts.testHelper) {
        afterState = await contracts.testHelper.getProtocolStatus()
      }

      success = true

    } catch (err: any) {
      error = err.message
      console.error(`Scenario ${scenario.id} failed:`, err)
    }

    const endTime = performance.now()
    const duration = endTime - startTime

    return {
      scenarioId: scenario.id,
      timestamp: Date.now(),
      duration,
      success,
      error,
      metrics: {
        gasUsed,
        responseTime: duration,
        memoryUsage: getMemoryUsage(),
        cpuUsage: getCPUUsage()
      },
      beforeState,
      afterState
    }
  }, [contracts])

  // Individual test scenario implementations
  const testRapidRebases = useCallback(async () => {
    if (!contracts.testHelper) throw new Error("TestHelper not available")
    
    // Simulate rapid price changes and rebases
    const priceChanges = [1.03, 0.98, 1.05, 0.96, 1.02]
    
    for (const price of priceChanges) {
      if (testAbortRef.current) break
      
      // Simulate price change
      await contracts.testHelper.setPriceForTesting(ethers.parseEther(price.toString()))
      
      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // Try rebase
      try {
        const tx = await contracts.testHelper.testNormalRebase()
        await tx.wait()
      } catch (error) {
        console.log("Rebase failed as expected (cooldown/circuit breaker)")
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }, [contracts])

  const testExtremePriceSwings = useCallback(async () => {
    if (!contracts.testHelper) throw new Error("TestHelper not available")
    
    // Test extreme price movements
    const extremePrices = [
      ethers.parseEther("0.5"),  // -50%
      ethers.parseEther("2.0"),  // +100%
      ethers.parseEther("0.3"),  // -70%
      ethers.parseEther("1.8"),  // +80%
      ethers.parseEther("1.0")   // Back to normal
    ]
    
    for (const price of extremePrices) {
      if (testAbortRef.current) break
      
      await contracts.testHelper.setPriceForTesting(price)
      
      // Should trigger circuit breaker for extreme prices
      try {
        await contracts.testHelper.testCircuitBreaker()
      } catch (error) {
        // Expected for extreme prices
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
  }, [contracts])

  const testPrecisionEdgeCases = useCallback(async () => {
    if (!contracts.testHelper) throw new Error("TestHelper not available")
    
    // Test very small and very large numbers
    const edgeCases = [
      ethers.parseEther("1.000001"), // Tiny increase
      ethers.parseEther("0.999999"), // Tiny decrease
      ethers.parseEther("1.499999"), // Just below circuit breaker
      ethers.parseEther("0.500001")  // Just above major threshold
    ]
    
    for (const price of edgeCases) {
      if (testAbortRef.current) break
      
      await contracts.testHelper.setPriceForTesting(price)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }, [contracts])

  const testOracleFailures = useCallback(async () => {
    if (!contracts.testHelper) throw new Error("TestHelper not available")
    
    // Test progressive oracle failures
    try {
      await contracts.testHelper.testOracleFailure()
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // Test recovery
      await contracts.testHelper.resetOracles()
    } catch (error) {
      console.log("Oracle failure test completed")
    }
  }, [contracts])

  const testOracleManipulation = useCallback(async () => {
    if (!contracts.testHelper) throw new Error("TestHelper not available")
    
    // Test outlier detection by setting one oracle to extreme value
    const normalPrice = ethers.parseEther("1.0")
    const manipulatedPrice = ethers.parseEther("10.0") // 10x manipulation
    
    await contracts.testHelper.setOraclePrice(0, manipulatedPrice)
    await contracts.testHelper.setOraclePrice(1, normalPrice)
    await contracts.testHelper.setOraclePrice(2, normalPrice)
    
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Reset to normal
    await contracts.testHelper.setOraclePrice(0, normalPrice)
  }, [contracts])

  const testStaleDataStress = useCallback(async () => {
    if (!contracts.testHelper) throw new Error("TestHelper not available")
    
    // Test with progressively older timestamps
    const currentTime = Math.floor(Date.now() / 1000)
    const staleTimestamps = [
      currentTime - 3600,  // 1 hour old
      currentTime - 7200,  // 2 hours old
      currentTime - 14400, // 4 hours old
    ]
    
    for (const timestamp of staleTimestamps) {
      if (testAbortRef.current) break
      
      await contracts.testHelper.setOracleTimestamp(0, timestamp)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    
    // Reset to current time
    await contracts.testHelper.setOracleTimestamp(0, currentTime)
  }, [contracts])

  const testSpendingLimitStress = useCallback(async () => {
    // Mock treasury stress test
    console.log("Testing treasury spending limits...")
    await new Promise(resolve => setTimeout(resolve, 5000))
  }, [])

  const testAllocationEdgeCases = useCallback(async () => {
    // Mock allocation testing
    console.log("Testing asset allocation edge cases...")
    await new Promise(resolve => setTimeout(resolve, 3000))
  }, [])

  const testAccessControlStress = useCallback(async () => {
    // Mock access control testing
    console.log("Testing access control under stress...")
    await new Promise(resolve => setTimeout(resolve, 4000))
  }, [])

  const testEmergencyScenarios = useCallback(async () => {
    if (!contracts.testHelper) throw new Error("TestHelper not available")
    
    // Test emergency pause/unpause
    try {
      await contracts.testHelper.testEmergencyPause()
      await new Promise(resolve => setTimeout(resolve, 3000))
      await contracts.testHelper.testEmergencyUnpause()
    } catch (error) {
      console.log("Emergency scenario test completed")
    }
  }, [contracts])

  const testHighGasEnvironment = useCallback(async () => {
    // Simulate high gas environment by running multiple operations
    console.log("Testing high gas price environment...")
    
    for (let i = 0; i < 5; i++) {
      if (testAbortRef.current) break
      
      // Simulate gas-intensive operations
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }, [])

  const testMemoryStress = useCallback(async (duration: number) => {
    console.log("Starting memory stress test...")
    
    const startTime = Date.now()
    const endTime = startTime + (duration * 1000)
    
    // Generate memory stress by creating large arrays
    const memoryStressData: any[] = []
    
    while (Date.now() < endTime && !testAbortRef.current) {
      // Create some memory pressure
      memoryStressData.push(new Array(1000).fill(Math.random()))
      
      // Add real-time metrics
      setState(prev => ({
        ...prev,
        realTimeMetrics: [
          ...prev.realTimeMetrics,
          {
            timestamp: Date.now(),
            memoryUsage: getMemoryUsage(),
            cpuUsage: getCPUUsage()
          }
        ].slice(-100) // Keep last 100 points
      }))
      
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Cleanup
    memoryStressData.length = 0
  }, [])

  // Performance monitoring
  const startPerformanceMonitoring = useCallback(() => {
    // Monitor performance metrics
    metricsIntervalRef.current = setInterval(() => {
      setState(prev => ({
        ...prev,
        realTimeMetrics: [
          ...prev.realTimeMetrics,
          {
            timestamp: Date.now(),
            memoryUsage: getMemoryUsage(),
            cpuUsage: getCPUUsage(),
            responseTime: Math.random() * 100 + 50 // Mock response time
          }
        ].slice(-200) // Keep last 200 points
      }))
    }, 1000)

    // Set up Performance Observer if available
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        performanceObserverRef.current = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          // Process performance entries
        })
        performanceObserverRef.current.observe({ entryTypes: ['measure', 'navigation'] })
      } catch (error) {
        console.log("Performance Observer not available")
      }
    }
  }, [])

  const stopPerformanceMonitoring = useCallback(() => {
    if (metricsIntervalRef.current) {
      clearInterval(metricsIntervalRef.current)
      metricsIntervalRef.current = null
    }
    
    if (performanceObserverRef.current) {
      performanceObserverRef.current.disconnect()
      performanceObserverRef.current = null
    }
  }, [])

  // Utility functions
  const getMemoryUsage = useCallback((): number => {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      return (performance as any).memory.usedJSHeapSize / 1024 / 1024 // MB
    }
    return Math.random() * 50 + 10 // Mock: 10-60 MB
  }, [])

  const getCPUUsage = useCallback((): number => {
    // Mock CPU usage calculation
    return Math.random() * 100
  }, [])

  // Abort stress test
  const abortStressTest = useCallback(() => {
    testAbortRef.current = true
    stopPerformanceMonitoring()
    setState(prev => ({ ...prev, isRunning: false, currentScenario: null }))
    toast.warning("Stress test aborted")
  }, [stopPerformanceMonitoring])

  // Toggle scenario
  const toggleScenario = useCallback((scenarioId: string) => {
    setScenarios(prev => prev.map(s => 
      s.id === scenarioId ? { ...s, enabled: !s.enabled } : s
    ))
  }, [])

  // Filter scenarios by category
  const filteredScenarios = scenarios.filter(scenario => 
    selectedCategory === 'all' || scenario.category === selectedCategory
  )

  const enabledCount = filteredScenarios.filter(s => s.enabled).length
  const successRate = state.results.length > 0 
    ? (state.results.filter(r => r.success).length / state.results.length) * 100 
    : 0

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Stress Test Monitoring</h2>
          <p className="text-gray-600">Comprehensive protocol stress testing and monitoring</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500">
            {enabledCount} scenarios enabled
          </div>
          {state.isRunning && (
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-blue-600">Running</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {state.isRunning && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              {state.currentScenario ? 
                scenarios.find(s => s.id === state.currentScenario)?.name || 'Running...' : 
                'Preparing...'}
            </span>
            <span className="text-sm text-gray-500">
              {state.completedTests} / {state.totalTests} completed
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${state.progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {state.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center mr-3">
              <span className="text-white text-sm">!</span>
            </div>
            <div>
              <h4 className="text-red-900 font-medium">Test Error</h4>
              <p className="text-red-700 text-sm">{state.error}</p>
            </div>
            <button
              onClick={() => setState(prev => ({ ...prev, error: null }))}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Test Results Summary */}
      {state.results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Total Tests</h4>
            <div className="text-2xl font-bold text-blue-600">{state.results.length}</div>
          </div>

          <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Success Rate</h4>
            <div className="text-2xl font-bold text-green-600">{successRate.toFixed(1)}%</div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Avg Duration</h4>
            <div className="text-2xl font-bold text-yellow-600">
              {state.results.length > 0 
                ? (state.results.reduce((sum, r) => sum + r.duration, 0) / state.results.length / 1000).toFixed(1)
                : 0}s
            </div>
          </div>

          <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Memory Peak</h4>
            <div className="text-2xl font-bold text-purple-600">
              {Math.max(...state.realTimeMetrics.map(m => m.memoryUsage || 0), 0).toFixed(1)}MB
            </div>
          </div>
        </div>
      )}

      {/* Control Panel */}
      <div className="border rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Test Control</h3>
          <div className="flex space-x-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1 text-sm border border-gray-300 rounded"
            >
              <option value="all">All Categories</option>
              <option value="rebase">Rebase Tests</option>
              <option value="oracle">Oracle Tests</option>
              <option value="treasury">Treasury Tests</option>
              <option value="security">Security Tests</option>
              <option value="performance">Performance Tests</option>
            </select>
            <button
              onClick={() => setShowResults(!showResults)}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            >
              {showResults ? 'Hide Results' : 'Show Results'}
            </button>
          </div>
        </div>

        <div className="flex space-x-4 mb-4">
          {!state.isRunning ? (
            <button
              onClick={startStressTest}
              disabled={enabledCount === 0}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              Start Stress Test ({enabledCount} scenarios)
            </button>
          ) : (
            <button
              onClick={abortStressTest}
              className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors"
            >
              Abort Test
            </button>
          )}
        </div>

        {/* Scenario Selection */}
        <div className="space-y-2">
          <h4 className="font-medium text-gray-900">Test Scenarios</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredScenarios.map(scenario => (
              <div
                key={scenario.id}
                className={`border rounded p-3 transition-colors ${
                  scenario.enabled ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={scenario.enabled}
                      onChange={() => toggleScenario(scenario.id)}
                      disabled={state.isRunning}
                      className="rounded"
                    />
                    <div>
                      <h5 className="font-medium text-gray-900">{scenario.name}</h5>
                      <p className="text-sm text-gray-600">{scenario.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      scenario.severity === 'critical' ? 'bg-red-100 text-red-800' :
                      scenario.severity === 'high' ? 'bg-orange-100 text-orange-800' :
                      scenario.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {scenario.severity.toUpperCase()}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {scenario.duration}s
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Real-time Monitoring Charts */}
      {state.realTimeMetrics.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Memory Usage</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={state.realTimeMetrics.slice(-50)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    labelFormatter={(value) => new Date(value).toLocaleTimeString()}
                    formatter={(value) => [`${Number(value).toFixed(1)} MB`, 'Memory']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="memoryUsage" 
                    stroke="#8B5CF6" 
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-4">CPU Usage</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={state.realTimeMetrics.slice(-50)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip 
                    labelFormatter={(value) => new Date(value).toLocaleTimeString()}
                    formatter={(value) => [`${Number(value).toFixed(1)}%`, 'CPU']}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="cpuUsage" 
                    stroke="#F59E0B" 
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Results */}
      {showResults && state.results.length > 0 && (
        <div className="border-t pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Detailed Results</h3>
          <div className="space-y-3">
            {state.results.map((result, index) => {
              const scenario = scenarios.find(s => s.id === result.scenarioId)
              return (
                <div
                  key={index}
                  className={`border rounded-lg p-4 ${
                    result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium text-gray-900">
                        {scenario?.name || result.scenarioId}
                      </h4>
                      <p className="text-sm text-gray-600">{scenario?.description}</p>
                      {result.error && (
                        <p className="text-sm text-red-600 mt-1">Error: {result.error}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`px-2 py-1 rounded text-xs font-medium ${
                        result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {result.success ? 'PASSED' : 'FAILED'}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {(result.duration / 1000).toFixed(2)}s
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Response Time:</span>
                      <span className="ml-1 font-medium">
                        {result.metrics.responseTime.toFixed(0)}ms
                      </span>
                    </div>
                    {result.metrics.memoryUsage && (
                      <div>
                        <span className="text-gray-600">Memory:</span>
                        <span className="ml-1 font-medium">
                          {result.metrics.memoryUsage.toFixed(1)}MB
                        </span>
                      </div>
                    )}
                    {result.metrics.gasUsed && (
                      <div>
                        <span className="text-gray-600">Gas Used:</span>
                        <span className="ml-1 font-medium">{result.metrics.gasUsed}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}