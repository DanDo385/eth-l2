// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SwapEngineStorage} from "./SwapEngineStorage.sol";
import {ISwapEngine} from "./ISwapEngine.sol";

/// @notice An honest-INTENT engine that contains a real bug, not a lie. The
///         author meant to compute amountOut = amountIn * RATE * (1 - fee), but
///         divided the per-unit net rate before multiplying by amountIn, which
///         truncates the fractional 0.7 unit per token. The result undercredits
///         the trader. This is the "mistake" case: distinct from the malicious
///         LyingSwapEngines, but still an invalid state transition, so a ZK
///         validity proof rejects it exactly like fraud. A bug and a lie are
///         indistinguishable to a validity gate, which is the lesson.
///
/// Honest: amountOut = (amountIn * RATE * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR
/// Buggy:  amountOut =  amountIn * ((RATE * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR)
/// The early division loses precision: for amountIn=10 the honest engine returns
/// 997 and this engine returns 990.
contract BuggySwapEngine is SwapEngineStorage, ISwapEngine {
    uint256 internal constant RATE = 100;
    uint256 internal constant FEE_BPS = 30;
    uint256 internal constant BPS_DENOMINATOR = 10000;

    function swap(address trader, uint256 amountIn, uint256 nonce)
        external
        override
        returns (uint64 swapId, uint256 amountOut)
    {
        require(nonce == _nonces[trader], "invalid nonce");
        require(_balanceA[trader] >= amountIn, "insufficient A");

        _nonces[trader] = nonce + 1;
        _balanceA[trader] = _balanceA[trader] - amountIn;

        // The bug: divide first, then multiply. netRatePerUnit truncates to 99
        // instead of the intended 99.7, dropping 0.7 token-B per unit swapped.
        uint256 netRatePerUnit = (RATE * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;
        amountOut = amountIn * netRatePerUnit;

        _balanceB[trader] = _balanceB[trader] + amountOut;

        swapId = _nextSwapId;
        _nextSwapId = swapId + 1;
        _swapCount = _swapCount + 1;

        bytes32 sHash =
            keccak256(abi.encodePacked(swapId, trader, amountIn, amountOut, nonce));
        _swapHashes[swapId] = sHash;

        _register(trader);
        bytes32 oldRoot = _stateRoot;
        _recomputeRoot();

        emit Swapped(swapId, trader, amountIn, amountOut, nonce);
        emit StateRootUpdated(oldRoot, _stateRoot, swapId);
    }

    function seed(address trader, uint256 amountA) external override {
        _register(trader);
        _balanceA[trader] = amountA;
        _recomputeRoot();
    }
}
