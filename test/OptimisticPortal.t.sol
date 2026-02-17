// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {OptimisticPortalMock} from "../contracts/l1/OptimisticPortalMock.sol";
import {DisputeGameMock} from "../contracts/l1/DisputeGameMock.sol";
import {DataTypes} from "../contracts/shared/DataTypes.sol";

contract OptimisticPortalTest is Test {
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

    function test_postBatch_success() public {
        vm.prank(sequencer);
        portal.postBatch{value: 0.1 ether}(_header(0), hex"dead");
        assertEq(portal.nextBatchId(), 1);
    }

    function test_postBatch_emitsEvent() public {
        DataTypes.BatchHeader memory h = _header(0);
        vm.prank(sequencer);
        vm.expectEmit(true, false, false, false);
        emit OptimisticPortalMock.BatchPosted(0, bytes32(0), bytes32(0), bytes32(0), 0, 0);
        portal.postBatch{value: 0.1 ether}(h, hex"dead");
    }

    function test_postBatch_insufficientBond() public {
        vm.prank(sequencer);
        vm.expectRevert("insufficient bond");
        portal.postBatch{value: 0.01 ether}(_header(0), hex"dead");
    }

    function test_postBatch_wrongId() public {
        vm.prank(sequencer);
        vm.expectRevert("wrong batch id");
        portal.postBatch{value: 0.1 ether}(_header(5), hex"dead");
    }

    function test_postBatch_onlySequencer() public {
        vm.prank(challenger);
        vm.expectRevert("only sequencer");
        portal.postBatch{value: 0.1 ether}(_header(0), hex"dead");
    }

    function test_challengeBatch_success() public {
        vm.prank(sequencer);
        portal.postBatch{value: 0.1 ether}(_header(0), hex"dead");

        vm.prank(challenger);
        portal.challengeBatch{value: 0.1 ether}(0);

        OptimisticPortalMock.SubmittedBatch memory b = portal.getBatch(0);
        assertTrue(b.challenged);
    }

    function test_challengeBatch_afterWindow() public {
        vm.prank(sequencer);
        portal.postBatch{value: 0.1 ether}(_header(0), hex"dead");

        vm.warp(block.timestamp + 200);

        vm.prank(challenger);
        vm.expectRevert("challenge window closed");
        portal.challengeBatch{value: 0.1 ether}(0);
    }

    function test_challengeBatch_alreadyChallenged() public {
        vm.prank(sequencer);
        portal.postBatch{value: 0.1 ether}(_header(0), hex"dead");

        vm.prank(challenger);
        portal.challengeBatch{value: 0.1 ether}(0);

        vm.deal(challenger, 10 ether);
        vm.prank(challenger);
        vm.expectRevert("already challenged");
        portal.challengeBatch{value: 0.1 ether}(0);
    }

    function test_finalizeBatch_afterWindow() public {
        vm.prank(sequencer);
        portal.postBatch{value: 0.1 ether}(_header(0), hex"dead");

        vm.warp(block.timestamp + 200);

        uint256 balBefore = sequencer.balance;
        portal.finalizeBatch(0, true);
        uint256 balAfter = sequencer.balance;

        assertEq(balAfter - balBefore, 0.1 ether);
    }

    function test_finalizeBatch_windowStillOpen() public {
        vm.prank(sequencer);
        portal.postBatch{value: 0.1 ether}(_header(0), hex"dead");

        vm.expectRevert("challenge window open");
        portal.finalizeBatch(0, true);
    }

    function test_finalizeBatch_onlyDisputeGameWhenChallenged() public {
        vm.prank(sequencer);
        portal.postBatch{value: 0.1 ether}(_header(0), hex"dead");

        vm.prank(challenger);
        portal.challengeBatch{value: 0.1 ether}(0);

        vm.warp(block.timestamp + 200);

        vm.expectRevert("only dispute game");
        portal.finalizeBatch(0, true);
    }
}
