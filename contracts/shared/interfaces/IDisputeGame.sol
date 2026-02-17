// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IDisputeGame {
    function initiate(
        uint64 batchId,
        address challenger,
        address sequencer,
        uint32 txCount,
        bytes32 batchHeaderHash,
        uint256 challengerBond
    ) external;
}
