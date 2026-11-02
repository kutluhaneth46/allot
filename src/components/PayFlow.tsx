import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useSignTypedData, useSwitchChain, useWriteContract } from 'wagmi'
import { CheckCircle2, ChevronRight, QrCode as QrIcon, ShieldCheck, Store, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { toast } from 'sonner'
import { useSendTx } from '@/hooks/useSendTx'
import { displayStatus } from '@/hooks/useVault'
import type { AllowanceView } from '@/hooks/useVault'
import { allotVaultAbi } from '@/lib/allotVaultAbi'
import { CHAIN_ID, NETWORKS, VAULT_ADDRESS, VAULT } from '@/lib/chains'
import { useNetwork } from './NetworkProvider'
import { orderRefToBytes32, parseTxError, randomNonce, shortAddress, usdc } from '@/lib/format'
import { encodeAuthorization, spendDomain, spendTypes } from '@/lib/payment'
import type { PaymentRequest, SignedAuthorization } from '@/lib/payment'
import { Button, Card } from './ui'
import { QrCode } from './QrCode'

const DEADLINE_SECONDS = 10 * 60

function ineligibleReason(a: AllowanceView, req: PaymentRequest): string | null {
  const status = displayStatus(a)
  if (status !== 'Active') return `${status}`
  if (!a.merchants.some((m) => m.toLowerCase() === req.merchant.toLowerCase())) return 'Merchant not approved'
  if (req.amount > a.limitPerPurchase) return `Above the ${usdc(a.limitPerPurchase)} limit`
  if (req.amount > a.remaining) return 'Not enough budget left'
  return null
}

export function PayFlow({ request, allowances, onClose }: { request: PaymentRequest; allowances: AllowanceView[]; onClose: () => void }) {
  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { signTypedDataAsync } = useSignTypedData()
  const { writeContractAsync } = useWriteContract()
  const { run, busy } = useSendTx()
  const { select } = useNetwork()
  const [selected, setSelected] = useState<bigint | null>(null)
  const [signing, setSigning] = useState(false)
  const [auth, setAuth] = useState<SignedAuthorization | null>(null)
  const [paidHash, setPaidHash] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)

  const rows = useMemo(
    () => allowances.map((a) => ({ a, reason: ineligibleReason(a, request) })),
    [allowances, request],
  )
  const eligible = rows.filter((r) => r.reason === null)
  const chosen = eligible.find((r) => r.a.id === (selected ?? eligible[0]?.a.id))?.a
  const wrongNetwork = request.chainId !== CHAIN_ID

  async function sign() {
    if (!chosen || !address) return
    setSigning(true)
    try {
      if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
      const message = {
        allowanceId: chosen.id,
        merchant: request.merchant,
        amount: request.amount,
        orderRef: orderRefToBytes32(request.ref),
        nonce: randomNonce(),
        deadline: BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS),
      }
      const signature = await signTypedDataAsync({
        domain: spendDomain(CHAIN_ID),
        types: spendTypes,
        primaryType: 'Spend',
        message,
      })
      setAuth({ ...message, signature, chainId: CHAIN_ID })
    } catch (error) {
      const msg = parseTxError(error)
      if (msg) toast.error(msg)
    } finally {
      setSigning(false)
    }
  }

  async function submit() {
    if (!auth || !VAULT_ADDRESS) return
    const receipt = await run('Payment', () =>
      writeContractAsync({
        address: VAULT,
        abi: allotVaultAbi,
        functionName: 'spend',
        chainId: CHAIN_ID,
        args: [auth.allowanceId, auth.merchant, auth.amount, auth.orderRef, auth.nonce, auth.deadline, auth.signature],
      }),
      'Payment sent to the merchant',
    )
    if (receipt) setPaidHash(receipt.transactionHash)
  }

  if (paidHash) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-300/15 text-emerald-200">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h3 className="text-2xl font-semibold">Paid {usdc(request.amount)} USDC</h3>
        <p className="text-sm text-[var(--muted)]">Sent from your allowance to {shortAddress(request.merchant)} for order {request.ref}.</p>
        <Link to={`/receipt/${paidHash}`} className="w-full">
          <Button className="w-full">View receipt</Button>
        </Link>
        <Button variant="ghost" onClick={onClose}>Done</Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-300/12 text-blue-200">
            <Store className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--subtle)]">Pay merchant</p>
            <p className="mono truncate text-sm">{shortAddress(request.merchant)}</p>
          </div>
        </div>
        <p className="display num text-4xl font-bold">
          {usdc(request.amount)} <span className="text-lg font-medium text-[var(--muted)]">USDC</span>
        </p>
        <p className="text-sm text-[var(--muted)]">Order reference <span className="mono text-white">{request.ref}</span></p>
      </Card>

      {wrongNetwork && (
        <p className="flex items-center gap-2 rounded-2xl bg-rose-300/10 p-3 text-sm text-rose-200">
          <XCircle className="h-4 w-4 shrink-0" /> This request is for {NETWORKS[request.chainId]?.label ?? 'another network'}, but you are on {NETWORKS[CHAIN_ID].label}.
        </p>
      )}
      {wrongNetwork && request.chainId in NETWORKS && (
        <Button className="w-full" variant="secondary" onClick={() => select(request.chainId)}>
          Switch to {NETWORKS[request.chainId].label}
        </Button>
      )}

      {!auth && !wrongNetwork && (
        <>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--subtle)]">Pay from</p>
            <div className="space-y-2">
              {rows.length === 0 && <p className="text-sm text-[var(--muted)]">No allowances are assigned to this wallet.</p>}
              {rows.map(({ a, reason }) => {
                const active = chosen?.id === a.id
                return (
                  <button
                    key={a.id.toString()}
                    disabled={reason !== null}
                    onClick={() => setSelected(a.id)}
                    className={clsx(
                      'flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition',
                      active ? 'border-blue-300/60 bg-blue-300/10' : 'border-white/10 bg-white/5',
                      reason === null ? 'hover:border-blue-300/40' : 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <span>
                      <span className="block font-semibold">{a.purpose}</span>
                      <span className="num block text-xs text-[var(--muted)]">
                        {reason ?? `${usdc(a.remaining)} USDC left`}
                      </span>
                    </span>
                    {reason === null && <ChevronRight className="h-4 w-4 text-[var(--muted)]" />}
                  </button>
                )
              })}
            </div>
          </div>
          <Button size="lg" className="w-full" disabled={!chosen} loading={signing} onClick={() => void sign()}>
            <ShieldCheck className="h-5 w-5" /> {signing ? 'Confirm in wallet' : 'Sign payment'}
          </Button>
          <p className="text-center text-xs text-[var(--subtle)]">
            You sign a message. Nothing moves until the payment is submitted onchain.
          </p>
        </>
      )}

      {auth && !showQr && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 rounded-2xl bg-emerald-300/10 p-3 text-sm text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Signed. Valid for 10 minutes.
          </p>
          <Button size="lg" className="w-full" loading={busy === 'Payment'} onClick={() => void submit()}>
            Submit payment now
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => setShowQr(true)}>
            <QrIcon className="h-4 w-4" /> Let the merchant submit it
          </Button>
          <p className="text-center text-xs text-[var(--subtle)]">Whoever submits pays the small USDC network fee.</p>
        </div>
      )}

      {auth && showQr && (
        <div className="flex flex-col items-center gap-3 text-center">
          <QrCode value={encodeAuthorization(auth)} size={240} label="Signed payment authorization" />
          <p className="max-w-xs text-sm text-[var(--muted)]">
            Show this to the merchant. They scan it on their Merchant page and submit the payment.
          </p>
          <Button variant="ghost" onClick={() => setShowQr(false)}>Back</Button>
        </div>
      )}
    </div>
  )
}
