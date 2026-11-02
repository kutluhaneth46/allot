// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AllotVault} from "../AllotVault.sol";
import {AllotVaultTestBase} from "./AllotVault.Base.t.sol";
import {HookUSDC, ReentrantActor} from "./AllotVaultMocks.sol";

/// @notice nonReentrant coverage using a USDC mock with transfer hooks etched at the USDC address.
contract AllotVaultReentrancyTest is AllotVaultTestBase {
    ReentrantActor internal actor;
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        // Swap in the hook-enabled token code; balances / allowances in storage are preserved.
        HookUSDC hook = new HookUSDC();
        vm.etch(USDC_ADDR, address(hook).code);
        actor = new ReentrantActor();
        id = _create();
    }

    function _guardErr() internal pure returns (bytes memory) {
        return bytes.concat(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
    }

    function _lastSelector() internal view returns (bytes4 sel) {
        bytes memory ret = actor.lastRet();
        require(ret.length >= 4, "no revert data");
        assembly {
            sel := mload(add(ret, 0x20))
        }
    }

    function _fundActorAsFunder(uint256 amount) internal {
        usdc.mint(address(actor), amount);
        actor.exec(USDC_ADDR, abi.encodeCall(usdc.approve, (address(vault), type(uint256).max)));
    }

    function _actorCreate() internal returns (uint256 newId) {
        bytes memory ret = actor.exec(
            address(vault),
            abi.encodeCall(vault.createAllowance, (recipient, "p", "c", AMOUNT, LIMIT, expiry, _merchants2()))
        );
        newId = abi.decode(ret, (uint256));
    }

    function test_Hook_NormalFlowsStillWork() public {
        _spend(id, merchant, 10e6, _ref(1), 1);
        assertEq(usdc.balanceOf(merchant), 10e6);
        assertEq(usdc.balanceOf(funder), 1_000_000e6 - AMOUNT);
    }

    function test_Reentrancy_MerchantCannotReenterSpend() public {
        vm.prank(funder);
        vault.addMerchant(id, address(actor));

        // A valid, fully signed second payment that WOULD succeed if reentrancy were possible.
        P memory p2 = _p(id, address(actor), 10e6, _ref(2), 2);
        bytes memory sig2 = _sign(p2);
        actor.arm(
            address(vault), abi.encodeCall(vault.spend, (p2.id, p2.merchant, p2.amount, p2.ref, p2.nonce, p2.deadline, sig2)), false
        );

        _spend(id, address(actor), 50e6, _ref(1), 1);

        assertTrue(actor.attempted());
        assertFalse(actor.lastOk());
        assertEq(_lastSelector(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        // only the outer payment happened
        assertEq(usdc.balanceOf(address(actor)), 50e6);
        assertEq(_alw(id).remaining, AMOUNT - 50e6);
        assertFalse(vault.isNonceUsed(id, 2));
    }

    function test_Reentrancy_BubbledRevertAbortsOuterSpend() public {
        vm.prank(funder);
        vault.addMerchant(id, address(actor));
        P memory p2 = _p(id, address(actor), 10e6, _ref(2), 2);
        bytes memory sig2 = _sign(p2);
        actor.arm(
            address(vault), abi.encodeCall(vault.spend, (p2.id, p2.merchant, p2.amount, p2.ref, p2.nonce, p2.deadline, sig2)), true
        );

        P memory p1 = _p(id, address(actor), 50e6, _ref(1), 1);
        bytes memory sig1 = _sign(p1);
        _expectSpend(_guardErr(), p1, sig1);

        assertEq(usdc.balanceOf(address(actor)), 0);
        assertEq(_alw(id).remaining, AMOUNT);
    }

    function test_Reentrancy_MerchantCannotReenterAddMerchant() public {
        vm.prank(funder);
        vault.addMerchant(id, address(actor));
        actor.arm(address(vault), abi.encodeCall(vault.addMerchant, (id, other)), false);
        _spend(id, address(actor), 10e6, _ref(1), 1);
        assertFalse(actor.lastOk());
        assertEq(_lastSelector(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertFalse(vault.isMerchantApproved(id, other));
    }

    function test_Reentrancy_FunderCannotReenterCloseOnRefund() public {
        _fundActorAsFunder(AMOUNT);
        uint256 aid = _actorCreate();
        actor.arm(address(vault), abi.encodeCall(vault.close, (aid)), false);

        actor.exec(address(vault), abi.encodeCall(vault.close, (aid)));

        assertTrue(actor.attempted());
        assertFalse(actor.lastOk());
        assertEq(_lastSelector(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(usdc.balanceOf(address(actor)), AMOUNT);
        assertEq(uint8(_alw(aid).status), uint8(AllotVault.Status.Closed));
        assertEq(_alw(aid).remaining, 0);
    }

    function test_Reentrancy_FunderCannotReenterReclaimOnRefund() public {
        _fundActorAsFunder(AMOUNT);
        uint256 aid = _actorCreate();
        vm.warp(expiry);
        actor.arm(address(vault), abi.encodeCall(vault.reclaim, (aid)), false);

        actor.exec(address(vault), abi.encodeCall(vault.reclaim, (aid)));

        assertFalse(actor.lastOk());
        assertEq(_lastSelector(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(usdc.balanceOf(address(actor)), AMOUNT);
        assertEq(usdc.balanceOf(address(vault)), AMOUNT); // only the setUp allowance remains
    }

    function test_Reentrancy_FunderCannotReenterCreateDuringFunding() public {
        _fundActorAsFunder(2 * AMOUNT);
        actor.arm(
            address(vault),
            abi.encodeCall(vault.createAllowance, (recipient, "p", "c", AMOUNT, LIMIT, expiry, _merchants2())),
            false
        );

        uint256 aid = _actorCreate(); // hook fires inside USDC.transferFrom (token pulled from the actor)

        assertTrue(actor.attempted());
        assertFalse(actor.lastOk());
        assertEq(_lastSelector(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(aid, 2);
        assertEq(vault.nextAllowanceId(), 3);
        assertEq(usdc.balanceOf(address(vault)), 2 * AMOUNT);
        assertEq(usdc.balanceOf(address(actor)), AMOUNT);
    }
}
