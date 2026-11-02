import { useState } from 'react'
import { erc20Abi, isAddress } from 'viem'
import type { Address } from 'viem'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useSendTx } from '@/hooks/useSendTx'
import { useUsdcBalance } from '@/hooks/useVault'
import { allotVaultAbi } from '@/lib/allotVaultAbi'
import { CHAIN_ID, USDC_ADDRESS, VAULT_ADDRESS, VAULT } from '@/lib/chains'
import { usdc } from '@/lib/format'
import { parseUsdc } from '@/onchain-money'
import { Button, Field, Sheet } from './ui'

const PURPOSES = ['Groceries', 'School supplies', 'Transport']

const toInputDate = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const daysFromNow = (days: number) => toInputDate(new Date(Date.now() + days * 86400_000))

function tryParse(value: string): bigint | null {
  try {
    const v = parseUsdc(value)
    return v > 0n ? v : null
  } catch {
    return null
  }
}

export function CreateAllowance({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { address } = useAccount()
  const client = usePublicClient({ chainId: CHAIN_ID })
  const { writeContractAsync } = useWriteContract()
  const { run, busy } = useSendTx()
  const balance = useUsdcBalance(address)

  const [now] = useState(() => Math.floor(Date.now() / 1000))
  const [recipient, setRecipient] = useState('')
  const [purpose, setPurpose] = useState('')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [limit, setLimit] = useState('')
  const [expiryDate, setExpiryDate] = useState(daysFromNow(30))
  const [merchantInput, setMerchantInput] = useState('')
  const [merchants, setMerchants] = useState<Address[]>([])

  const amountRaw = tryParse(amount)
  const limitRaw = tryParse(limit)
  const expirySeconds = Math.floor(new Date(`${expiryDate}T23:59:59`).getTime() / 1000)
  const errors: string[] = []
  if (!isAddress(recipient)) errors.push('Enter the recipient wallet address.')
  if (purpose.trim().length < 1 || purpose.length > 64) errors.push('Add a purpose (up to 64 characters).')
  if (!amountRaw) errors.push('Enter the total budget.')
  if (amountRaw && !limitRaw) errors.push('Enter a per purchase limit.')
  if (amountRaw && limitRaw && limitRaw > amountRaw) errors.push('The per purchase limit cannot exceed the budget.')
  if (!(expirySeconds > now)) errors.push('Pick an expiry in the future.')
  if (merchants.length === 0) errors.push('Approve at least one merchant.')
  if (amountRaw && balance.data !== undefined && amountRaw > balance.data) errors.push('Your USDC balance is below this budget.')

  const addMerchants = () => {
    const parts = merchantInput.split(/[\s,;]+/).filter(Boolean)
    const bad = parts.filter((p) => !isAddress(p))
    if (bad.length) {
      toast.error('One of those merchant addresses is not valid.')
      return
    }
    const next = [...merchants]
    for (const p of parts) if (!next.some((m) => m.toLowerCase() === p.toLowerCase())) next.push(p as Address)
    setMerchants(next.slice(0, 50))
    setMerchantInput('')
  }

  async function submit() {
    if (errors.length || !client || !address || !VAULT_ADDRESS || !amountRaw || !limitRaw) return
    const current = await client.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [address, VAULT],
    })
    if (current < amountRaw) {
      const approved = await run('Approve', () =>
        writeContractAsync({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          chainId: CHAIN_ID,
          args: [VAULT, amountRaw],
        }),
      'USDC approved for Allot')
      if (!approved) return
    }
    const created = await run('Create', () =>
      writeContractAsync({
        address: VAULT,
        abi: allotVaultAbi,
        functionName: 'createAllowance',
        chainId: CHAIN_ID,
        args: [recipient as Address, purpose.trim(), category.trim(), amountRaw, limitRaw, BigInt(expirySeconds), merchants],
      }),
    'Allowance created')
    if (created) {
      setRecipient(''); setPurpose(''); setCategory(''); setAmount(''); setLimit(''); setMerchants([])
      onClose()
    }
  }

  const label = busy === 'Approve' ? 'Approve USDC in wallet' : busy === 'Create' ? 'Creating allowance' : 'Fund allowance'

  return (
    <Sheet open={open} onClose={onClose} title="New allowance">
      <div className="space-y-4">
        <Field label="Recipient wallet">
          <input className="field mono text-sm" placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} />
        </Field>
        <Field label="Purpose">
          <input className="field" maxLength={64} placeholder="Groceries" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-2">
            {PURPOSES.map((p) => (
              <button key={p} type="button" onClick={() => { setPurpose(p); setCategory((c) => c || p.toLowerCase().split(' ')[0]) }}
                className="min-h-[36px] rounded-full border border-white/10 bg-white/5 px-3 text-xs text-[var(--muted)] transition hover:border-blue-300/40 hover:text-white">
                {p}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Category" hint="Optional label, up to 32 characters.">
          <input className="field" maxLength={32} placeholder="food" value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Total budget (USDC)">
            <input className="field num" inputMode="decimal" placeholder="100.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Per purchase (USDC)">
            <input className="field num" inputMode="decimal" placeholder="25.00" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </Field>
        </div>
        <p className="num -mt-2 text-xs text-[var(--subtle)]">
          Your balance: {balance.data !== undefined ? `${usdc(balance.data)} USDC` : '…'}
        </p>
        <Field label="Expires" hint="Anything unspent can be reclaimed after this date.">
          <input className="field" type="date" min={daysFromNow(1)} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          <div className="mt-2 flex gap-2">
            {[7, 30, 90].map((d) => (
              <button key={d} type="button" onClick={() => setExpiryDate(daysFromNow(d))}
                className="min-h-[36px] rounded-full border border-white/10 bg-white/5 px-3 text-xs text-[var(--muted)] transition hover:border-blue-300/40 hover:text-white">
                {d} days
              </button>
            ))}
          </div>
        </Field>
        <Field label="Approved merchants" hint="Paste one or more addresses. Only these can be paid.">
          <div className="flex gap-2">
            <input className="field mono text-sm" placeholder="0x… merchant" value={merchantInput} onChange={(e) => setMerchantInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMerchants() } }} />
            <Button type="button" variant="secondary" aria-label="Add merchant" disabled={!merchantInput.trim()} onClick={addMerchants}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {merchants.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {merchants.map((m) => (
                <span key={m} className="mono inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 py-1 pl-3 pr-1 text-xs">
                  {m.slice(0, 8)}…{m.slice(-6)}
                  <button type="button" aria-label={`Remove ${m}`} onClick={() => setMerchants(merchants.filter((x) => x !== m))}
                    className="grid h-6 w-6 place-items-center rounded-full text-[var(--muted)] hover:bg-white/10">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>

        {errors.length > 0 && (recipient || purpose || amount) && (
          <ul className="space-y-1 text-xs text-amber-200/90">
            {errors.slice(0, 3).map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
        <Button size="lg" className="w-full" disabled={errors.length > 0} loading={busy !== null} onClick={() => void submit()}>
          {label}
        </Button>
        <p className="text-center text-xs text-[var(--subtle)]">
          Two wallet steps: allow Allot to move your USDC, then lock it into the allowance. Network fees are paid in USDC.
        </p>
      </div>
    </Sheet>
  )
}
