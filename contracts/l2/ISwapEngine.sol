// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ISwapEngine {
    event Swapped(
        uint64 indexed swapId,
        address indexed trader,
        uint256 amountIn,
        uint256 amountOut,
        uint256 nonce
    );

    event StateRootUpdated(bytes32 oldRoot, bytes32 newRoot, uint64 swapId);

    function swap(address trader, uint256 amountIn, uint256 nonce)
        external
        returns (uint64 swapId, uint256 amountOut);

    function seed(address trader, uint256 amountA) external;
}
