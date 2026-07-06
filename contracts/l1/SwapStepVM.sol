// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title SwapStepVM: a scoped step machine for the swap computation.
/// @notice This is the "one-step re-executor" an interactive fraud proof needs.
///         It is NOT a general EVM interpreter: it models exactly the arithmetic
///         that computes a swap's amountOut and its balance update, over a small
///         fixed register file. Both honest and dishonest parties claim to have
///         run THIS program; the fraud proof bisects their claimed execution
///         traces to the first diverging step, and this VM re-executes that one
///         step on-chain to decide who is right. Scoping the instruction set to
///         the ops these engines diverge on (MUL, SUB, DIV, ADD) is what makes
///         on-chain single-step re-execution tractable.
///
/// Register file (w):
///   w[0] amountIn   w[1] RATE       w[2] BPS_DENOMINATOR  w[3] FEE_BPS
///   w[4] balanceB   w[5] gross      w[6] netBps           w[7] num / amountOut
///
/// Program (7 instructions, pc 0..6; states M0..M7 form an 8-leaf trace):
///   pc0: MUL w5 = w0 * w1     gross   = amountIn * RATE
///   pc1: SUB w6 = w2 - w3     netBps  = BPS_DENOMINATOR - FEE_BPS   (9970)
///   pc2: MUL w7 = w5 * w6     num     = gross * netBps
///   pc3: DIV w7 = w7 / w2     amountOut = num / BPS_DENOMINATOR
///   pc4: ADD w4 = w4 + w7     balanceB_post = balanceB_pre + amountOut
///   pc5: HALT
///   pc6: HALT
library SwapStepVM {
    uint8 internal constant OP_HALT = 0;
    uint8 internal constant OP_ADD = 1;
    uint8 internal constant OP_SUB = 2;
    uint8 internal constant OP_MUL = 3;
    uint8 internal constant OP_DIV = 4;

    uint256 internal constant WORDS = 8;
    uint256 internal constant STEPS = 7; // pc 0..6
    uint256 internal constant TRACE_LEN = 8; // states M0..M7

    struct State {
        uint256 pc;
        uint256[8] w;
    }

    /// @notice The fixed program. Returns the instruction at `pc`.
    function instr(uint256 pc)
        internal
        pure
        returns (uint8 op, uint8 dst, uint8 src1, uint8 src2)
    {
        if (pc == 0) return (OP_MUL, 5, 0, 1);
        if (pc == 1) return (OP_SUB, 6, 2, 3);
        if (pc == 2) return (OP_MUL, 7, 5, 6);
        if (pc == 3) return (OP_DIV, 7, 7, 2);
        if (pc == 4) return (OP_ADD, 4, 4, 7);
        return (OP_HALT, 0, 0, 0); // pc >= 5
    }

    /// @notice Canonical one-step transition. Given a pre-state, apply the single
    ///         instruction at its pc and return the post-state. This is the
    ///         authoritative rule the fraud proof enforces.
    function step(State memory s) internal pure returns (State memory ns) {
        // copy
        ns.pc = s.pc;
        for (uint256 i = 0; i < WORDS; i++) {
            ns.w[i] = s.w[i];
        }

        (uint8 op, uint8 dst, uint8 src1, uint8 src2) = instr(s.pc);
        if (op == OP_HALT) {
            ns.pc = s.pc + 1;
            return ns;
        }

        uint256 a = s.w[src1];
        uint256 b = s.w[src2];
        uint256 res;
        if (op == OP_ADD) {
            res = a + b;
        } else if (op == OP_SUB) {
            res = a - b;
        } else if (op == OP_MUL) {
            res = a * b;
        } else {
            // OP_DIV
            res = b == 0 ? 0 : a / b;
        }
        ns.w[dst] = res;
        ns.pc = s.pc + 1;
    }

    /// @notice Commitment of one machine state (a trace leaf).
    function hashState(State memory s) internal pure returns (bytes32) {
        return keccak256(abi.encode(s.pc, s.w));
    }

    /// @notice Build the initial machine state for a swap. amountOut/gross/netBps/num
    ///         start at zero and are filled in as the program runs.
    function initialState(uint256 amountIn, uint256 rate, uint256 bpsDenom, uint256 feeBps, uint256 balanceBPre)
        internal
        pure
        returns (State memory s)
    {
        s.pc = 0;
        s.w[0] = amountIn;
        s.w[1] = rate;
        s.w[2] = bpsDenom;
        s.w[3] = feeBps;
        s.w[4] = balanceBPre;
    }
}
