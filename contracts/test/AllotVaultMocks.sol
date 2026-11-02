// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @dev Minimal 6-decimal ERC20 with a public mint helper. All state is in storage mappings (no
///      constructor reliance) so its runtime code can be etched at the canonical USDC address.
contract MockUSDC {
    error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed);
    error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    function decimals() external pure returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) public virtual returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public virtual returns (bool) {
        _spendAllowance(from, amount);
        _move(from, to, amount);
        return true;
    }

    function _spendAllowance(address from, uint256 amount) internal {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            if (a < amount) revert ERC20InsufficientAllowance(msg.sender, a, amount);
            allowance[from][msg.sender] = a - amount;
        }
    }

    function _move(address from, address to, uint256 amount) internal {
        uint256 b = balanceOf[from];
        if (b < amount) revert ERC20InsufficientBalance(from, b, amount);
        balanceOf[from] = b - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

interface IHookReceiver {
    function onTokenReceived() external;
    function onTokenSent() external;
}

/// @dev Same storage layout as MockUSDC, but calls back into contract recipients (on transfer) and
///      contract senders (on transferFrom) AFTER balances move. Etched over MockUSDC in reentrancy tests.
contract HookUSDC is MockUSDC {
    function transfer(address to, uint256 amount) public override returns (bool) {
        _move(msg.sender, to, amount);
        if (to.code.length > 0) IHookReceiver(to).onTokenReceived();
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _spendAllowance(from, amount);
        _move(from, to, amount);
        if (from.code.length > 0) IHookReceiver(from).onTokenSent();
        return true;
    }
}

/// @dev Acts as funder and/or merchant. When a token hook fires it performs one armed call against
///      `target` and records the outcome; optionally bubbles the revert.
contract ReentrantActor is IHookReceiver {
    address public target;
    bytes public data;
    bool public bubble;
    bool public attempted;
    bool public lastOk;
    bytes public lastRet;

    function arm(address t, bytes calldata d, bool b) external {
        target = t;
        data = d;
        bubble = b;
        attempted = false;
        lastOk = false;
        delete lastRet;
    }

    function onTokenReceived() external override {
        _go();
    }

    function onTokenSent() external override {
        _go();
    }

    function _go() internal {
        if (target == address(0) || attempted) return;
        attempted = true;
        (bool ok, bytes memory ret) = target.call(data);
        lastOk = ok;
        lastRet = ret;
        if (!ok && bubble) {
            assembly {
                revert(add(ret, 0x20), mload(ret))
            }
        }
    }

    /// @dev Lets the actor behave as a funder: forwards an arbitrary call from this contract.
    function exec(address t, bytes calldata d) external returns (bytes memory) {
        (bool ok, bytes memory ret) = t.call(d);
        if (!ok) {
            assembly {
                revert(add(ret, 0x20), mload(ret))
            }
        }
        return ret;
    }
}

/// @dev ERC-1271 wallet owned by an EOA key.
contract Wallet1271 {
    address public immutable signer;
    bool public rejectAll;

    constructor(address s) {
        signer = s;
    }

    function setRejectAll(bool r) external {
        rejectAll = r;
    }

    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        if (!rejectAll) {
            (address r, ECDSA.RecoverError e,) = ECDSA.tryRecover(hash, sig);
            if (e == ECDSA.RecoverError.NoError && r == signer) return 0x1626ba7e;
        }
        return 0xffffffff;
    }
}
