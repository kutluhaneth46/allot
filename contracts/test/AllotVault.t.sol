// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AllotVault} from "../AllotVault.sol";
import {MockUSDC} from "./AllotVaultMocks.sol";
import {AllotVaultTestBase} from "./AllotVault.Base.t.sol";

/// @notice Deployment, EIP-712 domain, views, createAllowance and merchant management.
contract AllotVaultTest is AllotVaultTestBase {
    // ------------------------------------------------------------ deployment / constants

    function test_Deploy_Constants() public view {
        assertEq(vault.USDC_ADDRESS(), USDC_ADDR);
        assertEq(address(vault.USDC()), USDC_ADDR);
        assertEq(vault.MAX_MERCHANTS(), 50);
        assertEq(vault.nextAllowanceId(), 1);
        assertEq(
            vault.SPEND_TYPEHASH(),
            keccak256(
                "Spend(uint256 allowanceId,address merchant,uint256 amount,bytes32 orderRef,uint256 nonce,uint256 deadline)"
            )
        );
        assertEq(usdc.decimals(), 6);
    }

    function test_Eip712Domain_Fields() public view {
        (bytes1 fields, string memory name, string memory version, uint256 chainId, address verifying, bytes32 salt,
            uint256[] memory ext) = vault.eip712Domain();
        assertEq(fields, bytes1(0x0f));
        assertEq(name, "AllotVault");
        assertEq(version, "1");
        assertEq(chainId, block.chainid);
        assertEq(verifying, address(vault));
        assertEq(salt, bytes32(0));
        assertEq(ext.length, 0);
    }

    function _independentDomainSeparator() internal view returns (bytes32) {
        (, string memory name, string memory version, uint256 chainId, address verifying,,) = vault.eip712Domain();
        bytes32 domainTypeHash =
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
        return keccak256(abi.encode(domainTypeHash, keccak256(bytes(name)), keccak256(bytes(version)), chainId, verifying));
    }

    function _independentDigest(P memory p) internal view returns (bytes32) {
        bytes32 typeHash = keccak256(
            "Spend(uint256 allowanceId,address merchant,uint256 amount,bytes32 orderRef,uint256 nonce,uint256 deadline)"
        );
        bytes32 structHash = keccak256(abi.encode(typeHash, p.id, p.merchant, p.amount, p.ref, p.nonce, p.deadline));
        return keccak256(abi.encodePacked("\x19\x01", _independentDomainSeparator(), structHash));
    }

    function test_HashSpend_MatchesIndependentEip712Digest() public view {
        assertEq(_independentDomainSeparator(), vault.domainSeparator());
        P memory p = P(3, merchant, 55e6, _ref(7), 9, T0 + 1 days);
        assertEq(vault.hashSpend(p.id, p.merchant, p.amount, p.ref, p.nonce, p.deadline), _independentDigest(p));
    }

    function test_HashSpend_IndependentDigestVerifiesSignatureOnSpend() public {
        uint256 id = _create();
        P memory p = _p(id, merchant, 10e6, _ref(1), 1);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(recipientPk, _independentDigest(p));
        _doSpend(p, abi.encodePacked(r, s, v));
        assertEq(usdc.balanceOf(merchant), 10e6);
    }

    // ------------------------------------------------------------ createAllowance success

    function test_Create_Success_StateAndFunds() public {
        uint256 funderBefore = usdc.balanceOf(funder);
        uint256 id = _create();

        assertEq(id, 1);
        assertEq(vault.nextAllowanceId(), 2);
        assertEq(usdc.balanceOf(funder), funderBefore - AMOUNT);
        assertEq(usdc.balanceOf(address(vault)), AMOUNT);

        AllotVault.Allowance memory a = _alw(id);
        assertEq(a.funder, funder);
        assertEq(a.recipient, recipient);
        assertEq(a.expiry, expiry);
        assertEq(uint8(a.status), uint8(AllotVault.Status.Active));
        assertEq(a.limitPerPurchase, LIMIT);
        assertEq(a.funded, AMOUNT);
        assertEq(a.spent, 0);
        assertEq(a.remaining, AMOUNT);
        assertEq(a.purpose, "Groceries");
        assertEq(a.category, "Food");

        assertTrue(vault.isMerchantApproved(id, merchant));
        assertTrue(vault.isMerchantApproved(id, merchant2));
        assertFalse(vault.isMerchantApproved(id, other));
    }

    function test_Create_EmitsAllowanceCreatedAndMerchantAdded() public {
        vm.expectEmit(true, true, true, true, address(vault));
        emit AllotVault.AllowanceCreated(1, funder, recipient, "Groceries", "Food", AMOUNT, LIMIT, expiry);
        vm.expectEmit(true, true, false, true, address(vault));
        emit AllotVault.MerchantAdded(1, merchant);
        vm.expectEmit(true, true, false, true, address(vault));
        emit AllotVault.MerchantAdded(1, merchant2);
        _create();
    }

    function test_Create_PullsUsdcViaTransferFrom() public {
        vm.expectEmit(true, true, false, true, USDC_ADDR);
        emit MockUSDC.Transfer(funder, address(vault), AMOUNT);
        _create();
    }

    function test_Create_IdsAndIdLists() public {
        address funder2 = makeAddr("funder2");
        usdc.mint(funder2, 500e6);
        vm.prank(funder2);
        usdc.approve(address(vault), type(uint256).max);

        uint256 id1 = _create();
        uint256 id2 = _createFor(other, AMOUNT, LIMIT, expiry);
        vm.prank(funder2);
        uint256 id3 = vault.createAllowance(recipient, "Rent", "", 500e6, 500e6, expiry, _merchants2());

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);

        uint256[] memory fIds = vault.getFunderAllowanceIds(funder);
        assertEq(fIds.length, 2);
        assertEq(fIds[0], 1);
        assertEq(fIds[1], 2);
        uint256[] memory f2 = vault.getFunderAllowanceIds(funder2);
        assertEq(f2.length, 1);
        assertEq(f2[0], 3);

        uint256[] memory rIds = vault.getRecipientAllowanceIds(recipient);
        assertEq(rIds.length, 2);
        assertEq(rIds[0], 1);
        assertEq(rIds[1], 3);
        uint256[] memory oIds = vault.getRecipientAllowanceIds(other);
        assertEq(oIds.length, 1);
        assertEq(oIds[0], 2);
        assertEq(vault.getFunderAllowanceIds(other).length, 0);
        assertEq(vault.getRecipientAllowanceIds(funder).length, 0);
    }

    function test_Create_BoundaryLengthsAndLimitsAccepted() public {
        // purpose 64 bytes, category 32 bytes / empty, limit == amount, 50 merchants, expiry = now+1
        vm.startPrank(funder);
        uint256 id1 = vault.createAllowance(
            recipient, _str(64), _str(32), AMOUNT, AMOUNT, uint64(block.timestamp + 1), _merchantList(50)
        );
        uint256 id2 = vault.createAllowance(recipient, "x", "", AMOUNT, 1, expiry, _merchants2());
        vm.stopPrank();
        assertEq(vault.getMerchants(id1).length, 50);
        assertEq(bytes(_alw(id1).purpose).length, 64);
        assertEq(bytes(_alw(id1).category).length, 32);
        assertEq(bytes(_alw(id2).category).length, 0);
        assertEq(_alw(id2).limitPerPurchase, 1);
    }

    // ------------------------------------------------------------ createAllowance reverts

    function test_Create_RevertsZeroRecipient() public {
        vm.prank(funder);
        vm.expectRevert(AllotVault.InvalidRecipient.selector);
        vault.createAllowance(address(0), "p", "c", AMOUNT, LIMIT, expiry, _merchants2());
    }

    function test_Create_RevertsZeroAmount() public {
        vm.prank(funder);
        vm.expectRevert(AllotVault.InvalidAmount.selector);
        vault.createAllowance(recipient, "p", "c", 0, LIMIT, expiry, _merchants2());
    }

    function test_Create_RevertsZeroLimit() public {
        vm.prank(funder);
        vm.expectRevert(AllotVault.InvalidPerPurchaseLimit.selector);
        vault.createAllowance(recipient, "p", "c", AMOUNT, 0, expiry, _merchants2());
    }

    function test_Create_RevertsLimitOverAmount() public {
        vm.prank(funder);
        vm.expectRevert(AllotVault.InvalidPerPurchaseLimit.selector);
        vault.createAllowance(recipient, "p", "c", AMOUNT, AMOUNT + 1, expiry, _merchants2());
    }

    function test_Create_RevertsExpiryNotInFuture() public {
        vm.startPrank(funder);
        vm.expectRevert(AllotVault.InvalidExpiry.selector);
        vault.createAllowance(recipient, "p", "c", AMOUNT, LIMIT, uint64(block.timestamp), _merchants2());
        vm.expectRevert(AllotVault.InvalidExpiry.selector);
        vault.createAllowance(recipient, "p", "c", AMOUNT, LIMIT, uint64(block.timestamp - 1), _merchants2());
        vm.expectRevert(AllotVault.InvalidExpiry.selector);
        vault.createAllowance(recipient, "p", "c", AMOUNT, LIMIT, 0, _merchants2());
        vm.stopPrank();
    }

    function test_Create_RevertsPurposeEmpty() public {
        vm.prank(funder);
        vm.expectRevert(AllotVault.InvalidPurposeLength.selector);
        vault.createAllowance(recipient, "", "c", AMOUNT, LIMIT, expiry, _merchants2());
    }

    function test_Create_RevertsPurposeTooLong() public {
        string memory long = _str(65);
        vm.prank(funder);
        vm.expectRevert(AllotVault.InvalidPurposeLength.selector);
        vault.createAllowance(recipient, long, "c", AMOUNT, LIMIT, expiry, _merchants2());
    }

    function test_Create_RevertsCategoryTooLong() public {
        string memory long = _str(33);
        vm.prank(funder);
        vm.expectRevert(AllotVault.InvalidCategoryLength.selector);
        vault.createAllowance(recipient, "p", long, AMOUNT, LIMIT, expiry, _merchants2());
    }

    function test_Create_RevertsZeroMerchants() public {
        address[] memory none = new address[](0);
        vm.prank(funder);
        vm.expectRevert(AllotVault.InvalidMerchantCount.selector);
        vault.createAllowance(recipient, "p", "c", AMOUNT, LIMIT, expiry, none);
    }

    function test_Create_RevertsTooManyMerchants() public {
        address[] memory many = _merchantList(51);
        vm.prank(funder);
        vm.expectRevert(AllotVault.InvalidMerchantCount.selector);
        vault.createAllowance(recipient, "p", "c", AMOUNT, LIMIT, expiry, many);
    }

    function test_Create_RevertsZeroMerchantAddress() public {
        address[] memory m = new address[](2);
        m[0] = merchant;
        m[1] = address(0);
        vm.prank(funder);
        vm.expectRevert(AllotVault.InvalidMerchant.selector);
        vault.createAllowance(recipient, "p", "c", AMOUNT, LIMIT, expiry, m);
    }

    function test_Create_RevertsDuplicateMerchant() public {
        address[] memory m = new address[](3);
        m[0] = merchant;
        m[1] = merchant2;
        m[2] = merchant;
        vm.prank(funder);
        vm.expectRevert(AllotVault.MerchantAlreadyApproved.selector);
        vault.createAllowance(recipient, "p", "c", AMOUNT, LIMIT, expiry, m);
    }

    function test_Create_RevertsWithoutApproval() public {
        address funder2 = makeAddr("funder2");
        usdc.mint(funder2, AMOUNT);
        vm.prank(funder2);
        vm.expectRevert(abi.encodeWithSelector(MockUSDC.ERC20InsufficientAllowance.selector, address(vault), 0, AMOUNT));
        vault.createAllowance(recipient, "p", "c", AMOUNT, LIMIT, expiry, _merchants2());
        assertEq(vault.nextAllowanceId(), 1);
    }

    function test_Create_RevertsInsufficientBalance() public {
        address funder2 = makeAddr("funder2");
        vm.startPrank(funder2);
        usdc.approve(address(vault), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(MockUSDC.ERC20InsufficientBalance.selector, funder2, 0, AMOUNT));
        vault.createAllowance(recipient, "p", "c", AMOUNT, LIMIT, expiry, _merchants2());
        vm.stopPrank();
    }

    // ------------------------------------------------------------ addMerchant

    function test_AddMerchant_Success() public {
        uint256 id = _create();
        vm.expectEmit(true, true, false, true, address(vault));
        emit AllotVault.MerchantAdded(id, other);
        vm.prank(funder);
        vault.addMerchant(id, other);
        assertTrue(vault.isMerchantApproved(id, other));
        assertEq(vault.getMerchants(id).length, 3);
    }

    function test_AddMerchant_AllowedWhilePaused() public {
        uint256 id = _create();
        vm.startPrank(funder);
        vault.pause(id);
        vault.addMerchant(id, other);
        vm.stopPrank();
        assertTrue(vault.isMerchantApproved(id, other));
    }

    function test_AddMerchant_RevertsUnknownAllowance() public {
        vm.prank(funder);
        vm.expectRevert(AllotVault.AllowanceNotFound.selector);
        vault.addMerchant(99, other);
    }

    function test_AddMerchant_RevertsNonFunder() public {
        uint256 id = _create();
        vm.prank(other);
        vm.expectRevert(AllotVault.NotFunder.selector);
        vault.addMerchant(id, other);
    }

    function test_AddMerchant_RevertsClosed() public {
        uint256 id = _create();
        vm.startPrank(funder);
        vault.close(id);
        vm.expectRevert(AllotVault.AllowanceClosed.selector);
        vault.addMerchant(id, other);
        vm.stopPrank();
    }

    function test_AddMerchant_RevertsZeroAddress() public {
        uint256 id = _create();
        vm.prank(funder);
        vm.expectRevert(AllotVault.InvalidMerchant.selector);
        vault.addMerchant(id, address(0));
    }

    function test_AddMerchant_RevertsAlreadyApproved() public {
        uint256 id = _create();
        vm.prank(funder);
        vm.expectRevert(AllotVault.MerchantAlreadyApproved.selector);
        vault.addMerchant(id, merchant);
    }

    function test_AddMerchant_RevertsMaxReached() public {
        vm.prank(funder);
        uint256 id = vault.createAllowance(recipient, "p", "c", AMOUNT, LIMIT, expiry, _merchantList(49));
        vm.startPrank(funder);
        vault.addMerchant(id, other); // 50th
        vm.expectRevert(AllotVault.MaxMerchantsReached.selector);
        vault.addMerchant(id, merchant);
        vm.stopPrank();
        assertEq(vault.getMerchants(id).length, 50);
    }

    // ------------------------------------------------------------ removeMerchant

    function test_RemoveMerchant_Success() public {
        uint256 id = _create();
        vm.expectEmit(true, true, false, true, address(vault));
        emit AllotVault.MerchantRemoved(id, merchant);
        vm.prank(funder);
        vault.removeMerchant(id, merchant);
        assertFalse(vault.isMerchantApproved(id, merchant));
        assertTrue(vault.isMerchantApproved(id, merchant2));
        assertEq(vault.getMerchants(id).length, 1);
    }

    function test_RemoveMerchant_AllowedWhilePaused() public {
        uint256 id = _create();
        vm.startPrank(funder);
        vault.pause(id);
        vault.removeMerchant(id, merchant);
        vm.stopPrank();
        assertFalse(vault.isMerchantApproved(id, merchant));
    }

    function test_RemoveMerchant_ThenReAddWorks() public {
        uint256 id = _create();
        vm.startPrank(funder);
        vault.removeMerchant(id, merchant);
        vault.addMerchant(id, merchant);
        vm.stopPrank();
        assertTrue(vault.isMerchantApproved(id, merchant));
    }

    function test_RemoveMerchant_RevertsUnknownAllowance() public {
        vm.prank(funder);
        vm.expectRevert(AllotVault.AllowanceNotFound.selector);
        vault.removeMerchant(99, merchant);
    }

    function test_RemoveMerchant_RevertsNonFunder() public {
        uint256 id = _create();
        vm.prank(other);
        vm.expectRevert(AllotVault.NotFunder.selector);
        vault.removeMerchant(id, merchant);
    }

    function test_RemoveMerchant_RevertsClosed() public {
        uint256 id = _create();
        vm.startPrank(funder);
        vault.close(id);
        vm.expectRevert(AllotVault.AllowanceClosed.selector);
        vault.removeMerchant(id, merchant);
        vm.stopPrank();
    }

    function test_RemoveMerchant_RevertsZeroAddress() public {
        uint256 id = _create();
        vm.prank(funder);
        vm.expectRevert(AllotVault.InvalidMerchant.selector);
        vault.removeMerchant(id, address(0));
    }

    function test_RemoveMerchant_RevertsNotApproved() public {
        uint256 id = _create();
        vm.prank(funder);
        vm.expectRevert(AllotVault.MerchantNotApproved.selector);
        vault.removeMerchant(id, other);
    }

    function test_RemoveLastMerchant_ThenSpendFails() public {
        uint256 id = _create();
        vm.startPrank(funder);
        vault.removeMerchant(id, merchant);
        vault.removeMerchant(id, merchant2);
        vm.stopPrank();
        assertEq(vault.getMerchants(id).length, 0);
        _expectSpendSigned(_sel(AllotVault.MerchantNotApproved.selector), id, merchant, 10e6, _ref(1), 1);
    }

    // ------------------------------------------------------------ views

    function test_Views_UnknownAllowance() public {
        vm.expectRevert(AllotVault.AllowanceNotFound.selector);
        vault.getAllowance(1);
        vm.expectRevert(AllotVault.AllowanceNotFound.selector);
        vault.getMerchants(1);
        assertFalse(vault.isMerchantApproved(1, merchant));
        assertFalse(vault.isNonceUsed(1, 0));
        assertFalse(vault.isOrderPaid(1, merchant, _ref(1)));
        assertEq(vault.getFunderAllowanceIds(funder).length, 0);
    }

    function test_Views_GetMerchantsReturnsApprovedSet() public {
        uint256 id = _create();
        address[] memory ms = vault.getMerchants(id);
        assertEq(ms.length, 2);
        assertTrue((ms[0] == merchant && ms[1] == merchant2) || (ms[0] == merchant2 && ms[1] == merchant));
    }

    function test_Views_NonceAndOrderFlags() public {
        uint256 id = _create();
        assertFalse(vault.isNonceUsed(id, 5));
        assertFalse(vault.isOrderPaid(id, merchant, _ref(1)));
        _spend(id, merchant, 10e6, _ref(1), 5);
        assertTrue(vault.isNonceUsed(id, 5));
        assertTrue(vault.usedNonces(id, 5));
        assertFalse(vault.isNonceUsed(id, 6));
        assertTrue(vault.isOrderPaid(id, merchant, _ref(1)));
        assertTrue(vault.orderPaid(id, merchant, _ref(1)));
        assertFalse(vault.isOrderPaid(id, merchant2, _ref(1)));
        assertFalse(vault.isOrderPaid(id + 1, merchant, _ref(1)));
    }

    // ------------------------------------------------------------ util

    function _str(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i; i < n; ++i) {
            b[i] = "a";
        }
        return string(b);
    }
}
