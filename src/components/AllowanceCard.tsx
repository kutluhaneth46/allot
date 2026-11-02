import { useState } from 'react'
import { isAddress } from 'viem'
import type { Address } from 'viem'
import { useWriteContract } from 'wagmi'
import { CalendarClock, Pause, Play, Plus, Receipt, RotateCcw, Tag, Undo2, UserRound, X } from 'lucide-react'
import { useSendTx } from '@/hooks/useSendTx'
import { displayStatus } from '@/hooks/useVault'
import type { AllowanceView } from '@/hooks/useVault'
import { allotVaultAbi } from '@/lib/allotVaultAbi'
import { CHAIN_ID, VAULT_ADDRESS, VAULT, explorerAddress } from '@/lib/chains'
import { formatDate, shortAddress, timeLeft, usdc } from '@/lib/format'
import { Badge, Button, Card, statusTone } from './ui'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/5 px-3.5 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--subtle)]">{label}</p>
      <p className="num mt-0.5 font-semibold">{value}</p>
    </div>
  )
}

function Header({ a, person }: { a: AllowanceView; person: { label: string; address: Address } }) {
  const status = displayStatus(a)
  const pct = a.funded === 0n ? 0 : Number((a.spent * 10000n) / a.funded) / 100
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xl font-semibold">{a.purpose}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
            {a.category && (
              <span className="inline-flex items-center gap-1"><Tag className="h-3.5 w-3.5" />{a.category}</span>
            )}
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3.5 w-3.5" />
              {person.label}{' '}
              <a className="mono underline-offset-2 hover:underline" href={explorerAddress(person.address)} target="_blank" rel="noopener noreferrer">
                {shortAddress(person.address)}
              </a>
            </span>
          </p>
        </div>
        <Badge tone={statusTone(status)}>{status}</Badge>
      </div>
      <div className="mt-5">
        <p className="text-xs uppercase tracking-[0.08em] text-[var(--subtle)]">Remaining</p>
        <p className="display num text-4xl font-bold">
          {usdc(a.remaining)} <span className="text-base font-medium text-[var(--muted)]">USDC</span>
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Budget spent">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-300 to-violet-300 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="num mt-1.5 text-xs text-[var(--muted)]">{usdc(a.spent)} spent of {usdc(a.funded)}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Per purchase" value={`${usdc(a.limitPerPurchase)} USDC`} />
        <Stat label="Expires" value={formatDate(a.expiry)} />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--muted)]">
        <CalendarClock className="h-3.5 w-3.5" /> {timeLeft(a.expiry)}
      </p>
    </>
  )
}

export function RecipientAllowanceCard({ a }: { a: AllowanceView }) {
  return (
    <Card hover className="p-5 sm:p-6">
      <Header a={a} person={{ label: 'Funded by', address: a.funder }} />
      <div className="mt-5">
        <p className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--subtle)]">Approved merchants</p>
        <div className="flex flex-wrap gap-2">
          {a.merchants.length === 0 && <span className="text-sm text-[var(--muted)]">None approved right now.</span>}
          {a.merchants.map((m) => (
            <span key={m} className="mono rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">{shortAddress(m)}</span>
          ))}
        </div>
      </div>
    </Card>
  )
}

