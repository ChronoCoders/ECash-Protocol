"use client"

import { useState, useEffect } from "react"
import { ethers } from "ethers"
import { config, configManager, getNetworkInfo } from "../lib/config"

interface NetworkStatusProps {
  provider: ethers.BrowserProvider | null
  account: string
}

export default function NetworkStatus({ provider, account }: NetworkStatusProps) {
  const [networkInfo, setNetworkInfo] = useState<any>(null)
  const [balance, setBalance] = useState<string>("0")
  const [blockNumber, setBlockNumber] = useState<number>(0)
  const [gasPrice, setGasPrice] = useState<string>("0")
  const [connectionError, setConnectionError] = useState<string | null>(null)

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
        
        <div className="bg-red-100 rounded-lg p-3">
          <h4 className="font-medium text-red-900 text-sm mb-2">To connect to localhost:</h4>
          <ol className="text-red-800 text-xs space-y-1">
            <li>1. Start Hardhat node: <code className="bg-red-200 px-1 rounded">npx hardhat node</code></li>
            <li>2. Add localhost network to MetaMask:</li>
            <li className="ml-4">• Network Name: Localhost</li>
            <li className="ml-4">• RPC URL: http://localhost:8545</li>
            <li className="ml-4">• Chain ID: 31337</li>
            <li className="ml-4">• Currency Symbol: ETH</li>
            <li>3. Switch to localhost network in MetaMask</li>
          </ol>
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
            <div>3. Deploy contracts using the deployment manager below</div>
          </div>
        </div>
      )}
    </div>
  )
}
