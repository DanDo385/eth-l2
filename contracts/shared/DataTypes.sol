// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library DataTypes {
    struct Trade {
        uint64 tradeId;
        address trader;
        uint256 amountIn;
        uint256 amountOut;
        uint256 nonce;
    }

    struct BatchHeader {
        uint64 batchId;
        bytes32 prevStateRoot;
        bytes32 postStateRoot;
        bytes32 batchDataHash;
        uint64 l2StartBlock;
        uint64 l2EndBlock;
        uint32 txCount;
        uint64 timestamp;
    }

    enum DisputeStatus {
        NONE,
        CHALLENGED,
        BISECTING,
        RESOLVED_VALID,
        RESOLVED_INVALID
    }
}
