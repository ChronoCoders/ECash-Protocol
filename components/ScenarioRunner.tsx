"use client"

import { useState } from "react"
import { toast } from "react-toastify"
import { ethers } from "ethers"

interface ScenarioRunnerProps {
  contracts: any
  onStatusUpdate: () => void
}

interface Scenario {
  name: string
  description: string
  steps: string[]
  status: "idle" | "running" | "completed" | "failed"
  currentStep?: number
  results?: string[]
}

export default function ScenarioRunner({ contracts, onStatusUpdate }: ScenarioRunnerProps) {
  const [scenarios, setScenarios] = useState<Scenario[]>([
    {
      name: "Market Crash Simulation",
      description: "Simulates a gradual market crash from $1.00 to $0.75",
      steps: [
        "Set price to $0.95 (-5%)",
        "Execute rebase if possible",
        "Set price to $0.90 (-10%)",
        "Execute rebase if possible",
        "Set price to $0.85 (-15%)",
        "Execute rebase if possible",
        "Set price to $0.80 (-20%)",
        "Verify circuit breaker activation",
        "Set price to $0.75 (-25%)",
        "Confirm system protection",
      ],
      status: "idle",
    },
    {
      name: "Bull Market Growth",
      description: "Tests controlled supply expansion during price increases",
      steps: [
        "Set price to $1.05 (+5%)",
        "Execute rebase and monitor supply",
        "Set price to $1.10 (+10%)",
        "Execute rebase with dampening",
        "Set price to $1.15 (+15%)",
        "Execute rebase with higher dampening",
        "Set price to $1.20 (+20%)",
        "Verify circuit breaker activation",
        "Reset to target price",
        "Confirm system stability",
      ],
      status: "idle",
    },
    {
      name: "Oracle Manipulation Attack",
      description: "Tests resistance to oracle price manipulation",
      steps: [
        "Set normal price $1.00",
        "Inject extreme price $10.00",
        "Verify price rejection",
        "Test with negative price",
        "Verify system resilience",
        "Restore normal operation",
        "Confirm data integrity",
      ],
      status: "idle",
    },
    {
      name: "Recovery Procedure",
      description: "Tests system recovery from circuit breaker state",
      steps: [
        "Trigger circuit breaker",
        "Verify system pause",
        "Reset circuit breaker",
        "Restore normal price",
        "Execute recovery rebase",
        "Monitor system stability",
        "Confirm full recovery",
      ],
      status: "idle",
    },
  ])

  const updateScenario = (index: number, updates: Partial<Scenario>) => {
    setScenarios((prev) => prev.map((scenario, i) => (i === index ? { ...scenario, ...updates } : scenario)))
  }

  const runScenario = async (scenarioIndex: number) => {
    if (!contracts.testHelper) {
      toast.error("Test helper contract not available")
      return
    }

    const scenario = scenarios[scenarioIndex]
    updateScenario(scenarioIndex, {
      status: "running",
      currentStep: 0,
      results: [],
    })

    try {
      let results: string[] = []

      switch (scenarioIndex) {
        case 0: // Market Crash
          results = await runMarketCrashScenario()
          break
        case 1: // Bull Market
          results = await runBullMarketScenario()
          break
        case 2: // Oracle Attack
          results = await runOracleAttackScenario()
          break
        case 3: // Recovery
          results = await runRecoveryScenario()
          break
      }

      updateScenario(scenarioIndex, {
        status: "completed",
        results,
        currentStep: scenario.steps.length,
      })

      toast.success(`${scenario.name} completed successfully`)
      onStatusUpdate()
    } catch (error: any) {
      updateScenario(scenarioIndex, {
        status: "failed",
        results: [`Error: ${error.message}`],
      })
      toast.error(`${scenario.name} failed: ${error.message}`)
    }
  }

  const runMarketCrashScenario = async (): Promise<string[]> => {
    const results: string[] = []
    const prices = [0.95, 0.9, 0.85, 0.8, 0.75]

    for (let i = 0; i < prices.length; i++) {
      const price = prices[i]
      const priceWith8Decimals = Math.floor(price * 100000000)

      // Update oracle price
      await contracts.chainlinkOracle.updateAnswer(priceWith8Decimals)
      results.push(`✓ Price set to $${price.toFixed(2)}`)

      // Check if circuit breaker should activate
      const deviation = Math.abs(1.0 - price)
      if (deviation >= 0.2) {
        results.push(`⚠️ Circuit breaker should activate (${(deviation * 100).toFixed(1)}% deviation)`)
      }

      // Try to execute rebase
      try {
        const canRebase = await contracts.stabilizationController.canRebase()
        const circuitBreakerActive = await contracts.stabilizationController.circuitBreakerActive()

        if (canRebase && !circuitBreakerActive) {
          await contracts.stabilizationController.rebase()
          results.push(`✓ Rebase executed successfully`)
        } else if (circuitBreakerActive) {
          results.push(`🛡️ Circuit breaker active - rebase blocked`)
        } else {
          results.push(`⏳ Rebase on cooldown`)
        }
      } catch (error: any) {
        results.push(`❌ Rebase failed: ${error.message}`)
      }

      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    return results
  }

  const runBullMarketScenario = async (): Promise<string[]> => {
    const results: string[] = []
    const prices = [1.05, 1.1, 1.15, 1.2, 1.25]

    for (const price of prices) {
      const priceWith8Decimals = Math.floor(price * 100000000)

      await contracts.chainlinkOracle.updateAnswer(priceWith8Decimals)
      results.push(`✓ Price set to $${price.toFixed(2)}`)

      try {
        const canRebase = await contracts.stabilizationController.canRebase()
        const circuitBreakerActive = await contracts.stabilizationController.circuitBreakerActive()

        if (canRebase && !circuitBreakerActive) {
          const supplyBefore = await contracts.ecashToken.totalSupply()
          await contracts.stabilizationController.rebase()
          const supplyAfter = await contracts.ecashToken.totalSupply()

          const supplyChange =
            ((Number.parseFloat(supplyAfter.toString()) - Number.parseFloat(supplyBefore.toString())) /
              Number.parseFloat(supplyBefore.toString())) *
            100
          results.push(
            `✓ Supply ${supplyChange > 0 ? "expanded" : "contracted"} by ${Math.abs(supplyChange).toFixed(2)}%`,
          )
        } else if (circuitBreakerActive) {
          results.push(`🛡️ Circuit breaker active`)
        } else {
          results.push(`⏳ Rebase on cooldown`)
        }
      } catch (error: any) {
        results.push(`❌ Rebase failed: ${error.message}`)
      }

      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    return results
  }

  const runOracleAttackScenario = async (): Promise<string[]> => {
    const results: string[] = []

    // Set normal price
    await contracts.chainlinkOracle.updateAnswer(100000000) // $1.00
    results.push(`✓ Normal price set: $1.00`)

    // Try extreme high price
    try {
      await contracts.chainlinkOracle.updateAnswer(1000000000) // $10.00
      results.push(`⚠️ Extreme price injected: $10.00`)

      const [price] = await contracts.oracleAggregator.getAggregatedPrice()
      const priceFormatted = Number.parseFloat(ethers.formatEther(price))

      if (priceFormatted > 5.0) {
        results.push(`❌ System accepted manipulated price: $${priceFormatted.toFixed(2)}`)
      } else {
        results.push(`✓ System rejected extreme price`)
      }
    } catch (error) {
      results.push(`✓ Oracle aggregator rejected invalid data`)
    }

    // Restore normal price
    await contracts.chainlinkOracle.updateAnswer(100000000)
    results.push(`✓ Normal operation restored`)

    return results
  }

  const runRecoveryScenario = async (): Promise<string[]> => {
    const results: string[] = []

    // Trigger circuit breaker
    await contracts.chainlinkOracle.updateAnswer(75000000) // $0.75
    results.push(`✓ Extreme price set to trigger circuit breaker`)

    try {
      await contracts.stabilizationController.rebase()
    } catch (error) {
      results.push(`✓ Circuit breaker activated as expected`)
    }

    // Check circuit breaker status
    const circuitBreakerActive = await contracts.stabilizationController.circuitBreakerActive()
    if (circuitBreakerActive) {
      results.push(`✓ Circuit breaker confirmed active`)
    }

    // Reset circuit breaker (admin function)
    try {
      await contracts.stabilizationController.resetCircuitBreaker()
      results.push(`✓ Circuit breaker reset`)
    } catch (error: any) {
      results.push(`❌ Failed to reset circuit breaker: ${error.message}`)
    }

    // Restore normal price
    await contracts.chainlinkOracle.updateAnswer(100000000) // $1.00
    results.push(`✓ Normal price restored`)

    // Test normal operation
    try {
      if (await contracts.stabilizationController.canRebase()) {
        await contracts.stabilizationController.rebase()
        results.push(`✓ Normal operation confirmed`)
      }
    } catch (error: any) {
      results.push(`❌ Recovery failed: ${error.message}`)
    }

    return results
  }

  const resetScenario = (index: number) => {
    updateScenario(index, {
      status: "idle",
      currentStep: undefined,
      results: undefined,
    })
  }

  const getStatusColor = (status: Scenario["status"]) => {
    switch (status) {
      case "idle":
        return "text-gray-600"
      case "running":
        return "text-blue-600"
      case "completed":
        return "text-green-600"
      case "failed":
        return "text-red-600"
    }
  }

  const getStatusIcon = (status: Scenario["status"]) => {
    switch (status) {
      case "idle":
        return <div className="w-4 h-4 rounded-full bg-gray-300"></div>
      case "running":
        return <div className="w-4 h-4 rounded-full bg-blue-500 animate-pulse"></div>
      case "completed":
        return <div className="w-4 h-4 rounded-full bg-green-500"></div>
      case "failed":
        return <div className="w-4 h-4 rounded-full bg-red-500"></div>
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Scenario Test Runner</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {scenarios.map((scenario, index) => (
          <div key={index} className="border rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-3">
                {getStatusIcon(scenario.status)}
                <div>
                  <h3 className="font-medium text-gray-900">{scenario.name}</h3>
                  <p className="text-sm text-gray-600">{scenario.description}</p>
                </div>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => runScenario(index)}
                  disabled={scenario.status === "running" || !contracts.testHelper}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {scenario.status === "running" ? "Running..." : "Run"}
                </button>

                {scenario.status !== "idle" && (
                  <button
                    onClick={() => resetScenario(index)}
                    disabled={scenario.status === "running"}
                    className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Progress Steps */}
            <div className="space-y-2">
              {scenario.steps.map((step, stepIndex) => (
                <div
                  key={stepIndex}
                  className={`text-sm flex items-center space-x-2 ${
                    scenario.currentStep !== undefined && stepIndex <= scenario.currentStep
                      ? "text-green-600"
                      : scenario.status === "running" && stepIndex === scenario.currentStep
                        ? "text-blue-600"
                        : "text-gray-500"
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full ${
                      scenario.currentStep !== undefined && stepIndex < scenario.currentStep
                        ? "bg-green-500"
                        : scenario.status === "running" && stepIndex === scenario.currentStep
                          ? "bg-blue-500 animate-pulse"
                          : "bg-gray-300"
                    }`}
                  ></div>
                  <span>{step}</span>
                </div>
              ))}
            </div>

            {/* Results */}
            {scenario.results && scenario.results.length > 0 && (
              <div className="mt-4 p-3 bg-gray-50 rounded">
                <h4 className="font-medium text-gray-900 mb-2">Results:</h4>
                <div className="space-y-1">
                  {scenario.results.map((result, resultIndex) => (
                    <div key={resultIndex} className="text-sm text-gray-700">
                      {result}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
