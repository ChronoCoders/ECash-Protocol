// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/**
 * @title OracleAggregator
 * @dev Aggregates price data from multiple oracle sources with weighted averaging and outlier detection
 * @notice Enhanced version with better validation and attack resistance
 */
contract OracleAggregator is 
    Initializable, 
    AccessControlUpgradeable, 
    PausableUpgradeable, 
    ReentrancyGuardUpgradeable 
{
    bytes32 public constant ORACLE_MANAGER_ROLE = keccak256("ORACLE_MANAGER_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");

    struct OracleConfig {
        address oracle;
        uint256 weight;
        uint256 heartbeat;
        bool isActive;
        uint8 decimals;
        string description;
        uint256 addedAt;
        uint256 successfulUpdates;
        uint256 failedUpdates;
        uint256 lastUpdateTime;
    }

    struct PriceData {
        uint256 price;
        uint256 timestamp;
        uint256 confidence;
        uint256 validSources;
    }

    mapping(string => OracleConfig) public oracles;
    string[] public oracleKeys;
    
    // Enhanced constants
    uint256 public constant PRICE_PRECISION = 1e18;
    uint256 public constant MAX_PRICE_DEVIATION = 20e16; // 20%
    uint256 public constant MIN_ORACLES_REQUIRED = 1;
    uint256 public constant MAX_ORACLES = 10;
    uint256 public constant OUTLIER_THRESHOLD = 15e16; // 15% deviation considered outlier
    
    // Configurable parameters
    uint256 public minOraclesForConsensus;
    uint256 public maxPriceAge;
    uint256 public emergencyFallbackPrice;
    bool public emergencyMode;
    
    // Price validation
    uint256 public minPrice;
    uint256 public maxPrice;
    
    // Historical data
    mapping(uint256 => PriceData) public priceHistory;
    uint256 public priceHistoryIndex;
    uint256 public constant MAX_HISTORY = 100;

    event OracleAdded(string indexed key, address oracle, uint256 weight);
    event OracleUpdated(string indexed key, address oracle, uint256 weight);
    event OracleRemoved(string indexed key);
    event PriceUpdated(uint256 price, uint256 timestamp, uint256 confidence, uint256 validSources);
    event OutlierDetected(string indexed oracleKey, uint256 reportedPrice, uint256 aggregatedPrice);
    event EmergencyModeActivated(string reason);
    event EmergencyModeDeactivated();
    event ParameterUpdated(string parameter, uint256 oldValue, uint256 newValue);

    modifier validOracleParams(uint256 weight, uint256 heartbeat) {
        require(weight > 0 && weight <= 1000, "Invalid weight");
        require(heartbeat >= 5 minutes && heartbeat <= 24 hours, "Invalid heartbeat");
        _;
    }

    modifier oracleExists(string memory key) {
        require(oracles[key].isActive, "Oracle does not exist");
        _;
    }

    modifier notInEmergencyMode() {
        require(!emergencyMode, "Emergency mode active");
        _;
    }

    function initialize(address admin) public initializer {
        require(admin != address(0), "Invalid admin address");

        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_MANAGER_ROLE, admin);
        _grantRole(EMERGENCY_ROLE, admin);

        // Set default parameters
        minOraclesForConsensus = 1;
        maxPriceAge = 1 hours;
        minPrice = 1e16; // $0.01
        maxPrice = 100e18; // $100
        emergencyFallbackPrice = 1e18; // $1.00
    }

    /**
     * @dev Add oracle with enhanced validation
     */
    function addOracle(
        string memory key,
        address oracle,
        uint256 weight,
        uint256 heartbeat,
        uint8 decimals,
        string memory description
    ) external onlyRole(ORACLE_MANAGER_ROLE) validOracleParams(weight, heartbeat) notInEmergencyMode {
        require(oracle != address(0), "Invalid oracle address");
        require(oracle.code.length > 0, "Oracle must be contract");
        require(bytes(key).length > 0, "Invalid key");
        require(bytes(description).length > 0, "Invalid description");
        require(!oracles[key].isActive, "Oracle already exists");
        require(oracleKeys.length < MAX_ORACLES, "Too many oracles");
        require(decimals >= 6 && decimals <= 18, "Invalid decimals");

        // Validate oracle interface
        try AggregatorV3Interface(oracle).latestRoundData() returns (
            uint80, int256 answer, uint256, uint256 updatedAt, uint80
        ) {
            require(answer > 0, "Oracle returning invalid price");
            require(updatedAt > 0, "Oracle returning invalid timestamp");
        } catch {
            revert("Oracle interface validation failed");
        }

        oracles[key] = OracleConfig({
            oracle: oracle,
            weight: weight,
            heartbeat: heartbeat,
            isActive: true,
            decimals: decimals,
            description: description,
            addedAt: block.timestamp,
            successfulUpdates: 0,
            failedUpdates: 0,
            lastUpdateTime: 0
        });

        oracleKeys.push(key);
        emit OracleAdded(key, oracle, weight);
    }

    /**
     * @dev Update oracle parameters
     */
    function updateOracle(
        string memory key,
        uint256 weight,
        uint256 heartbeat
    ) external onlyRole(ORACLE_MANAGER_ROLE) oracleExists(key) validOracleParams(weight, heartbeat) {
        oracles[key].weight = weight;
        oracles[key].heartbeat = heartbeat;
        emit OracleUpdated(key, oracles[key].oracle, weight);
    }

    /**
     * @dev Remove oracle
     */
    function removeOracle(string memory key) external onlyRole(ORACLE_MANAGER_ROLE) oracleExists(key) {
        require(oracleKeys.length > minOraclesForConsensus, "Cannot remove - too few oracles");
        
        oracles[key].isActive = false;
        
        // Remove from array
        for (uint i = 0; i < oracleKeys.length; i++) {
            if (keccak256(bytes(oracleKeys[i])) == keccak256(bytes(key))) {
                oracleKeys[i] = oracleKeys[oracleKeys.length - 1];
                oracleKeys.pop();
                break;
            }
        }
        
        emit OracleRemoved(key);
    }

    /**
     * @dev Get aggregated price with enhanced validation and outlier detection
     */
    function getAggregatedPrice() external view returns (
        uint256 price, 
        uint256 timestamp, 
        uint256 confidence
    ) {
        if (emergencyMode) {
            return (emergencyFallbackPrice, block.timestamp, 0);
        }

        require(oracleKeys.length >= MIN_ORACLES_REQUIRED, "Insufficient oracles");

        uint256[] memory prices = new uint256[](oracleKeys.length);
        uint256[] memory weights = new uint256[](oracleKeys.length);
        uint256[] memory timestamps = new uint256[](oracleKeys.length);
        uint256 validCount = 0;

        // Collect price data
        for (uint i = 0; i < oracleKeys.length; i++) {
            string memory key = oracleKeys[i];
            OracleConfig memory config = oracles[key];
            
            if (!config.isActive) continue;

            try AggregatorV3Interface(config.oracle).latestRoundData() returns (
                uint80,
                int256 answer,
                uint256,
                uint256 updatedAt,
                uint80
            ) {
                if (answer > 0 && updatedAt > 0) {
                    // Check if data is fresh
                    if (block.timestamp - updatedAt <= config.heartbeat) {
                        uint256 normalizedPrice = _normalizePrice(uint256(answer), config.decimals);
                        
                        // Basic price validation
                        if (normalizedPrice >= minPrice && normalizedPrice <= maxPrice) {
                            prices[validCount] = normalizedPrice;
                            weights[validCount] = config.weight;
                            timestamps[validCount] = updatedAt;
                            validCount++;
                        }
                    }
                }
            } catch {
                // Oracle call failed, skip this oracle
                continue;
            }
        }

        require(validCount >= minOraclesForConsensus, "Insufficient valid oracles");

        // Detect and remove outliers if we have enough data points
        if (validCount >= 3) {
            (prices, weights, timestamps, validCount) = _removeOutliers(prices, weights, timestamps, validCount);
        }

        require(validCount >= minOraclesForConsensus, "Insufficient oracles after outlier removal");

        // Calculate weighted average
        uint256 totalWeight = 0;
        uint256 weightedSum = 0;
        uint256 oldestTimestamp = type(uint256).max;

        for (uint i = 0; i < validCount; i++) {
            weightedSum += prices[i] * weights[i];
            totalWeight += weights[i];
            
            if (timestamps[i] < oldestTimestamp) {
                oldestTimestamp = timestamps[i];
            }
        }

        price = weightedSum / totalWeight;
        timestamp = oldestTimestamp;
        confidence = (validCount * 100) / oracleKeys.length;

        // Final price validation
        require(price >= minPrice && price <= maxPrice, "Aggregated price out of bounds");
    }

    /**
     * @dev Remove outliers from price data
     */
    function _removeOutliers(
        uint256[] memory prices,
        uint256[] memory weights,
        uint256[] memory timestamps,
        uint256 count
    ) internal pure returns (
        uint256[] memory,
        uint256[] memory,
        uint256[] memory,
        uint256
    ) {
        if (count < 3) return (prices, weights, timestamps, count);

        // Calculate median for outlier detection
        uint256[] memory sortedPrices = new uint256[](count);
        for (uint i = 0; i < count; i++) {
            sortedPrices[i] = prices[i];
        }
        
        // Simple bubble sort for median calculation
        for (uint i = 0; i < count - 1; i++) {
            for (uint j = 0; j < count - i - 1; j++) {
                if (sortedPrices[j] > sortedPrices[j + 1]) {
                    uint256 temp = sortedPrices[j];
                    sortedPrices[j] = sortedPrices[j + 1];
                    sortedPrices[j + 1] = temp;
                }
            }
        }

        uint256 median = count % 2 == 0 
            ? (sortedPrices[count / 2 - 1] + sortedPrices[count / 2]) / 2
            : sortedPrices[count / 2];

        // Remove outliers (prices that deviate more than threshold from median)
        uint256 newCount = 0;
        for (uint i = 0; i < count; i++) {
            uint256 deviation = prices[i] > median 
                ? ((prices[i] - median) * PRICE_PRECISION) / median
                : ((median - prices[i]) * PRICE_PRECISION) / median;
                
            if (deviation <= OUTLIER_THRESHOLD) {
                if (newCount != i) {
                    prices[newCount] = prices[i];
                    weights[newCount] = weights[i];
                    timestamps[newCount] = timestamps[i];
                }
                newCount++;
            }
        }

        return (prices, weights, timestamps, newCount);
    }

    /**
     * @dev Normalize price to 18 decimals
     */
    function _normalizePrice(uint256 price, uint8 decimals) internal pure returns (uint256) {
        if (decimals == 18) {
            return price;
        } else if (decimals < 18) {
            return price * (10 ** (18 - decimals));
        } else {
            return price / (10 ** (decimals - 18));
        }
    }

    /**
     * @dev Get oracle count
     */
    function getOracleCount() external view returns (uint256) {
        return oracleKeys.length;
    }

    /**
     * @dev Check if oracle system is healthy
     */
    function isHealthy() external view returns (bool) {
        if (emergencyMode) return false;
        if (oracleKeys.length < minOraclesForConsensus) return false;

        try this.getAggregatedPrice() returns (uint256, uint256, uint256 confidence) {
            return confidence >= 50; // At least 50% of oracles must be working
        } catch {
            return false;
        }
    }

    /**
     * @dev Get detailed oracle information
     */
    function getOracleInfo(string memory key) external view returns (
        address oracle,
        uint256 weight,
        uint256 heartbeat,
        bool isActive,
        uint8 decimals,
        string memory description,
        uint256 successfulUpdates,
        uint256 failedUpdates,
        uint256 lastUpdateTime
    ) {
        OracleConfig memory config = oracles[key];
        return (
            config.oracle,
            config.weight,
            config.heartbeat,
            config.isActive,
            config.decimals,
            config.description,
            config.successfulUpdates,
            config.failedUpdates,
            config.lastUpdateTime
        );
    }

    /**
     * @dev Get all oracle keys
     */
    function getAllOracleKeys() external view returns (string[] memory) {
        return oracleKeys;
    }

    /**
     * @dev Update oracle statistics (called by external monitor)
     */
    function updateOracleStats(string memory key, bool success) 
        external 
        onlyRole(ORACLE_MANAGER_ROLE) 
        oracleExists(key) 
    {
        if (success) {
            oracles[key].successfulUpdates++;
        } else {
            oracles[key].failedUpdates++;
        }
        oracles[key].lastUpdateTime = block.timestamp;
    }

    /**
     * @dev Set emergency mode
     */
    function setEmergencyMode(bool _emergencyMode, string memory reason) 
        external 
        onlyRole(EMERGENCY_ROLE) 
    {
        emergencyMode = _emergencyMode;
        if (_emergencyMode) {
            emit EmergencyModeActivated(reason);
        } else {
            emit EmergencyModeDeactivated();
        }
    }

    /**
     * @dev Update system parameters
     */
    function updateMinOraclesForConsensus(uint256 _minOracles) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(_minOracles >= 1 && _minOracles <= oracleKeys.length, "Invalid oracle count");
        uint256 oldValue = minOraclesForConsensus;
        minOraclesForConsensus = _minOracles;
        emit ParameterUpdated("minOraclesForConsensus", oldValue, _minOracles);
    }

    function updateMaxPriceAge(uint256 _maxPriceAge) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(_maxPriceAge >= 5 minutes && _maxPriceAge <= 4 hours, "Invalid price age");
        uint256 oldValue = maxPriceAge;
        maxPriceAge = _maxPriceAge;
        emit ParameterUpdated("maxPriceAge", oldValue, _maxPriceAge);
    }

    function updatePriceBounds(uint256 _minPrice, uint256 _maxPrice) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(_minPrice > 0 && _minPrice < _maxPrice, "Invalid price bounds");
        require(_maxPrice <= 1000e18, "Max price too high"); // $1000 max
        
        uint256 oldMinPrice = minPrice;
        uint256 oldMaxPrice = maxPrice;
        minPrice = _minPrice;
        maxPrice = _maxPrice;
        
        emit ParameterUpdated("minPrice", oldMinPrice, _minPrice);
        emit ParameterUpdated("maxPrice", oldMaxPrice, _maxPrice);
    }

    function updateEmergencyFallbackPrice(uint256 _fallbackPrice) 
        external 
        onlyRole(EMERGENCY_ROLE) 
    {
        require(_fallbackPrice >= minPrice && _fallbackPrice <= maxPrice, "Fallback price out of bounds");
        uint256 oldValue = emergencyFallbackPrice;
        emergencyFallbackPrice = _fallbackPrice;
        emit ParameterUpdated("emergencyFallbackPrice", oldValue, _fallbackPrice);
    }

    /**
     * @dev Store price in history
     */
    function _storePriceHistory(uint256 price, uint256 timestamp, uint256 confidence, uint256 validSources) internal {
        priceHistory[priceHistoryIndex] = PriceData({
            price: price,
            timestamp: timestamp,
            confidence: confidence,
            validSources: validSources
        });
        priceHistoryIndex = (priceHistoryIndex + 1) % MAX_HISTORY;
    }

    /**
     * @dev Get price history
     */
    function getPriceHistory(uint256 count) external view returns (PriceData[] memory) {
        require(count <= MAX_HISTORY, "Count too large");
        
        PriceData[] memory history = new PriceData[](count);
        uint256 startIndex = priceHistoryIndex >= count 
            ? priceHistoryIndex - count 
            : MAX_HISTORY - (count - priceHistoryIndex);

        for (uint i = 0; i < count; i++) {
            uint256 index = (startIndex + i) % MAX_HISTORY;
            history[i] = priceHistory[index];
        }

        return history;
    }

    /**
     * @dev Get system status
     */
    function getSystemStatus() external view returns (
        bool healthy,
        uint256 activeOracles,
        uint256 totalOracles,
        bool emergencyModeActive,
        uint256 lastPriceUpdate,
        uint256 currentConfidence
    ) {
        healthy = this.isHealthy();
        totalOracles = oracleKeys.length;
        emergencyModeActive = emergencyMode;

        // Count active oracles
        for (uint i = 0; i < oracleKeys.length; i++) {
            if (oracles[oracleKeys[i]].isActive) {
                activeOracles++;
            }
        }

        try this.getAggregatedPrice() returns (uint256, uint256 timestamp, uint256 confidence) {
            lastPriceUpdate = timestamp;
            currentConfidence = confidence;
        } catch {
            lastPriceUpdate = 0;
            currentConfidence = 0;
        }
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