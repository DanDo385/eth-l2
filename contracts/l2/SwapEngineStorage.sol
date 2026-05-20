// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

abstract contract SwapEngineStorage {
    mapping(address => uint256) internal _balanceA;
    mapping(address => uint256) internal _balanceB;
    mapping(address => uint256) internal _nonces;
    uint64 internal _nextSwapId;
    uint64 internal _swapCount;
    bytes32 internal _stateRoot;
    mapping(uint64 => bytes32) internal _swapHashes;
}
