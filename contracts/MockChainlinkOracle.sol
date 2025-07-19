// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/**
 * @title MockChainlinkOracle
 * @dev Mock Chainlink oracle for testing purposes
 */
contract MockChainlinkOracle is AggregatorV3Interface {
    uint8 public decimals;
    string public description;
    uint256 public version;

    struct RoundData {
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
    }

    mapping(uint80 => RoundData) public rounds;
    uint80 public latestRound;

    constructor(uint8 _decimals, string memory _description) {
        decimals = _decimals;
        description = _description;
        version = 1;
    }

    function updateAnswer(int256 _answer) external {
        latestRound++;
        rounds[latestRound] = RoundData({
            answer: _answer,
            startedAt: block.timestamp,
            updatedAt: block.timestamp,
            answeredInRound: latestRound
        });
    }

    function getRoundData(uint80 _roundId)
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        RoundData memory round = rounds[_roundId];
        return (_roundId, round.answer, round.startedAt, round.updatedAt, round.answeredInRound);
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return this.getRoundData(latestRound);
    }
}
