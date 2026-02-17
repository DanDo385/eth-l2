// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {DataTypes} from "../shared/DataTypes.sol";
import {Hashing} from "../shared/Hashing.sol";
import {IVerifier} from "../shared/interfaces/IVerifier.sol";

contract ZkRollupMock {
    address public sequencer;
    IVerifier public verifier;
    uint64 public nextBatchId;

    struct ZkBatch {
        bytes32 headerHash;
        DataTypes.BatchHeader header;
        bytes32 proofHash;
        bool verified;
        bool accepted;
        uint64 submittedAt;
        uint256 verificationGasUsed;
    }

    mapping(uint64 => ZkBatch) public batches;

    event ZkBatchSubmitted(
        uint64 indexed batchId, bytes32 headerHash, bytes32 postStateRoot, uint32 txCount, bool accepted, uint256 gasUsed
    );

    constructor(address _sequencer, address _verifier) {
        sequencer = _sequencer;
        verifier = IVerifier(_verifier);
    }

    function submitBatch(DataTypes.BatchHeader calldata header, bytes calldata proof)
        external
        returns (bool accepted)
    {
        require(msg.sender == sequencer, "only sequencer");
        uint64 id = nextBatchId++;
        require(header.batchId == id, "wrong batch id");

        bytes32 hHash = Hashing.hashBatchHeader(header);

        uint256 gasBefore = gasleft();
        accepted = verifier.verifyProof(proof, hHash);
        uint256 gasConsumed = gasBefore - gasleft();

        bytes32 proofHash = keccak256(proof);

        batches[id] = ZkBatch({
            headerHash: hHash,
            header: header,
            proofHash: proofHash,
            verified: true,
            accepted: accepted,
            submittedAt: uint64(block.timestamp),
            verificationGasUsed: gasConsumed
        });

        emit ZkBatchSubmitted(id, hHash, header.postStateRoot, header.txCount, accepted, gasConsumed);
    }

    function getBatch(uint64 batchId) external view returns (ZkBatch memory) {
        return batches[batchId];
    }
}
