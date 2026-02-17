// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {DataTypes} from "../shared/DataTypes.sol";
import {Hashing} from "../shared/Hashing.sol";
import {IDisputeGame} from "../shared/interfaces/IDisputeGame.sol";

contract OptimisticPortalMock {
    uint256 public constant BOND_AMOUNT = 0.1 ether;
    uint64 public constant CHALLENGE_WINDOW = 120;

    address public sequencer;
    address public disputeGame;
    uint64 public nextBatchId;

    struct SubmittedBatch {
        bytes32 headerHash;
        DataTypes.BatchHeader header;
        bytes32 rawDataHash;
        uint256 bond;
        uint64 submittedAt;
        bool finalized;
        bool challenged;
    }

    mapping(uint64 => SubmittedBatch) public batches;

    event BatchPosted(
        uint64 indexed batchId,
        bytes32 headerHash,
        bytes32 postStateRoot,
        bytes32 batchDataHash,
        uint32 txCount,
        uint256 bond
    );
    event BatchChallenged(uint64 indexed batchId, address indexed challenger);
    event BatchFinalized(uint64 indexed batchId, bool valid);

    constructor(address _sequencer, address _disputeGame) {
        sequencer = _sequencer;
        disputeGame = _disputeGame;
    }

    function postBatch(DataTypes.BatchHeader calldata header, bytes calldata rawData) external payable {
        require(msg.sender == sequencer, "only sequencer");
        require(msg.value >= BOND_AMOUNT, "insufficient bond");

        uint64 id = nextBatchId++;
        require(header.batchId == id, "wrong batch id");

        bytes32 hHash = Hashing.hashBatchHeader(header);
        bytes32 dataHash = keccak256(rawData);

        batches[id] = SubmittedBatch({
            headerHash: hHash,
            header: header,
            rawDataHash: dataHash,
            bond: msg.value,
            submittedAt: uint64(block.timestamp),
            finalized: false,
            challenged: false
        });

        emit BatchPosted(id, hHash, header.postStateRoot, header.batchDataHash, header.txCount, msg.value);
    }

    function challengeBatch(uint64 batchId) external payable {
        SubmittedBatch storage b = batches[batchId];
        require(!b.finalized, "already finalized");
        require(!b.challenged, "already challenged");
        require(block.timestamp < b.submittedAt + CHALLENGE_WINDOW, "challenge window closed");
        require(msg.value >= BOND_AMOUNT, "challenger bond required");

        b.challenged = true;

        // Forward sequencer bond to dispute game so it can slash
        payable(disputeGame).transfer(b.bond);

        IDisputeGame(disputeGame).initiate(
            batchId, msg.sender, sequencer, b.header.txCount, b.headerHash, msg.value
        );

        emit BatchChallenged(batchId, msg.sender);
    }

    function finalizeBatch(uint64 batchId, bool valid) external {
        SubmittedBatch storage b = batches[batchId];
        require(!b.finalized, "already finalized");

        if (b.challenged) {
            require(msg.sender == disputeGame, "only dispute game");
        } else {
            require(block.timestamp >= b.submittedAt + CHALLENGE_WINDOW, "challenge window open");
        }

        b.finalized = true;

        if (!valid && !b.challenged) {
            // Edge case: should not happen in normal flow
        } else if (valid && !b.challenged) {
            // Return bond to sequencer
            payable(sequencer).transfer(b.bond);
        }

        emit BatchFinalized(batchId, valid);
    }

    function getBatch(uint64 batchId) external view returns (SubmittedBatch memory) {
        return batches[batchId];
    }

    receive() external payable {}
}
