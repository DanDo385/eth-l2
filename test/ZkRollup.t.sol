// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {ZkRollupMock} from "../contracts/l1/ZkRollupMock.sol";
import {VerifierMock} from "../contracts/l1/VerifierMock.sol";
import {DataTypes} from "../contracts/shared/DataTypes.sol";

contract ZkRollupTest is Test {
    ZkRollupMock zkRollup;
    VerifierMock verifier;
    address sequencer = address(0x1);

    function setUp() public {
        verifier = new VerifierMock();
        zkRollup = new ZkRollupMock(sequencer, address(verifier));
    }

    function _header(uint64 id) internal view returns (DataTypes.BatchHeader memory) {
        return DataTypes.BatchHeader({
            batchId: id,
            prevStateRoot: bytes32(0),
            postStateRoot: bytes32(uint256(id + 1)),
            batchDataHash: bytes32(uint256(id + 100)),
            l2StartBlock: id * 10,
            l2EndBlock: id * 10 + 9,
            txCount: 10,
            timestamp: uint64(block.timestamp)
        });
    }

    function test_submitBatch_accepted() public {
        // Find a proof that passes: keccak256(proof, headerHash)[0] < 0x80
        DataTypes.BatchHeader memory h = _header(0);
        bytes memory proof = hex"01";

        // Try different proofs until one is accepted
        for (uint256 i = 0; i < 256; i++) {
            proof = abi.encodePacked(bytes32(i));
            bytes32 hHash = keccak256(abi.encode(h));
            if (uint8(keccak256(abi.encodePacked(proof, hHash))[0]) < 0x80) break;
        }

        vm.prank(sequencer);
        bool accepted = zkRollup.submitBatch(h, proof);
        assertTrue(accepted);

        ZkRollupMock.ZkBatch memory b = zkRollup.getBatch(0);
        assertTrue(b.accepted);
        assertTrue(b.verified);
        assertTrue(b.verificationGasUsed > 0);
    }

    function test_submitBatch_rejected() public {
        DataTypes.BatchHeader memory h = _header(0);
        bytes memory proof = hex"01";

        // Find a proof that fails: keccak256(proof, headerHash)[0] >= 0x80
        for (uint256 i = 0; i < 256; i++) {
            proof = abi.encodePacked(bytes32(i));
            bytes32 hHash = keccak256(abi.encode(h));
            if (uint8(keccak256(abi.encodePacked(proof, hHash))[0]) >= 0x80) break;
        }

        vm.prank(sequencer);
        bool accepted = zkRollup.submitBatch(h, proof);
        assertFalse(accepted);

        ZkRollupMock.ZkBatch memory b = zkRollup.getBatch(0);
        assertFalse(b.accepted);
    }

    function test_submitBatch_emitsEvent() public {
        DataTypes.BatchHeader memory h = _header(0);
        bytes memory proof = abi.encodePacked(bytes32(uint256(0)));

        vm.prank(sequencer);
        vm.expectEmit(true, false, false, false);
        emit ZkRollupMock.ZkBatchSubmitted(0, bytes32(0), bytes32(0), 0, false, 0);
        zkRollup.submitBatch(h, proof);
    }

    function test_submitBatch_onlySequencer() public {
        vm.expectRevert("only sequencer");
        zkRollup.submitBatch(_header(0), hex"01");
    }

    function test_submitBatch_wrongId() public {
        vm.prank(sequencer);
        vm.expectRevert("wrong batch id");
        zkRollup.submitBatch(_header(5), hex"01");
    }

    function test_verifier_deterministic() public view {
        bytes memory proof = hex"abcdef";
        bytes32 pubInput = bytes32(uint256(42));
        bool r1 = verifier.verifyProofView(proof, pubInput);
        bool r2 = verifier.verifyProofView(proof, pubInput);
        assertEq(r1, r2);
    }
}
