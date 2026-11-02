// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AllotVault} from "../AllotVault.sol";
import {MockUSDC} from "./AllotVaultMocks.sol";

abstract contract AllotVaultTestBase is Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    uint256 internal constant T0 = 1_700_000_000;
    uint256 internal constant AMOUNT = 1_000e6;
    uint256 internal constant LIMIT = 200e6;
    uint256 internal constant DURATION = 7 days;

    AllotVault internal vault;
    MockUSDC internal usdc;

    address internal recipient;
    uint256 internal recipientPk;
    address internal funder = makeAddr("funder");
    address internal merchant = makeAddr("merchant");
    address internal merchant2 = makeAddr("merchant2");
    address internal other = makeAddr("other");
    address internal relayer = makeAddr("relayer");
    uint64 internal expiry;

    struct P {
        uint256 id;
        address merchant;
        uint256 amount;
        bytes32 ref;
        uint256 nonce;
        uint256 deadline;
    }

    function setUp() public virtual {
        vm.warp(T0);
        MockUSDC mock = new MockUSDC();
        vm.etch(USDC_ADDR, address(mock).code);
        usdc = MockUSDC(USDC_ADDR);

        (recipient, recipientPk) = makeAddrAndKey("recipient");
        vault = new AllotVault();
        expiry = uint64(T0 + DURATION);

        usdc.mint(funder, 1_000_000e6);
        vm.prank(funder);
        usdc.approve(address(vault), type(uint256).max);
    }

    // ------------------------------------------------------------------ helpers

    function _merchants2() internal view returns (address[] memory m) {
        m = new address[](2);
        m[0] = merchant;
        m[1] = merchant2;
    }

    function _merchantList(uint256 n) internal pure returns (address[] memory m) {
        m = new address[](n);
        for (uint256 i; i < n; ++i) {
            m[i] = address(uint160(0x10000 + i));
        }
    }

    function _create() internal returns (uint256 id) {
        vm.prank(funder);
        id = vault.createAllowance(recipient, "Groceries", "Food", AMOUNT, LIMIT, expiry, _merchants2());
    }

    function _createFor(address recip, uint256 amount, uint256 limit, uint64 exp) internal returns (uint256 id) {
        vm.prank(funder);
        id = vault.createAllowance(recip, "Groceries", "Food", amount, limit, exp, _merchants2());
    }

    function _ref(uint256 n) internal pure returns (bytes32) {
        return keccak256(abi.encode("order", n));
    }

    function _p(uint256 id, address m, uint256 amount, bytes32 ref, uint256 nonce) internal view returns (P memory) {
        return P(id, m, amount, ref, nonce, block.timestamp + 1 hours);
    }

    function _signWith(uint256 pk, P memory p) internal view returns (bytes memory) {
        bytes32 digest = vault.hashSpend(p.id, p.merchant, p.amount, p.ref, p.nonce, p.deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _sign(P memory p) internal view returns (bytes memory) {
        return _signWith(recipientPk, p);
    }

    function _doSpend(P memory p, bytes memory sig) internal {
        vm.prank(relayer);
        vault.spend(p.id, p.merchant, p.amount, p.ref, p.nonce, p.deadline, sig);
    }

    function _expectSpend(bytes memory err, P memory p, bytes memory sig) internal {
        vm.expectRevert(err);
        vm.prank(relayer);
        vault.spend(p.id, p.merchant, p.amount, p.ref, p.nonce, p.deadline, sig);
    }

    /// @dev Signs with the recipient key and submits through the relayer.
    function _spend(uint256 id, address m, uint256 amount, bytes32 ref, uint256 nonce) internal {
        P memory p = _p(id, m, amount, ref, nonce);
        _doSpend(p, _sign(p));
    }

    function _expectSpendSigned(bytes memory err, uint256 id, address m, uint256 amount, bytes32 ref, uint256 nonce)
        internal
    {
        P memory p = _p(id, m, amount, ref, nonce);
        bytes memory sig = _sign(p);
        _expectSpend(err, p, sig);
    }

    function _alw(uint256 id) internal view returns (AllotVault.Allowance memory) {
        return vault.getAllowance(id);
    }

    function _sel(bytes4 s) internal pure returns (bytes memory) {
        return bytes.concat(s);
    }
}
