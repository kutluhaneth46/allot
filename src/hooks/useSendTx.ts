import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Hash, TransactionReceipt } from 'viem'
import { toast } from 'sonner'
import { useAccount, usePublicClient, useSwitchChain } from 'wagmi'
import { CHAIN_ID } from '@/lib/chains'
import { isRateLimitError, parseTxError } from '@/lib/format'

/**
 * Runs one onchain action: switches to the Allot network if needed, waits for the
 * receipt, refreshes live data and reports real success or failure.
 */
export function useSendTx() {
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const client = usePublicClient({ chainId: CHAIN_ID })
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)

  // The transaction is already sent here, so a throttled status check must not look like a failure.
  const waitWithRetry = useCallback(
    async (hash: Hash): Promise<TransactionReceipt> => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await client!.waitForTransactionReceipt({ hash })
        } catch (error) {
          if (!isRateLimitError(error) || attempt >= 3) throw error
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      }
    },
    [client],
  )

  const run = useCallback(
    async (label: string, send: () => Promise<Hash>, successMessage?: string): Promise<TransactionReceipt | null> => {
      if (!client) return null
      setBusy(label)
      try {
        if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
        const hash = await send()
        const receipt = await waitWithRetry(hash)
        if (receipt.status !== 'success') throw new Error('Transaction reverted')
        await queryClient.invalidateQueries({ queryKey: ['allot'] })
        toast.success(successMessage ?? `${label} confirmed`)
        return receipt
      } catch (error) {
        const message = parseTxError(error)
        if (message) toast.error(message)
        return null
      } finally {
        setBusy(null)
      }
    },
    [chainId, client, queryClient, switchChainAsync, waitWithRetry],
  )

  return { run, busy }
}
