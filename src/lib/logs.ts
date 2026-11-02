import { getAbiItem } from 'viem'
import type { Address, Hex, PublicClient } from 'viem'
import { allotVaultAbi } from './allotVaultAbi'
import { VAULT_ADDRESS, VAULT_FROM_BLOCK } from './chains'
import { isRateLimitError } from './format'

const spentEvent = getAbiItem({ abi: allotVaultAbi, name: 'Spent' })

export interface SpentRecord {
  allowanceId: bigint
  merchant: Address
  orderRef: Hex
  recipient: Address
  amount: bigint
  nonce: bigint
  remaining: bigint
  submitter: Address
  txHash: Hex
  blockNumber: bigint
  logIndex: number
  timestamp: number
}

const MIN_WINDOW = 1_000n
// Learned at runtime: the largest block range the RPC accepted for eth_getLogs.
const knownWindows = new Map<number, bigint>()
const timestamps = new Map<string, number>()

async function blockTimestamp(client: PublicClient, blockNumber: bigint): Promise<number> {
  const key = `${client.chain?.id}:${blockNumber}`
  const cached = timestamps.get(key)
  if (cached !== undefined) return cached
  const block = await client.getBlock({ blockNumber })
  const value = Number(block.timestamp)
  timestamps.set(key, value)
  return value
}

interface SpentFilter {
  allowanceIds?: bigint[]
  merchant?: Address
}

type RawSpent = Awaited<ReturnType<typeof queryRange>>[number]

function queryRange(client: PublicClient, filter: SpentFilter, fromBlock: bigint, toBlock: bigint) {
  if (!VAULT_ADDRESS) return Promise.resolve([])
  return client.getLogs({
    address: VAULT_ADDRESS,
    event: spentEvent,
    args: {
      ...(filter.allowanceIds ? { id: filter.allowanceIds } : {}),
      ...(filter.merchant ? { merchant: filter.merchant } : {}),
    },
    fromBlock,
    toBlock,
  })
}

interface ScanCache {
  logs: RawSpent[]
  next: bigint
}
// Logs already fetched per filter, so each poll only asks for blocks it has not seen yet.
const scanCache = new Map<string, ScanCache>()

/**
 * Scans from the vault deployment block (never block 0) to the chain head in bounded
 * windows, then only new blocks on later calls. If the RPC rejects a range as too large,
 * the window is halved and remembered.
 */
async function scan(client: PublicClient, filter: SpentFilter): Promise<RawSpent[]> {
  const chainId = client.chain?.id ?? 0
  const key = JSON.stringify([chainId, filter.allowanceIds?.map(String), filter.merchant])
  const cached = scanCache.get(key)
  const head = await client.getBlockNumber()
  const start = cached?.next ?? VAULT_FROM_BLOCK
  if (head < start) return cached?.logs ?? []
  let window = knownWindows.get(chainId) ?? head - start + 1n
  for (;;) {
    try {
      const fresh: RawSpent[] = []
      for (let from = start; from <= head; from += window) {
        const to = from + window - 1n > head ? head : from + window - 1n
        fresh.push(...(await queryRange(client, filter, from, to)))
      }
      knownWindows.set(chainId, window)
      const logs = [...(cached?.logs ?? []), ...fresh]
      scanCache.set(key, { logs, next: head + 1n })
      return logs
    } catch (error) {
      // Throttling is not a range problem: surface it instead of hammering the RPC with smaller windows.
      if (isRateLimitError(error) || window <= MIN_WINDOW) throw error
      window = window / 2n < MIN_WINDOW ? MIN_WINDOW : window / 2n
      knownWindows.delete(chainId)
    }
  }
}

export async function fetchSpent(client: PublicClient, filter: SpentFilter): Promise<SpentRecord[]> {
  if (filter.allowanceIds && filter.allowanceIds.length === 0) return []
  const logs = await scan(client, filter)
  const blocks = [...new Set(logs.map((l) => l.blockNumber))]
  await Promise.all(blocks.map((b) => blockTimestamp(client, b)))
  const records: SpentRecord[] = []
  for (const log of logs) {
    const a = log.args
    if (
      a.id === undefined ||
      !a.merchant ||
      !a.orderRef ||
      !a.recipient ||
      a.amount === undefined ||
      a.nonce === undefined ||
      a.remaining === undefined ||
      !a.submitter
    )
      continue
    records.push({
      allowanceId: a.id,
      merchant: a.merchant,
      orderRef: a.orderRef,
      recipient: a.recipient,
      amount: a.amount,
      nonce: a.nonce,
      remaining: a.remaining,
      submitter: a.submitter,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      timestamp: await blockTimestamp(client, log.blockNumber),
    })
  }
  return records.sort((x, y) => (x.blockNumber === y.blockNumber ? y.logIndex - x.logIndex : Number(y.blockNumber - x.blockNumber)))
}
