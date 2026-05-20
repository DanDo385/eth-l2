// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SwapEngineStorage} from "./SwapEngineStorage.sol";

contract SwapRouter is SwapEngineStorage {
    address public sequencer;
    address public implementation;

    event ImplementationChanged(address indexed from, address indexed to);

    constructor(address _sequencer, address _implementation) {
        sequencer = _sequencer;
        implementation = _implementation;
    }

    function setImplementation(address impl) external {
        require(msg.sender == sequencer, "only sequencer");
        address prev = implementation;
        implementation = impl;
        emit ImplementationChanged(prev, impl);
    }

    // ---- views (read shared storage directly) ----

    function balanceA(address trader) external view returns (uint256) {
        return _balanceA[trader];
    }

    function balanceB(address trader) external view returns (uint256) {
        return _balanceB[trader];
    }

    function nonces(address trader) external view returns (uint256) {
        return _nonces[trader];
    }

    function stateRoot() external view returns (bytes32) {
        return _stateRoot;
    }

    function nextSwapId() external view returns (uint64) {
        return _nextSwapId;
    }

    function swapHashes(uint64 swapId) external view returns (bytes32) {
        return _swapHashes[swapId];
    }

    function getSwapHashes(uint64 from, uint64 to) external view returns (bytes32[] memory) {
        require(to <= _nextSwapId && from < to, "invalid range");
        bytes32[] memory hashes = new bytes32[](to - from);
        for (uint64 i = from; i < to; i++) {
            hashes[i - from] = _swapHashes[i];
        }
        return hashes;
    }

    // ---- delegated entry ----

    fallback() external payable {
        address impl = implementation;
        require(impl != address(0), "no implementation");
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }

    receive() external payable {}
}
