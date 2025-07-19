import { ethers, upgrades, network } from "hardhat"
import fs from "fs"
import path from "path"

interface DeploymentData {
  network: string
  chainId: number | undefined
  deployer: string
  timestamp: string
  contracts: Record<string, string>
  gasUsed: Record<string, string>
  transactionHashes: Record<string, string>
}

async function main() {
  console.log("🚀 Starting E-Cash Protocol Deployment to Sepolia...\n")

  if (network.name !== "sepolia") {
    console.error("❌ This script is for Sepolia deployment only")
    process.exit(1)
  }

  const [deployer] = await ethers.getSigners()
  console.log("Deploying contracts with account:", deployer.address)
  
  // Check balance
  const balance = await ethers.provider.getBalance(deployer.address)
  console.log("Account balance:", ethers.formatEther(balance), "ETH")
  
  if (balance < ethers.parseEther("0.1")) {
    console.error("❌ Insufficient balance. Need at least 0.1 ETH for deployment.")
    console.log("💡 Get Sepolia ETH from: https://sepoliafaucet.com/")
    process.exit(1)
  }

  console.log("Network:", network.name)
  console.log("Chain ID:", network.config.chainId)

  const deploymentData: DeploymentData = {
    network: network.name,
    chainId: network.config.chainId,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {},
    gasUsed: {},
    transactionHashes: {},
  }

  // Deploy MockChainlinkOracle first
  console.log("\n📊 Deploying MockChainlinkOracle...")
  const MockChainlinkOracle = await ethers.getContractFactory("MockChainlinkOracle")
  const chainlinkOracle = await MockChainlinkOracle.deploy(8, "ETH/USD")
  const oracleReceipt = await chainlinkOracle.deploymentTransaction()?.wait()

  const oracleAddress = await chainlinkOracle.getAddress()
  deploymentData.contracts.chainlinkOracle = oracleAddress
  deploymentData.gasUsed.chainlinkOracle = oracleReceipt?.gasUsed.toString() || "0"
  deploymentData.transactionHashes.chainlinkOracle = oracleReceipt?.hash || ""
  console.log("✅ MockChainlinkOracle deployed to:", oracleAddress)
  console.log("   Gas used:", oracleReceipt?.gasUsed.toString())

  // Set initial price to $1.00
  const setPriceTx = await chainlinkOracle.updateAnswer(100000000) // $1.00 with 8 decimals
  await setPriceTx.wait()
  console.log("✅ Initial price set to $1.00")

  // Deploy ECashToken
  console.log("\n🪙 Deploying ECashToken...")
  const ECashToken = await ethers.getContractFactory("ECashToken")
  const ecashToken = await upgrades.deployProxy(ECashToken, ["E-Cash", "ECASH", deployer.address], {
    initializer: "initialize",
  })
  await ecashToken.waitForDeployment()

  const ecashAddress = await ecashToken.getAddress()
  deploymentData.contracts.ecashToken = ecashAddress
  console.log("✅ ECashToken deployed to:", ecashAddress)

  // Deploy OracleAggregator
  console.log("\n🔮 Deploying OracleAggregator...")
  const OracleAggregator = await ethers.getContractFactory("OracleAggregator")
  const oracleAggregator = await upgrades.deployProxy(OracleAggregator, [deployer.address], {
    initializer: "initialize",
  })
  await oracleAggregator.waitForDeployment()

  const aggregatorAddress = await oracleAggregator.getAddress()
  deploymentData.contracts.oracleAggregator = aggregatorAddress
  console.log("✅ OracleAggregator deployed to:", aggregatorAddress)

  // Add oracle to aggregator
  const addOracleTx = await oracleAggregator.addOracle(
    "chainlink-eth-usd",
    oracleAddress,
    100, // 100% weight
    3600, // 1 hour heartbeat
    8, // 8 decimals
    "Chainlink ETH/USD",
  )
  await addOracleTx.wait()
  console.log("✅ Oracle added to aggregator")

  // Deploy Treasury
  console.log("\n🏦 Deploying Treasury...")
  const Treasury = await ethers.getContractFactory("Treasury")
  const treasury = await upgrades.deployProxy(Treasury, [deployer.address], { initializer: "initialize" })
  await treasury.waitForDeployment()

  const treasuryAddress = await treasury.getAddress()
  deploymentData.contracts.treasury = treasuryAddress
  console.log("✅ Treasury deployed to:", treasuryAddress)

  // Deploy StabilizationController
  console.log("\n⚖️ Deploying StabilizationController...")
  const StabilizationController = await ethers.getContractFactory("StabilizationController")
  const stabilizationController = await upgrades.deployProxy(
    StabilizationController,
    [deployer.address, ecashAddress, aggregatorAddress, treasuryAddress],
    { initializer: "initialize" },
  )
  await stabilizationController.waitForDeployment()

  const controllerAddress = await stabilizationController.getAddress()
  deploymentData.contracts.stabilizationController = controllerAddress
  console.log("✅ StabilizationController deployed to:", controllerAddress)

  // Grant REBASER_ROLE to StabilizationController
  const REBASER_ROLE = await ecashToken.REBASER_ROLE()
  const grantRoleTx = await ecashToken.grantRole(REBASER_ROLE, controllerAddress)
  await grantRoleTx.wait()
  console.log("✅ REBASER_ROLE granted to StabilizationController")

  // Deploy TestHelper
  console.log("\n🧪 Deploying TestHelper...")
  const TestHelper = await ethers.getContractFactory("TestHelper")
  const testHelper = await TestHelper.deploy(
    ecashAddress,
    aggregatorAddress,
    controllerAddress,
    treasuryAddress,
    oracleAddress,
  )
  const testHelperReceipt = await testHelper.deploymentTransaction()?.wait()

  const testHelperAddress = await testHelper.getAddress()
  deploymentData.contracts.testHelper = testHelperAddress
  deploymentData.gasUsed.testHelper = testHelperReceipt?.gasUsed.toString() || "0"
  deploymentData.transactionHashes.testHelper = testHelperReceipt?.hash || ""
  console.log("✅ TestHelper deployed to:", testHelperAddress)

  // Summary
  console.log("\n🎉 Sepolia Deployment Complete!")
  console.log("=====================================")
  console.log("Contract Addresses:")
  console.log("- ECashToken:", ecashAddress)
  console.log("- OracleAggregator:", aggregatorAddress)
  console.log("- StabilizationController:", controllerAddress)
  console.log("- Treasury:", treasuryAddress)
  console.log("- MockChainlinkOracle:", oracleAddress)
  console.log("- TestHelper:", testHelperAddress)
  console.log("=====================================")

  // Save deployment data
  const deploymentsDir = path.join(__dirname, "..", "deployments")
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true })
  }

  const deploymentFile = path.join(deploymentsDir, `sepolia-${Date.now()}.json`)
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentData, null, 2))
  console.log("📝 Deployment data saved to:", deploymentFile)

  // Update .env.local file with contract addresses
  const envPath = path.join(__dirname, "..", ".env.local")
  let envContent = ""

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8")
  }

  // Update contract addresses for Sepolia
  const contractEnvVars = {
    NEXT_PUBLIC_11155111_ECASH_TOKEN: ecashAddress,
    NEXT_PUBLIC_11155111_ORACLE_AGGREGATOR: aggregatorAddress,
    NEXT_PUBLIC_11155111_STABILIZATION_CONTROLLER: controllerAddress,
    NEXT_PUBLIC_11155111_TREASURY: treasuryAddress,
    NEXT_PUBLIC_11155111_TEST_HELPER: testHelperAddress,
    NEXT_PUBLIC_11155111_CHAINLINK_ORACLE: oracleAddress,
  }

  Object.entries(contractEnvVars).forEach(([key, value]) => {
    const regex = new RegExp(`^${key}=.*$`, "m")
    if (envContent.match(regex)) {
      envContent = envContent.replace(regex, `${key}=${value}`)
    } else {
      envContent += `\n${key}=${value}`
    }
  })

  fs.writeFileSync(envPath, envContent.trim() + "\n")
  console.log("📝 Contract addresses updated in .env.local")

  // Etherscan verification info
  console.log("\n📋 Etherscan Verification Commands:")
  console.log(`npx hardhat verify --network sepolia ${oracleAddress} 8 "ETH/USD"`)
  console.log(`npx hardhat verify --network sepolia ${testHelperAddress} ${ecashAddress} ${aggregatorAddress} ${controllerAddress} ${treasuryAddress} ${oracleAddress}`)

  console.log("\n🌐 Sepolia Links:")
  console.log(`- Etherscan: https://sepolia.etherscan.io/address/${ecashAddress}`)
  console.log("- Dashboard: Update your MetaMask to Sepolia and refresh!")

  console.log("\n✨ E-Cash Protocol is ready for Sepolia testing!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Sepolia deployment failed:", error)
    process.exit(1)
  })