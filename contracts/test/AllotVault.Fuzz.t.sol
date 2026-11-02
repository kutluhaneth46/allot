// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AllotVault} from "../AllotVault.sol";
import {AllotVaultTestBase} from "./AllotVault.Base.t.sol";

contract AllotVaultFuzzTest is AllotVaultTestBase {
    uint256 internal constant SECP_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    function testFuzz_Create_LocksFundsAndRecordsTerms(uint256 amount, uint256 limit, uint256 dur) public {
        amount = bound(amount, 1, 1_000_000e6);
        limit = bound(limit, 1, amount);
        dur = bound(dur, 1, 3650 days);
        uint256 before = usdc.balanceOf(funder);
        uint64 exp = uint64(block.timestamp + dur);

        uint256 id = _createFor(recipient, amount, limit, exp);

        AllotVault.Allowance memory a = _alw(id);
        assertEq(a.funded, amount);
        assertEq(a.remaining, amount);
        assertEq(a.spent, 0);
        assertEq(a.limitPerPurchase, limit);
        assertEq(a.expiry, exp);
        assertEq(usdc.balanceOf(address(vault)), amount);
        assertEq(usdc.balanceOf(funder), before - amount);
    }

    function testFuzz_SpendAccountingNeverExceedsFunded(uint256 amount, uint256 limit, uint256[6] memory xs) public {
        amount = bound(amount, 1, 1_000_000e6);
        limit = bound(limit, 1, amount);
        uint256 id = _createFor(recipient, amount, limit, expiry);

        uint256 spentSum;
        for (uint256 i; i < xs.length; ++i) {
            uint256 x = bound(xs[i], 1, limit); // random amount within the per-purchase limit
            uint256 remaining = _alw(id).remaining;
            address m = i % 2 == 0 ? merchant : merchant2;
            if (x <= remaining) {
                _spend(id, m, x, _ref(i), i);
                spentSum += x;
            } else {
                _expectSpendSigned(_sel(AllotVault.InsufficientBalance.selector), id, m, x, _ref(i), i);
            }
            AllotVault.Allowance memory a = _alw(id);
            assertEq(a.spent, spentSum);
            assertLe(a.spent, a.funded);
            assertEq(a.funded, a.spent + a.remaining);
            assertEq(usdc.balanceOf(address(vault)), a.remaining);
        }
        assertEq(usdc.balanceOf(merchant) + usdc.balanceOf(merchant2), spentSum);
    }

    function testFuzz_FundedEqualsSpentPlusRemainingPlusRefunded(uint256 amount, uint256 limit, uint256[4] memory xs, bool useReclaim)
        public
    {
        amount = bound(amount, 1, 1_000_000e6);
        limit = bound(limit, 1, amount);
        uint256 id = _createFor(recipient, amount, limit, expiry);

        for (uint256 i; i < xs.length; ++i) {
            uint256 x = bound(xs[i], 1, limit);
            if (x <= _alw(id).remaining) _spend(id, merchant, x, _ref(i), i);
        }

        uint256 before = usdc.balanceOf(funder);
        uint256 remainingBefore = _alw(id).remaining;
        vm.startPrank(funder);
        if (useReclaim && remainingBefore != 0) {
            vm.warp(expiry);
            vault.reclaim(id);
        } else {
            vault.close(id);
        }
        vm.stopPrank();

        uint256 refunded = usdc.balanceOf(funder) - before;
        AllotVault.Allowance memory a = _alw(id);
        assertEq(refunded, remainingBefore);
        assertEq(a.remaining, 0);
        assertEq(a.funded, a.spent + a.remaining + refunded);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function testFuzz_OverPerPurchaseLimitAlwaysReverts(uint256 amount, uint256 limit, uint256 excess) public {
        amount = bound(amount, 2, 1_000_000e6);
        limit = bound(limit, 1, amount - 1);
        excess = bound(excess, 1, amount - limit);
        uint256 id = _createFor(recipient, amount, limit, expiry);
        _expectSpendSigned(_sel(AllotVault.ExceedsPerPurchaseLimit.selector), id, merchant, limit + excess, _ref(1), 1);
    }

    function testFuzz_OverRemainingAlwaysReverts(uint256 amount, uint256 first) public {
        amount = bound(amount, 2, 1_000_000e6);
        first = bound(first, 1, amount - 1);
        uint256 id = _createFor(recipient, amount, amount, expiry); // limit == amount: only balance binds
        _spend(id, merchant, first, _ref(1), 1);
        uint256 tooMuch = amount - first + 1;
        _expectSpendSigned(_sel(AllotVault.InsufficientBalance.selector), id, merchant, tooMuch, _ref(2), 2);
        _spend(id, merchant, amount - first, _ref(3), 3); // exact remaining is fine
        assertEq(_alw(id).remaining, 0);
    }

    function testFuzz_SignatureBindsAmount(uint256 a, uint256 b) public {
        a = bound(a, 1, LIMIT);
        b = bound(b, 1, LIMIT);
        vm.assume(a != b);
        uint256 id = _create();
        P memory signed = _p(id, merchant, a, _ref(1), 1);
        bytes memory sig = _sign(signed);
        P memory submitted = P(signed.id, signed.merchant, b, signed.ref, signed.nonce, signed.deadline);
        _expectSpend(_sel(AllotVault.InvalidSignature.selector), submitted, sig);
    }

    function testFuzz_OnlyRecipientKeyAuthorizes(uint256 pk) public {
        pk = bound(pk, 1, SECP_N - 1);
        vm.assume(vm.addr(pk) != recipient);
        uint256 id = _create();
        P memory p = _p(id, merchant, 10e6, _ref(1), 1);
        bytes memory sig = _signWith(pk, p);
        _expectSpend(_sel(AllotVault.InvalidSignature.selector), p, sig);
    }

    function testFuzz_ExpiryBoundary(uint256 t) public {
        t = bound(t, T0, expiry + 3 days);
        uint256 id = _create();
        P memory p = _p(id, merchant, 10e6, _ref(1), 1);
        p.deadline = expiry + 10 days;
        bytes memory sig = _sign(p);
        vm.warp(t);
        if (t >= expiry) {
            _expectSpend(_sel(AllotVault.AllowanceExpired.selector), p, sig);
        } else {
            _doSpend(p, sig);
            assertEq(usdc.balanceOf(merchant), 10e6);
        }
    }

    function testFuzz_DeadlineBoundary(uint256 t) public {
        t = bound(t, T0, T0 + 2 hours);
        uint256 id = _create();
        P memory p = _p(id, merchant, 10e6, _ref(1), 1); // deadline = T0 + 1h
        bytes memory sig = _sign(p);
        vm.warp(t);
        if (t > p.deadline) {
            _expectSpend(_sel(AllotVault.SignatureExpired.selector), p, sig);
        } else {
            _doSpend(p, sig);
        }
    }

    function testFuzz_ReclaimRefundsExactRemainingAfterExpiry(uint256 spendAmt, uint256 extra) public {
        spendAmt = bound(spendAmt, 0, LIMIT);
        extra = bound(extra, 0, 365 days);
        uint256 id = _create();
        if (spendAmt != 0) _spend(id, merchant, spendAmt, _ref(1), 1);
        vm.warp(expiry + extra);
        uint256 before = usdc.balanceOf(funder);
        vm.prank(funder);
        vault.reclaim(id);
        assertEq(usdc.balanceOf(funder) - before, AMOUNT - spendAmt);
        assertEq(_alw(id).spent, spendAmt);
    }
}
