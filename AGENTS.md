# Allot

> Built with Arc Studio - money-powered apps in minutes

Project memory for agents and humans extending this app.

## What This App Does

Allot: purpose restricted USDC allowances on Arc. Funders lock USDC for a purpose and approve merchants; recipients pay merchants by scanning a QR code and signing an EIP-712 `Spend` authorization; USDC moves from the vault to the merchant. Unspent funds return to the funder on close or after expiry.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, react-router-dom, framer-motion
- Web3: wagmi v2, viem v2 (`arc` default, `arcTestnet` selectable), ConnectKit
- QR: `qrcode` (generate), `jsqr` (camera scan)
- Contracts: Solidity 0.8.28 + Foundry. Source `contracts/AllotVault.sol`, tests `contracts/test/AllotVault*.t.sol` (152 tests). `bun run contracts:build`, `bun run contracts:test`.
- Token: official Arc USDC `0x3600000000000000000000000000000000000000` (6 decimals), hardcoded in the vault.

## Deployments

- Arc Testnet (5042002): `AllotVault` at `0x30d0f23ee4fdb88e27c2396f0f96a8c2603c5996`, deploy tx `0xd8ad6665a26ed29892c390f4712f7b313eb9dbf85a4d399a37ae9a122af24c89`, block 70057064.
- Wired through `.env`: `VITE_ALLOT_VAULT_ADDRESS_TESTNET`, `VITE_ALLOT_VAULT_DEPLOY_BLOCK_TESTNET`. Read in `src/lib/chains.ts`.
- Arc mainnet (5042): `AllotVault` at `0x6b60240482afc53a5cdc0293756d863c4c7380d5`, deploy tx `0x49d813941ce39b86e7cd15da6b520e04a5c08255686d4125b25d9633d4058a22`, block 29144211. Deployed by the user from their own wallet, outside Arc Studio. Wired through `VITE_ALLOT_VAULT_ADDRESS_MAINNET` and `VITE_ALLOT_VAULT_DEPLOY_BLOCK_MAINNET`. Not independently audited.
- Default network is Arc mainnet. The header network selector switches to Arc Testnet (choice saved in localStorage). `src/lib/chains.ts` holds the active network as live bindings; `NetworkProvider` remounts the tree and clears cached reads on switch.

## Contract notes

- EIP-712 domain: name `AllotVault`, version `1`. Type `Spend(uint256 allowanceId,address merchant,uint256 amount,bytes32 orderRef,uint256 nonce,uint256 deadline)`. Signer is the allowance recipient (EOA or ERC-1271). Anyone may submit.
- Nonces and order references are scoped per allowance (a review fix: global order refs could be squatted).
- Order reference is a human string (max 32 chars) stored as bytes32 (`src/lib/format.ts`).

## Key Files

- `src/App.tsx` routes: `/`, `/funder`, `/recipient`, `/merchant`, `/pay` (QR landing), `/receipt/:txHash`
- `src/lib/payment.ts` QR payment request and signed authorization encoding
- `src/lib/logs.ts` bounded `eth_getLogs` scan from the deploy block (RPC rejects huge ranges)
- `src/lib/allotVaultAbi.ts` generated from the Foundry artifact; regenerate if the contract changes
- `src/hooks/useVault.ts`, `src/hooks/useSendTx.ts` reads and transaction runner

## Share links

- Use `buildShareLink` / `getShareBase` from `src/lib/share.ts` for every link a user copies or puts in a QR code. Keep `installShareSync()` in `src/main.tsx`.
- Never put a secret in a URL path or query.

## To Run

```bash
bun install
bun run dev
```
