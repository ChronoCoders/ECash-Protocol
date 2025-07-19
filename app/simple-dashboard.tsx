"use client"

import { useState, useEffect } from "react"
import { ethers } from "ethers"

export default function SimpleDashboard() {
  const [isConnected, setIsConnected] = useState(false)
  const [account, setAccount] = useState("")
  const [chainId, setChainId] = useState(0)
  const [error, setError] = useState("")

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        setError("MetaMask not detected")
        return
      }

      const provider = new ethers.BrowserProvider(window.ethereum)
      const accounts = await provider.send("eth_requestAccounts", [])
      const network = await provider.getNetwork()
      
      setAccount(accounts[0])
      setChainId(Number(network.chainId))
      setIsConnected(true)
      setError("")
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            E-Cash Protocol Dashboard
          </h1>
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-4 mb-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {!isConnected ? (
            <button
              onClick={connectWallet}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Connect Wallet
            </button>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded p-4">
                <h3 className="font-medium text-green-900">Wallet Connected</h3>
                <p className="text-green-700">Account: {account}</p>
                <p className="text-green-700">Chain ID: {chainId}</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-4">
                <h3 className="font-medium text-blue-900">Next Steps</h3>
                <ol className="list-decimal list-inside text-blue-700 space-y-1">
                  <li>Switch to localhost network (Chain ID: 31337)</li>
                  <li>Start Hardhat node: <code className="bg-blue-100 px-1 rounded">npx hardhat node</code></li>
                  <li>Deploy contracts using the deployment manager</li>
                  <li>Start testing the protocol</li>
                </ol>
              </div>

              {chainId === 31337 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                  <h3 className="font-medium text-yellow-900">Localhost Network Detected</h3>
                  <p className="text-yellow-700">Ready for contract deployment!</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}