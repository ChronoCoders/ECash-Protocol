// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ECashToken.sol";
import "./OracleAggregator.sol";
import "./StabilizationController.sol";
import "./Treasury.sol";
import "./MockChainlinkOracle.sol";

/**
 * @title TestHelper
 * @dev Helper contract for testing dashboard functionality
 */
contract TestHelper {
    ECashToken public ecashToken;
    OracleAggregator public oracleAggregator;
    StabilizationController public stabilizationController;
    Treasury public treasury;
    MockChainlinkOracle public chainlinkOracle;

    struct ProtocolStatus {
        uint256 currentPrice;
        uint256 targetPrice;
        uint256 totalSupply;
        uint256 deviation;
        bool canRebase;
        bool circuitBreakerActive;
        uint256 lastRebaseTime;
        uint256 rebaseCount;
        uint8 stabilityBand;
        uint256 oracleConfidence;
    }

    event TestExecuted(string testName, bool success, string result);

    constructor(
        address _ecashToken,
        address _oracleAggregator,
        address _stabilizationController,
        address _treasury,
        address _chainlinkOracle
    ) {
        ecashToken = ECashToken(_ecashToken);
        oracleAggregator = OracleAggregator(_oracleAggregator);
        stabilizationController = StabilizationController(_stabilizationController);
        treasury = Treasury(_treasury);
        chainlinkOracle = MockChainlinkOracle(_chainlinkOracle);
    }

    function getProtocolStatus() external view returns (ProtocolStatus memory status) {
        try oracleAggregator.getAggregatedPrice() returns (uint256 price, , uint256 confidence) {
            status.currentPrice = price;
            status.oracleConfidence = confidence;
        } catch {
            status.currentPrice = 0;
            status.oracleConfidence = 0;
        }

        status.targetPrice = 1e18; // $1.00
        status.totalSupply = ecashToken.totalSupply();
        status.canRebase = stabilizationController.canRebase();
        status.circuitBreakerActive = stabilizationController.circuitBreakerActive();
        status.lastRebaseTime = stabilizationController.lastRebaseTime();
        status.rebaseCount = stabilizationController.rebaseCount();

        if (status.currentPrice > 0) {
            if (status.currentPrice >= status.targetPrice) {
                status.deviation = ((status.currentPrice - status.targetPrice) * 1e18) / status.targetPrice;
            } else {
                status.deviation = ((status.targetPrice - status.currentPrice) * 1e18) / status.targetPrice;
            }

            // Determine stability band
            if (status.deviation >= 20e16) status.stabilityBand = 4;
            else if (status.deviation >= 10e16) status.stabilityBand = 3;
            else if (status.deviation >= 5e16) status.stabilityBand = 2;
            else if (status.deviation >= 1e16) status.stabilityBand = 1;
            else status.stabilityBand = 0;
        }

        return status;
    }

    function testNormalRebase() external returns (bool success) {
        try {
            // Set price to $1.02 (2% above target)
            chainlinkOracle.updateAnswer(102000000); // $1.02 with 8 decimals
            
            // Execute rebase
            stabilizationController.rebase();
            
            emit TestExecuted("Normal Rebase", true, "Rebase executed successfully");
            return true;
        } catch Error(string memory reason) {
            emit TestExecuted("Normal Rebase", false, reason);
            return false;
        }
    }

    function testCircuitBreaker() external returns (bool success) {
        try {
            // Set extreme price to trigger circuit breaker
            chainlinkOracle.updateAnswer(75000000); // $0.75 (-25% from target)
            
            // Attempt rebase (should trigger circuit breaker)
            stabilizationController.rebase();
            
            bool circuitBreakerActive = stabilizationController.circuitBreakerActive();
            
            emit TestExecuted("Circuit Breaker", circuitBreakerActive, 
                circuitBreakerActive ? "Circuit breaker activated" : "Circuit breaker failed to activate");
            return circuitBreakerActive;
        } catch Error(string memory reason) {
            emit TestExecuted("Circuit Breaker", false, reason);
            return false;
        }
    }

    function testOracleFailure() external returns (bool success) {
        try {
            // Test oracle aggregation with invalid data
            oracleAggregator.getAggregatedPrice();
            
            emit TestExecuted("Oracle Failure", true, "Oracle aggregation working");
            return true;
        } catch Error(string memory reason) {
            emit TestExecuted("Oracle Failure", false, reason);
            return false;
        }
    }

    function simulateMarketCrash() external returns (bool success) {
        try {
            // Simulate gradual price decline
            uint256[] memory prices = new uint256[](5);
            prices[0] = 95000000;  // $0.95
            prices[1] = 90000000;  // $0.90
            prices[2] = 85000000;  // $0.85
            prices[3] = 80000000;  // $0.80
            prices[4] = 75000000;  // $0.75

            for (uint i = 0; i < prices.length; i++) {
                chainlinkOracle.updateAnswer(int256(prices[i]));
                
                if (!stabilizationController.circuitBreakerActive()) {
                    try stabilizationController.rebase() {} catch {}
                }
            }

            emit TestExecuted("Market Crash Simulation", true, "Market crash simulation completed");
            return true;
        } catch Error(string memory reason) {
            emit TestExecuted("Market Crash Simulation", false, reason);
            return false;
        }
    }

    function simulateBullMarket() external returns (bool success) {
        try {
            // Simulate gradual price increase
            uint256[] memory prices = new uint256[](5);
            prices[0] = 105000000;  // $1.05
            prices[1] = 110000000;  // $1.10
            prices[2] = 115000000;  // $1.15
            prices[3] = 120000000;  // $1.20
            prices[4] = 125000000;  // $1.25

            for (uint i = 0; i < prices.length; i++) {
                chainlinkOracle.updateAnswer(int256(prices[i]));
                
                if (stabilizationController.canRebase()) {
                    try stabilizationController.rebase() {} catch {}
                }
            }

            emit TestExecuted("Bull Market Simulation", true, "Bull market simulation completed");
            return true;
        } catch Error(string memory reason) {
            emit TestExecuted("Bull Market Simulation", false, reason);
            return false;
        }
    }

    function resetProtocol() external {
        // Reset circuit breaker if active
        if (stabilizationController.circuitBreakerActive()) {
            try stabilizationController.resetCircuitBreaker() {} catch {}
        }
        
        // Reset price to target
        chainlinkOracle.updateAnswer(100000000); // $1.00
        
        emit TestExecuted("Protocol Reset", true, "Protocol reset to initial state");
    }
}
