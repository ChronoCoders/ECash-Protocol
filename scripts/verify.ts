import { run, network } from "hardhat"
import fs from "fs"
import path from "path"

async function main() {
  console.log("🔍 Starting Contract Verification...\n")

  // Load deployment data
  const deploymentsDir = path.join(__dirname, "..", "deployments")
  const deploymentFiles = fs
    .readdirSync(deploymentsDir)
    .filter((file) => file.startsWith(network.name) && file.endsWith(".json"))
    .sort()
    .reverse() // Get the latest deployment

  if (deploymentFiles.length === 0) {
    console.error("❌ No deployment files found for network:", network.name)
    process.exit(1)
  }

  const latestDeployment = deploymentFiles[0]
  const deploymentPath = path.join(deploymentsDir, latestDeployment)
  const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, "utf8"))

  console.log("📄 Using deployment file:", latestDeployment)
  console.log("🌐 Network:", deploymentData.network)
  console.log("⏰ Deployed at:", deploymentData.timestamp)

  const contracts = deploymentData.contracts

  try {
    // Verify MockChainlinkOracle
    console.log("\n📊 Verifying MockChainlinkOracle...")
    await run("verify:verify", {
      address: contracts.chainlinkOracle,
      constructorArguments: [8, "ETH/USD"],
    })
    console.log("✅ MockChainlinkOracle verified")

    // Verify TestHelper
    console.log("\n🧪 Verifying TestHelper...")
    await run("verify:verify", {
      address: contracts.testHelper,
      constructorArguments: [
        contracts.ecashToken,
        contracts.oracleAggregator,
        contracts.stabilizationController,
        contracts.treasury,
        contracts.chainlinkOracle,
      ],
    })
    console.log("✅ TestHelper verified")

    // Note: Proxy contracts (ECashToken, OracleAggregator, etc.) need special verification
    console.log("\n📝 Note: Upgradeable proxy contracts require manual verification")
    console.log("   Use the Etherscan UI or hardhat-upgrades plugin for proxy verification")

    console.log("\n🎉 Verification Complete!")
  } catch (error: any) {
    console.error("❌ Verification failed:", error.message)

    if (error.message.includes("Already Verified")) {
      console.log("ℹ️ Some contracts were already verified")
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Verification script failed:", error)
    process.exit(1)
  })
