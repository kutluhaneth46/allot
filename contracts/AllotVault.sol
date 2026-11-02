// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title AllotVault
/// @notice Purpose-labelled USDC allowances with funder-approved merchants and signed payments.
/// @dev Purpose and category are descriptive labels; merchant approval is the on-chain restriction.
///      All amounts are in Arc USDC base units (6 decimals). Anyone may submit a recipient's
///      authorization, but the submitter pays transaction gas. SignatureChecker uses ECDSA for
///      EOAs and ERC-1271 for contract recipients. There are no administrative privileges.
contract AllotVault is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    address public constant USDC_ADDRESS = 0x3600000000000000000000000000000000000000;
    IERC20 public constant USDC = IERC20(USDC_ADDRESS);
    uint256 public constant MAX_MERCHANTS = 50;
    bytes32 public constant SPEND_TYPEHASH = keccak256(
        "Spend(uint256 allowanceId,address merchant,uint256 amount,bytes32 orderRef,uint256 nonce,uint256 deadline)"
    );

    enum Status { Active, Paused, Closed }

    struct Allowance {
        address funder;
        address recipient;
        uint64 expiry;
        Status status;
        uint256 limitPerPurchase;
        uint256 funded;
        uint256 spent;
        uint256 remaining;
        string purpose;
        string category;
    }

    uint256 public nextAllowanceId = 1;
    mapping(uint256 allowanceId => Allowance) private _allowances;
    mapping(uint256 allowanceId => EnumerableSet.AddressSet) private _merchants;
    mapping(uint256 allowanceId => mapping(uint256 nonce => bool)) public usedNonces;
    mapping(uint256 allowanceId => mapping(address merchant => mapping(bytes32 orderRef => bool))) public orderPaid;
    mapping(address funder => uint256[]) private _funderAllowanceIds;
    mapping(address recipient => uint256[]) private _recipientAllowanceIds;

    error AllowanceNotFound();
    error NotFunder();
    error AllowancePaused();
    error AllowanceClosed();
    error NotPaused();
    error AllowanceExpired();
    error SignatureExpired();
    error InvalidRecipient();
    error InvalidAmount();
    error InvalidPerPurchaseLimit();
    error InvalidExpiry();
    error InvalidPurposeLength();
    error InvalidCategoryLength();
    error InvalidMerchantCount();
    error InvalidMerchant();
    error MerchantAlreadyApproved();
    error MerchantNotApproved();
    error MaxMerchantsReached();
    error InvalidOrderRef();
    error ExceedsPerPurchaseLimit();
    error InsufficientBalance();
    error NonceAlreadyUsed();
    error OrderAlreadyPaid();
    error InvalidSignature();
    error NotExpired();
    error NothingToReclaim();

    event AllowanceCreated(
        uint256 indexed id,
        address indexed funder,
        address indexed recipient,
        string purpose,
        string category,
        uint256 amount,
        uint256 limitPerPurchase,
        uint64 expiry
    );
    event MerchantAdded(uint256 indexed id, address indexed merchant);
    event MerchantRemoved(uint256 indexed id, address indexed merchant);
    event Spent(
        uint256 indexed id,
        address indexed merchant,
        bytes32 indexed orderRef,
        address recipient,
        uint256 amount,
        uint256 nonce,
        uint256 remaining,
        address submitter
    );
    event AllowancePausedEvent(uint256 indexed id, address indexed funder);
    event AllowanceResumed(uint256 indexed id, address indexed funder);
    event AllowanceClosedEvent(uint256 indexed id, address indexed funder, uint256 refunded);
    event AllowanceReclaimed(uint256 indexed id, address indexed funder, uint256 amount);

    /// @notice Initializes the AllotVault version 1 signing domain without an administrator.
    constructor() EIP712("AllotVault", "1") {}

    /// @notice Locks USDC for a recipient at the specified approved merchants.
    /// @dev The funder must first approve this vault to transfer `amount` USDC.
    /// @param recipient Wallet authorized to sign spends, including ERC-1271 wallets.
    /// @param purpose Descriptive purpose, between 1 and 64 bytes.
    /// @param category Descriptive category, at most 32 bytes.
    /// @param amount Funding in USDC base units.
    /// @param limitPerPurchase Maximum base units payable per authorization.
    /// @param expiry Timestamp at which spending stops (exclusive spending boundary).
    /// @param merchants Between 1 and 50 unique, nonzero merchant addresses.
    /// @return id The newly allocated allowance ID.
    function createAllowance(
        address recipient,
        string calldata purpose,
        string calldata category,
        uint256 amount,
        uint256 limitPerPurchase,
        uint64 expiry,
        address[] calldata merchants
    ) external nonReentrant returns (uint256 id) {
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (limitPerPurchase == 0 || limitPerPurchase > amount) revert InvalidPerPurchaseLimit();
        if (expiry <= block.timestamp) revert InvalidExpiry();
        if (bytes(purpose).length == 0 || bytes(purpose).length > 64) revert InvalidPurposeLength();
        if (bytes(category).length > 32) revert InvalidCategoryLength();
        if (merchants.length == 0 || merchants.length > MAX_MERCHANTS) revert InvalidMerchantCount();

        // Validate the entire list before recording the allowance or interacting with USDC.
        for (uint256 i; i < merchants.length; ++i) {
            if (merchants[i] == address(0)) revert InvalidMerchant();
            for (uint256 j; j < i; ++j) {
                if (merchants[i] == merchants[j]) revert MerchantAlreadyApproved();
            }
        }

        id = nextAllowanceId++;
        _allowances[id] = Allowance({
            funder: msg.sender,
            recipient: recipient,
            expiry: expiry,
            status: Status.Active,
            limitPerPurchase: limitPerPurchase,
            funded: amount,
            spent: 0,
            remaining: amount,
            purpose: purpose,
            category: category
        });
        _funderAllowanceIds[msg.sender].push(id);
        _recipientAllowanceIds[recipient].push(id);
        for (uint256 i; i < merchants.length; ++i) {
            _merchants[id].add(merchants[i]);
        }

        USDC.safeTransferFrom(msg.sender, address(this), amount);
        emit AllowanceCreated(id, msg.sender, recipient, purpose, category, amount, limitPerPurchase, expiry);
        for (uint256 i; i < merchants.length; ++i) {
            emit MerchantAdded(id, merchants[i]);
        }
    }

    /// @notice Approves a merchant; only the funder may call, including while paused.
    /// @param id Existing, non-closed allowance ID.
    /// @param merchant Nonzero merchant address not already approved.
    function addMerchant(uint256 id, address merchant) external nonReentrant {
        Allowance storage allowance = _getFunderAllowance(id);
        if (allowance.status == Status.Closed) revert AllowanceClosed();
        if (merchant == address(0)) revert InvalidMerchant();
        if (_merchants[id].contains(merchant)) revert MerchantAlreadyApproved();
        if (_merchants[id].length() >= MAX_MERCHANTS) revert MaxMerchantsReached();
        _merchants[id].add(merchant);
        emit MerchantAdded(id, merchant);
    }

    /// @notice Removes a merchant; only the funder may call, including while paused.
    /// @dev Removing the final merchant is permitted and prevents all spending.
    /// @param id Existing, non-closed allowance ID.
    /// @param merchant Currently approved, nonzero merchant address.
    function removeMerchant(uint256 id, address merchant) external nonReentrant {
        Allowance storage allowance = _getFunderAllowance(id);
        if (allowance.status == Status.Closed) revert AllowanceClosed();
        if (merchant == address(0)) revert InvalidMerchant();
        if (!_merchants[id].remove(merchant)) revert MerchantNotApproved();
        emit MerchantRemoved(id, merchant);
    }

    /// @notice Pays an approved merchant using the recipient's EIP-712 authorization.
    /// @dev Any caller may submit; the signature does not grant rights to the submitter.
    ///      Nonces and order references are allowance-scoped, so one recipient can never
    ///      consume another recipient's order reference.
    /// @param id Allowance ID (the signed `allowanceId`).
    /// @param merchant Approved destination for the payment.
    /// @param amount Payment in USDC base units.
    /// @param orderRef Nonzero order reference not yet paid to this merchant from this allowance.
    /// @param nonce Previously unused allowance nonce.
    /// @param deadline Last timestamp at which the authorization is accepted (inclusive).
    /// @param signature Recipient's ECDSA signature or ERC-1271 signature data.
    function spend(
        uint256 id,
        address merchant,
        uint256 amount,
        bytes32 orderRef,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        Allowance storage allowance = _getAllowance(id);
        if (allowance.status == Status.Paused) revert AllowancePaused();
        if (allowance.status == Status.Closed) revert AllowanceClosed();
        if (block.timestamp >= allowance.expiry) revert AllowanceExpired();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (orderRef == bytes32(0)) revert InvalidOrderRef();
        if (amount == 0) revert InvalidAmount();
        if (!_merchants[id].contains(merchant)) revert MerchantNotApproved();
        if (amount > allowance.limitPerPurchase) revert ExceedsPerPurchaseLimit();
        if (amount > allowance.remaining) revert InsufficientBalance();
        if (usedNonces[id][nonce]) revert NonceAlreadyUsed();
        if (orderPaid[id][merchant][orderRef]) revert OrderAlreadyPaid();
        if (!SignatureChecker.isValidSignatureNow(
            allowance.recipient, _hashSpend(id, merchant, amount, orderRef, nonce, deadline), signature
        )) revert InvalidSignature();

        usedNonces[id][nonce] = true;
        orderPaid[id][merchant][orderRef] = true;
        allowance.remaining -= amount;
        allowance.spent += amount;

        USDC.safeTransfer(merchant, amount);
        emit Spent(id, merchant, orderRef, allowance.recipient, amount, nonce, allowance.remaining, msg.sender);
    }

    /// @notice Pauses an active allowance; only its funder may call.
    /// @param id Allowance to pause, whether or not it has expired.
    function pause(uint256 id) external nonReentrant {
        Allowance storage allowance = _getFunderAllowance(id);
        if (allowance.status == Status.Closed) revert AllowanceClosed();
        if (allowance.status == Status.Paused) revert AllowancePaused();
        allowance.status = Status.Paused;
        emit AllowancePausedEvent(id, msg.sender);
    }

    /// @notice Resumes a paused allowance; expiry still prevents spending.
    /// @param id Paused allowance belonging to the caller.
    function resume(uint256 id) external nonReentrant {
        Allowance storage allowance = _getFunderAllowance(id);
        if (allowance.status == Status.Closed) revert AllowanceClosed();
        if (allowance.status != Status.Paused) revert NotPaused();
        allowance.status = Status.Active;
        emit AllowanceResumed(id, msg.sender);
    }

    /// @notice Closes an allowance at any time and refunds its unspent USDC to its funder.
    /// @dev A zero-balance allowance can also be closed. Only its funder may call.
    /// @param id Non-closed allowance ID.
    function close(uint256 id) external nonReentrant {
        Allowance storage allowance = _getFunderAllowance(id);
        if (allowance.status == Status.Closed) revert AllowanceClosed();
        uint256 refunded = allowance.remaining;
        allowance.status = Status.Closed;
        allowance.remaining = 0;
        if (refunded != 0) USDC.safeTransfer(allowance.funder, refunded);
        emit AllowanceClosedEvent(id, allowance.funder, refunded);
    }

    /// @notice Reclaims unspent USDC at or after expiry and closes the allowance.
    /// @param id Non-closed, expired allowance belonging to the caller with funds remaining.
    function reclaim(uint256 id) external nonReentrant {
        Allowance storage allowance = _getFunderAllowance(id);
        if (allowance.status == Status.Closed) revert AllowanceClosed();
        if (block.timestamp < allowance.expiry) revert NotExpired();
        uint256 amount = allowance.remaining;
        if (amount == 0) revert NothingToReclaim();
        allowance.status = Status.Closed;
        allowance.remaining = 0;
        USDC.safeTransfer(allowance.funder, amount);
        emit AllowanceReclaimed(id, allowance.funder, amount);
    }

    /// @notice Returns an existing allowance, including its labels and accounting.
    /// @dev `funded` and `spent` remain historical totals after closure or reclaim.
    function getAllowance(uint256 id) external view returns (Allowance memory) {
        return _getAllowance(id);
    }

    /// @notice Returns the approved merchants of an existing allowance; ordering is not stable.
    function getMerchants(uint256 id) external view returns (address[] memory) {
        _getAllowance(id);
        return _merchants[id].values();
    }

    /// @notice Reports merchant membership; returns false for an unknown allowance.
    function isMerchantApproved(uint256 id, address merchant) external view returns (bool) {
        return _merchants[id].contains(merchant);
    }

    /// @notice Reports whether an allowance nonce was consumed; unknown IDs return false.
    function isNonceUsed(uint256 id, uint256 nonce) external view returns (bool) {
        return usedNonces[id][nonce];
    }

    /// @notice Reports whether an order reference was already paid to this merchant from this allowance.
    function isOrderPaid(uint256 id, address merchant, bytes32 orderRef) external view returns (bool) {
        return orderPaid[id][merchant][orderRef];
    }

    /// @notice Returns all allowance IDs created by a funder, including closed allowances.
    function getFunderAllowanceIds(address funder) external view returns (uint256[] memory) {
        return _funderAllowanceIds[funder];
    }

    /// @notice Returns all allowance IDs assigned to a recipient, including closed allowances.
    function getRecipientAllowanceIds(address recipient) external view returns (uint256[] memory) {
        return _recipientAllowanceIds[recipient];
    }

    /// @notice Returns the full EIP-712 digest to authorize a spend, without validating its fields.
    /// @dev The domain binds signatures to this vault and the current chain ID.
    function hashSpend(
        uint256 allowanceId,
        address merchant,
        uint256 amount,
        bytes32 orderRef,
        uint256 nonce,
        uint256 deadline
    ) external view returns (bytes32 digest) {
        return _hashSpend(allowanceId, merchant, amount, orderRef, nonce, deadline);
    }

    /// @notice Returns the current chain's AllotVault version 1 EIP-712 domain separator.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function _hashSpend(
        uint256 allowanceId,
        address merchant,
        uint256 amount,
        bytes32 orderRef,
        uint256 nonce,
        uint256 deadline
    ) private view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            SPEND_TYPEHASH, allowanceId, merchant, amount, orderRef, nonce, deadline
        )));
    }

    function _getAllowance(uint256 id) private view returns (Allowance storage allowance) {
        allowance = _allowances[id];
        if (allowance.funder == address(0)) revert AllowanceNotFound();
    }

    function _getFunderAllowance(uint256 id) private view returns (Allowance storage allowance) {
        allowance = _getAllowance(id);
        if (allowance.funder != msg.sender) revert NotFunder();
    }
}
