// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AllotVault} from "../AllotVault.sol";
import {MockUSDC} from "./AllotVaultMocks.sol";
import {AllotVaultTestBase} from "./AllotVault.Base.t.sol";

/// @dev Funder + driver. Every action is bounded and wrapped so it never reverts the run.
contract AllotVaultHandler is Test {
    AllotVault public immutable vault;
    MockUSDC public immutable usdc;
    address public immutable recipient;
    uint256 public immutable recipientPk;
    address[3] public merchants;

    uint256 public counter;
    uint256 public ghostRefunded;

    constructor(AllotVault v, MockUSDC t, address r, uint256 rpk) {
        vault = v;
        usdc = t;
        recipient = r;
        recipientPk = rpk;
        merchants = [address(0xA001), address(0xA002), address(0xA003)];
        usdc.approve(address(v), type(uint256).max);
    }

    function _pickId(uint256 seed) internal view returns (uint256) {
        uint256 n = vault.nextAllowanceId();
        if (n <= 1) return 0;
        return bound(seed, 1, n - 1);
    }

    function create(uint256 amount, uint256 limit, uint256 dur, uint256 mSeed) external {
        amount = bound(amount, 1, 1_000e6);
        limit = bound(limit, 1, amount);
        dur = bound(dur, 1, 10 days);
        usdc.mint(address(this), amount);
        address[] memory ms = new address[](1 + (mSeed % 3));
        for (uint256 i; i < ms.length; ++i) {
            ms[i] = merchants[i];
        }
        vault.createAllowance(recipient, "invariant", "inv", amount, limit, uint64(block.timestamp + dur), ms);
    }

    function spend(uint256 idSeed, uint256 amount, uint256 mSeed) external {
        uint256 id = _pickId(idSeed);
        if (id == 0) return;
        amount = bound(amount, 1, 1_200e6);
        address m = merchants[mSeed % 3];
        uint256 nonce = ++counter;
        bytes32 ref = keccak256(abi.encode("ref", nonce));
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = vault.hashSpend(id, m, amount, ref, nonce, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(recipientPk, digest);
        try vault.spend(id, m, amount, ref, nonce, deadline, abi.encodePacked(r, s, v)) {} catch {}
    }

    function pause(uint256 idSeed) external {
        uint256 id = _pickId(idSeed);
        if (id == 0) return;
        try vault.pause(id) {} catch {}
    }

    function resume(uint256 idSeed) external {
        uint256 id = _pickId(idSeed);
        if (id == 0) return;
        try vault.resume(id) {} catch {}
    }

    function close(uint256 idSeed) external {
        uint256 id = _pickId(idSeed);
        if (id == 0) return;
        uint256 before = usdc.balanceOf(address(this));
        try vault.close(id) {} catch {}
        ghostRefunded += usdc.balanceOf(address(this)) - before;
    }

    function reclaim(uint256 idSeed) external {
        uint256 id = _pickId(idSeed);
        if (id == 0) return;
        uint256 before = usdc.balanceOf(address(this));
        try vault.reclaim(id) {} catch {}
        ghostRefunded += usdc.balanceOf(address(this)) - before;
    }

    function toggleMerchant(uint256 idSeed, uint256 mSeed) external {
        uint256 id = _pickId(idSeed);
        if (id == 0) return;
        address m = merchants[mSeed % 3];
        if (vault.isMerchantApproved(id, m)) {
            try vault.removeMerchant(id, m) {} catch {}
        } else {
            try vault.addMerchant(id, m) {} catch {}
        }
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 0, 4 days));
    }

    function merchantBalances() external view returns (uint256 sum) {
        for (uint256 i; i < 3; ++i) {
            sum += usdc.balanceOf(merchants[i]);
        }
    }
}

contract AllotVaultInvariantTest is AllotVaultTestBase {
    AllotVaultHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new AllotVaultHandler(vault, usdc, recipient, recipientPk);
        targetContract(address(handler));
        bytes4[] memory sels = new bytes4[](8);
        sels[0] = AllotVaultHandler.create.selector;
        sels[1] = AllotVaultHandler.spend.selector;
        sels[2] = AllotVaultHandler.pause.selector;
        sels[3] = AllotVaultHandler.resume.selector;
        sels[4] = AllotVaultHandler.close.selector;
        sels[5] = AllotVaultHandler.reclaim.selector;
        sels[6] = AllotVaultHandler.toggleMerchant.selector;
        sels[7] = AllotVaultHandler.warp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: sels}));
    }

    /// @dev Non-vacuity: the handler's bounded actions really create, spend and close.
    function test_Handler_ActionsActuallyMoveFunds() public {
        handler.create(500e6, 100e6, 1 days, 2);
        assertEq(usdc.balanceOf(address(vault)), 500e6);
        handler.spend(1, 60e6, 0);
        assertEq(vault.getAllowance(1).spent, 60e6);
        assertEq(handler.merchantBalances(), 60e6);
        handler.close(1);
        assertEq(handler.ghostRefunded(), 440e6);
        assertEq(usdc.balanceOf(address(vault)), 0);
    }

    function _sums() internal view returns (uint256 funded, uint256 spent, uint256 remaining) {
        uint256 n = vault.nextAllowanceId();
        for (uint256 id = 1; id < n; ++id) {
            AllotVault.Allowance memory a = vault.getAllowance(id);
            funded += a.funded;
            spent += a.spent;
            remaining += a.remaining;
        }
    }

    /// @dev Vault USDC balance == sum of remaining across all allowances.
    function invariant_VaultBalanceEqualsSumOfRemaining() public view {
        (,, uint256 remaining) = _sums();
        assertEq(usdc.balanceOf(address(vault)), remaining);
    }

    /// @dev Conservation: funded == spent + remaining + refunded.
    function invariant_FundedEqualsSpentPlusRemainingPlusRefunded() public view {
        (uint256 funded, uint256 spent, uint256 remaining) = _sums();
        assertEq(funded, spent + remaining + handler.ghostRefunded());
    }

    /// @dev Everything marked spent has actually reached merchants, and nothing else has.
    function invariant_MerchantsHoldExactlyWhatWasSpent() public view {
        (, uint256 spent,) = _sums();
        assertEq(handler.merchantBalances(), spent);
    }

    /// @dev No allowance ever pays out more than it was funded; closed ones hold nothing.
    function invariant_PerAllowanceBounds() public view {
        uint256 n = vault.nextAllowanceId();
        for (uint256 id = 1; id < n; ++id) {
            AllotVault.Allowance memory a = vault.getAllowance(id);
            assertLe(a.spent, a.funded);
            assertLe(a.spent + a.remaining, a.funded);
            if (a.status == AllotVault.Status.Closed) assertEq(a.remaining, 0);
            else assertEq(a.spent + a.remaining, a.funded);
        }
    }
}
