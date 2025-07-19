"use client"

import { useState, useCallback, useEffect } from "react"
import { ethers } from "ethers"
import { toast } from "react-toastify"
import { configManager, getNetworkInfo, switchNetwork, type NetworkConfig } from "../lib/config"

interface NetworkSwitcherProps {
  provider: ethers.BrowserProvider | null
  currentChainId: number
  onNetworkChanged?: () => void
}

interface NetworkSwitcherState {
  isLoading: boolean
  isSwitching: boolean
  error: string | null
  supportedNetworks: NetworkConfig[]
  targetChainId: number
}

export default function NetworkSwitcher({ 
  provider, 
  currentChainId, 
  onNetworkChanged 
}: NetworkSwitcherProps) {
  const [state, setState] = useState<NetworkSwitcherState>({
    isLoading: false,
    isSwitching: false,
    error: null,
    supportedNetworks: [],
    targetChainId: configManager.chainId
  })

  // Initialize supported networks
  useEffect(() => {
    const networks = configManager.getSupportedNetworks()
      .filter(network => network.chainId !== currentChainId) // Exclude current network
      .sort((a, b) => {
        // Sort by: testnet status, then by name
        if (a.testnet !== b.testnet) {
          return a.testnet ? 1 : -1 // Production networks first
        }
        return a.name.localeCompare(b.name)
      })

    setState(prev => ({ ...prev, supportedNetworks: networks }))
  }, [currentChainId])

  // Enhanced network switching with comprehensive error handling
  const handleNetworkSwitch = useCallback(async (targetChainId: number) => {
    if (!provider) {
      toast.error("Wallet not connected")
      return
    }

    if (state.isSwitching) {
      toast.warning("Network switch already in progress...")
      return
    }

    setState(prev => ({ 
      ...prev, 
      isSwitching: true, 
      error: null,
      targetChainId 
    }))

    try {
      const targetNetwork = getNetworkInfo(targetChainId)
      toast.info(`Switching to ${targetNetwork.name}...`)

      const success = await switchNetwork(targetChainId)
      
      if (success) {
        toast.success(`Successfully switched to ${targetNetwork.name}`)
        
        // Update config manager
        configManager.updateChainId(targetChainId)
        
        // Notify parent component
        if (onNetworkChanged) {
          // Delay to allow network change to propagate
          setTimeout(onNetworkChanged, 1000)
        }
      } else {
        throw new Error("Network switch failed")
      }

    } catch (error: any) {
      console.error("Network switch error:", error)
      
      let errorMessage = "Failed to switch network"
      
      // Handle specific error types
      if (error.code === 4001) {
        errorMessage = "User rejected the network switch request"
      } else if (error.code === 4902) {
        errorMessage = "Network not found in wallet. Attempting to add..."
        
        // Retry with add network
        try {
          await handleAddNetwork(targetChainId)
          return // Exit early as handleAddNetwork will handle the rest
        } catch (addError) {
          errorMessage = "Failed to add network to wallet"
        }
      } else if (error.code === -32002) {
        errorMessage = "Network switch request already pending in wallet"
      } else if (error.message.includes("unsupported")) {
        errorMessage = `Network ${targetChainId} is not supported`
      } else if (error.message.includes("timeout")) {
        errorMessage = "Network switch timed out. Please try again."
      }

      setState(prev => ({ ...prev, error: errorMessage }))
      toast.error(errorMessage)
    } finally {
      setState(prev => ({ ...prev, isSwitching: false }))
    }
  }, [provider, state.isSwitching, onNetworkChanged])

  // Add network to wallet
  const handleAddNetwork = useCallback(async (chainId: number) => {
    if (!provider || !window.ethereum) {
      throw new Error("Wallet not connected")
    }

    try {
      const network = getNetworkInfo(chainId)
      
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: `0x${chainId.toString(16)}`,
          chainName: network.name,
          rpcUrls: [network.rpcUrl],
          blockExplorerUrls: network.explorer ? [network.explorer] : undefined,
          nativeCurrency: {
            name: network.symbol,
            symbol: network.symbol,
            decimals: 18
          }
        }]
      })

      toast.success(`Added ${network.name} to wallet`)
      
      // Try switching again after adding
      await handleNetworkSwitch(chainId)
      
    } catch (error: any) {
      console.error("Add network error:", error)
      
      if (error.code === 4001) {
        throw new Error("User rejected adding the network")
      } else {
        throw new Error("Failed to add network to wallet")
      }
    }
  }, [provider, handleNetworkSwitch])

  // Get current network info with error handling
  const getCurrentNetworkInfo = useCallback((): NetworkConfig | null => {
    try {
      return getNetworkInfo(currentChainId)
    } catch {
      return null
    }
  }, [currentChainId])

  // Check if contracts are deployed on target network
  const isContractsDeployed = useCallback((chainId: number): boolean => {
    return configManager.isContractsDeployed(chainId)
  }, [])

  // Get network status
  const getNetworkStatus = useCallback((network: NetworkConfig) => {
    const hasContracts = isContractsDeployed(network.chainId)
    const isRecommended = network.chainId === configManager.chainId
    
    if (!hasContracts) {
      return { color: 'text-gray-500', label: 'No Contracts', disabled: true }
    } else if (isRecommended) {
      return { color: 'text-blue-600', label: 'Recommended', disabled: false }
    } else if (network.testnet) {
      return { color: 'text-yellow-600', label: 'Testnet', disabled: false }
    } else {
      return { color: 'text-green-600', label: 'Available', disabled: false }
    }
  }, [isContractsDeployed])

  const currentNetwork = getCurrentNetworkInfo()

  if (!currentNetwork) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center mb-4">
          <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center mr-3">
            <span className="text-white text-sm">!</span>
          </div>
          <h3 className="text-lg font-medium text-red-900">Unsupported Network</h3>
        </div>
        
        <p className="text-red-700 mb-4">
          You're connected to an unsupported network (Chain ID: {currentChainId}).
          Please switch to a supported network to continue.
        </p>
        
        <div className="space-y-2">
          {state.supportedNetworks.slice(0, 3).map((network) => {
            const status = getNetworkStatus(network)
            
            return (
              <button
                key={network.chainId}
                onClick={() => handleNetworkSwitch(network.chainId)}
                disabled={state.isSwitching || status.disabled}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  status.disabled
                    ? "bg-gray-100 border-gray-200 cursor-not-allowed"
                    : "bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                } ${state.isSwitching ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{network.name}</div>
                    <div className="text-sm text-gray-500">
                      Chain ID: {network.chainId} • {network.symbol}
                    </div>
                  </div>
                  <div className={`text-sm font-medium ${status.color}`}>
                    {status.label}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
      {/* Header */}
      <div className="flex items-center mb-4">
        <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center mr-3">
          <span className="text-white text-sm">⚠</span>
        </div>
        <h3 className="text-lg font-medium text-yellow-900">Network Mismatch</h3>
      </div>

      {/* Current Network Info */}
      <div className="bg-white rounded-lg p-4 mb-4">
        <h4 className="font-medium text-gray-900 mb-2">Current Network</h4>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">{currentNetwork.name}</div>
            <div className="text-sm text-gray-500">
              Chain ID: {currentNetwork.chainId} • {currentNetwork.symbol}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-yellow-600 font-medium">
              {isContractsDeployed(currentNetwork.chainId) ? "Contracts Available" : "No Contracts"}
            </div>
            <div className="text-xs text-gray-500">
              {currentNetwork.testnet ? "Testnet" : "Mainnet"}
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {state.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <div className="flex items-center">
            <span className="text-red-500 mr-2">✕</span>
            <span className="text-red-700 text-sm">{state.error}</span>
            <button
              onClick={() => setState(prev => ({ ...prev, error: null }))}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Recommended Network */}
      <div className="mb-4">
        <h4 className="font-medium text-gray-900 mb-2">Recommended Network</h4>
        {(() => {
          const recommended = getNetworkInfo(configManager.chainId)
          const status = getNetworkStatus(recommended)
          
          return (
            <button
              onClick={() => handleNetworkSwitch(recommended.chainId)}
              disabled={state.isSwitching || status.disabled}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                status.disabled
                  ? "bg-gray-100 border-gray-200 cursor-not-allowed"
                  : "bg-blue-50 border-blue-200 hover:border-blue-300 hover:bg-blue-100"
              } ${state.isSwitching ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{recommended.name}</div>
                  <div className="text-sm text-gray-500">
                    Chain ID: {recommended.chainId} • {recommended.symbol}
                    {recommended.faucetUrl && (
                      <span className="ml-2">
                        • <a 
                          href={recommended.faucetUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Faucet
                        </a>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center">
                  {state.isSwitching && state.targetChainId === recommended.chainId && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
                  )}
                  <div className={`text-sm font-medium ${status.color}`}>
                    {status.label}
                  </div>
                </div>
              </div>
            </button>
          )
        })()}
      </div>

      {/* Other Networks */}
      {state.supportedNetworks.length > 0 && (
        <div>
          <h4 className="font-medium text-gray-900 mb-2">Other Networks</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {state.supportedNetworks.map((network) => {
              const status = getNetworkStatus(network)
              
              return (
                <button
                  key={network.chainId}
                  onClick={() => handleNetworkSwitch(network.chainId)}
                  disabled={state.isSwitching || status.disabled}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    status.disabled
                      ? "bg-gray-100 border-gray-200 cursor-not-allowed"
                      : "bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                  } ${state.isSwitching ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900">{network.name}</div>
                      <div className="text-sm text-gray-500">
                        Chain ID: {network.chainId} • {network.symbol}
                        {network.faucetUrl && (
                          <span className="ml-2">
                            • <a 
                              href={network.faucetUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Faucet
                            </a>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center">
                      {state.isSwitching && state.targetChainId === network.chainId && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
                      )}
                      <div className={`text-sm font-medium ${status.color}`}>
                        {status.label}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}