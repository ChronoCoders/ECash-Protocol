"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { ethers } from "ethers"
import { toast } from "react-toastify"
import { configManager, getNetworkInfo, type ContractAddresses } from "@/lib/config"

interface DeploymentManagerProps {
  provider: ethers.BrowserProvider | null
  signer: ethers.Signer | null
  onDeploymentComplete?: (addresses: ContractAddresses) => void
}

interface DeploymentStep {
  id: string
  name: string
  description: string
  status: 'pending' | 'deploying' | 'completed' | 'failed'
  txHash?: string
  address?: string
  error?: string
  gasUsed?: string
  deploymentTime?: number
}

interface DeploymentState {
  steps: DeploymentStep[]
  isDeploying: boolean
  currentStep: number
  totalSteps: number
  deployedAddresses: Partial<ContractAddresses>
  deploymentStartTime?: number
  estimatedGasCosts: Record<string, string>
  error: string | null
}

// Contract bytecode and ABI would normally be imported from build artifacts
// For this example, we'll use simplified versions
const CONTRACT_CONFIGS = {
  securityConfig: {
    name: "SecurityConfig",
    description: "Centralized security management contract",
    gasLimit: "2000000"
  },
  ecashToken: {
    name: "ECashToken", 
    description: "Rebasing ERC-20 token with elastic supply",
    gasLimit: "3000000"
  },
  oracleAggregator: {
    name: "OracleAggregator",
    description: "Multi-oracle price aggregation with outlier detection", 
    gasLimit: "2500000"
  },
  treasury: {
    name: "Treasury",
    description: "Protocol treasury with multi-sig controls",
    gasLimit: "2500000"
  },
  stabilizationController: {
    name: "StabilizationController",
    description: "Rebase controller with circuit breakers",
    gasLimit: "3500000"
  },
  testHelper: {
    name: "TestHelper",
    description: "Testing utilities and scenario simulation",
    gasLimit: "2000000"
  }
} as const

