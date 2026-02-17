// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {OptimisticPortalMock} from "../contracts/l1/OptimisticPortalMock.sol";
import {DisputeGameMock} from "../contracts/l1/DisputeGameMock.sol";
import {DataTypes} from "../contracts/shared/DataTypes.sol";

contract DisputeGameTest is Test {
    OptimisticPortalMock portal;
    DisputeGameMock dispute;
    address sequencer = makeAddr("sequencer");
    address challenger = makeAddr("challenger");

    function setUp() public {
        dispute = new DisputeGameMock(address(0));
        portal = new OptimisticPortalMock(sequencer, address(dispute));
        dispute.setPortal(address(portal));

        vm.deal(sequencer, 10 ether);
        vm.deal(challenger, 10 ether);

        // Post a batch and challenge it
        vm.prank(sequencer);
        portal.postBatch{value: 0.1 ether}(
            DataTypes.BatchHeader({
                batchId: 0,
                prevStateRoot: bytes32(0),
                postStateRoot: bytes32(uint256(1)),
                batchDataHash: bytes32(uint256(100)),
                l2StartBlock: 0,
                l2EndBlock: 9,
                txCount: 10,
                timestamp: uint64(block.timestamp)
            }),
            hex"deadbeef"
        );

        vm.prank(challenger);
        portal.challengeBatch{value: 0.1 ether}(0);
    }

    function test_initiate_setsGame() public view {
        DisputeGameMock.Game memory g = dispute.getGame(0);
        assertEq(g.challenger, challenger);
        assertEq(g.sequencer, sequencer);
        assertTrue(g.status == DataTypes.DisputeStatus.BISECTING);
        assertTrue(g.maxDepth >= 2);
        assertTrue(g.isSequencerTurn);
    }

    function test_bisect_sequencerFirst() public {
        vm.prank(sequencer);
        dispute.bisect(0, bytes32(uint256(42)), 5);

        DisputeGameMock.BisectionRound[] memory rounds = dispute.getRounds(0);
        assertEq(rounds.length, 1);
        assertEq(rounds[0].submitter, sequencer);
    }

    function test_bisect_alternatesTurns() public {
        vm.prank(sequencer);
        dispute.bisect(0, bytes32(uint256(42)), 5);

        vm.prank(challenger);
        dispute.bisect(0, bytes32(uint256(43)), 3);

        DisputeGameMock.BisectionRound[] memory rounds = dispute.getRounds(0);
        assertEq(rounds.length, 2);
        assertEq(rounds[0].submitter, sequencer);
        assertEq(rounds[1].submitter, challenger);
    }

    function test_bisect_wrongTurn() public {
        vm.prank(challenger);
        vm.expectRevert("not sequencer turn");
        dispute.bisect(0, bytes32(uint256(42)), 5);
    }

    function test_resolve_challengerWins() public {
        DisputeGameMock.Game memory g = dispute.getGame(0);
        uint8 maxDepth = g.maxDepth;

        // Play all rounds
        for (uint8 i = 0; i < maxDepth; i++) {
            if (i % 2 == 0) {
                vm.prank(sequencer);
            } else {
                vm.prank(challenger);
            }
            dispute.bisect(0, bytes32(uint256(i + 10)), uint64(i));
        }

        // Resolve: batch is invalid, challenger wins
        dispute.resolve(0, false);

        g = dispute.getGame(0);
        assertTrue(g.status == DataTypes.DisputeStatus.RESOLVED_INVALID);

        // Batch should be finalized as invalid
        OptimisticPortalMock.SubmittedBatch memory b = portal.getBatch(0);
        assertTrue(b.finalized);
    }

    function test_resolve_sequencerWins() public {
        DisputeGameMock.Game memory g = dispute.getGame(0);
        uint8 maxDepth = g.maxDepth;

        for (uint8 i = 0; i < maxDepth; i++) {
            if (i % 2 == 0) {
                vm.prank(sequencer);
            } else {
                vm.prank(challenger);
            }
            dispute.bisect(0, bytes32(uint256(i + 10)), uint64(i));
        }

        uint256 seqBalBefore = sequencer.balance;
        dispute.resolve(0, true);
        uint256 seqBalAfter = sequencer.balance;

        g = dispute.getGame(0);
        assertTrue(g.status == DataTypes.DisputeStatus.RESOLVED_VALID);

        // Sequencer should receive challenger's bond
        assertEq(seqBalAfter - seqBalBefore, 0.1 ether);
    }

    function test_resolve_tooEarly() public {
        vm.expectRevert("game still active");
        dispute.resolve(0, false);
    }

    function test_resolve_afterTimeout() public {
        vm.warp(block.timestamp + 61);
        dispute.resolve(0, false);

        DisputeGameMock.Game memory g = dispute.getGame(0);
        assertTrue(g.status == DataTypes.DisputeStatus.RESOLVED_INVALID);
    }
}
