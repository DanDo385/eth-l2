// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IVerifier {
    function verifyProof(bytes calldata proof, bytes32 pubInputHash) external returns (bool valid);
}
