// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

library Merkle {
    function computeRoot(bytes32[] memory leaves) internal pure returns (bytes32) {
        require(leaves.length > 0, "empty leaves");
        uint256 n = leaves.length;
        while (n > 1) {
            uint256 half = (n + 1) / 2;
            for (uint256 i = 0; i < half; i++) {
                uint256 j = i * 2;
                bytes32 left = leaves[j];
                bytes32 right = (j + 1 < n) ? leaves[j + 1] : left;
                leaves[i] = keccak256(abi.encodePacked(left, right));
            }
            n = half;
        }
        return leaves[0];
    }

    function verify(bytes32 root, bytes32 leaf, bytes32[] memory proof, uint256 index)
        internal
        pure
        returns (bool)
    {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            if (index % 2 == 0) {
                computed = keccak256(abi.encodePacked(computed, proof[i]));
            } else {
                computed = keccak256(abi.encodePacked(proof[i], computed));
            }
            index /= 2;
        }
        return computed == root;
    }
}
