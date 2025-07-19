"use client"

import { useState, useEffect } from "react"
import { ethers } from "ethers"
import { config, getNetworkInfo } from "../lib/config"

interface NetworkStatusProps {
  provider: ethers.BrowserProvider | null
  account: string
}

export default function NetworkStatus({ provider, account }: NetworkStatusProps) {
  const [networkInfo, setNetworkInfo] = useState<any>(null)
  const [balance, setBalance] = useState<string>("0")
  const [blockNumber, setBlockNumber] = useState<number>(0)
  const [gasPrice, setGasPrice] = useState<string>("0")

  useEffect(() => {
    if (!provider) return

    const fetchNetworkInfo = async () => {
      try {
        const network = await provider.getNetwork()
        const info = getNetworkInfo(Number(network.chainId))
        setNetworkInfo({ ...info, chainId: Number(network.chainId) })

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
      }
    }

    fetchNetworkInfo()

    // Update block number periodically
    const interval = setInterval(async () => {
      try {
        const blockNumber = await provider.getBlockNumber()
        setBlockNumber(blockNumber)
      } catch (error) {
        console.error("Failed to fetch block number:", error)
      }
    }, 10000) // Every 10 seconds

    return () => clearInterval(interval)
  }, [provider, account])

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

  const isCorrectNetwork = networkInfo.chainId === config.chainId

  return (
    <div
      className={`rounded-lg p-4 ${isCorrectNetwork ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900">Network Status</h3>
        <div
          className={`px-2 py-1 rounded text-xs ${isCorrectNetwork ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
        >
          {isCorrectNetwork ? "Connected" : "Wrong Network"}
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Network:</span>
          <span className="font-medium">{networkInfo.name}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Chain ID:</span>
          <span className="font-medium">{networkInfo.chainId}</span>
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

      {!isCorrectNetwork && (
        <div className="mt-3 p-2 bg-red-100 rounded text-sm text-red-800">
          Please switch to {getNetworkInfo(config.chainId).name} (Chain ID: {config.chainId})
        </div>
      )}
    </div>
  )
}
