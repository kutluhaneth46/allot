// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AllotVault} from "../AllotVault.sol";
import {AllotVaultTestBase} from "./AllotVault.Base.t.sol";

/// @notice spend(): success paths and state / argument validation failures.
contract AllotVaultSpendTest is AllotVaultTestBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = _create();
    }

    // ------------------------------------------------------------ success

    function test_Spend_Success_PaysMerchantAndAccounts() public {
        _spend(id, merchant, 50e6, _ref(1), 1);

        assertEq(usdc.balanceOf(merchant), 50e6);
        assertEq(usdc.balanceOf(address(vault)), AMOUNT - 50e6);
        AllotVault.Allowance memory a = _alw(id);
        assertEq(a.spent, 50e6);
        assertEq(a.remaining, AMOUNT - 50e6);
        assertEq(a.funded, AMOUNT);
        assertEq(uint8(a.status), uint8(AllotVault.Status.Active));
        assertTrue(vault.isNonceUsed(id, 1));
        assertTrue(vault.isOrderPaid(id, merchant, _ref(1)));
    }

    function test_Spend_EmitsSpentWithOrderRef() public {
        P memory p = _p(id, merchant, 75e6, _ref(42), 3);
        bytes memory sig = _sign(p);
        vm.expectEmit(true, true, true, true, address(vault));
        emit AllotVault.Spent(id, merchant, _ref(42), recipient, 75e6, 3, AMOUNT - 75e6, relayer);
        _doSpend(p, sig);
    }

    function test_Spend_RelayedByThirdParty_SubmitterIsRecorded() public {
        P memory p = _p(id, merchant2, 10e6, _ref(1), 1);
        bytes memory sig = _sign(p);
        // submitted by an arbitrary address, recipient never transacts
        vm.expectEmit(true, true, true, true, address(vault));
        emit AllotVault.Spent(id, merchant2, _ref(1), recipient, 10e6, 1, AMOUNT - 10e6, other);
        vm.prank(other);
        vault.spend(p.id, p.merchant, p.amount, p.ref, p.nonce, p.deadline, sig);
        assertEq(usdc.balanceOf(merchant2), 10e6);
        assertEq(usdc.balanceOf(other), 0);
        assertEq(usdc.balanceOf(relayer), 0);
    }

    function test_Spend_SubmittedByRecipientAndMerchantThemselves() public {
        P memory p = _p(id, merchant, 10e6, _ref(1), 1);
        bytes memory sig = _sign(p);
        vm.prank(merchant);
        vault.spend(p.id, p.merchant, p.amount, p.ref, p.nonce, p.deadline, sig);
        P memory p2 = _p(id, merchant, 10e6, _ref(2), 2);
        bytes memory sig2 = _sign(p2);
        vm.prank(recipient);
        vault.spend(p2.id, p2.merchant, p2.amount, p2.ref, p2.nonce, p2.deadline, sig2);
        assertEq(usdc.balanceOf(merchant), 20e6);
    }

    function test_Spend_ExactPerPurchaseLimit() public {
        _spend(id, merchant, LIMIT, _ref(1), 1);
        assertEq(_alw(id).remaining, AMOUNT - LIMIT);
        assertEq(usdc.balanceOf(merchant), LIMIT);
    }

    function test_Spend_ExactRemainingBalance_DrainsAllowance() public {
        // 5 x LIMIT == AMOUNT
        for (uint256 i; i < 5; ++i) {
            _spend(id, i % 2 == 0 ? merchant : merchant2, LIMIT, _ref(i + 1), i);
        }
        AllotVault.Allowance memory a = _alw(id);
        assertEq(a.remaining, 0);
        assertEq(a.spent, AMOUNT);
        assertEq(usdc.balanceOf(address(vault)), 0);
        assertEq(usdc.balanceOf(merchant) + usdc.balanceOf(merchant2), AMOUNT);
    }

    function test_Spend_ExactRemaining_WhenRemainingBelowLimit() public {
        uint256 id2 = _createFor(recipient, 250e6, 200e6, expiry);
        _spend(id2, merchant, 200e6, _ref(1), 1);
        _spend(id2, merchant, 50e6, _ref(2), 2); // exactly remaining (< limit)
        assertEq(_alw(id2).remaining, 0);
    }

    function test_Spend_NonceZeroAndOneWeiAllowed() public {
        _spend(id, merchant, 1, _ref(1), 0);
        assertTrue(vault.isNonceUsed(id, 0));
        assertEq(usdc.balanceOf(merchant), 1);
    }

    function test_Spend_DeadlineEqualToBlockTimestampOk() public {
        P memory p = _p(id, merchant, 10e6, _ref(1), 1);
        p.deadline = block.timestamp;
        _doSpend(p, _sign(p));
        assertEq(usdc.balanceOf(merchant), 10e6);
    }

    function test_Spend_LastSecondBeforeExpiryOk() public {
        vm.warp(expiry - 1);
        _spend(id, merchant, 10e6, _ref(1), 1);
        assertEq(usdc.balanceOf(merchant), 10e6);
    }

    function test_Spend_SameOrderRefAllowedOnDifferentAllowance() public {
        uint256 id2 = _create();
        _spend(id, merchant, 10e6, _ref(1), 1);
        _spend(id2, merchant, 10e6, _ref(1), 1); // same ref AND same nonce, different allowance
        assertTrue(vault.isOrderPaid(id, merchant, _ref(1)));
        assertTrue(vault.isOrderPaid(id2, merchant, _ref(1)));
        assertEq(usdc.balanceOf(merchant), 20e6);
    }

    function test_Spend_SameOrderRefAllowedForDifferentMerchantOnSameAllowance() public {
        _spend(id, merchant, 10e6, _ref(1), 1);
        _spend(id, merchant2, 10e6, _ref(1), 2);
        assertEq(usdc.balanceOf(merchant2), 10e6);
    }

    function test_Spend_WorksAfterMerchantRemovedAndReAdded() public {
        vm.startPrank(funder);
        vault.removeMerchant(id, merchant);
        vault.addMerchant(id, merchant);
        vm.stopPrank();
        _spend(id, merchant, 10e6, _ref(1), 1);
        assertEq(usdc.balanceOf(merchant), 10e6);
    }

    function test_Spend_MerchantAddedLaterCanBePaid() public {
        vm.prank(funder);
        vault.addMerchant(id, other);
        _spend(id, other, 10e6, _ref(1), 1);
        assertEq(usdc.balanceOf(other), 10e6);
    }

    // ------------------------------------------------------------ state failures

    function test_Spend_RevertsUnknownAllowance() public {
        P memory p = _p(99, merchant, 10e6, _ref(1), 1);
        _expectSpend(_sel(AllotVault.AllowanceNotFound.selector), p, hex"");
    }

    function test_Spend_RevertsWhenPaused() public {
        P memory p = _p(id, merchant, 10e6, _ref(1), 1);
        bytes memory sig = _sign(p);
        vm.prank(funder);
        vault.pause(id);
        _expectSpend(_sel(AllotVault.AllowancePaused.selector), p, sig);
    }

    function test_Spend_RevertsWhenClosed() public {
        P memory p = _p(id, merchant, 10e6, _ref(1), 1);
        bytes memory sig = _sign(p);
        vm.prank(funder);
        vault.close(id);
        _expectSpend(_sel(AllotVault.AllowanceClosed.selector), p, sig);
    }

    function test_Spend_RevertsAfterExpiry() public {
        P memory p = _p(id, merchant, 10e6, _ref(1), 1);
        p.deadline = expiry + 10 days;
        bytes memory sig = _sign(p);
        vm.warp(expiry + 1);
        _expectSpend(_sel(AllotVault.AllowanceExpired.selector), p, sig);
    }

    function test_Spend_RevertsExactlyAtExpiry() public {
        P memory p = _p(id, merchant, 10e6, _ref(1), 1);
        p.deadline = expiry + 10 days;
        bytes memory sig = _sign(p);
        vm.warp(expiry);
        _expectSpend(_sel(AllotVault.AllowanceExpired.selector), p, sig);
    }

    function test_Spend_RevertsExpiredSignature() public {
        P memory p = _p(id, merchant, 10e6, _ref(1), 1);
        bytes memory sig = _sign(p);
        vm.warp(p.deadline + 1);
        // allowance (7 days) still live, deadline (1 hour) elapsed
        _expectSpend(_sel(AllotVault.SignatureExpired.selector), p, sig);
    }

    function test_Spend_RevertsZeroOrderRef() public {
        _expectSpendSigned(_sel(AllotVault.InvalidOrderRef.selector), id, merchant, 10e6, bytes32(0), 1);
    }

    function test_Spend_RevertsZeroAmount() public {
        _expectSpendSigned(_sel(AllotVault.InvalidAmount.selector), id, merchant, 0, _ref(1), 1);
    }

    function test_Spend_RevertsUnapprovedMerchant() public {
        _expectSpendSigned(_sel(AllotVault.MerchantNotApproved.selector), id, other, 10e6, _ref(1), 1);
    }

    function test_Spend_RevertsRemovedMerchant() public {
        P memory p = _p(id, merchant, 10e6, _ref(1), 1);
        bytes memory sig = _sign(p);
        vm.prank(funder);
        vault.removeMerchant(id, merchant);
        _expectSpend(_sel(AllotVault.MerchantNotApproved.selector), p, sig);
    }

    function test_Spend_RevertsOverPerPurchaseLimit() public {
        _expectSpendSigned(_sel(AllotVault.ExceedsPerPurchaseLimit.selector), id, merchant, LIMIT + 1, _ref(1), 1);
    }

    function test_Spend_RevertsOverRemainingBalance() public {
        uint256 id2 = _createFor(recipient, 250e6, 200e6, expiry);
        _spend(id2, merchant, 200e6, _ref(1), 1);
        // 50e6 remaining, 51e6 within per-purchase limit
        _expectSpendSigned(_sel(AllotVault.InsufficientBalance.selector), id2, merchant, 51e6, _ref(2), 2);
    }

    function test_Spend_RevertsWhenFullyDrained() public {
        uint256 id2 = _createFor(recipient, 100e6, 100e6, expiry);
        _spend(id2, merchant, 100e6, _ref(1), 1);
        _expectSpendSigned(_sel(AllotVault.InsufficientBalance.selector), id2, merchant, 1, _ref(2), 2);
    }

    function test_Spend_ReusedNonceWithDifferentOrder() public {
        _spend(id, merchant, 10e6, _ref(1), 1);
        _expectSpendSigned(_sel(AllotVault.NonceAlreadyUsed.selector), id, merchant, 10e6, _ref(2), 1);
    }

    function test_Spend_ReusedOrderRefOnSameAllowance() public {
        _spend(id, merchant, 10e6, _ref(1), 1);
        _expectSpendSigned(_sel(AllotVault.OrderAlreadyPaid.selector), id, merchant, 10e6, _ref(1), 2);
    }

    function test_Spend_RevertsDoNotMoveFunds() public {
        _expectSpendSigned(_sel(AllotVault.ExceedsPerPurchaseLimit.selector), id, merchant, LIMIT + 1, _ref(1), 1);
        assertEq(usdc.balanceOf(address(vault)), AMOUNT);
        assertEq(_alw(id).spent, 0);
        assertFalse(vault.isNonceUsed(id, 1));
        assertFalse(vault.isOrderPaid(id, merchant, _ref(1)));
    }
}
