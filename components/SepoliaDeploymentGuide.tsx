"use client"

import { useState } from "react"
import { toast } from "react-toastify"

export default function SepoliaDeploymentGuide() {
  const [currentStep, setCurrentStep] = useState(0)

  const deploymentSteps = [
    {
      title: "Get Sepolia ETH",
      description: "You need testnet ETH to deploy contracts",
      action: "Get ETH from Faucet",
      link: "https://sepoliafaucet.com/",
      completed: false,
    },
    {
      title: "Configure Environment",
      description: "Update your environment variables for Sepolia",
      action: "Update .env.local",
      completed: false,
    },
    {
      title: "Deploy Contracts",
      description: "Deploy the E-Cash protocol to Sepolia",
      action: "Run Deployment Script",
      completed: false,
    },
    {
      title: "Verify Contracts",
      description: "Verify contracts on Etherscan",
      action: "Run Verification",
      completed: false,
    },
    {
      title: "Test Protocol",
      description: "Run comprehensive tests on Sepolia",
      action: "Execute Test Suite",
      completed: false,
    },
  ]

  const envVariables = `# Update your .env.local file with these values:
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID

# For deployment (keep these secure!)
PRIVATE_KEY=your_private_key_here
ETHERSCAN_API_KEY=your_etherscan_api_key_here
INFURA_PROJECT_ID=your_infura_project_id_here


  const deploymentCommands = `# 1. Install dependencies
npm install

# 2. Compile contracts
npm run compile

# 3. Deploy to Sepolia
npm run deploy:sepolia

# 4. Verify contracts
npm run verify:sepolia

# 5. Setup testnet
npm run setup:testnet --network sepolia`

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard!")
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">S</span>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Sepolia Deployment Guide</h2>
          <p className="text-sm text-gray-600">Deploy E-Cash protocol to Sepolia testnet</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="space-y-4 mb-6">
        {deploymentSteps.map((step, index) => (
          <div key={index} className="flex items-start space-x-4">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                index <= currentStep ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
              }`}
            >
              {index + 1}
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-gray-900">{step.title}</h3>
              <p className="text-sm text-gray-600">{step.description}</p>
              {index === currentStep && (
                <button
                  onClick={() => {
                    if (step.link) {
                      window.open(step.link, "_blank")
                    }
                    setCurrentStep(Math.min(currentStep + 1, deploymentSteps.length - 1))
                  }}
                  className="mt-2 bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
                >
                  {step.action}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Environment Configuration */}
      <div className="mb-6">
        <h3 className="font-medium text-gray-900 mb-3">Environment Configuration</h3>
        <div className="bg-gray-900 text-gray-100 p-4 rounded-lg relative">
          <pre className="text-sm overflow-x-auto">{envVariables}</pre>
          <button
            onClick={() => copyToClipboard(envVariables)}
            className="absolute top-2 right-2 bg-gray-700 text-white px-2 py-1 rounded text-xs hover:bg-gray-600"
          >
            Copy
          </button>
        </div>
      </div>

      {/* Deployment Commands */}
      <div className="mb-6">
        <h3 className="font-medium text-gray-900 mb-3">Deployment Commands</h3>
        <div className="bg-gray-900 text-gray-100 p-4 rounded-lg relative">
          <pre className="text-sm overflow-x-auto">{deploymentCommands}</pre>
          <button
            onClick={() => copyToClipboard(deploymentCommands)}
            className="absolute top-2 right-2 bg-gray-700 text-white px-2 py-1 rounded text-xs hover:bg-gray-600"
          >
            Copy
          </button>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <a
          href="https://sepoliafaucet.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="p-4 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <h4 className="font-medium text-blue-900">Sepolia Faucet</h4>
          <p className="text-sm text-blue-700">Get free testnet ETH</p>
        </a>

        <a
          href="https://sepolia.etherscan.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="p-4 border border-green-200 rounded-lg hover:bg-green-50 transition-colors"
        >
          <h4 className="font-medium text-green-900">Sepolia Explorer</h4>
          <p className="text-sm text-green-700">View transactions</p>
        </a>

        <a
          href="https://infura.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="p-4 border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors"
        >
          <h4 className="font-medium text-purple-900">Infura</h4>
          <p className="text-sm text-purple-700">Get RPC endpoint</p>
        </a>
      </div>
    </div>
  )
}
