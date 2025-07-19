// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./ECashToken.sol";
import "./OracleAggregator.sol";
import "./Treasury.sol";

/**
 * @title StabilizationController
 * @dev Controls rebase operations with progressive stability bands and circuit breakers
 * @notice Enhanced version with improved security and automatic recovery mechanisms
 */
contract StabilizationController is Initializable, AccessControlUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    bytes32 public constant ORACLE_MANAGER_ROLE = keccak256("ORACLE_MANAGER_ROLE");

    ECashToken public ecashToken;
    OracleAggregator public oracleAggregator;
    Treasury public treasury;

    uint256 public constant TARGET_PRICE = 1e18; // $1.00
    uint256 public constant REBASE_COOLDOWN = 12 hours;
    uint256 public constant MAX_REBASE_PERCENTAGE = 10e16; // 10%
    uint256 public constant PRECISION = 1e18;
    
    // Enhanced stability bands with better precision
    uint256 public constant BAND_1_THRESHOLD = 1e16;  // 1%
    uint256 public constant BAND_2_THRESHOLD = 5e16;  // 5%
    uint256 public constant BAND_3_THRESHOLD = 10e16; // 10%
    uint256 public constant BAND_4_THRESHOLD = 20e16; // 20%

    // Improved dampening factors
    uint256 public constant BAND_1_DAMPING = 10e16;  // 10%
    uint256 public constant BAND_2_DAMPING = 25e16;  // 25%
    uint256 public constant BAND_3_DAMPING = 50e16;  // 50%
    uint256 public constant BAND_4_DAMPING = 75e16;  // 75%

    // Circuit breaker enhancements
    uint256 public constant CIRCUIT_BREAKER_COOLDOWN = 1 hours;
    uint256 public constant AUTO_RECOVERY_THRESHOLD = 5e16; // 5% - auto-recovery if deviation drops below this
    uint256 public constant MAX_CONSECUTIVE_REBOUNDS = 3;

    uint256 public lastRebaseTime;
    uint256 public rebaseCount;
    bool public circuitBreakerActive;
    uint256 public circuitBreakerActivatedAt;
    uint256 public consecutiveRebases;
    uint256 public maxSupplyChangePerRebase;

    // Oracle validation
    uint256 public minOracleConfidence;
    uint256 public maxPriceAge;

    struct RebaseData {
        uint256 timestamp;
        uint256 price;
        int256 supplyDelta;
        uint256 newSupply;
        uint8 stabilityBand;
        uint256 deviation;
        bool circuitBreakerTriggered;
    }

    mapping(uint256 => RebaseData) public rebaseHistory;

    event RebaseExecuted(
        uint256 indexed epoch,
        uint256 price,
        int256 supplyDelta,
        uint256 newSupply,
        uint8 stabilityBand,
        uint256 deviation
    );
    event CircuitBreakerTriggered(uint256 price, uint256 deviation, uint256 timestamp);
    event CircuitBreakerReset(bool automatic, uint256 timestamp);
    event ParametersUpdated(string parameter, uint256 oldValue, uint256 newValue);
    event OracleValidationFailed(uint256 confidence, uint256 age);

    modifier validPrice(uint256 price) {
        require(price > 0, "Invalid price");
        require(price <= TARGET_PRICE * 10, "Price too high"); // Max 10x target
        require(price >= TARGET_PRICE / 10, "Price too low"); // Min 0.1x target
        _;
    }

    modifier oracleHealthy() {
        require(oracleAggregator.isHealthy(), "Oracle system unhealthy");
        _;
    }

    function initialize(
        address admin,
        address _ecashToken,
        address _oracleAggregator,
        address _treasury
    ) public initializer {
        require(admin != address(0), "Invalid admin");
        require(_ecashToken != address(0), "Invalid token address");
        require(_oracleAggregator != address(0), "Invalid oracle address");
        require(_treasury != address(0), "Invalid treasury address");

        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
        _grantRole(EMERGENCY_ROLE, admin);
        _grantRole(ORACLE_MANAGER_ROLE, admin);

        ecashToken = ECashToken(_ecashToken);
        oracleAggregator = OracleAggregator(_oracleAggregator);
        treasury = Treasury(_treasury);

        // Set default parameters
        minOracleConfidence = 50; // 50%
        maxPriceAge = 1 hours;
        maxSupplyChangePerRebase = 5e16; // 5% max change per rebase
    }

    /**
     * @dev Enhanced rebase function with better validation and automatic recovery
     */
    function rebase() external onlyRole(OPERATOR_ROLE) whenNotPaused nonReentrant oracleHealthy {
        require(canRebase(), "Rebase conditions not met");

        (uint256 price, uint256 timestamp, uint256 confidence) = oracleAggregator.getAggregatedPrice();
        
        // Enhanced oracle validation
        require(confidence >= minOracleConfidence, "Insufficient oracle confidence");
        require(block.timestamp - timestamp <= maxPriceAge, "Oracle data too old");
        
        // Additional price validation
        _validatePrice(price);

        uint256 deviation = _calculateDeviation(price);
        uint8 stabilityBand = _getStabilityBand(deviation);

        // Check for automatic circuit breaker recovery
        if (circuitBreakerActive) {
            _checkAutoRecovery(deviation);
            if (circuitBreakerActive) {
                return; // Still in circuit breaker mode
            }
        }

        // Check circuit breaker conditions
        if (deviation >= BAND_4_THRESHOLD && !circuitBreakerActive) {
            _activateCircuitBreaker(price, deviation);
            return;
        }

        // Calculate supply adjustment with enhanced logic
        int256 supplyDelta = _calculateSupplyDelta(price, stabilityBand, deviation);
        
        uint256 newSupply;
        if (supplyDelta != 0) {
            // Validate supply change doesn't exceed limits
            uint256 currentSupply = ecashToken.totalSupply();
            uint256 maxChange = (currentSupply * maxSupplyChangePerRebase) / PRECISION;
            uint256 absSupplyDelta = supplyDelta < 0 ? uint256(-supplyDelta) : uint256(supplyDelta);
            
            if (absSupplyDelta > maxChange) {
                supplyDelta = supplyDelta < 0 ? -int256(maxChange) : int256(maxChange);
            }

            newSupply = ecashToken.rebase(supplyDelta);
            
            rebaseCount++;
            lastRebaseTime = block.timestamp;
            consecutiveRebases++;

            // Store rebase data
            rebaseHistory[rebaseCount] = RebaseData({
                timestamp: timestamp,
                price: price,
                supplyDelta: supplyDelta,
                newSupply: newSupply,
                stabilityBand: stabilityBand,
                deviation: deviation,
                circuitBreakerTriggered: false
            });

            emit RebaseExecuted(rebaseCount, price, supplyDelta, newSupply, stabilityBand, deviation);
        }

        // Reset consecutive counter if deviation is small
        if (deviation < BAND_1_THRESHOLD) {
            consecutiveRebases = 0;
        }

        // Check for excessive consecutive rebases
        if (consecutiveRebases >= MAX_CONSECUTIVE_REBOUNDS && deviation >= BAND_3_THRESHOLD) {
            _activateCircuitBreaker(price, deviation);
        }
    }

    /**
     * @dev Enhanced supply delta calculation with better precision
     */
    function _calculateSupplyDelta(uint256 price, uint8 stabilityBand, uint256 deviation) internal view returns (int256) {
        if (price == TARGET_PRICE || stabilityBand == 0) return 0;

        uint256 currentSupply = ecashToken.totalSupply();
        uint256 dampingFactor = _getDampingFactor(stabilityBand);

        // Improved calculation with better precision handling
        uint256 rawAdjustment = (currentSupply * deviation) / PRECISION;
        uint256 dampedAdjustment = (rawAdjustment * dampingFactor) / PRECISION;
        
        // Apply maximum rebase limit
        uint256 maxAdjustment = (currentSupply * MAX_REBASE_PERCENTAGE) / PRECISION;
        if (dampedAdjustment > maxAdjustment) {
            dampedAdjustment = maxAdjustment;
        }

        // Minimum adjustment threshold to prevent dust rebases
        uint256 minAdjustment = currentSupply / 10000; // 0.01%
        if (dampedAdjustment < minAdjustment) {
            return 0;
        }

        return price > TARGET_PRICE ? int256(dampedAdjustment) : -int256(dampedAdjustment);
    }

    /**
     * @dev Activate circuit breaker with enhanced logging
     */
    function _activateCircuitBreaker(uint256 price, uint256 deviation) internal {
        circuitBreakerActive = true;
        circuitBreakerActivatedAt = block.timestamp;
        consecutiveRebases = 0;

        // Store circuit breaker activation in history
        rebaseHistory[rebaseCount + 1] = RebaseData({
            timestamp: block.timestamp,
            price: price,
            supplyDelta: 0,
            newSupply: ecashToken.totalSupply(),
            stabilityBand: 4,
            deviation: deviation,
            circuitBreakerTriggered: true
        });

        emit CircuitBreakerTriggered(price, deviation, block.timestamp);
    }

    /**
     * @dev Check for automatic circuit breaker recovery
     */
    function _checkAutoRecovery(uint256 deviation) internal {
        require(circuitBreakerActive, "Circuit breaker not active");

        // Check if enough time has passed and deviation is low enough
        bool timeElapsed = block.timestamp >= circuitBreakerActivatedAt + CIRCUIT_BREAKER_COOLDOWN;
        bool deviationLow = deviation <= AUTO_RECOVERY_THRESHOLD;

        if (timeElapsed && deviationLow) {
            circuitBreakerActive = false;
            circuitBreakerActivatedAt = 0;
            consecutiveRebases = 0;
            emit CircuitBreakerReset(true, block.timestamp);
        }
    }

    /**
     * @dev Enhanced price validation
     */
    function _validatePrice(uint256 price) internal pure validPrice(price) {
        // Additional validation can be added here
    }

    /**
     * @dev Calculate deviation with improved precision
     */
    function _calculateDeviation(uint256 price) internal pure returns (uint256) {
        if (price >= TARGET_PRICE) {
            return ((price - TARGET_PRICE) * PRECISION) / TARGET_PRICE;
        } else {
            return ((TARGET_PRICE - price) * PRECISION) / TARGET_PRICE;
        }
    }

    /**
     * @dev Get stability band based on deviation
     */
    function _getStabilityBand(uint256 deviation) internal pure returns (uint8) {
        if (deviation >= BAND_4_THRESHOLD) return 4;
        if (deviation >= BAND_3_THRESHOLD) return 3;
        if (deviation >= BAND_2_THRESHOLD) return 2;
        if (deviation >= BAND_1_THRESHOLD) return 1;
        return 0;
    }

    /**
     * @dev Get dampening factor for stability band
     */
    function _getDampingFactor(uint8 band) internal pure returns (uint256) {
        if (band == 4) return BAND_4_DAMPING;
        if (band == 3) return BAND_3_DAMPING;
        if (band == 2) return BAND_2_DAMPING;
        if (band == 1) return BAND_1_DAMPING;
        return 0;
    }

    /**
     * @dev Check if rebase can be executed
     */
    function canRebase() public view returns (bool) {
        if (circuitBreakerActive) {
            // Check if auto-recovery conditions are met
            try oracleAggregator.getAggregatedPrice() returns (uint256 price, uint256 timestamp, uint256 confidence) {
                if (confidence >= minOracleConfidence && block.timestamp - timestamp <= maxPriceAge) {
                    uint256 deviation = _calculateDeviation(price);
                    bool timeElapsed = block.timestamp >= circuitBreakerActivatedAt + CIRCUIT_BREAKER_COOLDOWN;
                    bool deviationLow = deviation <= AUTO_RECOVERY_THRESHOLD;
                    return timeElapsed && deviationLow;
                }
            } catch {
                return false;
            }
            return false;
        }
        return block.timestamp >= lastRebaseTime + REBASE_COOLDOWN;
    }

    /**
     * @dev Enhanced rebase preview with more details
     */
    function previewRebase() external view returns (
        bool canExecute,
        uint256 currentPrice,
        uint256 deviation,
        int256 projectedSupplyDelta,
        uint8 stabilityBand,
        uint256 confidence,
        bool wouldTriggerCircuitBreaker
    ) {
        canExecute = canRebase();
        
        try oracleAggregator.getAggregatedPrice() returns (uint256 price, uint256 timestamp, uint256 conf) {
            if (conf >= minOracleConfidence && block.timestamp - timestamp <= maxPriceAge) {
                currentPrice = price;
                confidence = conf;
                deviation = _calculateDeviation(price);
                stabilityBand = _getStabilityBand(deviation);
                projectedSupplyDelta = _calculateSupplyDelta(price, stabilityBand, deviation);
                wouldTriggerCircuitBreaker = deviation >= BAND_4_THRESHOLD || 
                    (consecutiveRebases >= MAX_CONSECUTIVE_REBOUNDS && deviation >= BAND_3_THRESHOLD);
            } else {
                canExecute = false;
            }
        } catch {
            canExecute = false;
        }
    }

    /**
     * @dev Manual circuit breaker reset with additional checks
     */
    function resetCircuitBreaker() external onlyRole(EMERGENCY_ROLE) {
        require(circuitBreakerActive, "Circuit breaker not active");
        
        // Additional safety check - only allow reset if price is somewhat stable
        try oracleAggregator.getAggregatedPrice() returns (uint256 price, , uint256 confidence) {
            if (confidence >= minOracleConfidence) {
                uint256 deviation = _calculateDeviation(price);
                require(deviation <= BAND_3_THRESHOLD, "Price still too volatile for manual reset");
            }
        } catch {
            revert("Cannot reset - oracle issues");
        }

        circuitBreakerActive = false;
        circuitBreakerActivatedAt = 0;
        consecutiveRebases = 0;
        emit CircuitBreakerReset(false, block.timestamp);
    }

    /**
     * @dev Update system parameters
     */
    function updateMinOracleConfidence(uint256 _minOracleConfidence) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_minOracleConfidence >= 30 && _minOracleConfidence <= 100, "Invalid confidence range");
        uint256 oldValue = minOracleConfidence;
        minOracleConfidence = _minOracleConfidence;
        emit ParametersUpdated("minOracleConfidence", oldValue, _minOracleConfidence);
    }

    function updateMaxPriceAge(uint256 _maxPriceAge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_maxPriceAge >= 5 minutes && _maxPriceAge <= 4 hours, "Invalid price age range");
        uint256 oldValue = maxPriceAge;
        maxPriceAge = _maxPriceAge;
        emit ParametersUpdated("maxPriceAge", oldValue, _maxPriceAge);
    }

    function updateMaxSupplyChangePerRebase(uint256 _maxSupplyChangePerRebase) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_maxSupplyChangePerRebase >= 1e16 && _maxSupplyChangePerRebase <= 20e16, "Invalid supply change range");
        uint256 oldValue = maxSupplyChangePerRebase;
        maxSupplyChangePerRebase = _maxSupplyChangePerRebase;
        emit ParametersUpdated("maxSupplyChangePerRebase", oldValue, _maxSupplyChangePerRebase);
    }

    /**
     * @dev Get detailed system status
     */
    function getSystemStatus() external view returns (
        bool isHealthy,
        uint256 currentDeviation,
        uint256 timeSinceLastRebase,
        uint256 consecutiveRebaseCount,
        bool cbActive,
        uint256 cbActivatedTime
    ) {
        isHealthy = !circuitBreakerActive && oracleAggregator.isHealthy();
        
        try oracleAggregator.getAggregatedPrice() returns (uint256 price, , uint256 confidence) {
            if (confidence >= minOracleConfidence) {
                currentDeviation = _calculateDeviation(price);
            }
        } catch {
            isHealthy = false;
        }

        timeSinceLastRebase = block.timestamp > lastRebaseTime ? block.timestamp - lastRebaseTime : 0;
        consecutiveRebaseCount = consecutiveRebases;
        cbActive = circuitBreakerActive;
        cbActivatedTime = circuitBreakerActivatedAt;
    }

    /**
     * @dev Emergency pause
     */
    function emergencyPause() external onlyRole(EMERGENCY_ROLE) {
        _pause();
    }

    /**
     * @dev Emergency unpause
     */
    function emergencyUnpause() external onlyRole(EMERGENCY_ROLE) {
        _unpause();
    }

    /**
     * @dev Get rebase history for a range
     */
    function getRebaseHistory(uint256 startEpoch, uint256 endEpoch) 
        external 
        view 
        returns (RebaseData[] memory) 
    {
        require(startEpoch <= endEpoch, "Invalid range");
        require(endEpoch <= rebaseCount, "End epoch too high");
        
        uint256 length = endEpoch - startEpoch + 1;
        RebaseData[] memory history = new RebaseData[](length);
        
        for (uint256 i = 0; i < length; i++) {
            history[i] = rebaseHistory[startEpoch + i];
        }
        
        return history;
    }
}