// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {HonestSwapEngine} from "../contracts/l2/HonestSwapEngine.sol";
import {LyingSwapEngineObvious} from "../contracts/l2/LyingSwapEngineObvious.sol";
import {LyingSwapEngineSubtle} from "../contracts/l2/LyingSwapEngineSubtle.sol";
import {SwapRouter} from "../contracts/l2/SwapRouter.sol";

contract DeploySwapL2 is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        address sequencer = vm.envAddress("SEQUENCER_ADDR");
        string memory outPath = vm.envOr("DEPLOY_OUT_PATH", string("./out/swap-l2-deploy.json"));

        vm.startBroadcast(deployerKey);
        HonestSwapEngine honest = new HonestSwapEngine();
        LyingSwapEngineObvious lyingObvious = new LyingSwapEngineObvious();
        LyingSwapEngineSubtle lyingSubtle = new LyingSwapEngineSubtle();
        SwapRouter router = new SwapRouter(sequencer, address(honest));
        vm.stopBroadcast();

        string memory json = "deploy";
        vm.serializeAddress(json, "honestSwapEngine", address(honest));
        vm.serializeAddress(json, "lyingSwapEngineObvious", address(lyingObvious));
        vm.serializeAddress(json, "lyingSwapEngineSubtle", address(lyingSubtle));
        string memory output = vm.serializeAddress(json, "swapRouter", address(router));
        vm.writeJson(output, outPath);
    }
}
