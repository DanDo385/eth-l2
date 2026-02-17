// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IVerifier} from "../shared/interfaces/IVerifier.sol";

contract VerifierMock is IVerifier {
    event ProofVerified(bytes32 indexed pubInputHash, bool valid, bytes32 proofHash);

    function verifyProof(bytes calldata proof, bytes32 pubInputHash) external override returns (bool valid) {
        bytes32 proofHash = keccak256(proof);
        valid = uint8(keccak256(abi.encodePacked(proof, pubInputHash))[0]) < 0x80;
        emit ProofVerified(pubInputHash, valid, proofHash);
    }

    function verifyProofView(bytes calldata proof, bytes32 pubInputHash) external pure returns (bool) {
        return uint8(keccak256(abi.encodePacked(proof, pubInputHash))[0]) < 0x80;
    }
}