export default function DeploymentManager({ 
  provider, 
  signer, 
  onDeploymentComplete 
}: DeploymentManagerProps) {
  const [state, setState] = useState<DeploymentState>({
    steps: [],
    isDeploying: false,
    currentStep: 0,
    totalSteps: 0,
    deployedAddresses: {},
    estimatedGasCosts: {},
    error: null
  })

  const deploymentAbortRef = useRef<boolean>(false)
  const gasEstimateRef = useRef<Record<string, bigint>>({})

  // Initialize deployment steps
  useEffect(() => {
    const initializeSteps = () => {
      const contractOrder = ['securityConfig', 'ecashToken', 'oracleAggregator', 'treasury', 'stabilizationController', 'testHelper'] as const
      
      const steps: DeploymentStep[] = contractOrder.map((contractId, index) => ({
        id: contractId,
        name: CONTRACT_CONFIGS[contractId].name,
        description: CONTRACT_CONFIGS[contractId].description,
        status: 'pending'
      }))

      setState(prev => ({
        ...prev,
        steps,
        totalSteps: steps.length,
        currentStep: 0
      }))
    }

    initializeSteps()
  }, [])

  // Estimate gas costs for all contracts
  const estimateGasCosts = useCallback(async () => {
    if (!signer || !provider) return

    try {
      const network = await provider.getNetwork()
      const gasPrice = await provider.getFeeData()
      
      const estimates: Record<string, string> = {}
      
      Object.entries(CONTRACT_CONFIGS).forEach(([contractId, config]) => {
        const gasLimit = BigInt(config.gasLimit)
        const estimatedCost = gasLimit * (gasPrice.gasPrice || BigInt(20000000000)) // Fallback 20 gwei
        estimates[contractId] = ethers.formatEther(estimatedCost)
        gasEstimateRef.current[contractId] = estimatedCost
      })

      setState(prev => ({ ...prev, estimatedGasCosts: estimates }))
      
    } catch (error) {
      console.error("Failed to estimate gas costs:", error)
    }
  }, [provider, signer])

  // Run gas estimation when provider/signer changes
  useEffect(() => {
    if (provider && signer) {
      estimateGasCosts()
    }
  }, [provider, signer, estimateGasCosts])

  // Validate deployment environment
  const validateEnvironment = useCallback(async (): Promise<{ isValid: boolean; errors: string[] }> => {
    const errors: string[] = []

    if (!provider || !signer) {
      errors.push("Wallet not connected")
      return { isValid: false, errors }
    }

    try {
      // Check network
      const network = await provider.getNetwork()
      const networkInfo = getNetworkInfo(Number(network.chainId))
      
      if (!networkInfo.testnet && !confirm("You are deploying to a mainnet. Are you sure?")) {
        errors.push("Deployment cancelled by user")
        return { isValid: false, errors }
      }

      // Check account balance
      const signerAddress = await signer.getAddress()
      const balance = await provider.getBalance(signerAddress)
      
      // Calculate total estimated gas cost
      const totalEstimatedCost = Object.values(gasEstimateRef.current)
        .reduce((sum, cost) => sum + cost, BigInt(0))
      
      if (balance < totalEstimatedCost) {
        errors.push(`Insufficient balance. Need ~${ethers.formatEther(totalEstimatedCost)} ETH`)
      }

      // Check if contracts already deployed
      const existingAddresses = configManager.getContractAddresses(Number(network.chainId))
      if (existingAddresses && configManager.isContractsDeployed(Number(network.chainId))) {
        if (!confirm("Contracts appear to be already deployed. Continue anyway?")) {
          errors.push("Deployment cancelled - contracts already exist")
        }
      }

    } catch (error) {
      errors.push(`Environment validation failed: ${error}`)
    }

    return { isValid: errors.length === 0, errors }
  }, [provider, signer])

  // Deploy a single contract with enhanced error handling
  const deployContract = useCallback(async (
    contractId: string, 
    stepIndex: number
  ): Promise<{ address: string; txHash: string; gasUsed: string } | null> => {
    
    if (!signer || deploymentAbortRef.current) return null

    const startTime = Date.now()
    
    // Update step status
    setState(prev => ({
      ...prev,
      steps: prev.steps.map((step, index) => 
        index === stepIndex ? { ...step, status: 'deploying' } : step
      )
    }))

    try {
      // Mock contract deployment - In real implementation, you would:
      // 1. Import contract factory from build artifacts
      // 2. Deploy with proper constructor parameters
      // 3. Wait for deployment and verify
      
      const config = CONTRACT_CONFIGS[contractId as keyof typeof CONTRACT_CONFIGS]
      
      // Simulate deployment delay
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000))
      
      // Check if deployment was aborted
      if (deploymentAbortRef.current) {
        throw new Error("Deployment aborted by user")
      }

      // Mock successful deployment
      const mockAddress = ethers.Wallet.createRandom().address
      const mockTxHash = ethers.keccak256(ethers.toUtf8Bytes(`${contractId}-${Date.now()}`))
      const mockGasUsed = (BigInt(config.gasLimit) * BigInt(85) / BigInt(100)).toString() // 85% of limit
      
      const deploymentTime = Date.now() - startTime

      // Update step with success
      setState(prev => ({
        ...prev,
        steps: prev.steps.map((step, index) => 
          index === stepIndex ? { 
            ...step, 
            status: 'completed', 
            address: mockAddress,
            txHash: mockTxHash,
            gasUsed: mockGasUsed,
            deploymentTime 
          } : step
        ),
        deployedAddresses: {
          ...prev.deployedAddresses,
          [contractId]: mockAddress
        }
      }))

      toast.success(`${config.name} deployed successfully`)
      
      return { 
        address: mockAddress, 
        txHash: mockTxHash, 
        gasUsed: mockGasUsed 
      }

    } catch (error: any) {
      console.error(`Failed to deploy ${contractId}:`, error)
      
      let errorMessage = error.message || "Unknown deployment error"
      
      // Handle specific error types
      if (error.code === 'INSUFFICIENT_FUNDS') {
        errorMessage = "Insufficient funds for gas"
      } else if (error.code === 'NETWORK_ERROR') {
        errorMessage = "Network connection error"
      } else if (error.code === 'TIMEOUT') {
        errorMessage = "Transaction timeout"
      } else if (error.message.includes("reverted")) {
        errorMessage = "Transaction reverted"
      }

      // Update step with failure
      setState(prev => ({
        ...prev,
        steps: prev.steps.map((step, index) => 
          index === stepIndex ? { ...step, status: 'failed', error: errorMessage } : step
        )
      }))

      toast.error(`Failed to deploy ${config.name}: ${errorMessage}`)
      throw error
    }
  }, [signer])

  // Main deployment function
  const startDeployment = useCallback(async () => {
    // Validate environment first
    const validation = await validateEnvironment()
    if (!validation.isValid) {
      setState(prev => ({ ...prev, error: validation.errors.join('; ') }))
      validation.errors.forEach(error => toast.error(error))
      return
    }

    setState(prev => ({ 
      ...prev, 
      isDeploying: true, 
      error: null,
      deploymentStartTime: Date.now(),
      currentStep: 0
    }))

    deploymentAbortRef.current = false
    
    toast.info("Starting contract deployment...")

    try {
      const contractOrder = ['securityConfig', 'ecashToken', 'oracleAggregator', 'treasury', 'stabilizationController', 'testHelper']
      
      for (let i = 0; i < contractOrder.length; i++) {
        if (deploymentAbortRef.current) {
          throw new Error("Deployment aborted by user")
        }

        setState(prev => ({ ...prev, currentStep: i }))
        
        const contractId = contractOrder[i]
        await deployContract(contractId, i)
        
        // Small delay between deployments
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      // All deployments successful
      const addresses = state.deployedAddresses as ContractAddresses
      
      toast.success("All contracts deployed successfully!")
      
      // Notify parent component
      if (onDeploymentComplete) {
        onDeploymentComplete(addresses)
      }

    } catch (error: any) {
      console.error("Deployment failed:", error)
      setState(prev => ({ 
        ...prev, 
        error: error.message || "Deployment failed"
      }))
      
      if (!error.message.includes("aborted")) {
        toast.error("Deployment failed. Please check the console for details.")
      }
    } finally {
      setState(prev => ({ ...prev, isDeploying: false }))
    }
  }, [validateEnvironment, deployContract, onDeploymentComplete, state.deployedAddresses])

  // Abort deployment
  const abortDeployment = useCallback(() => {
    deploymentAbortRef.current = true
    setState(prev => ({ ...prev, isDeploying: false }))
    toast.warning("Deployment aborted")
  }, [])

  // Reset deployment state
  const resetDeployment = useCallback(() => {
    deploymentAbortRef.current = false
    setState(prev => ({
      ...prev,
      steps: prev.steps.map(step => ({ 
        ...step, 
        status: 'pending',
        txHash: undefined,
        address: undefined,
        error: undefined,
        gasUsed: undefined,
        deploymentTime: undefined
      })),
      isDeploying: false,
      currentStep: 0,
      deployedAddresses: {},
      error: null,
      deploymentStartTime: undefined
    }))
    toast.info("Deployment reset")
  }, [])

  // Get deployment progress
  const getProgress = useCallback(() => {
    const completed = state.steps.filter(step => step.status === 'completed').length
    const failed = state.steps.filter(step => step.status === 'failed').length
    return {
      completed,
      failed,
      remaining: state.totalSteps - completed - failed,
      percentage: state.totalSteps > 0 ? (completed / state.totalSteps) * 100 : 0
    }
  }, [state.steps, state.totalSteps])

  const progress = getProgress()
  const currentNetwork = getNetworkInfo(configManager.chainId)
  const totalEstimatedCost = Object.values(state.estimatedGasCosts)
    .reduce((sum, cost) => sum + parseFloat(cost), 0)

  if (!provider || !signer) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Contract Deployment</h2>
        <div className="text-center py-8 text-gray-500">
          <div className="mb-4">Wallet not connected</div>
          <div className="text-sm">Please connect your wallet to deploy contracts</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Contract Deployment</h2>
          <p className="text-gray-600">Deploy E-Cash protocol contracts to {currentNetwork.name}</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">
            Estimated Cost: ~{totalEstimatedCost.toFixed(4)} ETH
          </div>
          <div className="text-xs text-gray-400">
            {state.steps.length} contracts
          </div>
        </div>
      </div>

      {/* Error Display */}
      {state.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center mr-3">
              <span className="text-white text-sm">!</span>
            </div>
            <div>
              <h4 className="text-red-900 font-medium">Deployment Error</h4>
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

      {/* Progress Bar */}
      {state.isDeploying && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              Deployment Progress
            </span>
            <span className="text-sm text-gray-500">
              {progress.completed} / {state.totalSteps} contracts
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Deployment Steps */}
      <div className="space-y-4 mb-6">
        {state.steps.map((step, index) => (
          <div
            key={step.id}
            className={`border rounded-lg p-4 transition-all ${
              step.status === 'completed' ? 'border-green-200 bg-green-50' :
              step.status === 'deploying' ? 'border-blue-200 bg-blue-50' :
              step.status === 'failed' ? 'border-red-200 bg-red-50' :
              'border-gray-200 bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {/* Status Icon */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                  step.status === 'completed' ? 'bg-green-500' :
                  step.status === 'deploying' ? 'bg-blue-500' :
                  step.status === 'failed' ? 'bg-red-500' :
                  'bg-gray-400'
                }`}>
                  {step.status === 'completed' ? (
                    <span className="text-white text-sm">✓</span>
                  ) : step.status === 'deploying' ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  ) : step.status === 'failed' ? (
                    <span className="text-white text-sm">✕</span>
                  ) : (
                    <span className="text-white text-sm">{index + 1}</span>
                  )}
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900">{step.name}</h4>
                  <p className="text-sm text-gray-600">{step.description}</p>
                  {step.error && (
                    <p className="text-sm text-red-600 mt-1">Error: {step.error}</p>
                  )}
                </div>
              </div>

              <div className="text-right text-sm text-gray-500">
                {step.address && (
                  <div>
                    <div className="font-mono text-xs">
                      {step.address.slice(0, 6)}...{step.address.slice(-4)}
                    </div>
                    {step.txHash && (
                      <a
                        href={`${currentNetwork.explorer}/tx/${step.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        View TX
                      </a>
                    )}
                  </div>
                )}
                {step.gasUsed && (
                  <div className="text-xs">
                    Gas: {parseInt(step.gasUsed).toLocaleString()}
                  </div>
                )}
                {step.deploymentTime && (
                  <div className="text-xs">
                    {(step.deploymentTime / 1000).toFixed(1)}s
                  </div>
                )}
                {state.estimatedGasCosts[step.id] && (
                  <div className="text-xs">
                    ~{parseFloat(state.estimatedGasCosts[step.id]).toFixed(4)} ETH
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-4">
        {!state.isDeploying ? (
          <>
            <button
              onClick={startDeployment}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Deploy All Contracts
            </button>
            {progress.completed > 0 && (
              <button
                onClick={resetDeployment}
                className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
            )}
          </>
        ) : (
          <button
            onClick={abortDeployment}
            className="flex-1 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            Abort Deployment
          </button>
        )}
      </div>

      {/* Deployment Summary */}
      {progress.completed > 0 && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-2">Deployment Summary</h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-gray-600">Completed</div>
              <div className="font-medium text-green-600">{progress.completed}</div>
            </div>
            <div>
              <div className="text-gray-600">Failed</div>
              <div className="font-medium text-red-600">{progress.failed}</div>
            </div>
            <div>
              <div className="text-gray-600">Remaining</div>
              <div className="font-medium text-gray-600">{progress.remaining}</div>
            </div>
          </div>
          {state.deploymentStartTime && (
            <div className="mt-2 text-xs text-gray-500">
              Started: {new Date(state.deploymentStartTime).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}