// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {DataTypes} from "../shared/DataTypes.sol";
import {Hashing} from "../shared/Hashing.sol";

contract TradeEngine {
    uint64 public nextTradeId;
    bytes32 public stateRoot;
    mapping(uint64 => bytes32) public tradeHashes;
    mapping(address => uint256) public nonces;
    uint64 public tradeCount;

    event TradeExecuted(
        uint64 indexed tradeId, address indexed trader, uint256 amountIn, uint256 amountOut, uint256 nonce
    );

    event StateRootUpdated(bytes32 oldRoot, bytes32 newRoot, uint64 tradeId);

    function executeTrade(address trader, uint256 amountIn, uint256 amountOut, uint256 nonce)
        external
        returns (uint64 tradeId)
    {
        require(nonce == nonces[trader], "invalid nonce");
        nonces[trader]++;

        tradeId = nextTradeId++;
        tradeCount++;

        DataTypes.Trade memory trade = DataTypes.Trade({
            tradeId: tradeId,
            trader: trader,
            amountIn: amountIn,
            amountOut: amountOut,
            nonce: nonce
        });

        bytes32 tHash = Hashing.hashTrade(trade);
        tradeHashes[tradeId] = tHash;

        bytes32 oldRoot = stateRoot;
        stateRoot = keccak256(abi.encodePacked(oldRoot, tHash));

        emit TradeExecuted(tradeId, trader, amountIn, amountOut, nonce);
        emit StateRootUpdated(oldRoot, stateRoot, tradeId);
    }

    function getTradeHashes(uint64 from, uint64 to) external view returns (bytes32[] memory) {
        require(to <= nextTradeId && from < to, "invalid range");
        bytes32[] memory hashes = new bytes32[](to - from);
        for (uint64 i = from; i < to; i++) {
            hashes[i - from] = tradeHashes[i];
        }
        return hashes;
    }
}
