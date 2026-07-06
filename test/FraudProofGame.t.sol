// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {FraudProofGame} from "../contracts/l1/FraudProofGame.sol";
import {SwapStepVM} from "../contracts/l1/SwapStepVM.sol";
import {Merkle} from "../contracts/shared/Merkle.sol";

// Records finalizeBatch calls so tests can assert the on-chain verdict propagated.
contract MockPortal {
    mapping(uint64 => bool) public finalized;
    mapping(uint64 => bool) public validResult;

    function finalizeBatch(uint64 batchId, bool valid) external {
        finalized[batchId] = true;
        validResult[batchId] = valid;
    }
}

contract FraudProofGameTest is Test {
    FraudProofGame game;
    MockPortal portal;

    address sequencer = makeAddr("sequencer");
    address challenger = makeAddr("challenger");

    // honest states of the reference swap (amountIn=10, balanceB_pre=0), kept so
    // tests can supply the agreed pre-state to resolveOneStep.
    SwapStepVM.State[8] honestStates;

    function setUp() public {
        portal = new MockPortal();
        game = new FraudProofGame(address(portal));
        (SwapStepVM.State[8] memory hs,) = _honestTrace(10, 0);
        for (uint256 i = 0; i < 8; i++) {
            honestStates[i] = hs[i];
        }
    }

    // ── trace builders ───────────────────────────────────────────────────────

    function _honestTrace(uint256 amountIn, uint256 balBpre)
        internal
        pure
        returns (SwapStepVM.State[8] memory states, bytes32[8] memory leaves)
    {
        SwapStepVM.State memory s = SwapStepVM.initialState(amountIn, 100, 10000, 30, balBpre);
        states[0] = s;
        leaves[0] = SwapStepVM.hashState(s);
        for (uint256 k = 0; k < 7; k++) {
            s = SwapStepVM.step(s);
            states[k + 1] = s;
            leaves[k + 1] = SwapStepVM.hashState(s);
        }
    }

    // A lying trace: honest up to badStep, then the output of badStep is
    // corrupted to badValue, and honest steps continue from the corrupted state.
    function _lyingLeaves(uint256 amountIn, uint256 balBpre, uint256 badStep, uint8 badDst, uint256 badValue)
        internal
        pure
        returns (bytes32[8] memory leaves)
    {
        (SwapStepVM.State[8] memory hs,) = _honestTrace(amountIn, balBpre);
        SwapStepVM.State[8] memory ls;
        for (uint256 i = 0; i <= badStep; i++) {
            ls[i] = hs[i];
        }
        SwapStepVM.State memory ns = SwapStepVM.step(ls[badStep]);
        ns.w[badDst] = badValue;
        ls[badStep + 1] = ns;
        for (uint256 i = badStep + 1; i < 7; i++) {
            ls[i + 1] = SwapStepVM.step(ls[i]);
        }
        for (uint256 i = 0; i < 8; i++) {
            leaves[i] = SwapStepVM.hashState(ls[i]);
        }
    }

    // ── Merkle helpers (8-leaf clean binary tree) ────────────────────────────

    function _root(bytes32[8] memory leaves) internal pure returns (bytes32) {
        bytes32[] memory dyn = new bytes32[](8);
        for (uint256 i = 0; i < 8; i++) {
            dyn[i] = leaves[i];
        }
        return Merkle.computeRoot(dyn);
    }

    function _proof(bytes32[8] memory leaves, uint256 index) internal pure returns (bytes32[] memory p) {
        bytes32[4] memory l1;
        for (uint256 i = 0; i < 4; i++) {
            l1[i] = keccak256(abi.encodePacked(leaves[2 * i], leaves[2 * i + 1]));
        }
        bytes32[2] memory l2;
        for (uint256 i = 0; i < 2; i++) {
            l2[i] = keccak256(abi.encodePacked(l1[2 * i], l1[2 * i + 1]));
        }
        p = new bytes32[](3);
        p[0] = leaves[index ^ 1];
        p[1] = l1[(index / 2) ^ 1];
        p[2] = l2[(index / 4) ^ 1];
    }

    // ── game driver ──────────────────────────────────────────────────────────

    function _initiate(uint64 batchId, bytes32[8] memory seqLeaves, bytes32[8] memory chalLeaves) internal {
        game.initiate(
            FraudProofGame.InitParams({
                batchId: batchId,
                challenger: challenger,
                sequencer: sequencer,
                seqRoot: _root(seqLeaves),
                chalRoot: _root(chalLeaves),
                traceLen: 8,
                m0Hash: seqLeaves[0],
                m0SeqProof: _proof(seqLeaves, 0),
                m0ChalProof: _proof(chalLeaves, 0),
                seqLastHash: seqLeaves[7],
                chalLastHash: chalLeaves[7],
                lastSeqProof: _proof(seqLeaves, 7),
                lastChalProof: _proof(chalLeaves, 7)
            })
        );
    }

    function _bisectToOneStep(uint64 batchId, bytes32[8] memory seqLeaves, bytes32[8] memory chalLeaves)
        internal
    {
        for (uint256 guard = 0; guard < 16; guard++) {
            FraudProofGame.Game memory g = game.getGame(batchId);
            if (g.hi <= g.lo + 1) break;
            uint256 mid = (uint256(g.lo) + uint256(g.hi)) / 2;
            vm.prank(challenger);
            game.bisect(batchId, seqLeaves[mid], _proof(seqLeaves, mid), chalLeaves[mid], _proof(chalLeaves, mid));
        }
    }

    // ── full games ───────────────────────────────────────────────────────────

    // Sequencer posts a doubled output (obvious lie); the contract must catch it.
    function test_fullGame_sequencerLiesObvious() public {
        (, bytes32[8] memory chalLeaves) = _honestTrace(10, 0);
        // honest amountOut at step3 is 997; the lie claims 1994.
        bytes32[8] memory seqLeaves = _lyingLeaves(10, 0, 3, 7, 1994);

        _initiate(0, seqLeaves, chalLeaves);
        _bisectToOneStep(0, seqLeaves, chalLeaves);

        FraudProofGame.Game memory g = game.getGame(0);
        assertEq(g.lo, 3, "divergence isolated to step 3 (the DIV)");
        assertEq(g.hi, 4);

        game.resolveOneStep(0, honestStates[g.lo]);

        g = game.getGame(0);
        assertTrue(g.status == FraudProofGame.Status.RESOLVED_INVALID, "sequencer lied");
        assertEq(g.winner, challenger);
        assertEq(g.divergenceStep, 3);
        assertTrue(portal.finalized(0));
        assertFalse(portal.validResult(0), "batch finalized invalid");
        assertLe(g.rounds, 3, "bisection is logarithmic in trace length");
    }

    // Sequencer skips the fee (subtle lie): the SUB at step 1 is wrong.
    function test_fullGame_sequencerLiesSubtle() public {
        (, bytes32[8] memory chalLeaves) = _honestTrace(10, 0);
        // honest netBps at step1 is 9970; the lie claims 10000 (no fee).
        bytes32[8] memory seqLeaves = _lyingLeaves(10, 0, 1, 6, 10000);

        _initiate(0, seqLeaves, chalLeaves);
        _bisectToOneStep(0, seqLeaves, chalLeaves);

        FraudProofGame.Game memory g = game.getGame(0);
        assertEq(g.lo, 1, "divergence isolated to step 1 (the SUB)");

        game.resolveOneStep(0, honestStates[g.lo]);

        g = game.getGame(0);
        assertTrue(g.status == FraudProofGame.Status.RESOLVED_INVALID);
        assertEq(g.winner, challenger);
        assertEq(g.divergenceStep, 1);
        assertFalse(portal.validResult(0));
    }

    // The CHALLENGER is wrong: the sequencer was honest, so the challenge fails
    // and the batch is upheld. The verdict is derived on-chain either way.
    function test_fullGame_challengerWrong_sequencerUpheld() public {
        (, bytes32[8] memory seqLeaves) = _honestTrace(10, 0); // sequencer honest
        bytes32[8] memory chalLeaves = _lyingLeaves(10, 0, 3, 7, 1994); // challenger lies

        _initiate(0, seqLeaves, chalLeaves);
        _bisectToOneStep(0, seqLeaves, chalLeaves);

        FraudProofGame.Game memory g = game.getGame(0);
        game.resolveOneStep(0, honestStates[g.lo]);

        g = game.getGame(0);
        assertTrue(g.status == FraudProofGame.Status.RESOLVED_VALID, "sequencer honest");
        assertEq(g.winner, sequencer);
        assertTrue(portal.finalized(0));
        assertTrue(portal.validResult(0), "batch upheld");
    }

    // ── the fidelity guarantees ──────────────────────────────────────────────

    // The old attack (win by passing batchIsValid=false) is structurally gone:
    // resolve has no verdict argument, and a forged pre-state is rejected.
    function test_cannotForgeVerdict_wrongLoState() public {
        (, bytes32[8] memory chalLeaves) = _honestTrace(10, 0);
        bytes32[8] memory seqLeaves = _lyingLeaves(10, 0, 3, 7, 1994);
        _initiate(0, seqLeaves, chalLeaves);
        _bisectToOneStep(0, seqLeaves, chalLeaves);

        // Supply a pre-state that does not hash to the agreed loHash.
        SwapStepVM.State memory forged = honestStates[0];
        forged.w[7] = 12345;
        vm.expectRevert("loState != committed loHash");
        game.resolveOneStep(0, forged);
    }

    function test_cannotResolveBeforeNarrowed() public {
        (, bytes32[8] memory chalLeaves) = _honestTrace(10, 0);
        bytes32[8] memory seqLeaves = _lyingLeaves(10, 0, 3, 7, 1994);
        _initiate(0, seqLeaves, chalLeaves);
        vm.expectRevert("not narrowed to one step");
        game.resolveOneStep(0, honestStates[0]);
    }

    function test_initiate_rejectsAgreeingRoots() public {
        (, bytes32[8] memory honest) = _honestTrace(10, 0);
        vm.expectRevert("roots agree: nothing to dispute");
        game.initiate(
            FraudProofGame.InitParams({
                batchId: 0,
                challenger: challenger,
                sequencer: sequencer,
                seqRoot: _root(honest),
                chalRoot: _root(honest),
                traceLen: 8,
                m0Hash: honest[0],
                m0SeqProof: _proof(honest, 0),
                m0ChalProof: _proof(honest, 0),
                seqLastHash: honest[7],
                chalLastHash: honest[7],
                lastSeqProof: _proof(honest, 7),
                lastChalProof: _proof(honest, 7)
            })
        );
    }

    // A fabricated mid opening (not in the committed tree) is rejected, so a
    // party cannot steer the bisection.
    function test_bisect_rejectsUncommittedOpening() public {
        (, bytes32[8] memory chalLeaves) = _honestTrace(10, 0);
        bytes32[8] memory seqLeaves = _lyingLeaves(10, 0, 3, 7, 1994);
        _initiate(0, seqLeaves, chalLeaves);

        vm.prank(challenger);
        vm.expectRevert("bad seq mid proof");
        game.bisect(0, keccak256("fake"), _proof(seqLeaves, 3), chalLeaves[3], _proof(chalLeaves, 3));
    }
}
