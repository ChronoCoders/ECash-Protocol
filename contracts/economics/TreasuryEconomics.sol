// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

/**
 * @title TreasuryEconomics
 * @dev Advanced treasury economics with dynamic allocation, yield optimization, and incentive mechanisms
 * @notice Manages protocol treasury with economic efficiency and stakeholder incentives
 */
contract TreasuryEconomics is 
    Initializable, 
    AccessControlUpgradeable, 
    ReentrancyGuardUpgradeable, 
    PausableUpgradeable 
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes32 public constant TREASURY_MANAGER_ROLE = keccak256("TREASURY_MANAGER_ROLE");
    bytes32 public constant YIELD_MANAGER_ROLE = keccak256("YIELD_MANAGER_ROLE");
    bytes32 public constant INCENTIVE_MANAGER_ROLE = keccak256("INCENTIVE_MANAGER_ROLE");

    // Economic allocation structure
    struct EconomicAllocation {
        uint256 ecosystemDevelopment;    // % for ecosystem growth
        uint256 liquidityIncentives;    // % for liquidity provision rewards
        uint256 stabilityReserves;      // % for price stability interventions
        uint256 stakeholderRewards;     // % for token holder rewards
        uint256 operationalFunding;     // % for protocol operations
        uint256 researchDevelopment;    // % for R&D initiatives
        uint256 communityGrants;        // % for community programs
        uint256 emergencyReserves;      // % for emergency situations
        uint256 lastRebalance;
    }

    // Yield generation strategies
    struct YieldStrategy {
        string name;
        address strategyContract;
        uint256 allocation;              // % of funds allocated to this strategy
        uint256 expectedAPY;             // Expected annual percentage yield
        uint256 riskLevel;               // Risk level (1-10, 10 being highest risk)
        uint256 lockupPeriod;           // Minimum lockup period in seconds
        bool isActive;
        uint256 totalAllocated;
        uint256 totalReturns;
        uint256 lastUpdate;
    }

    // Stakeholder incentive structure
    struct StakeholderIncentive {
        string incentiveType;
        uint256 rewardRate;              // APY for this incentive type
        uint256 minHoldingPeriod;       // Minimum holding period for rewards
        uint256 minStakeAmount;         // Minimum stake amount
        uint256 maxStakeAmount;         // Maximum stake amount (0 = no limit)
        uint256 totalStaked;
        uint256 totalRewardsPaid;
        bool isActive;
    }

    // Market-responsive allocation adjustments
    struct MarketConditions {
        uint256 volatilityIndex;        // Current market volatility (0-100)
        uint256 liquidityIndex;         // Current liquidity index (0-100)
        uint256 stabilityDemand;        // Current demand for stability interventions
        uint256 ecosystemGrowth;        // Ecosystem growth rate
        uint256 lastAssessment;
    }

    // Treasury performance metrics
    struct PerformanceMetrics {
        uint256 totalValue;
        uint256 totalYieldGenerated;
        uint256 totalIncentivesPaid;
        uint256 averageAPY;
        uint256 riskAdjustedReturn;
        uint256 economicEfficiency;
        uint256 lastCalculation;
    }

    EconomicAllocation public allocation;
    MarketConditions public marketConditions;
    PerformanceMetrics public performanceMetrics;

    // Strategy and incentive mappings
    mapping(uint256 => YieldStrategy) public yieldStrategies;
    mapping(uint256 => StakeholderIncentive) public stakeholderIncentives;
    uint256 public yieldStrategyCount;
    uint256 public incentiveCount;

    // Stakeholder tracking
    mapping(address => mapping(uint256 => uint256)) public stakeholderStakes; // user => incentive type => amount
    mapping(address => mapping(uint256 => uint256)) public stakingTimestamps; // user => incentive type => timestamp
    mapping(address => uint256) public totalRewardsEarned;

    // Economic history tracking
    mapping(uint256 => uint256) public dailyYieldHistory;
    mapping(uint256 => uint256) public allocationHistory;
    uint256 public historyIndex;

    // Dynamic rebalancing parameters
    uint256 public rebalanceThreshold;      // Threshold for triggering rebalance (basis points)
    uint256 public minRebalanceInterval;    // Minimum time between rebalances
    uint256 public maxAllocationDrift;      // Maximum allowed drift from target allocation

    // Constants
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant PRECISION = 1e18;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    event AllocationUpdated(uint256[8] newAllocations, string reason);
    event YieldStrategyAdded(uint256 indexed strategyId, string name, uint256 expectedAPY);
    event YieldStrategyUpdated(uint256 indexed strategyId, uint256 newAllocation, uint256 newAPY);
    event StakeholderIncentiveCreated(uint256 indexed incentiveId, string incentiveType, uint256 rewardRate);
    event StakeCreated(address indexed user, uint256 indexed incentiveId, uint256 amount);
    event RewardsClaimed(address indexed user, uint256 amount);
    event MarketConditionsUpdated(uint256 volatility, uint256 liquidity, uint256 stability);
    event TreasuryRebalanced(uint256 totalValue, string trigger);
    event YieldGenerated(uint256 amount, uint256 strategyId);

    modifier onlyTreasuryManager() {
        require(hasRole(TREASURY_MANAGER_ROLE, msg.sender), "Not treasury manager");
        _;
    }

    modifier onlyYieldManager() {
        require(hasRole(YIELD_MANAGER_ROLE, msg.sender), "Not yield manager");
        _;
    }

    modifier onlyIncentiveManager() {
        require(hasRole(INCENTIVE_MANAGER_ROLE, msg.sender), "Not incentive manager");
        _;
    }

    function initialize(address admin) public initializer {
        require(admin != address(0), "Invalid admin address");

        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(TREASURY_MANAGER_ROLE, admin);
        _grantRole(YIELD_MANAGER_ROLE, admin);
        _grantRole(INCENTIVE_MANAGER_ROLE, admin);

        // Initialize default allocation (optimized for growth phase)
        allocation = EconomicAllocation({
            ecosystemDevelopment: 2500,    // 25%
            liquidityIncentives: 2000,     // 20%
            stabilityReserves: 1500,       // 15%
            stakeholderRewards: 1500,      // 15%
            operationalFunding: 1000,      // 10%
            researchDevelopment: 800,      // 8%
            communityGrants: 500,          // 5%
            emergencyReserves: 200,        // 2%
            lastRebalance: block.timestamp
        });

        // Initialize market conditions as neutral
        marketConditions = MarketConditions({
            volatilityIndex: 50,
            liquidityIndex: 50,
            stabilityDemand: 50,
            ecosystemGrowth: 50,
            lastAssessment: block.timestamp
        });

        // Set default rebalancing parameters
        rebalanceThreshold = 500;        // 5% threshold
        minRebalanceInterval = 7 days;   // Weekly rebalancing
        maxAllocationDrift = 1000;       // 10% maximum drift
    }

    /**
     * @dev Add a new yield generation strategy
     * @param name Strategy name
     * @param strategyContract Address of strategy contract
     * @param expectedAPY Expected annual percentage yield
     * @param riskLevel Risk level (1-10)
     * @param lockupPeriod Minimum lockup period
     */
    function addYieldStrategy(
        string memory name,
        address strategyContract,
        uint256 expectedAPY,
        uint256 riskLevel,
        uint256 lockupPeriod
    ) external onlyYieldManager {
        require(bytes(name).length > 0, "Invalid strategy name");
        require(strategyContract != address(0), "Invalid strategy contract");
        require(expectedAPY <= 10000, "APY too high"); // Max 100% APY
        require(riskLevel >= 1 && riskLevel <= 10, "Invalid risk level");
        require(lockupPeriod <= 365 days, "Lockup too long");

        yieldStrategies[yieldStrategyCount] = YieldStrategy({
            name: name,
            strategyContract: strategyContract,
            allocation: 0, // Initially no allocation
            expectedAPY: expectedAPY,
            riskLevel: riskLevel,
            lockupPeriod: lockupPeriod,
            isActive: true,
            totalAllocated: 0,
            totalReturns: 0,
            lastUpdate: block.timestamp
        });

        emit YieldStrategyAdded(yieldStrategyCount, name, expectedAPY);
        yieldStrategyCount++;
    }

    /**
     * @dev Create a new stakeholder incentive program
     * @param incentiveType Type of incentive (e.g., "HOLDING", "LIQUIDITY", "GOVERNANCE")
     * @param rewardRate Annual reward rate in basis points
     * @param minHoldingPeriod Minimum holding period for rewards
     * @param minStakeAmount Minimum stake amount
     * @param maxStakeAmount Maximum stake amount (0 = no limit)
     */
    function createStakeholderIncentive(
        string memory incentiveType,
        uint256 rewardRate,
        uint256 minHoldingPeriod,
        uint256 minStakeAmount,
        uint256 maxStakeAmount
    ) external onlyIncentiveManager {
        require(bytes(incentiveType).length > 0, "Invalid incentive type");
        require(rewardRate <= 5000, "Reward rate too high"); // Max 50% APY
        require(minHoldingPeriod <= 365 days, "Holding period too long");
        require(minStakeAmount > 0, "Min stake must be positive");
        require(maxStakeAmount == 0 || maxStakeAmount >= minStakeAmount, "Invalid stake limits");

        stakeholderIncentives[incentiveCount] = StakeholderIncentive({
            incentiveType: incentiveType,
            rewardRate: rewardRate,
            minHoldingPeriod: minHoldingPeriod,
            minStakeAmount: minStakeAmount,
            maxStakeAmount: maxStakeAmount,
            totalStaked: 0,
            totalRewardsPaid: 0,
            isActive: true
        });

        emit StakeholderIncentiveCreated(incentiveCount, incentiveType, rewardRate);
        incentiveCount++;
    }

    /**
     * @dev Stake tokens in an incentive program
     * @param incentiveId ID of the incentive program
     * @param amount Amount to stake
     */
    function stakeInIncentive(uint256 incentiveId, uint256 amount) external nonReentrant whenNotPaused {
        require(incentiveId < incentiveCount, "Invalid incentive ID");
        require(amount > 0, "Amount must be positive");

        StakeholderIncentive storage incentive = stakeholderIncentives[incentiveId];
        require(incentive.isActive, "Incentive not active");
        require(amount >= incentive.minStakeAmount, "Below minimum stake");
        
        if (incentive.maxStakeAmount > 0) {
            require(stakeholderStakes[msg.sender][incentiveId] + amount <= incentive.maxStakeAmount, "Exceeds maximum stake");
        }

        // If user already has stake, claim existing rewards first
        if (stakeholderStakes[msg.sender][incentiveId] > 0) {
            _claimRewards(msg.sender, incentiveId);
        }

        stakeholderStakes[msg.sender][incentiveId] += amount;
        stakingTimestamps[msg.sender][incentiveId] = block.timestamp;
        incentive.totalStaked += amount;

        emit StakeCreated(msg.sender, incentiveId, amount);
    }

    /**
     * @dev Claim rewards from stakeholder incentive
     * @param incentiveId ID of the incentive program
     */
    function claimRewards(uint256 incentiveId) external nonReentrant {
        require(incentiveId < incentiveCount, "Invalid incentive ID");
        _claimRewards(msg.sender, incentiveId);
    }

    /**
     * @dev Internal function to claim rewards
     * @param user User address
     * @param incentiveId ID of the incentive program
     */
    function _claimRewards(address user, uint256 incentiveId) internal {
        StakeholderIncentive storage incentive = stakeholderIncentives[incentiveId];
        uint256 userStake = stakeholderStakes[user][incentiveId];
        uint256 stakingTime = stakingTimestamps[user][incentiveId];

        if (userStake == 0 || stakingTime == 0) return;

        // Check minimum holding period
        if (block.timestamp < stakingTime + incentive.minHoldingPeriod) return;

        // Calculate rewards
        uint256 stakingDuration = block.timestamp - stakingTime;
        uint256 rewardAmount = calculateStakingRewards(userStake, incentive.rewardRate, stakingDuration);

        if (rewardAmount > 0) {
            totalRewardsEarned[user] += rewardAmount;
            incentive.totalRewardsPaid += rewardAmount;
            stakingTimestamps[user][incentiveId] = block.timestamp; // Reset timestamp

            // In a real implementation, this would transfer tokens
            emit RewardsClaimed(user, rewardAmount);
        }
    }

    /**
     * @dev Calculate staking rewards for a user
     * @param stakeAmount Amount staked
     * @param rewardRate Annual reward rate in basis points
     * @param duration Staking duration in seconds
     * @return rewardAmount Calculated reward amount
     */
    function calculateStakingRewards(
        uint256 stakeAmount,
        uint256 rewardRate,
        uint256 duration
    ) public pure returns (uint256 rewardAmount) {
        // Annual reward calculation: (stake * rate * duration) / (BASIS_POINTS * SECONDS_PER_YEAR)
        rewardAmount = (stakeAmount * rewardRate * duration) / (BASIS_POINTS * SECONDS_PER_YEAR);
    }

    /**
     * @dev Update market conditions for dynamic allocation
     * @param volatilityIndex Current market volatility (0-100)
     * @param liquidityIndex Current liquidity index (0-100)
     * @param stabilityDemand Current demand for stability interventions (0-100)
     * @param ecosystemGrowth Ecosystem growth rate (0-100)
     */
    function updateMarketConditions(
        uint256 volatilityIndex,
        uint256 liquidityIndex,
        uint256 stabilityDemand,
        uint256 ecosystemGrowth
    ) external onlyTreasuryManager {
        require(volatilityIndex <= 100, "Invalid volatility index");
        require(liquidityIndex <= 100, "Invalid liquidity index");
        require(stabilityDemand <= 100, "Invalid stability demand");
        require(ecosystemGrowth <= 100, "Invalid ecosystem growth");

        marketConditions.volatilityIndex = volatilityIndex;
        marketConditions.liquidityIndex = liquidityIndex;
        marketConditions.stabilityDemand = stabilityDemand;
        marketConditions.ecosystemGrowth = ecosystemGrowth;
        marketConditions.lastAssessment = block.timestamp;

        emit MarketConditionsUpdated(volatilityIndex, liquidityIndex, stabilityDemand);

        // Check if rebalancing is needed
        if (_shouldRebalance()) {
            _performDynamicRebalancing("Market conditions changed");
        }
    }

    /**
     * @dev Check if treasury should be rebalanced
     * @return shouldRebalance True if rebalancing is needed
     */
    function _shouldRebalance() internal view returns (bool shouldRebalance) {
        // Check time since last rebalance
        if (block.timestamp < allocation.lastRebalance + minRebalanceInterval) {
            return false;
        }

        // Check if market conditions warrant rebalancing
        MarketConditions memory market = marketConditions;
        
        // High volatility increases stability reserve needs
        if (market.volatilityIndex > 70 && allocation.stabilityReserves < 2000) { // Less than 20%
            return true;
        }

        // Low liquidity increases liquidity incentive needs
        if (market.liquidityIndex < 30 && allocation.liquidityIncentives < 1500) { // Less than 15%
            return true;
        }

        // High ecosystem growth increases development funding needs
        if (market.ecosystemGrowth > 80 && allocation.ecosystemDevelopment < 2000) { // Less than 20%
            return true;
        }

        return false;
    }

    /**
     * @dev Perform dynamic rebalancing based on market conditions
     * @param reason Reason for rebalancing
     */
    function _performDynamicRebalancing(string memory reason) internal {
        MarketConditions memory market = marketConditions;
        EconomicAllocation memory newAllocation = allocation;

        // Adjust stability reserves based on volatility
        if (market.volatilityIndex > 70) {
            // Increase stability reserves, reduce ecosystem development
            uint256 increase = (market.volatilityIndex - 50) * 10; // Up to 20% increase
            newAllocation.stabilityReserves = _adjustAllocation(newAllocation.stabilityReserves, increase, true);
            newAllocation.ecosystemDevelopment = _adjustAllocation(newAllocation.ecosystemDevelopment, increase, false);
        }

        // Adjust liquidity incentives based on liquidity index
        if (market.liquidityIndex < 40) {
            // Increase liquidity incentives, reduce operational funding
            uint256 increase = (50 - market.liquidityIndex) * 8; // Up to 8% increase
            newAllocation.liquidityIncentives = _adjustAllocation(newAllocation.liquidityIncentives, increase, true);
            newAllocation.operationalFunding = _adjustAllocation(newAllocation.operationalFunding, increase, false);
        }

        // Adjust ecosystem development based on growth
        if (market.ecosystemGrowth > 70) {
            // Increase ecosystem development, reduce community grants
            uint256 increase = (market.ecosystemGrowth - 50) * 5; // Up to 10% increase
            newAllocation.ecosystemDevelopment = _adjustAllocation(newAllocation.ecosystemDevelopment, increase, true);
            newAllocation.communityGrants = _adjustAllocation(newAllocation.communityGrants, increase, false);
        }

        newAllocation.lastRebalance = block.timestamp;

        // Ensure allocations sum to 100%
        _normalizeAllocation(newAllocation);

        allocation = newAllocation;

        uint256[8] memory allocations = [
            newAllocation.ecosystemDevelopment,
            newAllocation.liquidityIncentives,
            newAllocation.stabilityReserves,
            newAllocation.stakeholderRewards,
            newAllocation.operationalFunding,
            newAllocation.researchDevelopment,
            newAllocation.communityGrants,
            newAllocation.emergencyReserves
        ];

        emit AllocationUpdated(allocations, reason);
        emit TreasuryRebalanced(performanceMetrics.totalValue, reason);
    }

    /**
     * @dev Adjust allocation with bounds checking
     * @param currentValue Current allocation value
     * @param adjustment Adjustment amount in basis points
     * @param increase True for increase, false for decrease
     * @return newValue New allocation value
     */
    function _adjustAllocation(
        uint256 currentValue,
        uint256 adjustment,
        bool increase
    ) internal pure returns (uint256 newValue) {
        if (increase) {
            newValue = currentValue + adjustment;
            if (newValue > 5000) newValue = 5000; // Max 50% allocation
        } else {
            if (adjustment >= currentValue) {
                newValue = 100; // Min 1% allocation
            } else {
                newValue = currentValue - adjustment;
            }
        }
    }

    /**
     * @dev Normalize allocation to ensure it sums to 100%
     * @param alloc Allocation struct to normalize
     */
    function _normalizeAllocation(EconomicAllocation memory alloc) internal pure {
        uint256 total = alloc.ecosystemDevelopment + alloc.liquidityIncentives + 
                       alloc.stabilityReserves + alloc.stakeholderRewards + 
                       alloc.operationalFunding + alloc.researchDevelopment + 
                       alloc.communityGrants + alloc.emergencyReserves;

        if (total != BASIS_POINTS) {
            // Proportionally adjust all allocations
            alloc.ecosystemDevelopment = (alloc.ecosystemDevelopment * BASIS_POINTS) / total;
            alloc.liquidityIncentives = (alloc.liquidityIncentives * BASIS_POINTS) / total;
            alloc.stabilityReserves = (alloc.stabilityReserves * BASIS_POINTS) / total;
            alloc.stakeholderRewards = (alloc.stakeholderRewards * BASIS_POINTS) / total;
            alloc.operationalFunding = (alloc.operationalFunding * BASIS_POINTS) / total;
            alloc.researchDevelopment = (alloc.researchDevelopment * BASIS_POINTS) / total;
            alloc.communityGrants = (alloc.communityGrants * BASIS_POINTS) / total;
            alloc.emergencyReserves = (alloc.emergencyReserves * BASIS_POINTS) / total;
        }
    }

    /**
     * @dev Update yield strategy allocation
     * @param strategyId Strategy ID to update
     * @param newAllocation New allocation percentage
     * @param newExpectedAPY Updated expected APY
     */
    function updateYieldStrategy(
        uint256 strategyId,
        uint256 newAllocation,
        uint256 newExpectedAPY
    ) external onlyYieldManager {
        require(strategyId < yieldStrategyCount, "Invalid strategy ID");
        require(newAllocation <= BASIS_POINTS, "Allocation too high");
        require(newExpectedAPY <= 10000, "APY too high");

        YieldStrategy storage strategy = yieldStrategies[strategyId];
        strategy.allocation = newAllocation;
        strategy.expectedAPY = newExpectedAPY;
        strategy.lastUpdate = block.timestamp;

        emit YieldStrategyUpdated(strategyId, newAllocation, newExpectedAPY);
    }

    /**
     * @dev Record yield generated from a strategy
     * @param strategyId Strategy that generated yield
     * @param yieldAmount Amount of yield generated
     */
    function recordYieldGenerated(uint256 strategyId, uint256 yieldAmount) external onlyYieldManager {
        require(strategyId < yieldStrategyCount, "Invalid strategy ID");
        require(yieldAmount > 0, "Yield amount must be positive");

        YieldStrategy storage strategy = yieldStrategies[strategyId];
        strategy.totalReturns += yieldAmount;
        strategy.lastUpdate = block.timestamp;

        // Update performance metrics
        performanceMetrics.totalYieldGenerated += yieldAmount;
        performanceMetrics.totalValue += yieldAmount;

        // Store daily yield history
        uint256 today = block.timestamp / 1 days;
        dailyYieldHistory[today] += yieldAmount;

        emit YieldGenerated(yieldAmount, strategyId);

        // Recalculate performance metrics
        _updatePerformanceMetrics();
    }

    /**
     * @dev Update comprehensive performance metrics
     */
    function _updatePerformanceMetrics() internal {
        PerformanceMetrics storage metrics = performanceMetrics;
        
        // Calculate average APY across all strategies
        uint256 totalWeightedAPY = 0;
        uint256 totalActiveAllocation = 0;
        
        for (uint256 i = 0; i < yieldStrategyCount; i++) {
            YieldStrategy storage strategy = yieldStrategies[i];
            if (strategy.isActive && strategy.allocation > 0) {
                totalWeightedAPY += strategy.expectedAPY * strategy.allocation;
                totalActiveAllocation += strategy.allocation;
            }
        }
        
        if (totalActiveAllocation > 0) {
            metrics.averageAPY = totalWeightedAPY / totalActiveAllocation;
        }

        // Calculate risk-adjusted return
        uint256 totalRiskWeightedReturn = 0;
        uint256 totalRiskWeight = 0;
        
        for (uint256 i = 0; i < yieldStrategyCount; i++) {
            YieldStrategy storage strategy = yieldStrategies[i];
            if (strategy.isActive && strategy.totalAllocated > 0) {
                uint256 actualReturn = (strategy.totalReturns * BASIS_POINTS) / strategy.totalAllocated;
                uint256 riskWeight = 11 - strategy.riskLevel; // Invert risk level (lower risk = higher weight)
                totalRiskWeightedReturn += actualReturn * riskWeight;
                totalRiskWeight += riskWeight;
            }
        }
        
        if (totalRiskWeight > 0) {
            metrics.riskAdjustedReturn = totalRiskWeightedReturn / totalRiskWeight;
        }

        // Calculate economic efficiency (yield generated vs incentives paid)
        if (metrics.totalIncentivesPaid > 0) {
            metrics.economicEfficiency = (metrics.totalYieldGenerated * BASIS_POINTS) / metrics.totalIncentivesPaid;
        } else if (metrics.totalYieldGenerated > 0) {
            metrics.economicEfficiency = BASIS_POINTS; // 100% efficiency if no incentives paid yet
        }

        metrics.lastCalculation = block.timestamp;
    }

    /**
     * @dev Get optimal allocation based on current market conditions
     * @return optimalAllocation Suggested optimal allocation
     */
    function getOptimalAllocation() external view returns (EconomicAllocation memory optimalAllocation) {
        MarketConditions memory market = marketConditions;
        
        // Start with current allocation
        optimalAllocation = allocation;
        
        // Adjust based on market conditions
        if (market.volatilityIndex > 60) {
            // High volatility: increase stability reserves
            optimalAllocation.stabilityReserves = _adjustAllocation(
                optimalAllocation.stabilityReserves, 
                (market.volatilityIndex - 50) * 10, 
                true
            );
        }
        
        if (market.liquidityIndex < 40) {
            // Low liquidity: increase liquidity incentives
            optimalAllocation.liquidityIncentives = _adjustAllocation(
                optimalAllocation.liquidityIncentives, 
                (50 - market.liquidityIndex) * 8, 
                true
            );
        }
        
        if (market.ecosystemGrowth > 70) {
            // High growth: increase ecosystem development
            optimalAllocation.ecosystemDevelopment = _adjustAllocation(
                optimalAllocation.ecosystemDevelopment, 
                (market.ecosystemGrowth - 50) * 5, 
                true
            );
        }
        
        // Normalize to ensure 100% allocation
        _normalizeAllocation(optimalAllocation);
    }

    /**
     * @dev Get comprehensive treasury analytics
     * @return analytics Detailed treasury analytics
     */
    function getTreasuryAnalytics() external view returns (
        uint256 totalValue,
        uint256 yieldAPY,
        uint256 riskScore,
        uint256 efficiencyRatio,
        uint256 stakeholderSatisfaction,
        uint256 allocationOptimality
    ) {
        PerformanceMetrics memory metrics = performanceMetrics;
        
        totalValue = metrics.totalValue;
        yieldAPY = metrics.averageAPY;
        efficiencyRatio = metrics.economicEfficiency;
        
        // Calculate overall risk score (weighted by allocation)
        uint256 totalRiskWeight = 0;
        uint256 totalAllocation = 0;
        
        for (uint256 i = 0; i < yieldStrategyCount; i++) {
            YieldStrategy storage strategy = yieldStrategies[i];
            if (strategy.isActive) {
                totalRiskWeight += strategy.riskLevel * strategy.allocation;
                totalAllocation += strategy.allocation;
            }
        }
        
        riskScore = totalAllocation > 0 ? totalRiskWeight / totalAllocation : 0;
        
        // Calculate stakeholder satisfaction (based on rewards distribution)
        uint256 totalRewardRate = 0;
        uint256 activeIncentives = 0;
        
        for (uint256 i = 0; i < incentiveCount; i++) {
            if (stakeholderIncentives[i].isActive) {
                totalRewardRate += stakeholderIncentives[i].rewardRate;
                activeIncentives++;
            }
        }
        
        stakeholderSatisfaction = activeIncentives > 0 ? totalRewardRate / activeIncentives : 0;
        
        // Calculate allocation optimality (how well current allocation matches optimal)
        EconomicAllocation memory optimal = this.getOptimalAllocation();
        uint256 totalDifference = 
            _abs(int256(allocation.ecosystemDevelopment) - int256(optimal.ecosystemDevelopment)) +
            _abs(int256(allocation.liquidityIncentives) - int256(optimal.liquidityIncentives)) +
            _abs(int256(allocation.stabilityReserves) - int256(optimal.stabilityReserves)) +
            _abs(int256(allocation.stakeholderRewards) - int256(optimal.stakeholderRewards));
            
        allocationOptimality = totalDifference < BASIS_POINTS ? BASIS_POINTS - totalDifference : 0;
    }

    /**
     * @dev Helper function to calculate absolute value
     * @param x Signed integer
     * @return Absolute value
     */
    function _abs(int256 x) internal pure returns (uint256) {
        return x >= 0 ? uint256(x) : uint256(-x);
    }

    /**
     * @dev Get historical performance data
     * @param days Number of days to look back
     * @return yieldData Daily yield data
     * @return allocationData Daily allocation data
     */
    function getHistoricalPerformance(uint256 days) external view returns (
        uint256[] memory yieldData,
        uint256[] memory allocationData
    ) {
        require(days <= 365, "Too many days requested");
        
        yieldData = new uint256[](days);
        allocationData = new uint256[](days);
        
        uint256 currentDay = block.timestamp / 1 days;
        
        for (uint256 i = 0; i < days; i++) {
            uint256 day = currentDay - i;
            yieldData[days - 1 - i] = dailyYieldHistory[day];
            allocationData[days - 1 - i] = allocationHistory[day];
        }
    }

    /**
     * @dev Emergency rebalancing function
     * @param newAllocations New allocation array [ecosystem, liquidity, stability, stakeholder, operational, R&D, community, emergency]
     * @param reason Reason for emergency rebalancing
     */
    function emergencyRebalance(
        uint256[8] memory newAllocations,
        string memory reason
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bytes(reason).length > 0, "Reason required");
        
        // Validate allocations sum to 100%
        uint256 total = 0;
        for (uint256 i = 0; i < 8; i++) {
            total += newAllocations[i];
        }
        require(total == BASIS_POINTS, "Allocations must sum to 100%");
        
        allocation.ecosystemDevelopment = newAllocations[0];
        allocation.liquidityIncentives = newAllocations[1];
        allocation.stabilityReserves = newAllocations[2];
        allocation.stakeholderRewards = newAllocations[3];
        allocation.operationalFunding = newAllocations[4];
        allocation.researchDevelopment = newAllocations[5];
        allocation.communityGrants = newAllocations[6];
        allocation.emergencyReserves = newAllocations[7];
        allocation.lastRebalance = block.timestamp;
        
        emit AllocationUpdated(newAllocations, reason);
        emit TreasuryRebalanced(performanceMetrics.totalValue, reason);
    }

    /**
     * @dev Set rebalancing parameters
     * @param newThreshold New rebalancing threshold
     * @param newInterval New minimum rebalancing interval
     * @param newMaxDrift New maximum allocation drift
     */
    function setRebalancingParameters(
        uint256 newThreshold,
        uint256 newInterval,
        uint256 newMaxDrift
    ) external onlyTreasuryManager {
        require(newThreshold <= 2000, "Threshold too high"); // Max 20%
        require(newInterval >= 1 days, "Interval too short");
        require(newMaxDrift <= 3000, "Max drift too high"); // Max 30%
        
        rebalanceThreshold = newThreshold;
        minRebalanceInterval = newInterval;
        maxAllocationDrift = newMaxDrift;
    }

    /**
     * @dev Pause the contract
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Get current treasury status
     * @return allocation Current allocation
     * @return market Current market conditions
     * @return metrics Current performance metrics
     */
    function getTreasuryStatus() external view returns (
        EconomicAllocation memory,
        MarketConditions memory,
        PerformanceMetrics memory
    ) {
        return (allocation, marketConditions, performanceMetrics);
    }
}