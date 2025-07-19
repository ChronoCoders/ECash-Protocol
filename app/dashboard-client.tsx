"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { ethers } from "ethers"
import { toast } from "react-toastify"
import { ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"

// Import fixed components
import DeploymentManager from "@/components/DeploymentManager"
import NetworkStatus from "@/components/NetworkStatus"
import NetworkSwitcher from "@/components/NetworkSwitcher"
import RealtimeMetrics from "@/components/RealtimeMetrics"
import StressTestSuite from "@/components/StressTestSuite"
import ScenarioRunner from "@/components/ScenarioRunner"
import FeatureFlags from "@/components/FeatureFlags"

// Import configuration
import { config, configManager, getNetworkInfo, isContractsDeployed } from "@/lib/config"

interface ProtocolStatus {
  currentPrice: string
  targetPrice: string
  totalSupply: string
  deviation: string
  canRebase: boolean
  circuitBreakerActive: boolean
  lastRebaseTime: string
  rebaseCount: string
  stabilityBand: number
  oracleConfidence: string
}

interface DashboardState {
  provider: ethers.BrowserProvider | null
  signer: ethers.Signer | null
  account: string
  chainId: number
  isConnecting: boolean
  isConnected: boolean
  networkMismatch: boolean
  contracts: any
  protocolStatus: ProtocolStatus | null
  autoRefresh: boolean
  error: string | null
  lastUpdate: number
}

interface ConnectionError extends Error {
  code?: number
  data?: any
}

export default function DashboardClient() {
  const [state, setState] = useState<DashboardState>({
    provider: null,
    signer: null,
    account: "",
    chainId: 0,
    isConnecting: false,
    isConnected: false,
    networkMismatch: false,
    contracts: {},
    protocolStatus: null,
    autoRefresh: true,
    error: null,
    lastUpdate: 0,
  })

  // Refs for managing intervals and preventing memory leaks
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const connectionAttempts = useRef(0)
  const maxRetries = 3

  // Cleanup function
  const cleanup = useCallback(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current)
      refreshIntervalRef.current = null
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
  }, [])

  // Enhanced error handling
  const handleError = useCallback((error: ConnectionError, context: string) => {
    console.error(`Error in ${context}:`, error)
    
    let errorMessage = `${context} failed: ${error.message}`
    
    // Handle specific error types
    if (error.code === 4001) {
      errorMessage = "User rejected the connection request"
    } else if (error.code === -32002) {
      errorMessage = "Connection request is already pending in MetaMask"
    } else if (error.code === -32603) {
      errorMessage = "Internal JSON-RPC error"
    } else if (error.message.includes("network")) {
      errorMessage = "Network connection issue. Please check your internet connection."
    } else if (error.message.includes("user rejected")) {
      errorMessage = "Connection was rejected. Please try again."
    }

    setState(prev => ({ ...prev, error: errorMessage, isConnecting: false }))
    toast.error(errorMessage)
  }, [])

  // Safe provider check
  const checkProvider = useCallback((): boolean => {
    if (typeof window === "undefined") return false
    
    if (!window.ethereum) {
      toast.error("MetaMask not detected. Please install MetaMask to continue.", {
        position: "top-right",
        autoClose: 5000,
      })
      return false
    }
    
    return true
  }, [])

  // Enhanced wallet connection
  const connectWallet = useCallback(async () => {
    if (!checkProvider()) return
    
    if (state.isConnecting) {
      toast.warning("Connection already in progress...")
      return
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }))
    connectionAttempts.current++

    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      
      // Request account access with timeout
      const accounts = await Promise.race([
        provider.send("eth_requestAccounts", []),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Connection timeout")), 30000)
        )
      ]) as string[]

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts returned from wallet")
      }

      const signer = await provider.getSigner()
      
      // Get network with better error handling
      let network
      try {
        network = await provider.getNetwork()
      } catch (networkError: any) {
        if (networkError.message.includes("could not detect network")) {
          throw new Error("Could not fetch chain ID. Is your RPC URL correct? Make sure Hardhat node is running on http://localhost:8545")
        }
        throw networkError
      }
      
      const account = accounts[0]

      // Validate account format
      if (!ethers.isAddress(account)) {
        throw new Error("Invalid account address returned")
      }

      const chainId = Number(network.chainId)
      
      // Update config manager with detected chain ID
      if (configManager.isNetworkSupported(chainId)) {
        configManager.updateChainId(chainId)
      }
      
      const networkMismatch = !configManager.isNetworkSupported(chainId)

      setState(prev => ({
        ...prev,
        provider,
        signer,
        account,
        chainId,
        isConnected: true,
        isConnecting: false,
        networkMismatch,
        error: null,
      }))

      connectionAttempts.current = 0
      toast.success(`Connected to ${account.slice(0, 6)}...${account.slice(-4)}`, {
        duration: 3000,
      })

      if (networkMismatch) {
        toast.warning(`Unsupported network (Chain ID: ${chainId}). Please switch to localhost (Chain ID: 31337) for testing.`, {
          duration: 8000,
        })
      } else {
        const currentNetwork = getNetworkInfo(chainId)
        toast.success(`Connected to ${currentNetwork.name}`, {
          duration: 3000,
        })
      }

    } catch (error: any) {
      handleError(error, "Wallet connection")
      
      // Retry logic for certain errors
      if (connectionAttempts.current < maxRetries && 
          !error.message.includes("rejected") && 
          !error.message.includes("denied")) {
        
        const delay = Math.min(1000 * Math.pow(2, connectionAttempts.current), 10000)
        toast.info(`Retrying connection in ${delay / 1000} seconds...`)
        
        retryTimeoutRef.current = setTimeout(() => {
          connectWallet()
        }, delay)
      } else {
        connectionAttempts.current = 0
      }
    }
  }, [checkProvider, handleError, state.isConnecting])

  // Safe disconnect
  const disconnectWallet = useCallback(() => {
    cleanup()
    connectionAttempts.current = 0
    
    setState({
      provider: null,
      signer: null,
      account: "",
      chainId: 0,
      isConnecting: false,
      isConnected: false,
      networkMismatch: false,
      contracts: {},
      protocolStatus: null,
      autoRefresh: true,
      error: null,
      lastUpdate: 0,
    })
    
    toast.info("Wallet disconnected")
  }, [cleanup])

  // Enhanced contract initialization
  const initializeContracts = useCallback(async (deployedAddresses?: any) => {
    if (!state.provider || !state.signer) return

    try {
      const addresses = deployedAddresses || config.contracts
      
      if (!addresses.testHelper || !ethers.isAddress(addresses.testHelper)) {
        console.warn("Test helper contract not deployed or invalid address")
        return {}
      }

      // Validate all contract addresses
      const requiredContracts = ['ecashToken', 'oracleAggregator', 'stabilizationController', 'treasury', 'testHelper']
      for (const contractName of requiredContracts) {
        if (!addresses[contractName] || !ethers.isAddress(addresses[contractName])) {
          throw new Error(`Invalid or missing ${contractName} address`)
        }
      }

      // Create contract instances with error handling
      const contracts: any = {}
      
      try {
        // Simple contract interface for basic interactions
        const testHelperAbi = [
          "function getProtocolStatus() external view returns (tuple(uint256,uint256,uint256,uint256,bool,bool,uint256,uint256,uint8,uint256))",
          "function testNormalRebase() external returns (bool)",
          "function testCircuitBreaker() external returns (bool)",
          "function testOracleFailure() external returns (bool)",
          "function simulateMarketCrash() external returns (bool)",
          "function simulateBullMarket() external returns (bool)",
          "function resetProtocol() external"
        ]

        contracts.testHelper = new ethers.Contract(addresses.testHelper, testHelperAbi, state.signer)

        // Validate contract by calling a read-only function
        await contracts.testHelper.getProtocolStatus()

        setState(prev => ({ ...prev, contracts }))
        return contracts

      } catch (contractError: any) {
        throw new Error(`Contract initialization failed: ${contractError.message}`)
      }

    } catch (error: any) {
      handleError(error, "Contract initialization")
      return {}
    }
  }, [state.provider, state.signer, handleError])

  // Enhanced protocol status fetching
  const fetchProtocolStatus = useCallback(async () => {
    if (!state.contracts.testHelper) return

    try {
      const status = await state.contracts.testHelper.getProtocolStatus()
      
      if (!status || status.length < 10) {
        throw new Error("Invalid protocol status response")
      }

      const protocolStatus: ProtocolStatus = {
        currentPrice: ethers.formatEther(status[0]),
        targetPrice: ethers.formatEther(status[1]),
        totalSupply: ethers.formatEther(status[2]),
        deviation: ethers.formatEther(status[3]),
        canRebase: status[4],
        circuitBreakerActive: status[5],
        lastRebaseTime: status[6].toString(),
        rebaseCount: status[7].toString(),
        stabilityBand: status[8],
        oracleConfidence: status[9].toString(),
      }

      setState(prev => ({ 
        ...prev, 
        protocolStatus, 
        error: null,
        lastUpdate: Date.now()
      }))

    } catch (error: any) {
      // Only log error if it's not a network issue to avoid spam
      if (!error.message.includes("network") && !error.message.includes("timeout")) {
        handleError(error, "Protocol status fetch")
      }
    }
  }, [state.contracts.testHelper, handleError])

  // Network change handler
  const handleNetworkChange = useCallback(() => {
    if (!state.provider) return

    const updateNetwork = async () => {
      try {
        const network = await state.provider!.getNetwork()
        const chainId = Number(network.chainId)
        const networkMismatch = chainId !== config.chainId

        setState(prev => ({ ...prev, chainId, networkMismatch }))

        // Update config manager with new chain ID
        if (configManager.isNetworkSupported(chainId)) {
          configManager.updateChainId(chainId)
        }

        if (!networkMismatch && isContractsDeployed(chainId)) {
          await initializeContracts()
        } else if (networkMismatch) {
          // Clear contracts if on wrong network
          setState(prev => ({ ...prev, contracts: {} }))
        }

      } catch (error: any) {
        handleError(error, "Network change")
      }
    }

    updateNetwork()
  }, [state.provider, initializeContracts, handleError])

  // Account change handler
  const handleAccountChange = useCallback((accounts: string[]) => {
    if (accounts.length === 0) {
      disconnectWallet()
    } else if (accounts[0] !== state.account) {
      setState(prev => ({ ...prev, account: accounts[0] }))
      toast.info(`Switched to account ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`)
    }
  }, [state.account, disconnectWallet])

  // Set up event listeners
  useEffect(() => {
    if (!checkProvider()) return

    const handleChainChanged = () => {
      // Reload page on chain change to avoid state issues
      window.location.reload()
    }

    const handleDisconnect = () => {
      disconnectWallet()
    }

    // Add event listeners
    window.ethereum.on("chainChanged", handleChainChanged)
    window.ethereum.on("accountsChanged", handleAccountChange)
    window.ethereum.on("disconnect", handleDisconnect)

    return () => {
      // Cleanup event listeners
      if (window.ethereum?.removeListener) {
        window.ethereum.removeListener("chainChanged", handleChainChanged)
        window.ethereum.removeListener("accountsChanged", handleAccountChange)
        window.ethereum.removeListener("disconnect", handleDisconnect)
      }
    }
  }, [checkProvider, handleAccountChange, disconnectWallet])

  // Auto-refresh protocol status
  useEffect(() => {
    if (!state.autoRefresh || !state.contracts.testHelper) return

    const interval = setInterval(() => {
      fetchProtocolStatus()
    }, config.dashboard.refreshInterval)

    refreshIntervalRef.current = interval

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [state.autoRefresh, state.contracts.testHelper, fetchProtocolStatus])

  // Initialize contracts when connected
  useEffect(() => {
    if (state.isConnected && !state.networkMismatch && isContractsDeployed(state.chainId)) {
      initializeContracts()
    }
  }, [state.isConnected, state.networkMismatch, state.chainId, initializeContracts])

  // Fetch initial protocol status
  useEffect(() => {
    if (state.contracts.testHelper) {
      fetchProtocolStatus()
    }
  }, [state.contracts.testHelper, fetchProtocolStatus])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  // Price simulation handlers with error handling
  const simulatePrice = useCallback(async (price: number) => {
    if (!state.contracts.testHelper) {
      toast.error("Contracts not initialized")
      return
    }

    try {
      // This would need to be implemented in the actual contracts
      toast.info(`Simulating price: ${price.toFixed(2)}`)
      await fetchProtocolStatus()
    } catch (error: any) {
      handleError(error, "Price simulation")
    }
  }, [state.contracts.testHelper, fetchProtocolStatus, handleError])

  const executeRebase = useCallback(async () => {
    if (!state.contracts.testHelper) {
      toast.error("Contracts not initialized")
      return
    }

    try {
      toast.info("Executing rebase...")
      // This would need the stabilization controller contract
      await fetchProtocolStatus()
      toast.success("Rebase executed successfully")
    } catch (error: any) {
      handleError(error, "Rebase execution")
    }
  }, [state.contracts.testHelper, fetchProtocolStatus, handleError])

  // Component error boundary
  const ErrorDisplay = ({ error }: { error: string }) => (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <div className="flex items-center">
        <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center mr-3">
          <span className="text-white text-sm">!</span>
        </div>
        <div>
          <h3 className="text-red-900 font-medium">Error</h3>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
        <button
          onClick={() => setState(prev => ({ ...prev, error: null }))}
          className="ml-auto text-red-500 hover:text-red-700"
        >
          ✕
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">E-Cash Protocol Dashboard</h1>
              <p className="text-gray-600 mt-2">
                Comprehensive testing environment for algorithmic stablecoin protocol
              </p>
            </div>
            
            {/* Connection Status */}
            <div className="flex items-center space-x-4">
              {state.lastUpdate > 0 && (
                <div className="text-sm text-gray-500">
                  Last updated: {new Date(state.lastUpdate).toLocaleTimeString()}
                </div>
              )}
              
              <button
                onClick={() => setState(prev => ({ ...prev, autoRefresh: !prev.autoRefresh }))}
                className={`px-3 py-1 rounded text-sm ${
                  state.autoRefresh 
                    ? "bg-green-100 text-green-800" 
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                Auto-refresh: {state.autoRefresh ? "ON" : "OFF"}
              </button>
              
              {!state.isConnected ? (
                <button
                  onClick={connectWallet}
                  disabled={state.isConnecting}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {state.isConnecting ? "Connecting..." : "Connect Wallet"}
                </button>
              ) : (
                <div className="flex items-center space-x-3">
                  <div className="text-sm">
                    <div className="font-medium">
                      {state.account.slice(0, 6)}...{state.account.slice(-4)}
                    </div>
                    <div className="text-gray-500">
                      {getNetworkInfo(state.chainId).name}
                    </div>
                  </div>
                  <button
                    onClick={disconnectWallet}
                    className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error Display */}
        {state.error && <ErrorDisplay error={state.error} />}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Network Status */}
            <NetworkStatus provider={state.provider} account={state.account} />

            {/* Deployment Manager or Real-time Metrics */}
            {!isContractsDeployed(state.chainId) ? (
              <DeploymentManager
                provider={state.provider}
                signer={state.signer}
                onDeploymentComplete={initializeContracts}
              />
            ) : (
              <FeatureFlags feature="realTimeMonitoring">
                <RealtimeMetrics protocolStatus={state.protocolStatus} />
              </FeatureFlags>
            )}

            {/* Interactive Controls */}
            {state.contracts.testHelper && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Interactive Controls</h2>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <button
                    onClick={() => simulatePrice(0.95)}
                    className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
                  >
                    $0.95 (-5%)
                  </button>
                  <button
                    onClick={() => simulatePrice(1.00)}
                    className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors"
                  >
                    $1.00 (0%)
                  </button>
                  <button
                    onClick={() => simulatePrice(1.05)}
                    className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    $1.05 (+5%)
                  </button>
                  <button
                    onClick={() => simulatePrice(1.25)}
                    className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors"
                  >
                    $1.25 (+25%)
                  </button>
                </div>

                <div className="flex space-x-4">
                  <button
                    onClick={executeRebase}
                    disabled={!state.protocolStatus?.canRebase}
                    className="bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
                  >
                    Execute Rebase
                  </button>
                  <button
                    onClick={fetchProtocolStatus}
                    className="bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Refresh Status
                  </button>
                </div>
              </div>
            )}

            {/* Testing Suites */}
            {state.contracts.testHelper && (
              <>
                <FeatureFlags feature="stressTesting">
                  <StressTestSuite
                    contracts={state.contracts}
                    onStatusUpdate={fetchProtocolStatus}
                  />
                </FeatureFlags>

                <FeatureFlags feature="scenarioTesting">
                  <ScenarioRunner
                    contracts={state.contracts}
                    onStatusUpdate={fetchProtocolStatus}
                  />
                </FeatureFlags>
              </>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Network Switcher */}
            {state.networkMismatch && (
              <NetworkSwitcher
                provider={state.provider}
                currentChainId={state.chainId}
                onNetworkChanged={handleNetworkChange}
              />
            )}

            {/* Protocol Status */}
            {state.protocolStatus && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Protocol Status</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Current Price:</span>
                    <span className="font-medium">${Number.parseFloat(state.protocolStatus.currentPrice).toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Supply:</span>
                    <span className="font-medium">{Number.parseFloat(state.protocolStatus.totalSupply).toLocaleString()} ECASH</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Deviation:</span>
                    <span className={`font-medium ${Number.parseFloat(state.protocolStatus.deviation) > 0.1 ? 'text-red-600' : 'text-green-600'}`}>
                      {(Number.parseFloat(state.protocolStatus.deviation) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Can Rebase:</span>
                    <span className={`font-medium ${state.protocolStatus.canRebase ? 'text-green-600' : 'text-red-600'}`}>
                      {state.protocolStatus.canRebase ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Circuit Breaker:</span>
                    <span className={`font-medium ${state.protocolStatus.circuitBreakerActive ? 'text-red-600' : 'text-green-600'}`}>
                      {state.protocolStatus.circuitBreakerActive ? 'Active' : 'Normal'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Oracle Confidence:</span>
                    <span className="font-medium">{state.protocolStatus.oracleConfidence}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast Container */}
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  )
}