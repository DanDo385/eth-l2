// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {DataTypes} from "../shared/DataTypes.sol";
import {Hashing} from "../shared/Hashing.sol";
import {ZkValidityVerifier} from "./ZkValidityVerifier.sol";

/// @notice The ZK settlement gate. A batch settles ONLY if its claimed
///         post-state root is proven valid by re-execution over the witness
///         (see ZkValidityVerifier, a labeled Tier B stand-in). The canonical
///         root (`finalizedRoot`) advances only on acceptance, so an invalid
///         state transition (a lie or a bug) is rejected at submission and
///         never enters L1 state. There is no challenge window and no watcher.
contract ZkRollupMock {
    address public sequencer;
    ZkValidityVerifier public verifier;
    uint64 public nextBatchId;

    /// @notice Canonical ZK state root. Advances only when a batch verifies.
    ///         A rejected batch leaves this untouched.
    bytes32 public finalizedRoot;

    struct ZkBatch {
        bytes32 headerHash;
        bytes32 claimedPostRoot;
        bytes32 recomputedRoot;
        bool accepted;
        uint64 submittedAt;
        uint256 verificationGasUsed;
    }

    mapping(uint64 => ZkBatch) public batches;

    event ZkBatchSubmitted(
        uint64 indexed batchId,
        bytes32 headerHash,
        bytes32 postStateRoot,
        uint32 txCount,
        bool accepted,
        uint256 gasUsed
    );
    event ZkStateAdvanced(uint64 indexed batchId, bytes32 newFinalizedRoot);
    event ZkBatchRejected(uint64 indexed batchId, bytes32 claimedRoot, bytes32 recomputedRoot, string reason);

    constructor(address _sequencer, address _verifier) {
        sequencer = _sequencer;
        verifier = ZkValidityVerifier(_verifier);
    }

    function submitBatch(
        DataTypes.BatchHeader calldata header,
        ZkValidityVerifier.AccountState[] calldata pre,
        ZkValidityVerifier.SwapOp[] calldata swaps
    ) external returns (bool accepted) {
        require(msg.sender == sequencer, "only sequencer");
        uint64 id = nextBatchId++;
        require(header.batchId == id, "wrong batch id");

        bytes32 hHash = Hashing.hashBatchHeader(header);

        // Measure real on-chain verification cost. For this Tier B stand-in the
        // cost grows with tx count (it re-executes); a real succinct proof would
        // verify in constant time. That contrast is surfaced in the UI.
        uint256 gasBefore = gasleft();
        (bool valid, bytes32 recomputed, bool bound) =
            verifier.verifyValidity(header.prevStateRoot, header.postStateRoot, pre, swaps);

        batches[id] = ZkBatch({
            headerHash: hHash,
            claimedPostRoot: header.postStateRoot,
            recomputedRoot: recomputed,
            accepted: valid,
            submittedAt: uint64(block.timestamp),
            verificationGasUsed: gasBefore - gasleft()
        });
        accepted = valid;

        emit ZkBatchSubmitted(
            id, hHash, header.postStateRoot, header.txCount, valid, batches[id].verificationGasUsed
        );

        if (valid) {
            // Validity proven: the batch settles with immediate hard finality.
            finalizedRoot = header.postStateRoot;
            emit ZkStateAdvanced(id, header.postStateRoot);
        } else {
            // Rejected at the gate: finalizedRoot is untouched, bad state never settles.
            emit ZkBatchRejected(id, header.postStateRoot, recomputed, _rejectReason(bound));
        }
    }

    function _rejectReason(bool bound) internal pure returns (string memory) {
        return bound
            ? "post-state root does not match honest re-execution"
            : "pre-state witness does not hash to prevStateRoot";
    }

    function getBatch(uint64 batchId) external view returns (ZkBatch memory) {
        return batches[batchId];
    }
}
