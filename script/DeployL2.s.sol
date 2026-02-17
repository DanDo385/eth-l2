// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {TradeEngine} from "../contracts/l2/TradeEngine.sol";

contract DeployL2 is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        string memory outPath = vm.envString("DEPLOY_OUT_PATH");

        vm.startBroadcast(deployerKey);
        TradeEngine engine = new TradeEngine();
        vm.stopBroadcast();

        string memory json = "deploy";
        string memory output = vm.serializeAddress(json, "tradeEngine", address(engine));
        vm.writeJson(output, outPath);
    }
}
