// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {DataTypes} from "../shared/DataTypes.sol";
import {IDisputeGame} from "../shared/interfaces/IDisputeGame.sol";

interface IPortal {
    function finalizeBatch(uint64 batchId, bool valid) external;
}

contract DisputeGameMock is IDisputeGame {
    address public portal;

    struct Game {
        uint64 batchId;
        address challenger;
        address sequencer;
        uint256 challengerBond;
        DataTypes.DisputeStatus status;
        uint8 currentDepth;
        uint8 maxDepth;
        bytes32 batchHeaderHash;
        uint64 deadline;
        bool isSequencerTurn;
    }

    struct BisectionRound {
        uint8 depth;
        address submitter;
        bytes32 claimedStateHash;
        uint64 position;
        uint64 timestamp;
    }

    mapping(uint64 => Game) public games;
    mapping(uint64 => BisectionRound[]) internal _rounds;

    event GameInitiated(uint64 indexed batchId, address challenger, address sequencer, uint8 maxDepth);
    event BisectionMove(
        uint64 indexed batchId, uint8 depth, address submitter, bytes32 claimedHash, uint64 position
    );
    event GameResolved(uint64 indexed batchId, DataTypes.DisputeStatus result, address winner);

    constructor(address _portal) {
        portal = _portal;
    }

    function setPortal(address _portal) external {
        require(portal == address(0), "already set");
        portal = _portal;
    }

    function initiate(
        uint64 batchId,
        address challenger,
        address sequencer,
        uint32 txCount,
        bytes32 batchHeaderHash,
        uint256 challengerBond
    ) external override {
        require(msg.sender == portal, "only portal");
        require(games[batchId].status == DataTypes.DisputeStatus.NONE, "game exists");

        uint8 depth = 2;
        uint32 n = txCount;
        while ((uint32(1) << depth) < n) {
            depth++;
        }
        if (depth > 10) depth = 10;

        games[batchId] = Game({
            batchId: batchId,
            challenger: challenger,
            sequencer: sequencer,
            challengerBond: challengerBond,
            status: DataTypes.DisputeStatus.BISECTING,
            currentDepth: 0,
            maxDepth: depth,
            batchHeaderHash: batchHeaderHash,
            deadline: uint64(block.timestamp) + 60,
            isSequencerTurn: true
        });

        emit GameInitiated(batchId, challenger, sequencer, depth);
    }

    function bisect(uint64 batchId, bytes32 claimedStateHash, uint64 position) external {
        Game storage g = games[batchId];
        require(g.status == DataTypes.DisputeStatus.BISECTING, "not bisecting");
        require(g.currentDepth < g.maxDepth, "max depth reached");

        if (g.isSequencerTurn) {
            require(msg.sender == g.sequencer, "not sequencer turn");
        } else {
            require(msg.sender == g.challenger, "not challenger turn");
        }

        _rounds[batchId].push(
            BisectionRound({
                depth: g.currentDepth,
                submitter: msg.sender,
                claimedStateHash: claimedStateHash,
                position: position,
                timestamp: uint64(block.timestamp)
            })
        );

        g.currentDepth++;
        g.isSequencerTurn = !g.isSequencerTurn;
        g.deadline = uint64(block.timestamp) + 60;

        emit BisectionMove(batchId, g.currentDepth - 1, msg.sender, claimedStateHash, position);
    }

    function resolve(uint64 batchId, bool batchIsValid) external {
        Game storage g = games[batchId];
        require(g.status == DataTypes.DisputeStatus.BISECTING, "not bisecting");
        require(g.currentDepth >= g.maxDepth || block.timestamp > g.deadline, "game still active");

        address winner;
        if (batchIsValid) {
            g.status = DataTypes.DisputeStatus.RESOLVED_VALID;
            winner = g.sequencer;
            // Challenger bond slashed
            payable(g.sequencer).transfer(g.challengerBond);
        } else {
            g.status = DataTypes.DisputeStatus.RESOLVED_INVALID;
            winner = g.challenger;
            // Sequencer bond slashed (held by portal)
        }

        IPortal(portal).finalizeBatch(batchId, batchIsValid);

        emit GameResolved(batchId, g.status, winner);
    }

    function getRounds(uint64 batchId) external view returns (BisectionRound[] memory) {
        return _rounds[batchId];
    }

    function getGame(uint64 batchId) external view returns (Game memory) {
        return games[batchId];
    }

    receive() external payable {}
}
