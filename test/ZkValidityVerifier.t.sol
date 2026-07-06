// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {ZkValidityVerifier} from "../contracts/l1/ZkValidityVerifier.sol";
import {SwapRouter} from "../contracts/l2/SwapRouter.sol";
import {HonestSwapEngine} from "../contracts/l2/HonestSwapEngine.sol";
import {LyingSwapEngineObvious} from "../contracts/l2/LyingSwapEngineObvious.sol";
import {LyingSwapEngineSubtle} from "../contracts/l2/LyingSwapEngineSubtle.sol";
import {BuggySwapEngine} from "../contracts/l2/BuggySwapEngine.sol";
import {ISwapEngine} from "../contracts/l2/ISwapEngine.sol";

/// @notice Proves the Tier B validity gate rejects invalid roots (lie or bug) by
///         independent honest re-execution, and accepts genuinely honest batches.
///         The witness pre-state must also bind to prevStateRoot.
contract ZkValidityVerifierTest is Test {
    ZkValidityVerifier v;
    HonestSwapEngine honest;
    LyingSwapEngineObvious lyingObvious;
    LyingSwapEngineSubtle lyingSubtle;
    BuggySwapEngine buggy;

    address sequencer = makeAddr("sequencer");
    address trader = makeAddr("trader");
    address other = makeAddr("other");

    function setUp() public {
        v = new ZkValidityVerifier();
        honest = new HonestSwapEngine();
        lyingObvious = new LyingSwapEngineObvious();
        lyingSubtle = new LyingSwapEngineSubtle();
        buggy = new BuggySwapEngine();
    }

    // Snapshot a router's committed account set into a witness pre-state.
    function _snapshot(SwapRouter r)
        internal
        view
        returns (ZkValidityVerifier.AccountState[] memory pre)
    {
        uint256 n = r.accountCount();
        pre = new ZkValidityVerifier.AccountState[](n);
        for (uint256 i = 0; i < n; i++) {
            address a = r.accountAt(i);
            pre[i] = ZkValidityVerifier.AccountState({
                account: a,
                balanceA: r.balanceA(a),
                balanceB: r.balanceB(a),
                nonce: r.nonces(a)
            });
        }
    }

    function _oneSwap(address trader_, uint256 amountIn, uint256 nonce)
        internal
        pure
        returns (ZkValidityVerifier.SwapOp[] memory swaps)
    {
        swaps = new ZkValidityVerifier.SwapOp[](1);
        swaps[0] = ZkValidityVerifier.SwapOp({trader: trader_, amountIn: amountIn, nonce: nonce});
    }

    // ---- acceptance ----

    function test_accepts_honestBatch() public {
        SwapRouter r = new SwapRouter(sequencer, address(honest));
        ISwapEngine(address(r)).seed(trader, 1000);
        bytes32 prevRoot = r.stateRoot();
        ZkValidityVerifier.AccountState[] memory pre = _snapshot(r);

        ISwapEngine(address(r)).swap(trader, 10, 0);
        bytes32 postRoot = r.stateRoot();

        (bool valid, bytes32 recomputed, bool bound) =
            v.verifyValidity(prevRoot, postRoot, pre, _oneSwap(trader, 10, 0));

        assertTrue(bound, "honest pre-state must bind to prevStateRoot");
        assertTrue(valid, "honest batch must verify");
        assertEq(recomputed, postRoot, "recomputed root must equal honest post root");
    }

    function test_accepts_multiSwapMultiAccount() public {
        SwapRouter r = new SwapRouter(sequencer, address(honest));
        ISwapEngine(address(r)).seed(trader, 1000);
        ISwapEngine(address(r)).seed(other, 1000);
        bytes32 prevRoot = r.stateRoot();
        ZkValidityVerifier.AccountState[] memory pre = _snapshot(r);

        ISwapEngine(address(r)).swap(trader, 10, 0);
        ISwapEngine(address(r)).swap(other, 7, 0);
        ISwapEngine(address(r)).swap(trader, 3, 1);
        bytes32 postRoot = r.stateRoot();

        ZkValidityVerifier.SwapOp[] memory swaps = new ZkValidityVerifier.SwapOp[](3);
        swaps[0] = ZkValidityVerifier.SwapOp(trader, 10, 0);
        swaps[1] = ZkValidityVerifier.SwapOp(other, 7, 0);
        swaps[2] = ZkValidityVerifier.SwapOp(trader, 3, 1);

        (bool valid,, bool bound) = v.verifyValidity(prevRoot, postRoot, pre, swaps);
        assertTrue(bound);
        assertTrue(valid);
    }

    // ---- rejection: fraud ----

    function test_rejects_lyingObvious() public {
        (bytes32 prevRoot, ZkValidityVerifier.AccountState[] memory pre) = _honestPreState();

        SwapRouter l = new SwapRouter(sequencer, address(lyingObvious));
        ISwapEngine(address(l)).seed(trader, 1000);
        ISwapEngine(address(l)).swap(trader, 10, 0);

        (bool valid,, bool bound) =
            v.verifyValidity(prevRoot, l.stateRoot(), pre, _oneSwap(trader, 10, 0));
        assertTrue(bound, "pre-state is genuine");
        assertFalse(valid, "a doubled output cannot be reproduced honestly");
    }

    function test_rejects_lyingSubtle() public {
        (bytes32 prevRoot, ZkValidityVerifier.AccountState[] memory pre) = _honestPreState();

        SwapRouter l = new SwapRouter(sequencer, address(lyingSubtle));
        ISwapEngine(address(l)).seed(trader, 1000);
        ISwapEngine(address(l)).swap(trader, 10, 0);

        (bool valid,, bool bound) =
            v.verifyValidity(prevRoot, l.stateRoot(), pre, _oneSwap(trader, 10, 0));
        assertTrue(bound);
        assertFalse(valid, "a skipped fee cannot be reproduced honestly");
    }

    // ---- rejection: honest-intent bug ----

    function test_rejects_buggyEngine() public {
        (bytes32 prevRoot, ZkValidityVerifier.AccountState[] memory pre) = _honestPreState();

        SwapRouter b = new SwapRouter(sequencer, address(buggy));
        ISwapEngine(address(b)).seed(trader, 1000);
        ISwapEngine(address(b)).swap(trader, 10, 0);

        (bool valid,, bool bound) =
            v.verifyValidity(prevRoot, b.stateRoot(), pre, _oneSwap(trader, 10, 0));
        assertTrue(bound);
        assertFalse(valid, "a bug is still an invalid state transition, rejected like a lie");
    }

    // ---- rejection: unbound pre-state ----

    function test_rejects_tamperedPreState() public {
        SwapRouter r = new SwapRouter(sequencer, address(honest));
        ISwapEngine(address(r)).seed(trader, 1000);
        bytes32 prevRoot = r.stateRoot();
        ZkValidityVerifier.AccountState[] memory pre = _snapshot(r);
        pre[0].balanceA = 999; // fake a favorable pre-state

        ISwapEngine(address(r)).swap(trader, 10, 0);

        (bool valid,, bool bound) =
            v.verifyValidity(prevRoot, r.stateRoot(), pre, _oneSwap(trader, 10, 0));
        assertFalse(bound, "a pre-state that does not hash to prevStateRoot is not bound");
        assertFalse(valid);
    }

    function _honestPreState()
        internal
        returns (bytes32 prevRoot, ZkValidityVerifier.AccountState[] memory pre)
    {
        SwapRouter h = new SwapRouter(sequencer, address(honest));
        ISwapEngine(address(h)).seed(trader, 1000);
        prevRoot = h.stateRoot();
        pre = _snapshot(h);
    }
}
