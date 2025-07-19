import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers"
import type {
  ECashToken,
  OracleAggregator,
  StabilizationController,
  Treasury,
  MockChainlinkOracle,
  TestHelper,
} from "../typechain-types"

describe("E-Cash Protocol", () => {
  let ecashToken: ECashToken
  let oracleAggregator: OracleAggregator
  let stabilizationController: StabilizationController
  let treasury: Treasury
  let chainlinkOracle: MockChainlinkOracle
  let testHelper: TestHelper
  let owner: SignerWithAddress
  let user1: SignerWithAddress
  let user2: SignerWithAddress

  beforeEach(async () => {
    ;[owner, user1, user2] = await ethers.getSigners()

    // Deploy MockChainlinkOracle
    const MockChainlinkOracle = await ethers.getContractFactory("MockChainlinkOracle")
    chainlinkOracle = await MockChainlinkOracle.deploy(8, "ETH/USD")
    await chainlinkOracle.waitForDeployment()
    await chainlinkOracle.updateAnswer(100000000) // $1.00

    // Deploy ECashToken
    const ECashToken = await ethers.getContractFactory("ECashToken")
    ecashToken = (await upgrades.deployProxy(ECashToken, ["E-Cash", "ECASH", owner.address], {
      initializer: "initialize",
    })) as unknown as ECashToken
    await ecashToken.waitForDeployment()

    // Deploy OracleAggregator
    const OracleAggregator = await ethers.getContractFactory("OracleAggregator")
    oracleAggregator = (await upgrades.deployProxy(OracleAggregator, [owner.address], {
      initializer: "initialize",
    })) as unknown as OracleAggregator
    await oracleAggregator.waitForDeployment()

    // Add oracle
    await oracleAggregator.addOracle(
      "chainlink-eth-usd",
      await chainlinkOracle.getAddress(),
      100,
      3600,
      8,
      "Chainlink ETH/USD",
    )

    // Deploy Treasury
    const Treasury = await ethers.getContractFactory("Treasury")
    treasury = (await upgrades.deployProxy(Treasury, [owner.address], {
      initializer: "initialize",
    })) as unknown as Treasury
    await treasury.waitForDeployment()

    // Deploy StabilizationController
    const StabilizationController = await ethers.getContractFactory("StabilizationController")
    stabilizationController = (await upgrades.deployProxy(
      StabilizationController,
      [owner.address, await ecashToken.getAddress(), await oracleAggregator.getAddress(), await treasury.getAddress()],
      { initializer: "initialize" },
    )) as unknown as StabilizationController
    await stabilizationController.waitForDeployment()

    // Grant roles
    const REBASER_ROLE = await ecashToken.REBASER_ROLE()
    await ecashToken.grantRole(REBASER_ROLE, await stabilizationController.getAddress())

    // Deploy TestHelper
    const TestHelper = await ethers.getContractFactory("TestHelper")
    testHelper = await TestHelper.deploy(
      await ecashToken.getAddress(),
      await oracleAggregator.getAddress(),
      await stabilizationController.getAddress(),
      await treasury.getAddress(),
      await chainlinkOracle.getAddress(),
    )
    await testHelper.waitForDeployment()
  })

  describe("ECashToken", () => {
    it("Should have correct initial supply", async () => {
      const totalSupply = await ecashToken.totalSupply()
      expect(totalSupply).to.equal(ethers.parseEther("1000000"))
    })

    it("Should rebase correctly", async () => {
      const initialSupply = await ecashToken.totalSupply()
      const supplyDelta = ethers.parseEther("100000") // 10% increase

      await ecashToken.rebase(supplyDelta)

      const newSupply = await ecashToken.totalSupply()
      expect(newSupply).to.equal(initialSupply + supplyDelta)
    })

    it("Should maintain balance proportions after rebase", async () => {
      // Transfer some tokens to user1
      const transferAmount = ethers.parseEther("100000")
      await ecashToken.transfer(user1.address, transferAmount)

      const ownerBalanceBefore = await ecashToken.balanceOf(owner.address)
      const user1BalanceBefore = await ecashToken.balanceOf(user1.address)
      const totalSupplyBefore = await ecashToken.totalSupply()

      // Rebase with 10% increase
      const supplyDelta = totalSupplyBefore / 10n
      await ecashToken.rebase(supplyDelta)

      const ownerBalanceAfter = await ecashToken.balanceOf(owner.address)
      const user1BalanceAfter = await ecashToken.balanceOf(user1.address)
      const totalSupplyAfter = await ecashToken.totalSupply()

      // Check proportions are maintained (within 1% tolerance)
      const ownerProportion = (ownerBalanceAfter * 1000n) / totalSupplyAfter
      const expectedOwnerProportion = (ownerBalanceBefore * 1000n) / totalSupplyBefore

      expect(ownerProportion).to.be.closeTo(expectedOwnerProportion, 1n)
    })

    it("Should handle negative rebase", async () => {
      const initialSupply = await ecashToken.totalSupply()
      const supplyDelta = -ethers.parseEther("50000") // 5% decrease

      await ecashToken.rebase(supplyDelta)

      const newSupply = await ecashToken.totalSupply()
      expect(newSupply).to.equal(initialSupply - ethers.parseEther("50000"))
    })

    it("Should prevent unauthorized rebase", async () => {
      const supplyDelta = ethers.parseEther("100000")

      await expect(ecashToken.connect(user1).rebase(supplyDelta)).to.be.reverted
    })
  })

  describe("OracleAggregator", () => {
    it("Should return correct aggregated price", async () => {
      const [price, , confidence] = await oracleAggregator.getAggregatedPrice()
      expect(price).to.equal(ethers.parseEther("1.0"))
      expect(confidence).to.equal(100)
    })

    it("Should handle oracle updates", async () => {
      await chainlinkOracle.updateAnswer(105000000) // $1.05
      const [price] = await oracleAggregator.getAggregatedPrice()
      expect(price).to.equal(ethers.parseEther("1.05"))
    })

    it("Should handle multiple oracles", async () => {
      // Deploy second oracle
      const MockChainlinkOracle2 = await ethers.getContractFactory("MockChainlinkOracle")
      const chainlinkOracle2 = await MockChainlinkOracle2.deploy(8, "ETH/USD-2")
      await chainlinkOracle2.waitForDeployment()
      await chainlinkOracle2.updateAnswer(102000000) // $1.02

      // Add second oracle with 50% weight
      await oracleAggregator.addOracle(
        "chainlink-eth-usd-2",
        await chainlinkOracle2.getAddress(),
        50,
        3600,
        8,
        "Chainlink ETH/USD-2",
      )

      // Update first oracle weight to 50%
      await oracleAggregator.updateOracle("chainlink-eth-usd", 50, 3600)

      // Price should be weighted average: (1.00 * 50 + 1.02 * 50) / 100 = 1.01
      const [price] = await oracleAggregator.getAggregatedPrice()
      expect(price).to.equal(ethers.parseEther("1.01"))
    })
  })

  describe("StabilizationController", () => {
    it("Should execute rebase when price deviates", async () => {
      // Set price to $1.02 (2% above target)
      await chainlinkOracle.updateAnswer(102000000)

      const initialSupply = await ecashToken.totalSupply()
      await stabilizationController.rebase()
      const newSupply = await ecashToken.totalSupply()

      expect(newSupply).to.be.gt(initialSupply)
    })

    it("Should activate circuit breaker for extreme prices", async () => {
      // Set extreme price to trigger circuit breaker
      await chainlinkOracle.updateAnswer(75000000) // $0.75 (-25%)

      await stabilizationController.rebase()
      const circuitBreakerActive = await stabilizationController.circuitBreakerActive()

      expect(circuitBreakerActive).to.be.true
    })

    it("Should respect rebase cooldown", async () => {
      await chainlinkOracle.updateAnswer(102000000)
      await stabilizationController.rebase()

      // Try to rebase again immediately
      await expect(stabilizationController.rebase()).to.be.revertedWith("Rebase conditions not met")
    })

    it("Should preview rebase correctly", async () => {
      await chainlinkOracle.updateAnswer(103000000) // $1.03

      const [canExecute, currentPrice, deviation, projectedSupplyDelta, stabilityBand] =
        await stabilizationController.previewRebase()

      expect(canExecute).to.be.true
      expect(currentPrice).to.equal(ethers.parseEther("1.03"))
      expect(deviation).to.be.gt(0)
      expect(projectedSupplyDelta).to.be.gt(0)
      expect(stabilityBand).to.be.gte(1)
    })

    it("Should handle different stability bands", async () => {
      const testCases = [
        { price: 101500000, expectedBand: 1 }, // $1.015 (1.5% deviation)
        { price: 107000000, expectedBand: 2 }, // $1.07 (7% deviation)
        { price: 112000000, expectedBand: 3 }, // $1.12 (12% deviation)
        { price: 125000000, expectedBand: 4 }, // $1.25 (25% deviation)
      ]

      for (const testCase of testCases) {
        await chainlinkOracle.updateAnswer(testCase.price)
        const [, , , , stabilityBand] = await stabilizationController.previewRebase()
        expect(stabilityBand).to.equal(testCase.expectedBand)
      }
    })
  })

  describe("TestHelper", () => {
    it("Should return correct protocol status", async () => {
      const status = await testHelper.getProtocolStatus()

      expect(status.targetPrice).to.equal(ethers.parseEther("1.0"))
      expect(status.totalSupply).to.equal(ethers.parseEther("1000000"))
      expect(status.circuitBreakerActive).to.be.false
    })

    it("Should execute test scenarios", async () => {
      const success = await testHelper.testNormalRebase()
      expect(success).to.be.true
    })

    it("Should simulate market crash", async () => {
      const success = await testHelper.simulateMarketCrash()
      expect(success).to.be.true

      // Check if circuit breaker was activated
      const status = await testHelper.getProtocolStatus()
      expect(status.circuitBreakerActive).to.be.true
    })

    it("Should simulate bull market", async () => {
      const success = await testHelper.simulateBullMarket()
      expect(success).to.be.true

      // Check if supply increased
      const status = await testHelper.getProtocolStatus()
      expect(status.totalSupply).to.be.gt(ethers.parseEther("1000000"))
    })
  })

  describe("Integration Tests", () => {
    it("Should handle complete rebase cycle", async () => {
      // Set price above target
      await chainlinkOracle.updateAnswer(103000000) // $1.03

      const initialSupply = await ecashToken.totalSupply()
      const [initialPrice] = await oracleAggregator.getAggregatedPrice()

      // Execute rebase
      await stabilizationController.rebase()

      const newSupply = await ecashToken.totalSupply()
      const rebaseCount = await stabilizationController.rebaseCount()

      expect(newSupply).to.be.gt(initialSupply)
      expect(rebaseCount).to.equal(1)
    })

    it("Should handle market crash scenario", async () => {
      const prices = [95000000, 90000000, 85000000, 80000000, 75000000]

      for (const price of prices) {
        await chainlinkOracle.updateAnswer(price)

        try {
          await stabilizationController.rebase()
        } catch (error) {
          // Expected for extreme prices
        }
      }

      const circuitBreakerActive = await stabilizationController.circuitBreakerActive()
      expect(circuitBreakerActive).to.be.true
    })

    it("Should recover from circuit breaker", async () => {
      // Trigger circuit breaker
      await chainlinkOracle.updateAnswer(75000000)
      await stabilizationController.rebase()

      let circuitBreakerActive = await stabilizationController.circuitBreakerActive()
      expect(circuitBreakerActive).to.be.true

      // Reset circuit breaker
      await stabilizationController.resetCircuitBreaker()
      circuitBreakerActive = await stabilizationController.circuitBreakerActive()
      expect(circuitBreakerActive).to.be.false

      // Restore normal price and test rebase
      await chainlinkOracle.updateAnswer(100000000)
      await stabilizationController.rebase()
    })

    it("Should maintain system invariants", async () => {
      const initialSupply = await ecashToken.totalSupply()

      // Execute multiple rebases with different prices
      const prices = [102000000, 98000000, 105000000, 95000000, 100000000]

      for (const price of prices) {
        await chainlinkOracle.updateAnswer(price)

        if (await stabilizationController.canRebase()) {
          await stabilizationController.rebase()
        }

        // Wait for cooldown
        await ethers.provider.send("evm_increaseTime", [43200]) // 12 hours
        await ethers.provider.send("evm_mine", [])
      }

      // Check that total supply is reasonable
      const finalSupply = await ecashToken.totalSupply()
      expect(finalSupply).to.be.gt(initialSupply / 2n) // Not less than 50% of initial
      expect(finalSupply).to.be.lt(initialSupply * 2n) // Not more than 200% of initial
    })
  })

  describe("Gas Optimization Tests", () => {
    it("Should have reasonable gas costs for rebase", async () => {
      await chainlinkOracle.updateAnswer(102000000)

      const tx = await stabilizationController.rebase()
      const receipt = await tx.wait()

      // Rebase should cost less than 200k gas
      expect(receipt?.gasUsed).to.be.lt(200000)
    })

    it("Should have reasonable gas costs for oracle updates", async () => {
      const tx = await chainlinkOracle.updateAnswer(105000000)
      const receipt = await tx.wait()

      // Oracle update should cost less than 50k gas
      expect(receipt?.gasUsed).to.be.lt(50000)
    })
  })
})
