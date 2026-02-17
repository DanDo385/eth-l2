// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {TradeEngine} from "../contracts/l2/TradeEngine.sol";
import {DataTypes} from "../contracts/shared/DataTypes.sol";
import {Hashing} from "../contracts/shared/Hashing.sol";

contract TradeEngineTest is Test {
    TradeEngine engine;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        engine = new TradeEngine();
    }

    function test_executeTrade_basic() public {
        uint64 id = engine.executeTrade(alice, 1 ether, 3000e18, 0);
        assertEq(id, 0);
        assertEq(engine.tradeCount(), 1);
        assertEq(engine.nextTradeId(), 1);
    }

    function test_executeTrade_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit TradeEngine.TradeExecuted(0, alice, 1 ether, 3000e18, 0);
        engine.executeTrade(alice, 1 ether, 3000e18, 0);
    }

    function test_executeTrade_updatesStateRoot() public {
        bytes32 rootBefore = engine.stateRoot();
        engine.executeTrade(alice, 1 ether, 3000e18, 0);
        bytes32 rootAfter = engine.stateRoot();
        assertTrue(rootBefore != rootAfter);
    }

    function test_executeTrade_nonceEnforcement() public {
        engine.executeTrade(alice, 1 ether, 3000e18, 0);
        vm.expectRevert("invalid nonce");
        engine.executeTrade(alice, 2 ether, 6000e18, 0); // wrong nonce
    }

    function test_executeTrade_incrementsNonce() public {
        engine.executeTrade(alice, 1 ether, 3000e18, 0);
        engine.executeTrade(alice, 2 ether, 6000e18, 1);
        assertEq(engine.nonces(alice), 2);
    }

    function test_executeTrade_multipleTraders() public {
        engine.executeTrade(alice, 1 ether, 3000e18, 0);
        engine.executeTrade(bob, 2 ether, 6000e18, 0);
        assertEq(engine.tradeCount(), 2);
        assertEq(engine.nonces(alice), 1);
        assertEq(engine.nonces(bob), 1);
    }

    function test_stateRoot_deterministic() public {
        engine.executeTrade(alice, 1 ether, 3000e18, 0);
        bytes32 root1 = engine.stateRoot();

        TradeEngine engine2 = new TradeEngine();
        engine2.executeTrade(alice, 1 ether, 3000e18, 0);
        bytes32 root2 = engine2.stateRoot();

        assertEq(root1, root2);
    }

    function test_getTradeHashes_range() public {
        engine.executeTrade(alice, 1 ether, 3000e18, 0);
        engine.executeTrade(alice, 2 ether, 6000e18, 1);
        engine.executeTrade(bob, 3 ether, 9000e18, 0);

        bytes32[] memory hashes = engine.getTradeHashes(0, 3);
        assertEq(hashes.length, 3);

        DataTypes.Trade memory t0 =
            DataTypes.Trade({tradeId: 0, trader: alice, amountIn: 1 ether, amountOut: 3000e18, nonce: 0});
        assertEq(hashes[0], Hashing.hashTrade(t0));
    }

    function test_getTradeHashes_revertsInvalidRange() public {
        engine.executeTrade(alice, 1 ether, 3000e18, 0);
        vm.expectRevert("invalid range");
        engine.getTradeHashes(0, 5);
    }

    function test_getTradeHashes_partialRange() public {
        engine.executeTrade(alice, 1 ether, 3000e18, 0);
        engine.executeTrade(alice, 2 ether, 6000e18, 1);
        engine.executeTrade(bob, 3 ether, 9000e18, 0);

        bytes32[] memory hashes = engine.getTradeHashes(1, 3);
        assertEq(hashes.length, 2);
    }
}
