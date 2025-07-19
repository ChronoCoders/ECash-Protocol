import { ethers, network } from "hardhat"
import fs from "fs"
import path from "path"

async function main() {
  console.log("🚀 Setting up E-Cash Protocol for Testnet Testing...\n")

  if (network.name === "localhost" || network.name === "hardhat") {
    console.log("❌ This script is for testnet deployment only")
    process.exit(1)
  }

  // Load deployment data
  const deploymentsDir = path.join(__dirname, "..", "deployments")
  const deploymentFiles = fs
    .readdirSync(deploymentsDir)
    .filter((file) => file.startsWith(network.name) && file.endsWith(".json"))
    .sort()
    .reverse()

  if (deploymentFiles.length === 0) {
    console.error("❌ No deployment files found. Please deploy contracts first.")
    process.exit(1)
  }

  const latestDeployment = deploymentFiles[0]
  const deploymentPath = path.join(deploymentsDir, latestDeployment)
  const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, "utf8"))

  console.log("📄 Using deployment:", latestDeployment)

  const [deployer] = await ethers.getSigners()
  const contracts = deploymentData.contracts

  // Get contract instances
  const ecashToken = await ethers.getContractAt("ECashToken", contracts.ecashToken)
  const oracleAggregator = await ethers.getContractAt("OracleAggregator", contracts.oracleAggregator)
  const stabilizationController = await ethers.getContractAt(
    "StabilizationController",
    contracts.stabilizationController,
  )
  const chainlinkOracle = await ethers.getContractAt("MockChainlinkOracle", contracts.chainlinkOracle)
  const testHelper = await ethers.getContractAt("TestHelper", contracts.testHelper)

  console.log("\n🔧 Setting up initial test conditions...")

  // Set various price points for testing
  const testPrices = [
    { price: 100000000, description: "$1.00 (Target)" },
    { price: 95000000, description: "$0.95 (-5%)" },
    { price: 105000000, description: "$1.05 (+5%)" },
    { price: 90000000, description: "$0.90 (-10%)" },
    { price: 110000000, description: "$1.10 (+10%)" },
  ]

  for (const testPrice of testPrices) {
    console.log(`\n📊 Testing price: ${testPrice.description}`)

    // Update oracle price
    const updateTx = await chainlinkOracle.updateAnswer(testPrice.price)
    await updateTx.wait()

    // Get protocol status
    try {
      const status = await testHelper.getProtocolStatus()
      console.log(`   Current Price: $${ethers.formatEther(status.currentPrice)}`)
      console.log(`   Deviation: ${(Number(ethers.formatEther(status.deviation)) * 100).toFixed(2)}%`)
      console.log(`   Can Rebase: ${status.canRebase}`)
      console.log(`   Circuit Breaker: ${status.circuitBreakerActive ? "Active" : "Normal"}`)

      // Try to execute rebase if possible
      if (status.canRebase && !status.circuitBreakerActive) {
        console.log("   Executing rebase...")
        const rebaseTx = await stabilizationController.rebase()
        const receipt = await rebaseTx.wait()
        console.log(`   ✅ Rebase executed (Gas: ${receipt?.gasUsed.toString()})`)
      } else {
        console.log("   ⏸️ Rebase not possible")
      }
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`)
    }

    // Small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  // Reset to target price
  console.log("\n🎯 Resetting to target price...")
  const resetTx = await chainlinkOracle.updateAnswer(100000000)
  await resetTx.wait()

  // Reset circuit breaker if active
  const finalStatus = await testHelper.getProtocolStatus()
  if (finalStatus.circuitBreakerActive) {
    console.log("🔄 Resetting circuit breaker...")
    const resetCBTx = await stabilizationController.resetCircuitBreaker()
    await resetCBTx.wait()
    console.log("✅ Circuit breaker reset")
  }

  console.log("\n🎉 Testnet setup complete!")
  console.log("=====================================")
  console.log("📊 Protocol Status:")

  const finalProtocolStatus = await testHelper.getProtocolStatus()
  console.log(`- Current Price: $${ethers.formatEther(finalProtocolStatus.currentPrice)}`)
  console.log(`- Total Supply: ${ethers.formatEther(finalProtocolStatus.totalSupply)} ECASH`)
  console.log(`- Rebase Count: ${finalProtocolStatus.rebaseCount.toString()}`)
  console.log(`- Oracle Confidence: ${finalProtocolStatus.oracleConfidence.toString()}%`)
  console.log(`- System Status: ${finalProtocolStatus.circuitBreakerActive ? "Circuit Breaker Active" : "Normal"}`)

  console.log("\n🌐 Dashboard URLs:")
  console.log(
    `- Etherscan: https://${network.name === "mainnet" ? "" : network.name + "."}etherscan.io/address/${contracts.ecashToken}`,
  )
  console.log("- Dashboard: Connect your wallet and start testing!")

  console.log("\n📋 Test Scenarios Available:")
  console.log("1. Price simulation ($0.95, $1.00, $1.05, $1.25)")
  console.log("2. Stress testing suite (5 different tests)")
  console.log("3. Scenario runner (Market crash, Bull market, etc.)")
  console.log("4. Circuit breaker testing")
  console.log("5. Real-time monitoring and analytics")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Setup failed:", error)
    process.exit(1)
  })
