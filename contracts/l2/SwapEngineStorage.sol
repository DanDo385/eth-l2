// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Storage shared by SwapRouter and every swap engine. The engines run
///         in the router's storage context via delegatecall, so this layout is
///         the single source of truth for slot numbers.
///
/// State root model (WO-1): the root is a commitment over the full account
/// balance set, not an opaque hash of the swap history. A leaf commits to one
/// account's (balanceA, balanceB, nonce); the root folds every registered
/// account's leaf in registration order. Two batches that end in the same
/// balances produce the same root regardless of the order swaps were applied,
/// which is the correct semantics for a state commitment.
///
/// Slot layout (must stay in sync with trace/capture.go HonestReplay override
/// and app/data/traceNarrative.ts slotMeaning):
///   slot 0: _balanceA   mapping(address => uint256)
///   slot 1: _balanceB   mapping(address => uint256)
///   slot 2: _nonces     mapping(address => uint256)
///   slot 3: _nextSwapId(uint64) + _swapCount(uint64)  (packed)
///   slot 4: _stateRoot  bytes32
///   slot 5: _swapHashes mapping(uint64 => bytes32)
///   slot 6: _accounts   address[]
///   slot 7: _registered mapping(address => bool)
/// SwapRouter then adds sequencer(slot 8) and implementation(slot 9).
abstract contract SwapEngineStorage {
    mapping(address => uint256) internal _balanceA;
    mapping(address => uint256) internal _balanceB;
    mapping(address => uint256) internal _nonces;
    uint64 internal _nextSwapId;
    uint64 internal _swapCount;
    bytes32 internal _stateRoot;
    mapping(uint64 => bytes32) internal _swapHashes;
    address[] internal _accounts;
    mapping(address => bool) internal _registered;

    /// @notice Register an account into the committed set exactly once. Order is
    ///         fixed by first registration, which the Go re-implementation mirrors.
    function _register(address account) internal {
        if (!_registered[account]) {
            _registered[account] = true;
            _accounts.push(account);
        }
    }

    /// @notice Leaf commitment for one account. abi.encodePacked widths:
    ///         address(20) | balanceA(32) | balanceB(32) | nonce(32).
    function _accountLeaf(address account) internal view returns (bytes32) {
        return keccak256(
            abi.encodePacked(account, _balanceA[account], _balanceB[account], _nonces[account])
        );
    }

    /// @notice Fold every registered account's leaf into the state root:
    ///         root_0 = 0; root_i = keccak256(root_{i-1} | leaf_i).
    ///         Reads every balance (real SLOADs) and writes _stateRoot (real
    ///         SSTORE), so debug_traceCall still captures the state accesses.
    function _recomputeRoot() internal {
        bytes32 acc = bytes32(0);
        uint256 n = _accounts.length;
        for (uint256 i = 0; i < n; i++) {
            acc = keccak256(abi.encodePacked(acc, _accountLeaf(_accounts[i])));
        }
        _stateRoot = acc;
    }

    /// @notice Number of registered accounts, exposed for views and tests.
    function accountCount() external view returns (uint256) {
        return _accounts.length;
    }

    /// @notice Registered account at an index, in commitment order.
    function accountAt(uint256 i) external view returns (address) {
        return _accounts[i];
    }
}
