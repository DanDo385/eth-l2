// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title ZkValidityVerifier (Tier B stand-in)
/// @notice This verifier RE-EXECUTES the batch to check validity. It stands in
///         for a succinct proof. Production ZK verifies WITHOUT re-executing,
///         and that succinctness (verify cost independent of tx count) is the
///         whole point. Here the "proof" is the witness (pre-state + swaps) and
///         the check is: (1) the witness pre-state hashes to the batch's
///         prevStateRoot, and (2) honestly re-executing the swaps over that
///         pre-state reproduces the claimed postStateRoot. A lying engine or a
///         buggy engine produces a postStateRoot that honest re-execution cannot
///         reproduce, so it is rejected at the gate with no state change. A
///         validity gate cannot tell a bug from a lie, and does not need to.
///
/// The leaf and fold MUST match SwapEngineStorage._accountLeaf / _recomputeRoot
/// and the Go re-implementation in watcher/honest.go, or honest batches would be
/// rejected. This is covered by ZkValidityVerifier.t.sol and the cross-language
/// root pin in SwapEngines.t.sol / honest_test.go.
contract ZkValidityVerifier {
    uint256 internal constant RATE = 100;
    uint256 internal constant FEE_BPS = 30;
    uint256 internal constant BPS_DENOMINATOR = 10000;

    /// @notice One account's committed state, in registration (fold) order.
    struct AccountState {
        address account;
        uint256 balanceA;
        uint256 balanceB;
        uint256 nonce;
    }

    /// @notice One swap in the batch, as the engine received it.
    struct SwapOp {
        address trader;
        uint256 amountIn;
        uint256 nonce;
    }

    /// @param prevStateRoot          the batch header's claimed prior root
    /// @param claimedPostStateRoot   the batch header's claimed post root
    /// @param pre                    witness: accounts + balances before the batch, in fold order
    /// @param swaps                  witness: the swaps in the batch, in order
    /// @return valid          true iff the pre-state is bound AND honest re-execution matches the claim
    /// @return recomputedRoot the honest post-state root this verifier derived
    /// @return preStateBound  whether the witness pre-state hashes to prevStateRoot
    function verifyValidity(
        bytes32 prevStateRoot,
        bytes32 claimedPostStateRoot,
        AccountState[] calldata pre,
        SwapOp[] calldata swaps
    ) external pure returns (bool valid, bytes32 recomputedRoot, bool preStateBound) {
        // Copy calldata witness into a mutable memory working set.
        AccountState[] memory st = new AccountState[](pre.length);
        for (uint256 i = 0; i < pre.length; i++) {
            st[i] = pre[i];
        }

        // (1) Bind the witness pre-state to the committed prevStateRoot. Without
        // this a prover could feed a favorable fake pre-state.
        preStateBound = _fold(st) == prevStateRoot;

        // (2) Apply each swap under the honest VM rules.
        for (uint256 s = 0; s < swaps.length; s++) {
            uint256 idx = _indexOf(st, swaps[s].trader);
            AccountState memory a = st[idx];
            // An out-of-order or overspending swap is itself invalid state.
            if (a.nonce != swaps[s].nonce || a.balanceA < swaps[s].amountIn) {
                return (false, bytes32(0), preStateBound);
            }
            uint256 gross = swaps[s].amountIn * RATE;
            uint256 amountOut = (gross * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;
            a.nonce += 1;
            a.balanceA -= swaps[s].amountIn;
            a.balanceB += amountOut;
            st[idx] = a;
        }

        recomputedRoot = _fold(st);
        valid = preStateBound && (recomputedRoot == claimedPostStateRoot);
    }

    /// @dev Mirrors SwapEngineStorage._recomputeRoot over an in-memory account set.
    function _fold(AccountState[] memory st) internal pure returns (bytes32) {
        bytes32 acc = bytes32(0);
        for (uint256 i = 0; i < st.length; i++) {
            bytes32 leaf =
                keccak256(abi.encodePacked(st[i].account, st[i].balanceA, st[i].balanceB, st[i].nonce));
            acc = keccak256(abi.encodePacked(acc, leaf));
        }
        return acc;
    }

    function _indexOf(AccountState[] memory st, address who) internal pure returns (uint256) {
        for (uint256 i = 0; i < st.length; i++) {
            if (st[i].account == who) {
                return i;
            }
        }
        revert("account not in witness");
    }
}
