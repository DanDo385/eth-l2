// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Merkle} from "../shared/Merkle.sol";
import {SwapStepVM} from "./SwapStepVM.sol";

interface IFinalizable {
    function finalizeBatch(uint64 batchId, bool valid) external;
}

/// @title FraudProofGame: a real interactive fraud proof over the swap step-VM.
/// @notice Both parties commit a Merkle root over their claimed execution trace
///         (one leaf per machine state). They agree on the pre-state (leaf 0)
///         and disagree on the post-state (last leaf). Bisection narrows the
///         disagreement to a single step, with every opened leaf verified
///         against the committed root, so neither party can move the goalposts.
///         At one step, the contract RE-EXECUTES that step on-chain via
///         SwapStepVM and derives the winner itself. There is no trusted
///         "batchIsValid" argument: the verdict follows from the committed
///         traces and the on-chain re-execution.
contract FraudProofGame {
    address public portal;

    enum Status {
        NONE,
        BISECTING,
        RESOLVED_VALID, // sequencer honest, challenge failed
        RESOLVED_INVALID // sequencer lied, batch invalid
    }

    struct Game {
        uint64 batchId;
        address challenger;
        address sequencer;
        bytes32 seqRoot;
        bytes32 chalRoot;
        uint64 traceLen;
        uint64 lo; // last index where the parties agree
        uint64 hi; // first index where they disagree
        bytes32 loHash; // agreed state hash at lo
        bytes32 seqHiHash; // sequencer's state hash at hi
        bytes32 chalHiHash; // challenger's state hash at hi
        uint64 rounds;
        Status status;
        address winner;
        uint64 divergenceStep;
    }

    mapping(uint64 => Game) internal games;

    /// @notice Params for initiate, grouped to stay under the stack limit.
    struct InitParams {
        uint64 batchId;
        address challenger;
        address sequencer;
        bytes32 seqRoot;
        bytes32 chalRoot;
        uint64 traceLen;
        bytes32 m0Hash;
        bytes32[] m0SeqProof;
        bytes32[] m0ChalProof;
        bytes32 seqLastHash;
        bytes32 chalLastHash;
        bytes32[] lastSeqProof;
        bytes32[] lastChalProof;
    }

    event GameInitiated(uint64 indexed batchId, bytes32 seqRoot, bytes32 chalRoot, uint64 traceLen);
    event Bisected(uint64 indexed batchId, uint64 lo, uint64 hi, bool agreedAtMid, uint64 mid);
    event Resolved(uint64 indexed batchId, Status result, address winner, uint64 divergenceStep);

    constructor(address _portal) {
        portal = _portal;
    }

    function setPortal(address _portal) external {
        require(portal == address(0), "already set");
        portal = _portal;
    }

    /// @notice Open a game. Verifies the agreed pre-state and the disputed
    ///         post-state against both committed roots, so the disagreement is real.
    function initiate(InitParams calldata p) external {
        require(games[p.batchId].status == Status.NONE, "game exists");
        require(p.seqRoot != p.chalRoot, "roots agree: nothing to dispute");
        require(p.traceLen >= 2, "trace too short");
        uint64 last = p.traceLen - 1;

        // Agreed pre-state (same leaf under both roots at index 0).
        require(Merkle.verify(p.seqRoot, p.m0Hash, p.m0SeqProof, 0), "bad m0 seq proof");
        require(Merkle.verify(p.chalRoot, p.m0Hash, p.m0ChalProof, 0), "bad m0 chal proof");

        // Disputed post-state (different leaves at the last index).
        require(Merkle.verify(p.seqRoot, p.seqLastHash, p.lastSeqProof, last), "bad last seq proof");
        require(Merkle.verify(p.chalRoot, p.chalLastHash, p.lastChalProof, last), "bad last chal proof");
        require(p.seqLastHash != p.chalLastHash, "endpoints agree");

        Game storage g = games[p.batchId];
        g.batchId = p.batchId;
        g.challenger = p.challenger;
        g.sequencer = p.sequencer;
        g.seqRoot = p.seqRoot;
        g.chalRoot = p.chalRoot;
        g.traceLen = p.traceLen;
        g.lo = 0;
        g.hi = last;
        g.loHash = p.m0Hash;
        g.seqHiHash = p.seqLastHash;
        g.chalHiHash = p.chalLastHash;
        g.status = Status.BISECTING;

        emit GameInitiated(p.batchId, p.seqRoot, p.chalRoot, p.traceLen);
    }

    /// @notice One bisection round. The caller opens both parties' claimed state
    ///         at the midpoint; the contract verifies both against the committed
    ///         roots and narrows toward the first divergence.
    function bisect(
        uint64 batchId,
        bytes32 seqMidHash,
        bytes32[] calldata seqProof,
        bytes32 chalMidHash,
        bytes32[] calldata chalProof
    ) external {
        Game storage g = games[batchId];
        require(g.status == Status.BISECTING, "not bisecting");
        require(msg.sender == g.challenger || msg.sender == g.sequencer, "not a party");
        require(g.hi > g.lo + 1, "already at one step");

        uint64 mid = (g.lo + g.hi) / 2;
        require(Merkle.verify(g.seqRoot, seqMidHash, seqProof, mid), "bad seq mid proof");
        require(Merkle.verify(g.chalRoot, chalMidHash, chalProof, mid), "bad chal mid proof");

        bool agreed = seqMidHash == chalMidHash;
        if (agreed) {
            // Divergence is after mid.
            g.lo = mid;
            g.loHash = seqMidHash;
        } else {
            // Divergence is at or before mid.
            g.hi = mid;
            g.seqHiHash = seqMidHash;
            g.chalHiHash = chalMidHash;
        }
        g.rounds += 1;
        emit Bisected(batchId, g.lo, g.hi, agreed, mid);
    }

    /// @notice Once narrowed to one step, re-execute it on-chain and decide.
    ///         `loState` is the agreed pre-state; its hash must equal loHash.
    function resolveOneStep(uint64 batchId, SwapStepVM.State calldata loState) external {
        Game storage g = games[batchId];
        require(g.status == Status.BISECTING, "not bisecting");
        require(g.hi == g.lo + 1, "not narrowed to one step");
        require(SwapStepVM.hashState(loState) == g.loHash, "loState != committed loHash");

        // Authoritative one-step re-execution.
        bytes32 correctHi = SwapStepVM.hashState(SwapStepVM.step(loState));

        bool seqCorrect = correctHi == g.seqHiHash;
        bool chalCorrect = correctHi == g.chalHiHash;
        require(seqCorrect != chalCorrect, "one-step did not separate the parties");

        g.divergenceStep = g.lo;
        if (seqCorrect) {
            g.status = Status.RESOLVED_VALID;
            g.winner = g.sequencer;
        } else {
            g.status = Status.RESOLVED_INVALID;
            g.winner = g.challenger;
        }

        emit Resolved(batchId, g.status, g.winner, g.divergenceStep);

        if (portal != address(0)) {
            IFinalizable(portal).finalizeBatch(batchId, seqCorrect);
        }
    }

    function getGame(uint64 batchId) external view returns (Game memory) {
        return games[batchId];
    }
}
