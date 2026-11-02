import type { ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { AlertTriangle, Wallet } from 'lucide-react'
import { VAULT_ADDRESS } from '@/lib/chains'
import { ConnectButton } from './Layout'
import { Card } from './ui'

/** Blocks a page until a wallet is connected and the vault is configured. */
export function Gate({ children, reason }: { children: ReactNode; reason: string }) {
  const { isConnected } = useAccount()

  if (!VAULT_ADDRESS) {
    return (
      <Card className="flex items-start gap-3 p-6">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
        <div>
          <h3 className="font-semibold">Vault address not configured</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Set <span className="mono">VITE_ALLOT_VAULT_ADDRESS_TESTNET</span> in <span className="mono">.env</span> and restart the dev server.
          </p>
        </div>
      </Card>
    )
  }

  if (!isConnected) {
    return (
      <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/8 text-blue-200">
          <Wallet className="h-6 w-6" />
        </div>
        <h3 className="text-xl font-semibold">Connect your wallet</h3>
        <p className="max-w-sm text-sm text-[var(--muted)]">{reason}</p>
        <ConnectButton />
      </Card>
    )
  }

  return <>{children}</>
}
