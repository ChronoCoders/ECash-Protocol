"use client"

import { useState, useEffect } from "react"
import { ethers } from "ethers"
import { config, configManager, getNetworkInfo } from "../lib/config"

interface NetworkStatusProps {
  provider: ethers.BrowserProvider | null
  account: string
}

interface RpcDiagnostics {
  url: string
  status: 'checking' | 'success' | 'failed'
  error?: string
  responseTime?: number
}
export default function NetworkStatus({ provider, account }: NetworkStatusProps) {
  const [networkInfo, setNetworkInfo] = useState<any>(null)
  const [balance, setBalance] = useState<string>("0")
  const [blockNumber, setBlockNumber] = useState<number>(0)
  const [gasPrice, setGasPrice] = useState<string>("0")
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [rpcDiagnostics, setRpcDiagnostics] = useState<RpcDiagnostics[]>([])

  // Test RPC endpoints
  const testRpcEndpoints = async () => {
    const endpoints = [
      'http://127.0.0.1:8545',
      'http://localhost:8545',
      'http://0.0.0.0:8545'
    ]

    const diagnostics: RpcDiagnostics[] = []

    for (const url of endpoints) {
      const diagnostic: RpcDiagnostics = { url, status: 'checking' }
      diagnostics.push(diagnostic)
      setRpcDiagnostics([...diagnostics])

      try {
        const startTime = Date.now()
        
        // Test with fetch first
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_blockNumber',
            params: [],
            id: 1
          })
        })

        if (response.ok) {
          const data = await response.json()
          if (data.result) {
            diagnostic.status = 'success'
            diagnostic.responseTime = Date.now() - startTime
          } else {
            diagnostic.status = 'failed'
            diagnostic.error = 'Invalid response'
          }
        } else {
          diagnostic.status = 'failed'
          diagnostic.error = `HTTP ${response.status}`
        }
      } catch (error: any) {
        diagnostic.status = 'failed'
        diagnostic.error = error.message
      }

      setRpcDiagnostics([...diagnostics])
    }
  }
  useEffect(() => {
    if (!provider) return

    const fetchNetworkInfo = async () => {
      try {
        setConnectionError(null)
        const network = await provider.getNetwork()
        const chainId = Number(network.chainId)
        
        let info
        try {
          info = getNetworkInfo(chainId)
        } catch {
          // Handle unsupported networks
          info = {
            name: `Unknown Network`,
            symbol: "ETH",
            explorer: "",
            testnet: true,
            chainId: chainId
          }
        }
        
        setNetworkInfo({ ...info, chainId })

        if (account) {
          const balance = await provider.getBalance(account)
          setBalance(ethers.formatEther(balance))
        }

        const blockNumber = await provider.getBlockNumber()
        setBlockNumber(blockNumber)

        const feeData = await provider.getFeeData()
        if (feeData.gasPrice) {
          setGasPrice(ethers.formatUnits(feeData.gasPrice, "gwei"))
        }
      } catch (error) {
        console.error("Failed to fetch network info:", error)
        
        let errorMessage = "Failed to fetch network information"
        if (error.message.includes("could not detect network")) {
          errorMessage = "Could not detect network. Check RPC connection."
          // Trigger RPC diagnostics when there's a connection issue
          testRpcEndpoints()
        } else if (error.message.includes("network")) {
          errorMessage = "Network connection error. Please check your connection."
        }
        
        setConnectionError(errorMessage)
      }
    }

    fetchNetworkInfo()

    // Update block number periodically
    const interval = setInterval(async () => {
      try {
        const blockNumber = await provider.getBlockNumber()
        setBlockNumber(blockNumber)
        setConnectionError(null) // Clear error if successful
      } catch (error) {
        console.error("Failed to fetch block number:", error)
      }
    }, 10000) // Every 10 seconds

    return () => clearInterval(interval)
  }, [provider, account])

  if (connectionError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center mb-3">
          <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center mr-3">
            <span className="text-white text-sm">!</span>
          </div>
          <h3 className="font-medium text-red-900">Connection Error</h3>
        </div>
        <p className="text-red-700 text-sm mb-3">{connectionError}</p>
        
        {/* RPC Diagnostics */}
        {rpcDiagnostics.length > 0 && (
          <div className="bg-red-100 rounded-lg p-3 mb-3">
            <h4 className="font-medium text-red-900 text-sm mb-2">RPC Endpoint Test Results:</h4>
            <div className="space-y-1">
              {rpcDiagnostics.map((diagnostic, index) => (
                <div key={index} className="flex items-center justify-between text-xs">
                  <code className="bg-red-200 px-1 rounded">{diagnostic.url}</code>
                  <div className="flex items-center">
                    {diagnostic.status === 'checking' && (
                      <span className="text-blue-600">Testing...</span>
                    )}
                    {diagnostic.status === 'success' && (
                      <span className="text-green-600">✓ Working ({diagnostic.responseTime}ms)</span>
                    )}
                    {diagnostic.status === 'failed' && (
                      <span className="text-red-600">✗ {diagnostic.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-red-100 rounded-lg p-3">
          <h4 className="font-medium text-red-900 text-sm mb-2">To connect to localhost:</h4>
          <ol className="text-red-800 text-xs space-y-1">
            <li>1. Start Hardhat node: <code className="bg-red-200 px-1 rounded">npx hardhat node</code></li>
            <li>2. Add localhost network to MetaMask:</li>
            <li className="ml-4">• Network Name: Localhost</li>
            <li className="ml-4">• RPC URL: <code className="bg-red-200 px-1 rounded">http://127.0.0.1:8545</code> (try this first)</li>
            <li className="ml-4">• Alternative: <code className="bg-red-200 px-1 rounded">http://localhost:8545</code></li>
            <li className="ml-4">• Chain ID: 31337</li>
            <li className="ml-4">• Currency Symbol: ETH</li>
            <li>3. Switch to localhost network in MetaMask</li>
            <li>4. If still failing, try restarting MetaMask</li>
          </ol>
          
          <div className="mt-2 pt-2 border-t border-red-200">
            <button
              onClick={testRpcEndpoints}
              className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-700"
            >
              Test RPC Endpoints
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!networkInfo) {
    return (
      <div className="bg-gray-100 rounded-lg p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-gray-300 rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  const isSupported = configManager.isNetworkSupported(networkInfo.chainId)
  const hasContracts = isSupported && configManager.isContractsDeployed(networkInfo.chainId)

  return (
    <div
      className={`rounded-lg p-4 ${
        hasContracts ? "bg-green-50 border border-green-200" : 
        isSupported ? "bg-yellow-50 border border-yellow-200" : 
        "bg-red-50 border border-red-200"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900">Network Status</h3>
        <div
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            hasContracts ? "bg-green-100 text-green-800" : 
            isSupported ? "bg-yellow-100 text-yellow-800" : 
            "bg-red-100 text-red-800"
          }`}
        >
          {hasContracts ? "Ready" : isSupported ? "No Contracts" : "Unsupported"}
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Network:</span>
          <span className={`font-medium ${
            hasContracts ? "text-gray-900" : 
            isSupported ? "text-yellow-700" : 
            "text-red-700"
          }`}>
            {networkInfo.name}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Chain ID:</span>
          <span className={`font-medium ${
            hasContracts ? "text-gray-900" : 
            isSupported ? "text-yellow-700" : 
            "text-red-700"
          }`}>
            {networkInfo.chainId}
          </span>
        </div>

        {account && (
          <div className="flex justify-between">
            <span className="text-gray-600">Balance:</span>
            <span className="font-medium">
              {Number.parseFloat(balance).toFixed(4)} {networkInfo.symbol}
            </span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-gray-600">Block:</span>
          <span className="font-medium">#{blockNumber.toLocaleString()}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Gas Price:</span>
          <span className="font-medium">{Number.parseFloat(gasPrice).toFixed(2)} Gwei</span>
        </div>
      </div>

      {!hasContracts && (
        <div className={`mt-3 p-3 rounded-lg ${
          isSupported ? "bg-yellow-100" : "bg-red-100"
        }`}>
          <div className={`text-sm font-medium mb-2 ${
            isSupported ? "text-yellow-800" : "text-red-800"
          }`}>
            {isSupported ? "⚠️ No contracts deployed" : "❌ Unsupported network"}
          </div>
          <div className={`text-xs ${
            isSupported ? "text-yellow-700" : "text-red-700"
          }`}>
            {isSupported ? 
              "Deploy contracts or switch to a network with deployed contracts" :
              "Please switch to a supported network (localhost, Sepolia, etc.)"
            }
          </div>
          {networkInfo.chainId === 1 && (
            <div className={`text-xs mt-1 ${
              isSupported ? "text-yellow-700" : "text-red-700"
            }`}>
              💡 For testing, switch to localhost: <code className={`px-1 rounded ${
                isSupported ? "bg-yellow-200" : "bg-red-200"
              }`}>Chain ID: 31337</code>
            </div>
          )}
        </div>
      )}
      
      {networkInfo.chainId === 31337 && !hasContracts && (
        <div className="mt-3 p-3 bg-blue-100 rounded-lg">
          <div className="text-sm text-blue-800 font-medium mb-2">
            🚀 Localhost Setup
          </div>
          <div className="text-xs text-blue-700 space-y-1">
            <div>1. Start Hardhat node:</div>
            <div className="ml-2">
              <code className="bg-blue-200 px-1 rounded">npx hardhat node</code>
            </div>
            <div>2. Add network to MetaMask:</div>
            <div className="ml-2 text-xs">
              <div>• Network Name: <code className="bg-blue-200 px-1 rounded">Localhost</code></div>
              <div>• RPC URL: <code className="bg-blue-200 px-1 rounded">http://127.0.0.1:8545</code></div>
              <div>• Chain ID: <code className="bg-blue-200 px-1 rounded">31337</code></div>
              <div>• Currency: <code className="bg-blue-200 px-1 rounded">ETH</code></div>
            </div>
            <div>2. Add network to MetaMask:</div>
            <div className="ml-2 text-xs">
              <div>• Network Name: <code className="bg-blue-200 px-1 rounded">Localhost</code></div>
              <div>• RPC URL: <code className="bg-blue-200 px-1 rounded">http://127.0.0.1:8545</code></div>
              <div>• Chain ID: <code className="bg-blue-200 px-1 rounded">31337</code></div>
              <div>• Currency: <code className="bg-blue-200 px-1 rounded">ETH</code></div>
            </div>
            <div>3. Deploy contracts using the deployment manager below</div>
          </div>
        </div>
      )}
    </div>
  )
}
