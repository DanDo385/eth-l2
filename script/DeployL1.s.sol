// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {OptimisticPortalMock} from "../contracts/l1/OptimisticPortalMock.sol";
import {DisputeGameMock} from "../contracts/l1/DisputeGameMock.sol";
import {ZkRollupMock} from "../contracts/l1/ZkRollupMock.sol";
import {VerifierMock} from "../contracts/l1/VerifierMock.sol";

contract DeployL1 is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        address sequencer = vm.envAddress("SEQUENCER_ADDR");

        vm.startBroadcast(deployerKey);

        VerifierMock verifier = new VerifierMock();
        DisputeGameMock disputeGame = new DisputeGameMock(address(0));
        OptimisticPortalMock portal = new OptimisticPortalMock(sequencer, address(disputeGame));
        ZkRollupMock zkRollup = new ZkRollupMock(sequencer, address(verifier));
        disputeGame.setPortal(address(portal));

        vm.stopBroadcast();

        string memory json = "deploy";
        vm.serializeAddress(json, "verifier", address(verifier));
        vm.serializeAddress(json, "disputeGame", address(disputeGame));
        vm.serializeAddress(json, "portal", address(portal));
        string memory output = vm.serializeAddress(json, "zkRollup", address(zkRollup));
        vm.writeJson(output, "./out/l1-deploy.json");
    }
}
