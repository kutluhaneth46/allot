// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AllotVault} from "../AllotVault.sol";
import {AllotVaultTestBase} from "./AllotVault.Base.t.sol";

/// @notice pause / resume / close / reclaim.
contract AllotVaultLifecycleTest is AllotVaultTestBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = _create();
    }

    function _status(uint256 i) internal view returns (AllotVault.Status) {
        return _alw(i).status;
    }

    // ------------------------------------------------------------ pause

    function test_Pause_Success() public {
        vm.expectEmit(true, true, false, true, address(vault));
        emit AllotVault.AllowancePausedEvent(id, funder);
        vm.prank(funder);
        vault.pause(id);
        assertEq(uint8(_status(id)), uint8(AllotVault.Status.Paused));
    }

    function test_Pause_RevertsUnknown() public {
        vm.prank(funder);
        vm.expectRevert(AllotVault.AllowanceNotFound.selector);
        vault.pause(99);
    }

    function test_Pause_RevertsNonFunder() public {
        vm.prank(other);
        vm.expectRevert(AllotVault.NotFunder.selector);
        vault.pause(id);
        vm.prank(recipient);
        vm.expectRevert(AllotVault.NotFunder.selector);
        vault.pause(id);
    }

    function test_Pause_RevertsAlreadyPaused() public {
        vm.startPrank(funder);
        vault.pause(id);
        vm.expectRevert(AllotVault.AllowancePaused.selector);
        vault.pause(id);
        vm.stopPrank();
    }

    function test_Pause_RevertsClosed() public {
        vm.startPrank(funder);
        vault.close(id);
        vm.expectRevert(AllotVault.AllowanceClosed.selector);
        vault.pause(id);
        vm.stopPrank();
    }

    function test_Pause_AllowedAfterExpiry() public {
        vm.warp(expiry + 1);
        vm.prank(funder);
        vault.pause(id);
        assertEq(uint8(_status(id)), uint8(AllotVault.Status.Paused));
    }

    // ------------------------------------------------------------ resume

    function test_Resume_Success_SpendBlockedWhilePausedThenWorks() public {
        P memory p = _p(id, merchant, 10e6, _ref(1), 1);
        bytes memory sig = _sign(p);

        vm.prank(funder);
        vault.pause(id);
        _expectSpend(_sel(AllotVault.AllowancePaused.selector), p, sig);

        vm.expectEmit(true, true, false, true, address(vault));
        emit AllotVault.AllowanceResumed(id, funder);
        vm.prank(funder);
        vault.resume(id);
        assertEq(uint8(_status(id)), uint8(AllotVault.Status.Active));

        // the very same signature (unused while paused) now works
        _doSpend(p, sig);
        assertEq(usdc.balanceOf(merchant), 10e6);
    }

    function test_Resume_RevertsUnknown() public {
        vm.prank(funder);
        vm.expectRevert(AllotVault.AllowanceNotFound.selector);
        vault.resume(99);
    }

    function test_Resume_RevertsNonFunder() public {
        vm.prank(funder);
        vault.pause(id);
        vm.prank(other);
        vm.expectRevert(AllotVault.NotFunder.selector);
        vault.resume(id);
    }

    function test_Resume_RevertsWhenActive() public {
        vm.prank(funder);
        vm.expectRevert(AllotVault.NotPaused.selector);
        vault.resume(id);
    }

    function test_Resume_RevertsClosed() public {
        vm.startPrank(funder);
        vault.close(id);
        vm.expectRevert(AllotVault.AllowanceClosed.selector);
        vault.resume(id);
        vm.stopPrank();
    }

    function test_Resume_DoesNotRevivePastExpiry() public {
        vm.startPrank(funder);
        vault.pause(id);
        vm.warp(expiry);
        vault.resume(id);
        vm.stopPrank();
        _expectSpendSigned(_sel(AllotVault.AllowanceExpired.selector), id, merchant, 10e6, _ref(1), 1);
    }

    function test_PauseResumeCycleRepeatable() public {
        vm.startPrank(funder);
        vault.pause(id);
        vault.resume(id);
        vault.pause(id);
        vault.resume(id);
        vm.stopPrank();
        assertEq(uint8(_status(id)), uint8(AllotVault.Status.Active));
    }

    // ------------------------------------------------------------ close

    function test_Close_RefundsUnspent() public {
        _spend(id, merchant, 150e6, _ref(1), 1);
        uint256 before = usdc.balanceOf(funder);

        vm.expectEmit(true, true, false, true, address(vault));
        emit AllotVault.AllowanceClosedEvent(id, funder, AMOUNT - 150e6);
        vm.prank(funder);
        vault.close(id);

        assertEq(usdc.balanceOf(funder), before + AMOUNT - 150e6);
        assertEq(usdc.balanceOf(address(vault)), 0);
        AllotVault.Allowance memory a = _alw(id);
        assertEq(uint8(a.status), uint8(AllotVault.Status.Closed));
        assertEq(a.remaining, 0);
        assertEq(a.spent, 150e6);
        assertEq(a.funded, AMOUNT);
    }

    function test_Close_WhilePausedRefunds() public {
        vm.startPrank(funder);
        vault.pause(id);
        vault.close(id);
        vm.stopPrank();
        assertEq(usdc.balanceOf(funder), 1_000_000e6);
        assertEq(uint8(_status(id)), uint8(AllotVault.Status.Closed));
    }

    function test_Close_RevertsUnknown() public {
        vm.prank(funder);
        vm.expectRevert(AllotVault.AllowanceNotFound.selector);
        vault.close(99);
    }

    function test_Close_RevertsNonFunder() public {
        vm.prank(other);
        vm.expectRevert(AllotVault.NotFunder.selector);
        vault.close(id);
        vm.prank(recipient);
        vm.expectRevert(AllotVault.NotFunder.selector);
        vault.close(id);
    }

    function test_Close_RevertsAlreadyClosed() public {
        vm.startPrank(funder);
        vault.close(id);
        vm.expectRevert(AllotVault.AllowanceClosed.selector);
        vault.close(id);
        vm.stopPrank();
    }

    function test_Close_AfterExpiryRefunds() public {
        vm.warp(expiry + 30 days);
        vm.expectEmit(true, true, false, true, address(vault));
        emit AllotVault.AllowanceClosedEvent(id, funder, AMOUNT);
        vm.prank(funder);
        vault.close(id);
        assertEq(usdc.balanceOf(funder), 1_000_000e6);
    }

    function test_Close_ZeroBalanceStillCloses() public {
        uint256 id2 = _createFor(recipient, 100e6, 100e6, expiry);
        _spend(id2, merchant, 100e6, _ref(1), 1);
        uint256 before = usdc.balanceOf(funder);

        vm.expectEmit(true, true, false, true, address(vault));
        emit AllotVault.AllowanceClosedEvent(id2, funder, 0);
        vm.prank(funder);
        vault.close(id2);

        assertEq(usdc.balanceOf(funder), before);
        assertEq(uint8(_status(id2)), uint8(AllotVault.Status.Closed));
        assertEq(_alw(id2).spent, 100e6);
    }

    function test_Close_BlocksSpend() public {
        P memory p = _p(id, merchant, 10e6, _ref(1), 1);
        bytes memory sig = _sign(p);
        vm.prank(funder);
        vault.close(id);
        _expectSpend(_sel(AllotVault.AllowanceClosed.selector), p, sig);
    }

    function test_Close_DoesNotAffectOtherAllowances() public {
        uint256 id2 = _create();
        vm.prank(funder);
        vault.close(id);
        assertEq(usdc.balanceOf(address(vault)), AMOUNT);
        _spend(id2, merchant, 10e6, _ref(1), 1);
        assertEq(usdc.balanceOf(merchant), 10e6);
    }

    // ------------------------------------------------------------ reclaim

    function test_Reclaim_RevertsBeforeExpiry() public {
        vm.prank(funder);
        vm.expectRevert(AllotVault.NotExpired.selector);
        vault.reclaim(id);
        vm.warp(expiry - 1);
        vm.prank(funder);
        vm.expectRevert(AllotVault.NotExpired.selector);
        vault.reclaim(id);
    }

    function test_Reclaim_AfterExpiryRefundsAndCloses() public {
        _spend(id, merchant, 100e6, _ref(1), 1);
        vm.warp(expiry + 1);
        uint256 before = usdc.balanceOf(funder);

        vm.expectEmit(true, true, false, true, address(vault));
        emit AllotVault.AllowanceReclaimed(id, funder, AMOUNT - 100e6);
        vm.prank(funder);
        vault.reclaim(id);

        assertEq(usdc.balanceOf(funder), before + AMOUNT - 100e6);
        assertEq(usdc.balanceOf(address(vault)), 0);
        AllotVault.Allowance memory a = _alw(id);
        assertEq(uint8(a.status), uint8(AllotVault.Status.Closed));
        assertEq(a.remaining, 0);
        assertEq(a.spent, 100e6);
        assertEq(a.funded, AMOUNT);
    }

    function test_Reclaim_ExactlyAtExpiryWorks() public {
        vm.warp(expiry);
        vm.prank(funder);
        vault.reclaim(id);
        assertEq(usdc.balanceOf(funder), 1_000_000e6);
        assertEq(uint8(_status(id)), uint8(AllotVault.Status.Closed));
    }

    function test_Reclaim_WorksWhilePaused() public {
        vm.startPrank(funder);
        vault.pause(id);
        vm.warp(expiry);
        vault.reclaim(id);
        vm.stopPrank();
        assertEq(usdc.balanceOf(funder), 1_000_000e6);
        assertEq(uint8(_status(id)), uint8(AllotVault.Status.Closed));
    }

    function test_Reclaim_RevertsUnknown() public {
        vm.prank(funder);
        vm.expectRevert(AllotVault.AllowanceNotFound.selector);
        vault.reclaim(99);
    }

    function test_Reclaim_RevertsNonFunder() public {
        vm.warp(expiry);
        vm.prank(other);
        vm.expectRevert(AllotVault.NotFunder.selector);
        vault.reclaim(id);
    }

    function test_Reclaim_RevertsAlreadyClosed() public {
        vm.warp(expiry);
        vm.startPrank(funder);
        vault.reclaim(id);
        vm.expectRevert(AllotVault.AllowanceClosed.selector);
        vault.reclaim(id);
        vm.stopPrank();
    }

    function test_Reclaim_RevertsAfterClose() public {
        vm.startPrank(funder);
        vault.close(id);
        vm.warp(expiry);
        vm.expectRevert(AllotVault.AllowanceClosed.selector);
        vault.reclaim(id);
        vm.stopPrank();
    }

    function test_Reclaim_RevertsNothingToReclaimWhenFullySpent() public {
        uint256 id2 = _createFor(recipient, 100e6, 100e6, expiry);
        _spend(id2, merchant, 100e6, _ref(1), 1);
        vm.warp(expiry);
        vm.prank(funder);
        vm.expectRevert(AllotVault.NothingToReclaim.selector);
        vault.reclaim(id2);
        // still closable (no refund)
        vm.prank(funder);
        vault.close(id2);
        assertEq(uint8(_status(id2)), uint8(AllotVault.Status.Closed));
    }

    function test_Reclaim_BlocksSpendAndSecondReclaim() public {
        P memory p = _p(id, merchant, 10e6, _ref(1), 1);
        p.deadline = expiry + 1 days;
        bytes memory sig = _sign(p);
        vm.warp(expiry);
        vm.prank(funder);
        vault.reclaim(id);
        _expectSpend(_sel(AllotVault.AllowanceClosed.selector), p, sig);
    }
}
