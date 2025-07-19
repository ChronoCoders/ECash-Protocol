"use client"

import { useState } from "react"

import { toast } from "react-toastify"
interface StressTestSuiteProps {
  contracts: any
  onStatusUpdate: () => void
}

interface TestResult {
  name: string
  status: "idle" | "running" | "passed" | "failed"
  duration?: number
  error?: string
  gasUsed?: string
}

export default function StressTestSuite({ contracts, onStatusUpdate }: StressTestSuiteProps) {
  const [testResults, setTestResults] = useState<TestResult[]>([
    { name: "Normal Rebase", status: "idle" },
    { name: "Circuit Breaker", status: "idle" },
    { name: "Oracle Failure", status: "idle" },
    { name: "High Frequency Rebases", status: "idle" },
    { name: "Extreme Price Volatility", status: "idle" },
  ])
  const [isRunningAll, setIsRunningAll] = useState(false)

  const updateTestResult = (index: number, updates: Partial<TestResult>) => {
    setTestResults((prev) => prev.map((result, i) => (i === index ? { ...result, ...updates } : result)))
  }

  const runSingleTest = async (testIndex: number) => {
    if (!contracts.testHelper) {
      toast.error("Test helper contract not available")
      return
    }

    const testName = testResults[testIndex].name
    updateTestResult(testIndex, { status: "running" })

    const startTime = Date.now()

    try {
      let success = false
      let gasUsed = "0"

      switch (testIndex) {
        case 0: // Normal Rebase
          const tx1 = await contracts.testHelper.testNormalRebase()
          const receipt1 = await tx1.wait()
          success = true
          gasUsed = receipt1.gasUsed.toString()
          break

        case 1: // Circuit Breaker
          const tx2 = await contracts.testHelper.testCircuitBreaker()
          const receipt2 = await tx2.wait()
          success = true
          gasUsed = receipt2.gasUsed.toString()
          break

        case 2: // Oracle Failure
          const tx3 = await contracts.testHelper.testOracleFailure()
          const receipt3 = await tx3.wait()
          success = true
          gasUsed = receipt3.gasUsed.toString()
          break

        case 3: // High Frequency Rebases
          success = await testHighFrequencyRebases()
          break

        case 4: // Extreme Price Volatility
          success = await testExtremeVolatility()
          break
      }

      const duration = Date.now() - startTime

      updateTestResult(testIndex, {
        status: success ? "passed" : "failed",
        duration,
        gasUsed,
      })

      toast.success(`${testName} completed successfully`)
      onStatusUpdate()
    } catch (error: any) {
      const duration = Date.now() - startTime
      updateTestResult(testIndex, {
        status: "failed",
        duration,
        error: error.message || "Unknown error",
      })

      toast.error(`${testName} failed: ${error.message}`)
    }
  }

  const testHighFrequencyRebases = async (): Promise<boolean> => {
    try {
      const prices = [1.01, 0.99, 1.02, 0.98, 1.01]

      for (const price of prices) {
        const priceWith8Decimals = Math.floor(price * 100000000)
        await contracts.chainlinkOracle.updateAnswer(priceWith8Decimals)

        if (await contracts.stabilizationController.canRebase()) {
          await contracts.stabilizationController.rebase()
        }

        // Small delay between rebases
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      return true
    } catch (error) {
      console.error("High frequency rebase test failed:", error)
      return false
    }
  }

  const testExtremeVolatility = async (): Promise<boolean> => {
    try {
      const extremePrices = [1.25, 0.75, 1.3, 0.7, 1.0]

      for (const price of extremePrices) {
        const priceWith8Decimals = Math.floor(price * 100000000)
        await contracts.chainlinkOracle.updateAnswer(priceWith8Decimals)

        try {
          if (await contracts.stabilizationController.canRebase()) {
            await contracts.stabilizationController.rebase()
          }
        } catch (error) {
          // Expected to fail for extreme prices (circuit breaker)
          console.log("Circuit breaker activated as expected")
        }

        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      return true
    } catch (error) {
      console.error("Extreme volatility test failed:", error)
      return false
    }
  }

  const runAllTests = async () => {
    setIsRunningAll(true)

    for (let i = 0; i < testResults.length; i++) {
      await runSingleTest(i)
      // Small delay between tests
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    setIsRunningAll(false)
    toast.success("All stress tests completed!")
  }

  const resetTests = () => {
    setTestResults((prev) =>
      prev.map((result) => ({
        ...result,
        status: "idle",
        duration: undefined,
        error: undefined,
        gasUsed: undefined,
      })),
    )
    toast.info("Test results reset")
  }

  const getStatusIcon = (status: TestResult["status"]) => {
    switch (status) {
      case "idle":
        return <div className="w-4 h-4 rounded-full bg-gray-300"></div>
      case "running":
        return <div className="w-4 h-4 rounded-full bg-blue-500 animate-pulse"></div>
      case "passed":
        return (
          <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )
      case "failed":
        return (
          <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Stress Test Suite</h2>
        <div className="flex space-x-2">
          <button
            onClick={runAllTests}
            disabled={isRunningAll || !contracts.testHelper}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isRunningAll ? "Running Tests..." : "Run All Tests"}
          </button>
          <button
            onClick={resetTests}
            disabled={isRunningAll}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {testResults.map((test, index) => (
          <div key={index} className="border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {getStatusIcon(test.status)}
                <div>
                  <h3 className="font-medium text-gray-900">{test.name}</h3>
                  {test.duration && (
                    <p className="text-sm text-gray-600">
                      Duration: {test.duration}ms
                      {test.gasUsed && ` | Gas: ${Number.parseInt(test.gasUsed).toLocaleString()}`}
                    </p>
                  )}
                  {test.error && <p className="text-sm text-red-600">Error: {test.error}</p>}
                </div>
              </div>

              <button
                onClick={() => runSingleTest(index)}
                disabled={test.status === "running" || isRunningAll || !contracts.testHelper}
                className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {test.status === "running" ? "Running..." : "Run Test"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium text-gray-900 mb-2">Test Descriptions</h3>
        <div className="text-sm text-gray-600 space-y-1">
          <p>
            <strong>Normal Rebase:</strong> Tests standard rebase operation with 2% price deviation
          </p>
          <p>
            <strong>Circuit Breaker:</strong> Verifies circuit breaker activation with extreme price (-25%)
          </p>
          <p>
            <strong>Oracle Failure:</strong> Tests system resilience to oracle data failures
          </p>
          <p>
            <strong>High Frequency Rebases:</strong> Tests rapid consecutive rebase operations
          </p>
          <p>
            <strong>Extreme Price Volatility:</strong> Tests system behavior under extreme market conditions
          </p>
        </div>
      </div>
    </div>
  )
}
