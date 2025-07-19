// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title EconomicParameterManager
 * @dev Advanced economic parameter management with dynamic adjustments and market responsiveness
 * @notice Manages rebase frequency, stability bands, and economic incentives based on market conditions
 */
contract EconomicParameterManager is Initializable, AccessControlUpgradeable, PausableUpgradeable {
    bytes32 public constant ECONOMICS_ADMIN_ROLE = keccak256("ECONOMICS_ADMIN_ROLE");
    bytes32 public constant PARAMETER_UPDATER_ROLE = keccak256("PARAMETER_UPDATER_ROLE");
    bytes32 public constant ANALYTICS_ROLE = keccak256("ANALYTICS_ROLE");

    // Core economic parameters
    struct EconomicParameters {
        uint256 baseRebaseCooldown;        // Base cooldown period (12 hours default)
        uint256 minRebaseCooldown;         // Minimum cooldown (1 hour)
        uint256 maxRebaseCooldown;         // Maximum cooldown (24 hours)
        uint256 volatilityThreshold;      // Threshold for high volatility
        uint256 stabilityPremium;         // Bonus for stability
        uint256 lastUpdated;
    }

    // Dynamic stability bands with adaptive thresholds
    struct StabilityBand {
        uint256 threshold;                 // Deviation threshold (e.g., 1%, 5%, 10%)
        uint256 dampingFactor;            // Rebase dampening (10%-75%)
        uint256 minCooldown;              // Minimum cooldown for this band
        uint256 maxRebaseAmount;          // Maximum rebase amount for this band
        bool isActive;
    }

    // Market condition tracking
    struct MarketCondition {
        uint256 volatilityScore;          // 0-100 volatility measure
        uint256 trendDirection;           // 0 = down, 50 = neutral, 100 = up
        uint256 liquidityIndex;           // Market liquidity measure
        uint256 stabilityDuration;       // Time since last major deviation
        uint256 consecutiveRebases;       // Number of consecutive rebases
        uint256 lastAssessment;
    }

    // Treasury economic parameters
    struct TreasuryEconomics {
        uint256 ecosystemAllocation;     // % for ecosystem development
        uint256 liquidityAllocation;     // % for liquidity incentives
        uint256 stabilityAllocation;     // % for stability reserves
        uint256 operationsAllocation;    // % for operations
        uint256 rewardRate;              // APY for staking/holding
        uint256 lastRebalance;
    }

    EconomicParameters public economicParams;
    MarketCondition public marketCondition;
    TreasuryEconomics public treasuryEconomics;

    // Stability bands mapping (band level => StabilityBand)
    mapping(uint8 => StabilityBand) public stabilityBands;
    uint8 public maxStabilityBands;

    // Historical data for analysis
    mapping(uint256 => uint256) public historicalVolatility;
    mapping(uint256 => uint256) public historicalRebaseAmounts;
    uint256 public dataPoints;

    // Economic incentive tracking
    mapping(address => uint256) public stabilityRewards;
    mapping(address => uint256) public lastStabilityCheck;
    uint256 public totalStabilityRewards;

    // Advanced metrics
    uint256 public avgRebaseFrequency;
    uint256 public avgDeviationSize;
    uint256 public stabilityRatio;       // % of time within target range
    uint256 public economicEfficiency;   // Overall system efficiency score

    // Constants
    uint256 public constant PRECISION = 1e18;
    uint256 public constant MAX_VOLATILITY = 100;
    uint256 public constant SECONDS_PER_DAY = 86400;
    uint256 public constant BASIS_POINTS = 10000;

    event ParametersUpdated(string indexed parameter, uint256 oldValue, uint256 newValue, address updater);
    event StabilityBandUpdated(uint8 indexed band, uint256 threshold, uint256 dampingFactor);
    event MarketConditionAssessed(uint256 volatility, uint256 trend, uint256 liquidity);
    event RebaseCooldownAdjusted(uint256 oldCooldown, uint256 newCooldown, string reason);
    event StabilityRewardDistributed(address indexed recipient, uint256 amount);
    event TreasuryRebalanced(uint256[4] newAllocations);

    modifier onlyEconomicsAdmin() {
        require(hasRole(ECONOMICS_ADMIN_ROLE, msg.sender), "Not economics admin");
        _;
    }

    modifier onlyParameterUpdater() {
        require(hasRole(PARAMETER_UPDATER_ROLE, msg.sender), "Not parameter updater");
        _;
    }

    function initialize(address admin) public initializer {
        require(admin != address(0), "Invalid admin address");

        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ECONOMICS_ADMIN_ROLE, admin);
        _grantRole(PARAMETER_UPDATER_ROLE, admin);
        _grantRole(ANALYTICS_ROLE, admin);

        // Initialize default economic parameters
        economicParams = EconomicParameters({
            baseRebaseCooldown: 12 hours,
            minRebaseCooldown: 1 hours,
            maxRebaseCooldown: 24 hours,
            volatilityThreshold: 20e16, // 20%
            stabilityPremium: 5e16,     // 5% bonus
            lastUpdated: block.timestamp
        });

        // Initialize market condition
        marketCondition = MarketCondition({
            volatilityScore: 0,
            trendDirection: 50, // Neutral
            liquidityIndex: 50,
            stabilityDuration: 0,
            consecutiveRebases: 0,
            lastAssessment: block.timestamp
        });

        // Initialize treasury economics with balanced allocation
        treasuryEconomics = TreasuryEconomics({
            ecosystemAllocation: 4000,    // 40%
            liquidityAllocation: 3000,    // 30%
            stabilityAllocation: 2000,    // 20%
            operationsAllocation: 1000,   // 10%
            rewardRate: 500,              // 5% APY
            lastRebalance: block.timestamp
        });

        // Initialize default stability bands
        _initializeStabilityBands();
    }

    /**
     * @dev Initialize default stability bands with optimized parameters
     */
    function _initializeStabilityBands() internal {
        // Band 1: Small deviations (0-1%)
        stabilityBands[1] = StabilityBand({
            threshold: 1e16,      // 1%
            dampingFactor: 15e16, // 15% dampening
            minCooldown: 8 hours,
            maxRebaseAmount: 5e15, // 0.5% max rebase
            isActive: true
        });

        // Band 2: Medium deviations (1-5%)
        stabilityBands[2] = StabilityBand({
            threshold: 5e16,      // 5%
            dampingFactor: 30e16, // 30% dampening
            minCooldown: 6 hours,
            maxRebaseAmount: 2e16, // 2% max rebase
            isActive: true
        });

        // Band 3: Large deviations (5-10%)
        stabilityBands[3] = StabilityBand({
            threshold: 10e16,     // 10%
            dampingFactor: 50e16, // 50% dampening
            minCooldown: 4 hours,
            maxRebaseAmount: 5e16, // 5% max rebase
            isActive: true
        });

        // Band 4: Extreme deviations (10-20%)
        stabilityBands[4] = StabilityBand({
            threshold: 20e16,     // 20%
            dampingFactor: 70e16, // 70% dampening
            minCooldown: 2 hours,
            maxRebaseAmount: 8e16, // 8% max rebase
            isActive: true
        });

        maxStabilityBands = 4;
    }

    /**
     * @dev Calculate dynamic rebase cooldown based on market conditions
     * @param currentDeviation Current price deviation from target
     * @param recentVolatility Recent market volatility measure
     * @return cooldown Calculated cooldown period in seconds
     */
    function calculateDynamicCooldown(
        uint256 currentDeviation,
        uint256 recentVolatility
    ) external view returns (uint256 cooldown) {
        EconomicParameters memory params = economicParams;
        MarketCondition memory market = marketCondition;

        // Start with base cooldown
        cooldown = params.baseRebaseCooldown;

        // Adjust based on volatility (higher volatility = shorter cooldown)
        if (recentVolatility > params.volatilityThreshold) {
            uint256 volatilityFactor = (recentVolatility * PRECISION) / params.volatilityThreshold;
            cooldown = (cooldown * PRECISION) / volatilityFactor;
        }

        // Adjust based on stability duration (longer stability = longer cooldown)
        if (market.stabilityDuration > SECONDS_PER_DAY) {
            uint256 stabilityBonus = (market.stabilityDuration / SECONDS_PER_DAY) * params.stabilityPremium;
            cooldown += (cooldown * stabilityBonus) / PRECISION;
        }

        // Adjust based on consecutive rebases (more rebases = longer cooldown)
        if (market.consecutiveRebases > 2) {
            uint256 rebasePenalty = (market.consecutiveRebases - 2) * 2e16; // 2% per extra rebase
            cooldown += (cooldown * rebasePenalty) / PRECISION;
        }

        // Enforce bounds
        if (cooldown < params.minRebaseCooldown) {
            cooldown = params.minRebaseCooldown;
        } else if (cooldown > params.maxRebaseCooldown) {
            cooldown = params.maxRebaseCooldown;
        }
    }

    /**
     * @dev Get optimal stability band for given deviation
     * @param deviation Price deviation from target
     * @return bandLevel Optimal stability band level
     * @return bandData Stability band configuration
     */
    function getOptimalStabilityBand(uint256 deviation) 
        external 
        view 
        returns (uint8 bandLevel, StabilityBand memory bandData) 
    {
        // Find appropriate band based on deviation
        for (uint8 i = 1; i <= maxStabilityBands; i++) {
            if (deviation <= stabilityBands[i].threshold && stabilityBands[i].isActive) {
                return (i, stabilityBands[i]);
            }
        }
        
        // If no band found, return highest active band
        return (maxStabilityBands, stabilityBands[maxStabilityBands]);
    }

    /**
     * @dev Calculate optimal rebase amount with market-responsive dampening
     * @param priceDeviation Current price deviation
     * @param currentSupply Current token supply
     * @param marketVolatility Current market volatility
     * @return rebaseAmount Calculated rebase amount (can be negative)
     * @return bandUsed Stability band that was used
     */
    function calculateOptimalRebase(
        uint256 priceDeviation,
        uint256 currentSupply,
        uint256 marketVolatility
    ) external view returns (int256 rebaseAmount, uint8 bandUsed) {
        if (priceDeviation == 0) return (0, 0);

        // Get optimal stability band
        (uint8 bandLevel, StabilityBand memory band) = this.getOptimalStabilityBand(priceDeviation);
        bandUsed = bandLevel;

        // Calculate base rebase amount
        uint256 baseAmount = (currentSupply * priceDeviation) / PRECISION;

        // Apply band dampening
        uint256 dampenedAmount = (baseAmount * band.dampingFactor) / PRECISION;

        // Apply market volatility adjustment
        if (marketVolatility > economicParams.volatilityThreshold) {
            // In high volatility, be more conservative
            uint256 volatilityPenalty = ((marketVolatility - economicParams.volatilityThreshold) * 5e16) / PRECISION;
            dampenedAmount = (dampenedAmount * (PRECISION - volatilityPenalty)) / PRECISION;
        }

        // Enforce band maximum
        if (dampenedAmount > (currentSupply * band.maxRebaseAmount) / PRECISION) {
            dampenedAmount = (currentSupply * band.maxRebaseAmount) / PRECISION;
        }

        // Determine direction (positive for above target, negative for below)
        rebaseAmount = int256(dampenedAmount);
    }

    /**
     * @dev Update market condition assessment
     * @param volatility New volatility score (0-100)
     * @param trend New trend direction (0-100)
     * @param liquidity New liquidity index (0-100)
     */
    function updateMarketCondition(
        uint256 volatility,
        uint256 trend,
        uint256 liquidity
    ) external onlyParameterUpdater {
        require(volatility <= MAX_VOLATILITY, "Invalid volatility");
        require(trend <= 100, "Invalid trend");
        require(liquidity <= 100, "Invalid liquidity");

        MarketCondition storage market = marketCondition;
        
        // Update stability duration
        if (volatility <= 10) { // Low volatility threshold
            market.stabilityDuration += block.timestamp - market.lastAssessment;
        } else {
            market.stabilityDuration = 0; // Reset on high volatility
        }

        market.volatilityScore = volatility;
        market.trendDirection = trend;
        market.liquidityIndex = liquidity;
        market.lastAssessment = block.timestamp;

        // Store historical data
        historicalVolatility[dataPoints] = volatility;
        dataPoints++;

        emit MarketConditionAssessed(volatility, trend, liquidity);
    }

    /**
     * @dev Update stability band parameters
     * @param bandLevel Band level to update (1-4)
     * @param threshold New deviation threshold
     * @param dampingFactor New dampening factor
     * @param minCooldown New minimum cooldown
     * @param maxRebaseAmount New maximum rebase amount
     */
    function updateStabilityBand(
        uint8 bandLevel,
        uint256 threshold,
        uint256 dampingFactor,
        uint256 minCooldown,
        uint256 maxRebaseAmount
    ) external onlyEconomicsAdmin {
        require(bandLevel > 0 && bandLevel <= maxStabilityBands, "Invalid band level");
        require(threshold > 0 && threshold <= PRECISION, "Invalid threshold");
        require(dampingFactor > 0 && dampingFactor <= PRECISION, "Invalid dampening factor");
        require(minCooldown >= 1 hours && minCooldown <= 48 hours, "Invalid cooldown");
        require(maxRebaseAmount > 0 && maxRebaseAmount <= 20e16, "Invalid max rebase amount");

        StabilityBand storage band = stabilityBands[bandLevel];
        band.threshold = threshold;
        band.dampingFactor = dampingFactor;
        band.minCooldown = minCooldown;
        band.maxRebaseAmount = maxRebaseAmount;

        emit StabilityBandUpdated(bandLevel, threshold, dampingFactor);
    }

    /**
     * @dev Update treasury economic allocations
     * @param allocations New allocation percentages [ecosystem, liquidity, stability, operations]
     */
    function updateTreasuryAllocations(uint256[4] memory allocations) external onlyEconomicsAdmin {
        uint256 total = allocations[0] + allocations[1] + allocations[2] + allocations[3];
        require(total == BASIS_POINTS, "Allocations must sum to 100%");

        TreasuryEconomics storage treasury = treasuryEconomics;
        treasury.ecosystemAllocation = allocations[0];
        treasury.liquidityAllocation = allocations[1];
        treasury.stabilityAllocation = allocations[2];
        treasury.operationsAllocation = allocations[3];
        treasury.lastRebalance = block.timestamp;

        emit TreasuryRebalanced(allocations);
    }

    /**
     * @dev Calculate stability rewards for protocol participants
     * @param participant Address to calculate rewards for
     * @param holdingPeriod Duration of holding in seconds
     * @param averageBalance Average balance during period
     * @return rewardAmount Calculated reward amount
     */
    function calculateStabilityRewards(
        address participant,
        uint256 holdingPeriod,
        uint256 averageBalance
    ) external view returns (uint256 rewardAmount) {
        if (holdingPeriod == 0 || averageBalance == 0) return 0;

        // Base reward calculation (APY-based)
        uint256 annualReward = (averageBalance * treasuryEconomics.rewardRate) / BASIS_POINTS;
        rewardAmount = (annualReward * holdingPeriod) / (365 days);

        // Stability bonus (extra rewards for holding during stable periods)
        if (marketCondition.stabilityDuration > 7 days) {
            uint256 stabilityBonus = (rewardAmount * economicParams.stabilityPremium) / PRECISION;
            rewardAmount += stabilityBonus;
        }

        // Liquidity bonus (extra rewards based on market liquidity contribution)
        if (marketCondition.liquidityIndex > 70) {
            uint256 liquidityBonus = (rewardAmount * 1e16) / PRECISION; // 1% bonus
            rewardAmount += liquidityBonus;
        }
    }

    /**
     * @dev Record rebase execution for analytics
     * @param rebaseAmount Amount rebased (positive or negative)
     * @param priceDeviation Price deviation that triggered rebase
     * @param bandUsed Stability band that was used
     */
    function recordRebaseExecution(
        int256 rebaseAmount,
        uint256 priceDeviation,
        uint8 bandUsed
    ) external onlyParameterUpdater {
        // Update consecutive rebase counter
        marketCondition.consecutiveRebases++;

        // Store historical data
        historicalRebaseAmounts[dataPoints] = uint256(rebaseAmount < 0 ? -rebaseAmount : rebaseAmount);

        // Update analytics
        _updateAnalytics(priceDeviation, bandUsed);

        // Reset stability duration if large rebase
        if (priceDeviation > stabilityBands[2].threshold) {
            marketCondition.stabilityDuration = 0;
        }
    }

    /**
     * @dev Update internal analytics metrics
     * @param deviation Latest price deviation
     * @param bandUsed Stability band used
     */
    function _updateAnalytics(uint256 deviation, uint8 bandUsed) internal {
        // Update average deviation size (exponential moving average)
        if (avgDeviationSize == 0) {
            avgDeviationSize = deviation;
        } else {
            avgDeviationSize = (avgDeviationSize * 9 + deviation) / 10; // 10% weight to new data
        }

        // Update stability ratio (% time within 1% of target)
        if (deviation <= stabilityBands[1].threshold) {
            stabilityRatio = (stabilityRatio * 99 + 100) / 100; // Increase ratio
        } else {
            stabilityRatio = (stabilityRatio * 99) / 100; // Decrease ratio
        }

        // Update economic efficiency score
        _calculateEconomicEfficiency();
    }

    /**
     * @dev Calculate overall economic efficiency score
     */
    function _calculateEconomicEfficiency() internal {
        uint256 stabilityScore = stabilityRatio;
        uint256 volatilityScore = marketCondition.volatilityScore > 0 ? 
            (100 - marketCondition.volatilityScore) : 100;
        uint256 liquidityScore = marketCondition.liquidityIndex;

        economicEfficiency = (stabilityScore + volatilityScore + liquidityScore) / 3;
    }

    /**
     * @dev Get comprehensive economic status
     * @return params Current economic parameters
     * @return market Current market conditions
     * @return treasury Current treasury economics
     * @return efficiency Overall efficiency metrics
     */
    function getEconomicStatus() external view returns (
        EconomicParameters memory params,
        MarketCondition memory market,
        TreasuryEconomics memory treasury,
        uint256 efficiency
    ) {
        return (economicParams, marketCondition, treasuryEconomics, economicEfficiency);
    }

    /**
     * @dev Get historical analytics data
     * @param lookbackPeriod Number of data points to look back
     * @return volatilityData Historical volatility data
     * @return rebaseData Historical rebase amounts
     */
    function getHistoricalData(uint256 lookbackPeriod) external view returns (
        uint256[] memory volatilityData,
        uint256[] memory rebaseData
    ) {
        uint256 startPoint = dataPoints > lookbackPeriod ? dataPoints - lookbackPeriod : 0;
        uint256 length = dataPoints - startPoint;

        volatilityData = new uint256[](length);
        rebaseData = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            volatilityData[i] = historicalVolatility[startPoint + i];
            rebaseData[i] = historicalRebaseAmounts[startPoint + i];
        }
    }

    /**
     * @dev Emergency parameter update for critical situations
     * @param parameterName Name of parameter to update
     * @param newValue New parameter value
     */
    function emergencyParameterUpdate(
        string memory parameterName,
        uint256 newValue
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 paramHash = keccak256(bytes(parameterName));
        uint256 oldValue;

        if (paramHash == keccak256("baseRebaseCooldown")) {
            oldValue = economicParams.baseRebaseCooldown;
            economicParams.baseRebaseCooldown = newValue;
        } else if (paramHash == keccak256("volatilityThreshold")) {
            oldValue = economicParams.volatilityThreshold;
            economicParams.volatilityThreshold = newValue;
        } else {
            revert("Unknown parameter");
        }

        economicParams.lastUpdated = block.timestamp;
        emit ParametersUpdated(parameterName, oldValue, newValue, msg.sender);
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
}