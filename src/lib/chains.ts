import type { Address, Chain } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { buildAddressExplorerUrl, buildTxExplorerUrl, getUsdc, requireChain } from '@/onchain-facts'

const env = import.meta.env as Record<string, string | undefined>

function readAddress(value: string | undefined): Address | undefined {
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : undefined
}

export interface NetworkConfig {
  chain: Chain
  label: string
  isMainnet: boolean
  vault: Address | undefined
  fromBlock: bigint
}

/** Networks Allot runs on, mainnet first. Vault addresses come from `.env`. */
export const NETWORKS: Record<number, NetworkConfig> = {
  [arc.id]: {
    chain: arc,
    label: 'Arc',
    isMainnet: true,
    vault: readAddress(env.VITE_ALLOT_VAULT_ADDRESS_MAINNET),
    fromBlock: BigInt(env.VITE_ALLOT_VAULT_DEPLOY_BLOCK_MAINNET ?? '0'),
  },
  [arcTestnet.id]: {
    chain: arcTestnet,
    label: 'Arc Testnet',
    isMainnet: false,
    vault: readAddress(env.VITE_ALLOT_VAULT_ADDRESS_TESTNET),
    fromBlock: BigInt(env.VITE_ALLOT_VAULT_DEPLOY_BLOCK_TESTNET ?? '0'),
  },
}

export const NETWORK_LIST: NetworkConfig[] = [NETWORKS[arc.id], NETWORKS[arcTestnet.id]]

/** Arc mainnet is the default. The visitor's last choice is remembered on this device. */
export const DEFAULT_NETWORK_ID: number = arc.id
const STORAGE_KEY = 'allot:network'

function readStoredNetwork(): number {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY))
    if (stored in NETWORKS) return stored
  } catch {
    // Storage can be blocked inside embedded previews; fall back to the default.
  }
  return DEFAULT_NETWORK_ID
}

function usdcFor(chainId: number): Address {
  const usdc = getUsdc(chainId)
  if (!usdc) throw new Error(`USDC is not registered for chain ${chainId}`)
  return usdc.address as Address
}

// The active network. These are live bindings: setActiveNetwork() updates them, and the
// app remounts (see NetworkProvider) so every component reads the new values.
export let CHAIN_ID: number = DEFAULT_NETWORK_ID
export let ACTIVE_CHAIN: Chain = arc
export let IS_MAINNET = true
export let VAULT_ADDRESS: Address | undefined
/** Non-optional alias for call sites already guarded by the Gate component. */
export let VAULT: Address = '0x0000000000000000000000000000000000000000'
export let VAULT_FROM_BLOCK = 0n
export let USDC_ADDRESS: Address = usdcFor(DEFAULT_NETWORK_ID)

export function setActiveNetwork(chainId: number, persist = true): void {
  const network = NETWORKS[chainId]
  if (!network) return
  CHAIN_ID = chainId
  ACTIVE_CHAIN = network.chain
  IS_MAINNET = network.isMainnet
  VAULT_ADDRESS = network.vault
  VAULT = network.vault as Address
  VAULT_FROM_BLOCK = network.fromBlock
  USDC_ADDRESS = usdcFor(chainId)
  if (persist) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(chainId))
    } catch {
      // Ignore blocked storage.
    }
  }
}

setActiveNetwork(readStoredNetwork(), false)

export const explorerTx = (hash: string) => buildTxExplorerUrl(CHAIN_ID, hash)
export const explorerAddress = (address: string) => buildAddressExplorerUrl(CHAIN_ID, address)

export const ARC_LINKS = {
  site: 'https://www.arc.io',
  docs: 'https://docs.arc.io',
  get explorer() {
    return requireChain(CHAIN_ID).explorerBase
  },
}

/** Set VITE_GITHUB_REPO_URL to the Allot repository. Falls back to the Circle GitHub org. */
export const GITHUB_URL = env.VITE_GITHUB_REPO_URL || 'https://github.com/circlefin'