export function FunderAllowanceCard({ a }: { a: AllowanceView }) {
  const { writeContractAsync } = useWriteContract()
  const { run, busy } = useSendTx()
  const [newMerchant, setNewMerchant] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const status = displayStatus(a)
  const closed = a.status === 'Closed'
  const canReclaim = !closed && status === 'Expired' && a.remaining > 0n
  const validNew = isAddress(newMerchant)

  const call = (label: string, functionName: 'pause' | 'resume' | 'close' | 'reclaim', done: string) => {
    if (!VAULT_ADDRESS) return Promise.resolve(null)
    return run(label, () => writeContractAsync({ address: VAULT, abi: allotVaultAbi, functionName, chainId: CHAIN_ID, args: [a.id] }), done)
  }

  const addMerchant = async () => {
    if (!VAULT_ADDRESS || !validNew) return
    const receipt = await run('Add merchant', () =>
      writeContractAsync({ address: VAULT, abi: allotVaultAbi, functionName: 'addMerchant', chainId: CHAIN_ID, args: [a.id, newMerchant] }),
    'Merchant approved')
    if (receipt) setNewMerchant('')
  }

  const removeMerchant = (merchant: Address) => {
    if (!VAULT_ADDRESS) return
    void run(`Remove ${merchant}`, () =>
      writeContractAsync({ address: VAULT, abi: allotVaultAbi, functionName: 'removeMerchant', chainId: CHAIN_ID, args: [a.id, merchant] }),
    'Merchant removed')
  }

  return (
    <Card hover className="p-5 sm:p-6">
      <Header a={a} person={{ label: 'For', address: a.recipient }} />

      <div className="mt-5">
        <p className="mb-2 text-xs uppercase tracking-[0.08em] text-[var(--subtle)]">Approved merchants</p>
        <div className="flex flex-wrap gap-2">
          {a.merchants.length === 0 && <span className="text-sm text-[var(--muted)]">No merchants. Nothing can be spent.</span>}
          {a.merchants.map((m) => (
            <span key={m} className="mono inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 py-1 pl-3 pr-1 text-xs">
              {shortAddress(m)}
              {!closed && (
                <button
                  aria-label={`Remove merchant ${m}`}
                  disabled={busy !== null}
                  onClick={() => removeMerchant(m)}
                  className="grid h-6 w-6 place-items-center rounded-full text-[var(--muted)] transition hover:bg-rose-300/20 hover:text-rose-200 disabled:opacity-40"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
        {!closed && (
          <div className="mt-3 flex gap-2">
            <input
              className="field mono text-sm"
              placeholder="Add merchant address 0x…"
              value={newMerchant}
              onChange={(e) => setNewMerchant(e.target.value.trim())}
              aria-label="Merchant address"
            />
            <Button variant="secondary" aria-label="Add merchant" disabled={!validNew} loading={busy === 'Add merchant'} onClick={() => void addMerchant()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {!closed && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-white/8 pt-5">
          {a.status === 'Active' && status !== 'Expired' && (
            <Button size="sm" variant="secondary" loading={busy === 'Pause'} onClick={() => void call('Pause', 'pause', 'Allowance paused')}>
              <Pause className="h-4 w-4" /> Pause
            </Button>
          )}
          {a.status === 'Paused' && (
            <Button size="sm" variant="secondary" loading={busy === 'Resume'} onClick={() => void call('Resume', 'resume', 'Allowance resumed')}>
              <Play className="h-4 w-4" /> Resume
            </Button>
          )}
          {canReclaim && (
            <Button size="sm" loading={busy === 'Reclaim'} onClick={() => void call('Reclaim', 'reclaim', 'Unspent funds returned to you')}>
              <RotateCcw className="h-4 w-4" /> Reclaim {usdc(a.remaining)}
            </Button>
          )}
          {!confirmClose ? (
            <Button size="sm" variant="danger" onClick={() => setConfirmClose(true)}>
              <Undo2 className="h-4 w-4" /> Close and refund
            </Button>
          ) : (
            <>
              <Button size="sm" variant="danger" loading={busy === 'Close'} onClick={() => void call('Close', 'close', 'Allowance closed and refunded')}>
                Confirm: refund {usdc(a.remaining)} USDC
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmClose(false)}>Cancel</Button>
            </>
          )}
        </div>
      )}
      {closed && (
        <p className="mt-5 flex items-center gap-2 border-t border-white/8 pt-4 text-sm text-[var(--muted)]">
          <Receipt className="h-4 w-4" /> Closed. Any unspent balance was returned to you.
        </p>
      )}
    </Card>
  )
}
