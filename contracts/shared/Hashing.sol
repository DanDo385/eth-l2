// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {DataTypes} from "./DataTypes.sol";

library Hashing {
    function hashTrade(DataTypes.Trade memory t) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(t.tradeId, t.trader, t.amountIn, t.amountOut, t.nonce));
    }

    function hashBatchHeader(DataTypes.BatchHeader memory h) internal pure returns (bytes32) {
        return keccak256(abi.encode(h));
    }
}
