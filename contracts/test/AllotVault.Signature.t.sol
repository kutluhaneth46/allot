// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AllotVault} from "../AllotVault.sol";
import {AllotVaultTestBase} from "./AllotVault.Base.t.sol";
import {Wallet1271} from "./AllotVaultMocks.sol";

/// @notice Signature validity: tampering, replay, wrong signer, domain separation, ERC-1271.
contract AllotVaultSignatureTest is AllotVaultTestBase {
    uint256 internal constant SECP_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    uint256 internal id;
    function setUp() public override {
        super.setUp();
        id = _create();
    }

    function _signedBase() internal view returns (P memory p, bytes memory sig) {
        p = P(id, merchant, 50e6, _ref(1), 1, block.timestamp + 1 hours);
        sig = _sign(p);
    }

    function _invalid() internal pure returns (bytes memory) {
        return bytes.concat(AllotVault.InvalidSignature.selector);
    }

    // ------------------------------------------------------------ tampering

    function test_Sig_ValidBaselineAccepted() public {
        (P memory p, bytes memory sig) = _signedBase();
        _doSpend(p, sig);
        assertEq(usdc.balanceOf(merchant), 50e6);
    }

    function test_Sig_TamperedAmount() public {
        (P memory p, bytes memory sig) = _signedBase();
        p.amount = 49e6;
        _expectSpend(_invalid(), p, sig);
        p.amount = 51e6;
        _expectSpend(_invalid(), p, sig);
    }

    function test_Sig_TamperedOrderRef() public {
        (P memory p, bytes memory sig) = _signedBase();
        p.ref = _ref(2);
        _expectSpend(_invalid(), p, sig);
    }

    function test_Sig_TamperedNonce() public {
        (P memory p, bytes memory sig) = _signedBase();
        p.nonce = 2;
        _expectSpend(_invalid(), p, sig);
    }

    function test_Sig_TamperedDeadline() public {
        (P memory p, bytes memory sig) = _signedBase();
        p.deadline += 1;
        _expectSpend(_invalid(), p, sig);
    }

    function test_Sig_TamperedAllowanceId() public {
        uint256 id2 = _create(); // same recipient, same merchants
        (P memory p, bytes memory sig) = _signedBase();
        p.id = id2;
        _expectSpend(_invalid(), p, sig);
        // the original id still accepts it
        p.id = id;
        _doSpend(p, sig);
    }

    function test_Sig_SignedForDifferentMerchantThanSubmitted() public {
        // both merchants are approved, so only the signature binds the destination
        P memory signedFor = _p(id, merchant2, 50e6, _ref(1), 1);
        bytes memory sig = _sign(signedFor);
        // fresh struct: memory structs are references, so `submitted = signedFor` would alias
        P memory submitted = P(id, merchant, 50e6, _ref(1), 1, signedFor.deadline);
        _expectSpend(_invalid(), submitted, sig);
        assertEq(usdc.balanceOf(merchant), 0);
        // and the intended merchant is paid when submitted correctly
        _doSpend(signedFor, sig);
        assertEq(usdc.balanceOf(merchant2), 50e6);
    }

    // ------------------------------------------------------------ replay

    function test_Sig_ReplaySameSignatureReverts() public {
        (P memory p, bytes memory sig) = _signedBase();
        _doSpend(p, sig);
        _expectSpend(_sel(AllotVault.NonceAlreadyUsed.selector), p, sig);
        assertEq(usdc.balanceOf(merchant), 50e6);
        assertEq(_alw(id).remaining, AMOUNT - 50e6);
    }

    // ------------------------------------------------------------ wrong signer

    function test_Sig_FromNonRecipientReverts() public {
        (, uint256 otherPk) = makeAddrAndKey("attacker");
        P memory p = _p(id, merchant, 50e6, _ref(1), 1);
        bytes memory sig = _signWith(otherPk, p);
        _expectSpend(_invalid(), p, sig);
    }

    function test_Sig_FromFunderReverts() public {
        (, uint256 funderPk) = makeAddrAndKey("funder-key");
        P memory p = _p(id, merchant, 50e6, _ref(1), 1);
        bytes memory sig = _signWith(funderPk, p);
        _expectSpend(_invalid(), p, sig);
    }

    function test_Sig_FromMerchantReverts() public {
        (address m, uint256 mPk) = makeAddrAndKey("merchant-self");
        vm.prank(funder);
        vault.addMerchant(id, m);
        P memory p = _p(id, m, 50e6, _ref(1), 1);
        bytes memory sig = _signWith(mPk, p);
        _expectSpend(_invalid(), p, sig);
    }

    // ------------------------------------------------------------ domain separation

    function test_Sig_ForOtherChainIdReverts() public {
        uint256 orig = block.chainid;
        P memory p = _p(id, merchant, 50e6, _ref(1), 1);
        bytes32 digestHere = vault.hashSpend(p.id, p.merchant, p.amount, p.ref, p.nonce, p.deadline);
        vm.chainId(orig + 1);
        bytes32 digestThere = vault.hashSpend(p.id, p.merchant, p.amount, p.ref, p.nonce, p.deadline);
        assertTrue(digestHere != digestThere);
        bytes memory sig = _sign(p); // signed under the other chain id
        vm.chainId(orig);
        _expectSpend(_invalid(), p, sig);
        // the same-chain signature works
        _doSpend(p, _sign(p));
    }

    function test_Sig_ForOtherVaultDomainReverts() public {
        AllotVault vault2 = new AllotVault();
        vm.startPrank(funder);
        usdc.approve(address(vault2), type(uint256).max);
        uint256 id2 = vault2.createAllowance(recipient, "Groceries", "Food", AMOUNT, LIMIT, expiry, _merchants2());
        vm.stopPrank();
        assertEq(id2, id); // identical ids, only the verifying contract differs

        P memory p = _p(id, merchant, 50e6, _ref(1), 1);
        bytes32 d2 = vault2.hashSpend(p.id, p.merchant, p.amount, p.ref, p.nonce, p.deadline);
        assertTrue(d2 != vault.hashSpend(p.id, p.merchant, p.amount, p.ref, p.nonce, p.deadline));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(recipientPk, d2);
        bytes memory sig = abi.encodePacked(r, s, v);

        // valid on vault2 ...
        vm.prank(relayer);
        vault2.spend(p.id, p.merchant, p.amount, p.ref, p.nonce, p.deadline, sig);
        assertEq(usdc.balanceOf(merchant), 50e6);
        // ... but not accepted by the original vault
        _expectSpend(_invalid(), p, sig);
    }

    // ------------------------------------------------------------ malformed signatures

    function test_Sig_EmptySignatureReverts() public {
        P memory p = _p(id, merchant, 50e6, _ref(1), 1);
        _expectSpend(_invalid(), p, hex"");
    }

    function test_Sig_ShortSignatureReverts() public {
        P memory p = _p(id, merchant, 50e6, _ref(1), 1);
        _expectSpend(_invalid(), p, hex"deadbeef");
    }

    function test_Sig_TooLongSignatureReverts() public {
        (P memory p, bytes memory sig) = _signedBase();
        _expectSpend(_invalid(), p, bytes.concat(sig, hex"00"));
    }

    function test_Sig_AllZeroSignatureReverts() public {
        P memory p = _p(id, merchant, 50e6, _ref(1), 1);
        _expectSpend(_invalid(), p, new bytes(65));
    }

    function test_Sig_BadVReverts() public {
        (P memory p, bytes memory sig) = _signedBase();
        sig[64] = bytes1(uint8(29));
        _expectSpend(_invalid(), p, sig);
    }

    function test_Sig_HighSMalleatedReverts() public {
        P memory p = _p(id, merchant, 50e6, _ref(1), 1);
        bytes32 digest = vault.hashSpend(p.id, p.merchant, p.amount, p.ref, p.nonce, p.deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(recipientPk, digest);
        bytes32 s2 = bytes32(SECP_N - uint256(s));
        uint8 v2 = v == 27 ? 28 : 27;
        bytes memory malleated = abi.encodePacked(r, s2, v2);
        _expectSpend(_invalid(), p, malleated);
        // original form is fine
        _doSpend(p, abi.encodePacked(r, s, v));
    }

    function test_Sig_FailedValidationConsumesNothing() public {
        P memory p = _p(id, merchant, 50e6, _ref(1), 1);
        _expectSpend(_invalid(), p, hex"");
        assertFalse(vault.isNonceUsed(id, 1));
        assertFalse(vault.isOrderPaid(id, merchant, _ref(1)));
        // a correct signature with the same nonce / ref still works afterwards
        _doSpend(p, _sign(p));
    }

    // ------------------------------------------------------------ ERC-1271 contract recipient

    function _walletAllowance() internal returns (Wallet1271 w, uint256 wid) {
        w = new Wallet1271(recipient);
        wid = _createFor(address(w), AMOUNT, LIMIT, expiry);
    }

    function test_Sig_Erc1271ContractWalletSucceeds() public {
        (Wallet1271 w, uint256 wid) = _walletAllowance();
        // The wallet's validator accepts the EOA owner's ECDSA signature over the vault digest.
        P memory p = _p(wid, merchant, 60e6, _ref(1), 1);
        bytes memory sig = _sign(p);
        vm.expectEmit(true, true, true, true, address(vault));
        emit AllotVault.Spent(wid, merchant, _ref(1), address(w), 60e6, 1, AMOUNT - 60e6, relayer);
        _doSpend(p, sig);
        assertEq(usdc.balanceOf(merchant), 60e6);
        assertEq(_alw(wid).remaining, AMOUNT - 60e6);
    }

    function test_Sig_Erc1271WrongSignerReverts() public {
        (, uint256 wid) = _walletAllowance();
        (, uint256 otherPk) = makeAddrAndKey("attacker");
        P memory p = _p(wid, merchant, 60e6, _ref(1), 1);
        bytes memory sig = _signWith(otherPk, p);
        _expectSpend(_invalid(), p, sig);
    }

    function test_Sig_Erc1271WalletRejectsAllReverts() public {
        (Wallet1271 w, uint256 wid) = _walletAllowance();
        w.setRejectAll(true);
        P memory p = _p(wid, merchant, 60e6, _ref(1), 1);
        bytes memory sig = _sign(p);
        _expectSpend(_invalid(), p, sig);
    }

    function test_Sig_Erc1271MalformedSignatureReverts() public {
        (, uint256 wid) = _walletAllowance();
        P memory p = _p(wid, merchant, 60e6, _ref(1), 1);
        _expectSpend(_invalid(), p, hex"1234");
    }

    function test_Sig_Erc1271EoaSignatureOfWalletAddressNotAccepted() public {
        // allowance recipient is the wallet: a signature "from" the EOA that is not validated by the wallet fails
        (Wallet1271 w, uint256 wid) = _walletAllowance();
        w.setRejectAll(true);
        P memory p = _p(wid, merchant, 60e6, _ref(1), 1);
        bytes memory sig = _sign(p);
        _expectSpend(_invalid(), p, sig);
        w.setRejectAll(false);
        _doSpend(p, sig);
        assertEq(usdc.balanceOf(merchant), 60e6);
    }
}
