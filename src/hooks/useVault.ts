import { useQuery } from '@tanstack/react-query'
import { erc20Abi } from 'viem'
import type { Address, PublicClient } from 'viem'
import { usePublicClient } from 'wagmi'
import { allotVaultAbi } from '@/lib/allotVaultAbi'
import { CHAIN_ID, USDC_ADDRESS, VAULT_ADDRESS, VAULT } from '@/lib/chains'
import { fetchSpent } from '@/lib/logs'
import type { SpentRecord } from '@/lib/logs'

export const STATUS = ['Active', 'Paused', 'Closed'] as const
export type StatusName = (typeof STATUS)[number]

export interface AllowanceView {
  id: bigint
  funder: Address
  recipient: Address
  expiry: number
  status: StatusName
  limitPerPurchase: bigint
  funded: bigint
  spent: bigint
  remaining: bigint
  purpose: string
  category: string
  merchants: Address[]
}

export type Role = 'funder' | 'recipient'

/** Derived display state: Expired is an Active or Paused allowance past its expiry. */
export function displayStatus(a: AllowanceView, nowSeconds = Math.floor(Date.now() / 1000)): StatusName | 'Expired' {
  if (a.status === 'Closed') return 'Closed'
  if (nowSeconds >= a.expiry) return 'Expired'
  return a.status
}

const readAllowance = (client: PublicClient, id: bigint) =>
  client.readContract({ address: VAULT, abi: allotVaultAbi, functionName: 'getAllowance', args: [id] })

/** Background polling is capped at one refresh per 15 seconds and pauses while the tab is hidden. */
const POLL_MS = 15_000
const POLLING = { refetchInterval: POLL_MS, refetchIntervalInBackground: false, staleTime: 10_000 } as const

function usePublic() {
  return usePublicClient({ chainId: CHAIN_ID })
}

export function useAllowances(role: Role, address: Address | undefined) {
  const client = usePublic()
  return useQuery({
    queryKey: ['allot', 'allowances', role, address],
    enabled: Boolean(client && address && VAULT_ADDRESS),
    ...POLLING,
    queryFn: async (): Promise<AllowanceView[]> => {
      if (!client || !address || !VAULT_ADDRESS) return []
      const ids = await client.readContract({
        address: VAULT,
        abi: allotVaultAbi,
        functionName: role === 'funder' ? 'getFunderAllowanceIds' : 'getRecipientAllowanceIds',
        args: [address],
      })
      if (ids.length === 0) return []
      const ordered = [...ids].reverse()
      // One multicall for every allowance and its merchant list.
      const results = await client.multicall({
        allowFailure: false,
        contracts: ordered.flatMap((id) => [
          { address: VAULT, abi: allotVaultAbi, functionName: 'getAllowance', args: [id] },
          { address: VAULT, abi: allotVaultAbi, functionName: 'getMerchants', args: [id] },
        ] as const),
      })
      const rows: AllowanceView[] = ordered.map((id, i) => {
        const a = results[i * 2] as Awaited<ReturnType<typeof readAllowance>>
        const merchants = results[i * 2 + 1] as readonly Address[]
        return {
          id,
          funder: a.funder,
          recipient: a.recipient,
          expiry: Number(a.expiry),
          status: STATUS[a.status] ?? 'Closed',
          limitPerPurchase: a.limitPerPurchase,
          funded: a.funded,
          spent: a.spent,
          remaining: a.remaining,
          purpose: a.purpose,
          category: a.category,
          merchants: [...merchants],
        }
      })
      return rows
    },
  })
}

export function useSpentRecords(filter: { allowanceIds?: bigint[]; merchant?: Address }, enabled = true) {
  const client = usePublic()
  const idsKey = filter.allowanceIds?.map(String).join(',')
  return useQuery({
    queryKey: ['allot', 'spent', idsKey, filter.merchant],
    enabled: Boolean(client && VAULT_ADDRESS && enabled),
    ...POLLING,
    queryFn: async (): Promise<SpentRecord[]> => (client ? fetchSpent(client, filter) : []),
  })
}

export function useUsdcBalance(address: Address | undefined) {
  const client = usePublic()
  return useQuery({
    queryKey: ['allot', 'usdc-balance', address],
    enabled: Boolean(client && address),
    ...POLLING,
    queryFn: async (): Promise<bigint> => {
      if (!client || !address) return 0n
      return client.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
    },
  })
}
