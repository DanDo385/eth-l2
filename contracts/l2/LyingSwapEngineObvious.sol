// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SwapEngineStorage} from "./SwapEngineStorage.sol";
import {ISwapEngine} from "./ISwapEngine.sol";

/// @notice Same ABI and storage layout as HonestSwapEngine, but credits the
///         trader with 2x the honest amountOut. The state root + emitted event
///         carry the lying amount, so the divergence is observable at the
///         final SSTORE writing _balanceB[trader].
contract LyingSwapEngineObvious is SwapEngineStorage, ISwapEngine {
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

        uint256 gross = amountIn * RATE;
        uint256 honest = (gross * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;
        amountOut = honest * 2; // <-- the lie

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
