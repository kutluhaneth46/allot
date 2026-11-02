import { createContext, Fragment, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CHAIN_ID, setActiveNetwork } from '@/lib/chains'

interface NetworkContextValue {
  chainId: number
  select: (chainId: number) => void
}

const NetworkContext = createContext<NetworkContextValue | null>(null)

/**
 * Holds the selected network. Switching updates the active vault and chain, clears cached
 * reads from the other network, and remounts the tree so nothing shows stale data.
 */
export function NetworkProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [chainId, setChainId] = useState(CHAIN_ID)

  const select = useCallback(
    (next: number) => {
      if (next === chainId) return
      setActiveNetwork(next)
      queryClient.clear()
      setChainId(next)
    },
    [chainId, queryClient],
  )

  const value = useMemo(() => ({ chainId, select }), [chainId, select])

  return (
    <NetworkContext.Provider value={value}>
      <Fragment key={chainId}>{children}</Fragment>
    </NetworkContext.Provider>
  )
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext)
  if (!ctx) throw new Error('useNetwork must be used inside NetworkProvider')
  return ctx
}
