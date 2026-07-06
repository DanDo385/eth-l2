// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {SwapRouter} from "../contracts/l2/SwapRouter.sol";
import {HonestSwapEngine} from "../contracts/l2/HonestSwapEngine.sol";
import {LyingSwapEngineObvious} from "../contracts/l2/LyingSwapEngineObvious.sol";
import {LyingSwapEngineSubtle} from "../contracts/l2/LyingSwapEngineSubtle.sol";
import {BuggySwapEngine} from "../contracts/l2/BuggySwapEngine.sol";
import {ISwapEngine} from "../contracts/l2/ISwapEngine.sol";

contract SwapEnginesTest is Test {
    SwapRouter router;
    HonestSwapEngine honest;
    LyingSwapEngineObvious lyingObvious;
    LyingSwapEngineSubtle lyingSubtle;
    BuggySwapEngine buggy;

    address sequencer = makeAddr("sequencer");
    address trader = makeAddr("trader");
    address other = makeAddr("other");

    function setUp() public {
        honest = new HonestSwapEngine();
        lyingObvious = new LyingSwapEngineObvious();
        lyingSubtle = new LyingSwapEngineSubtle();
        buggy = new BuggySwapEngine();
        router = new SwapRouter(sequencer, address(honest));
    }

    // ---- happy path (honest) ----

    function test_honest_swap_appliesFeeAndUpdatesState() public {
        SwapRouter(router).balanceA(trader); // no-op view to exercise router
        ISwapEngine(address(router)).seed(trader, 1000);
        assertEq(router.balanceA(trader), 1000);

        (uint64 swapId, uint256 amountOut) =
            ISwapEngine(address(router)).swap(trader, 10, 0);

        // amountIn=10, rate=100, fee=0.3% -> 10*100 = 1000, 1000*9970/10000 = 997
        assertEq(amountOut, 997);
        assertEq(swapId, 0);
        assertEq(router.balanceA(trader), 990);
        assertEq(router.balanceB(trader), 997);
        assertEq(router.nonces(trader), 1);
        assertEq(router.nextSwapId(), 1);
        assertTrue(router.stateRoot() != bytes32(0));
    }

    // WO-1: the root is a commitment over final balances, so the same swaps
    // applied in a different order (across distinct accounts, same registration
    // order) commit to the SAME root. This is the correct state-commitment
    // semantics, replacing the old path-dependent history hash.
    function test_honest_stateRoot_commitsToFinalBalances() public {
        ISwapEngine(address(router)).seed(trader, 1000);
        ISwapEngine(address(router)).seed(other, 1000);
        ISwapEngine(address(router)).swap(trader, 10, 0);
        ISwapEngine(address(router)).swap(other, 5, 0);
        bytes32 rootA = router.stateRoot();

        SwapRouter router2 = new SwapRouter(sequencer, address(honest));
        ISwapEngine(address(router2)).seed(trader, 1000);
        ISwapEngine(address(router2)).seed(other, 1000);
        ISwapEngine(address(router2)).swap(other, 5, 0);
        ISwapEngine(address(router2)).swap(trader, 10, 0);
        bytes32 rootB = router2.stateRoot();

        assertEq(rootA, rootB, "same final balances must commit to the same root");
    }

    // Registration order is part of the commitment (mirrors the Go fold order).
    function test_honest_stateRoot_registrationOrderMatters() public {
        ISwapEngine(address(router)).seed(trader, 1000);
        ISwapEngine(address(router)).seed(other, 1000);
        bytes32 rootA = router.stateRoot();

        SwapRouter router2 = new SwapRouter(sequencer, address(honest));
        ISwapEngine(address(router2)).seed(other, 1000);
        ISwapEngine(address(router2)).seed(trader, 1000);
        bytes32 rootB = router2.stateRoot();

        assertTrue(rootA != rootB, "different registration order must differ");
    }

    // Cross-language parity: this exact one-account scenario is pinned to the
    // SAME literal in the Go re-implementation
    // (watcher/honest_test.go TestHonestSim_root_pinnedFormula). If either the
    // Solidity _accountLeaf/_recomputeRoot encoding or the Go fold drifts, one
    // side breaks. Scenario: single account 0x1111..1111, balanceA=1000,
    // balanceB=0, nonce=0.
    function test_root_matchesGoReferenceScenario() public {
        address ref = 0x1111111111111111111111111111111111111111;
        SwapRouter r = new SwapRouter(sequencer, address(honest));
        ISwapEngine(address(r)).seed(ref, 1000);
        assertEq(
            r.stateRoot(),
            bytes32(0xea057b0a0638c94375c460077254704b78263d17ea3eaad67a845af4953fabbf),
            "Solidity root must match the Go reference root"
        );
    }

    function test_honest_nonceMustMatch() public {
        ISwapEngine(address(router)).seed(trader, 1000);

        vm.expectRevert("invalid nonce");
        ISwapEngine(address(router)).swap(trader, 10, 1);
    }

    function test_honest_insufficientReverts() public {
        ISwapEngine(address(router)).seed(trader, 5);

        vm.expectRevert("insufficient A");
        ISwapEngine(address(router)).swap(trader, 10, 0);
    }

    // ---- obvious lie: balanceB is 2x what it should be ----

    function test_lyingObvious_writesDoubleAmount() public {
        vm.prank(sequencer);
        router.setImplementation(address(lyingObvious));

        ISwapEngine(address(router)).seed(trader, 1000);
        (, uint256 amountOut) = ISwapEngine(address(router)).swap(trader, 10, 0);

        // Lying engine returns 2x the honest amount
        assertEq(amountOut, 997 * 2);
        assertEq(router.balanceB(trader), 997 * 2);
    }

    function test_lyingObvious_yieldsDifferentStateRootThanHonest() public {
        bytes32 honestRoot;
        {
            ISwapEngine(address(router)).seed(trader, 1000);
            ISwapEngine(address(router)).swap(trader, 10, 0);
            honestRoot = router.stateRoot();
        }

        SwapRouter router2 = new SwapRouter(sequencer, address(lyingObvious));
        ISwapEngine(address(router2)).seed(trader, 1000);
        ISwapEngine(address(router2)).swap(trader, 10, 0);
        bytes32 lyingRoot = router2.stateRoot();

        assertTrue(honestRoot != lyingRoot);
    }

    // ---- subtle lie: fee skipped ----

    function test_lyingSubtle_skipsFee() public {
        vm.prank(sequencer);
        router.setImplementation(address(lyingSubtle));

        ISwapEngine(address(router)).seed(trader, 1000);
        (, uint256 amountOut) = ISwapEngine(address(router)).swap(trader, 10, 0);

        // Subtle lie returns gross (1000) instead of gross - fee (997)
        assertEq(amountOut, 1000);
        assertEq(router.balanceB(trader), 1000);
    }

    function test_lyingSubtle_yieldsDifferentStateRootThanHonest() public {
        bytes32 honestRoot;
        {
            ISwapEngine(address(router)).seed(trader, 1000);
            ISwapEngine(address(router)).swap(trader, 10, 0);
            honestRoot = router.stateRoot();
        }

        SwapRouter router2 = new SwapRouter(sequencer, address(lyingSubtle));
        ISwapEngine(address(router2)).seed(trader, 1000);
        ISwapEngine(address(router2)).swap(trader, 10, 0);
        bytes32 lyingRoot = router2.stateRoot();

        assertTrue(honestRoot != lyingRoot);
    }

    // ---- buggy engine: honest intent, off-by-truncation bug ----

    function test_buggy_undercreditsFromTruncation() public {
        vm.prank(sequencer);
        router.setImplementation(address(buggy));

        ISwapEngine(address(router)).seed(trader, 1000);
        (, uint256 amountOut) = ISwapEngine(address(router)).swap(trader, 10, 0);

        // Honest returns 997; the early-division bug returns 10 * 99 = 990.
        assertEq(amountOut, 990);
        assertEq(router.balanceB(trader), 990);
    }

    // A bug is still an invalid state transition: its root differs from honest,
    // exactly like a lie. This is why a validity gate rejects bugs and lies alike.
    function test_buggy_yieldsDifferentStateRootThanHonest() public {
        bytes32 honestRoot;
        {
            ISwapEngine(address(router)).seed(trader, 1000);
            ISwapEngine(address(router)).swap(trader, 10, 0);
            honestRoot = router.stateRoot();
        }

        SwapRouter router2 = new SwapRouter(sequencer, address(buggy));
        ISwapEngine(address(router2)).seed(trader, 1000);
        ISwapEngine(address(router2)).swap(trader, 10, 0);

        assertTrue(honestRoot != router2.stateRoot());
    }

    function test_buggy_distinctFromLies() public {
        // honest 997, buggy 990, subtle 1000, obvious 1994 are all distinct.
        uint256[4] memory outs;
        outs[0] = _oneSwapOut(address(honest));
        outs[1] = _oneSwapOut(address(buggy));
        outs[2] = _oneSwapOut(address(lyingSubtle));
        outs[3] = _oneSwapOut(address(lyingObvious));
        assertEq(outs[0], 997);
        assertEq(outs[1], 990);
        assertEq(outs[2], 1000);
        assertEq(outs[3], 1994);
    }

    function _oneSwapOut(address engine) internal returns (uint256 amountOut) {
        SwapRouter r = new SwapRouter(sequencer, engine);
        ISwapEngine(address(r)).seed(trader, 1000);
        (, amountOut) = ISwapEngine(address(r)).swap(trader, 10, 0);
    }

    // ---- engine swap ----

    function test_setImplementation_onlySequencer() public {
        vm.expectRevert("only sequencer");
        router.setImplementation(address(lyingObvious));
    }

    function test_setImplementation_emitsEvent() public {
        vm.expectEmit(true, true, false, false);
        emit SwapRouter.ImplementationChanged(address(honest), address(lyingObvious));

        vm.prank(sequencer);
        router.setImplementation(address(lyingObvious));

        assertEq(router.implementation(), address(lyingObvious));
    }

    function test_engineSwap_preservesSharedState() public {
        // Swap honestly, then flip to lying, swap again. Earlier state must persist.
        ISwapEngine(address(router)).seed(trader, 1000);
        ISwapEngine(address(router)).swap(trader, 10, 0);

        assertEq(router.balanceA(trader), 990);
        assertEq(router.balanceB(trader), 997);
        uint64 idAfterHonest = router.nextSwapId();

        vm.prank(sequencer);
        router.setImplementation(address(lyingObvious));
        ISwapEngine(address(router)).swap(trader, 10, 1);

        // Earlier honest state preserved
        assertEq(router.balanceA(trader), 980);
        assertEq(router.balanceB(trader), 997 + 997 * 2);
        assertEq(router.nextSwapId(), idAfterHonest + 1);
    }

    // ---- the same trader/calldata against each engine gives 3 distinct outcomes ----

    function test_threeEngines_threeDistinctOutcomes() public {
        uint256[3] memory outs;

        // honest
        {
            SwapRouter r = new SwapRouter(sequencer, address(honest));
            ISwapEngine(address(r)).seed(trader, 1000);
            (, outs[0]) = ISwapEngine(address(r)).swap(trader, 10, 0);
        }
        // lying obvious
        {
            SwapRouter r = new SwapRouter(sequencer, address(lyingObvious));
            ISwapEngine(address(r)).seed(trader, 1000);
            (, outs[1]) = ISwapEngine(address(r)).swap(trader, 10, 0);
        }
        // lying subtle
        {
            SwapRouter r = new SwapRouter(sequencer, address(lyingSubtle));
            ISwapEngine(address(r)).seed(trader, 1000);
            (, outs[2]) = ISwapEngine(address(r)).swap(trader, 10, 0);
        }

        assertEq(outs[0], 997);
        assertEq(outs[1], 1994);
        assertEq(outs[2], 1000);
        assertTrue(outs[0] != outs[1] && outs[1] != outs[2] && outs[0] != outs[2]);
    }
}
