/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { fallback, http, createConfig } from 'wagmi'
import type { Transport } from 'viem'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arc.id, arc.rpcUrls.default.http[0])
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

/**
 * Arc RPC transport: every public endpoint the chain lists, tried in order, with
 * JSON-RPC batching so concurrent reads share one HTTP request. When an endpoint
 * rate limits, the fallback layer retries up to 3 times, 1 second apart, and moves
 * on to the next endpoint.
 */
function arcTransport(urls: readonly string[]): Transport {
  return fallback(
    urls.map((url) => http(url, { batch: { wait: 20 }, retryCount: 0 })),
    { retryCount: 3, retryDelay: 1000 },
  )
}

// Arc mainnet is the default chain; Arc Testnet stays available from the network selector.
export const config = createConfig({
  chains: [arc, arcTestnet, mainnet], // mainnet (Ethereum) needed for ENS resolution
  connectors: [injected()],
  batch: { multicall: true },
  transports: {
    [arcTestnet.id]: arcTransport(arcTestnet.rpcUrls.default.http),
    [arc.id]: arcTransport(arc.rpcUrls.default.http),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
