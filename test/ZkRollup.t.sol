// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {ZkRollupMock} from "../contracts/l1/ZkRollupMock.sol";
import {ZkValidityVerifier} from "../contracts/l1/ZkValidityVerifier.sol";
import {DataTypes} from "../contracts/shared/DataTypes.sol";
import {SwapRouter} from "../contracts/l2/SwapRouter.sol";
import {HonestSwapEngine} from "../contracts/l2/HonestSwapEngine.sol";
import {LyingSwapEngineObvious} from "../contracts/l2/LyingSwapEngineObvious.sol";
import {ISwapEngine} from "../contracts/l2/ISwapEngine.sol";

contract ZkRollupTest is Test {
    ZkRollupMock zkRollup;
    ZkValidityVerifier verifier;
    HonestSwapEngine honest;
    LyingSwapEngineObvious lying;

    address sequencer = address(0x1);
    address trader = makeAddr("trader");

    function setUp() public {
        verifier = new ZkValidityVerifier();
        zkRollup = new ZkRollupMock(sequencer, address(verifier));
        honest = new HonestSwapEngine();
        lying = new LyingSwapEngineObvious();
    }

    function _snapshot(SwapRouter r)
        internal
        view
        returns (ZkValidityVerifier.AccountState[] memory pre)
    {
        uint256 n = r.accountCount();
        pre = new ZkValidityVerifier.AccountState[](n);
        for (uint256 i = 0; i < n; i++) {
            address a = r.accountAt(i);
            pre[i] = ZkValidityVerifier.AccountState(a, r.balanceA(a), r.balanceB(a), r.nonces(a));
        }
    }

    function _oneSwap() internal view returns (ZkValidityVerifier.SwapOp[] memory swaps) {
        swaps = new ZkValidityVerifier.SwapOp[](1);
        swaps[0] = ZkValidityVerifier.SwapOp(trader, 10, 0);
    }

    function _header(uint64 id, bytes32 prev, bytes32 post)
        internal
        view
        returns (DataTypes.BatchHeader memory)
    {
        return DataTypes.BatchHeader({
            batchId: id,
            prevStateRoot: prev,
            postStateRoot: post,
            batchDataHash: bytes32(uint256(id + 100)),
            l2StartBlock: id * 10,
            l2EndBlock: id * 10 + 9,
            txCount: 1,
            timestamp: uint64(block.timestamp)
        });
    }

    struct Fixture {
        DataTypes.BatchHeader header;
        ZkValidityVerifier.AccountState[] pre;
        ZkValidityVerifier.SwapOp[] swaps;
        bytes32 honestPost;
    }

    // Build a genuine honest batch: pre-state, swaps, and the true post root.
    function _honestBatch() internal returns (Fixture memory f) {
        SwapRouter r = new SwapRouter(sequencer, address(honest));
        ISwapEngine(address(r)).seed(trader, 1000);
        bytes32 prev = r.stateRoot();
        f.pre = _snapshot(r);
        ISwapEngine(address(r)).swap(trader, 10, 0);
        f.honestPost = r.stateRoot();
        f.swaps = _oneSwap();
        f.header = _header(0, prev, f.honestPost);
    }

    // ---- acceptance advances canonical state ----

    function test_submitBatch_acceptedAdvancesFinalizedRoot() public {
        Fixture memory f = _honestBatch();

        vm.prank(sequencer);
        bool accepted = zkRollup.submitBatch(f.header, f.pre, f.swaps);

        assertTrue(accepted, "honest batch must verify");
        assertEq(zkRollup.finalizedRoot(), f.honestPost, "canonical root advances to the honest post root");

        ZkRollupMock.ZkBatch memory b = zkRollup.getBatch(0);
        assertTrue(b.accepted);
        assertTrue(b.verificationGasUsed > 0);
    }

    // ---- rejection leaves canonical state untouched ----

    // Build the LYING claimed post root for the same trader/swap.
    function _lyingPost() internal returns (bytes32) {
        SwapRouter l = new SwapRouter(sequencer, address(lying));
        ISwapEngine(address(l)).seed(trader, 1000);
        ISwapEngine(address(l)).swap(trader, 10, 0);
        return l.stateRoot();
    }

    function test_submitBatch_rejectedDoesNotChangeState() public {
        // Same pre-state and swaps, but a LYING claimed post root.
        SwapRouter r = new SwapRouter(sequencer, address(honest));
        ISwapEngine(address(r)).seed(trader, 1000);
        DataTypes.BatchHeader memory header = _header(0, r.stateRoot(), _lyingPost());
        // Snapshot before the prank: _snapshot makes external calls that would
        // otherwise consume the single-call prank.
        ZkValidityVerifier.AccountState[] memory pre = _snapshot(r);

        vm.prank(sequencer);
        bool accepted = zkRollup.submitBatch(header, pre, _oneSwap());

        assertFalse(accepted, "a lying post root must be rejected");
        assertEq(zkRollup.finalizedRoot(), bytes32(0), "canonical root must NOT advance on rejection");
        assertFalse(zkRollup.getBatch(0).accepted);
        assertTrue(zkRollup.getBatch(0).verificationGasUsed > 0, "gas is still measured at the gate");
    }

    function test_submitBatch_rejectedEmitsReason() public {
        SwapRouter r = new SwapRouter(sequencer, address(honest));
        ISwapEngine(address(r)).seed(trader, 1000);
        bytes32 prev = r.stateRoot();
        ZkValidityVerifier.AccountState[] memory pre = _snapshot(r);

        // Claim a garbage post root.
        DataTypes.BatchHeader memory header = _header(0, prev, keccak256("garbage"));

        vm.prank(sequencer);
        vm.expectEmit(true, false, false, false);
        emit ZkRollupMock.ZkBatchRejected(0, bytes32(0), bytes32(0), "");
        zkRollup.submitBatch(header, pre, _oneSwap());
    }

    // ---- access control ----

    function test_submitBatch_onlySequencer() public {
        Fixture memory f = _honestBatch();
        vm.expectRevert("only sequencer");
        zkRollup.submitBatch(f.header, f.pre, f.swaps);
    }

    function test_submitBatch_wrongId() public {
        Fixture memory f = _honestBatch();
        f.header.batchId = 5;
        vm.prank(sequencer);
        vm.expectRevert("wrong batch id");
        zkRollup.submitBatch(f.header, f.pre, f.swaps);
    }
}
