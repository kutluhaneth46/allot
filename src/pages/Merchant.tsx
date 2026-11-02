import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useWriteContract } from 'wagmi'
import { CheckCircle2, Copy, QrCode as QrIcon, RefreshCw, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { Gate } from '@/components/Gate'
import { QrCode } from '@/components/QrCode'
import { QrScanner } from '@/components/QrScanner'
import { SpendHistory } from '@/components/SpendHistory'
import { Button, Card, Field, PageTitle, Sheet } from '@/components/ui'
import { useSendTx } from '@/hooks/useSendTx'
import { useSpentRecords } from '@/hooks/useVault'
import { allotVaultAbi } from '@/lib/allotVaultAbi'
import { CHAIN_ID, VAULT_ADDRESS, VAULT } from '@/lib/chains'
import { bytes32ToOrderRef, isValidOrderRef, randomOrderRef, shortAddress, usdc } from '@/lib/format'
import { buildPaymentQuery, decodeAuthorization } from '@/lib/payment'
import type { PaymentRequest, SignedAuthorization } from '@/lib/payment'
import { getShareBase } from '@/lib/share'
import { parseUsdc } from '@/onchain-money'

function parseAmount(value: string): bigint | null {
  try {
    const v = parseUsdc(value)
    return v > 0n ? v : null
  } catch {
    return null
  }
}

export default function Merchant() {
  const { address } = useAccount()
  const [base, setBase] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [ref, setRef] = useState(() => randomOrderRef())
  const [request, setRequest] = useState<PaymentRequest | null>(null)
  const [relaying, setRelaying] = useState(false)
  const [pasted, setPasted] = useState('')
  const [auth, setAuth] = useState<SignedAuthorization | null>(null)
  const { writeContractAsync } = useWriteContract()
  const { run, busy } = useSendTx()
  const incoming = useSpentRecords({ merchant: address }, Boolean(address))

  useEffect(() => {
    void getShareBase().then(setBase)
  }, [])

  const amountRaw = parseAmount(amount)
  const refOk = isValidOrderRef(ref)
  const qrValue = request && base ? `${base}/pay${buildPaymentQuery(request)}` : null
  const paid = useMemo(
    () => (request ? incoming.data?.find((r) => bytes32ToOrderRef(r.orderRef) === request.ref && r.amount === request.amount) : undefined),
    [incoming.data, request],
  )

  const create = () => {
    if (!address || !amountRaw || !refOk) return
    setRequest({ merchant: address, amount: amountRaw, ref, chainId: CHAIN_ID })
  }

  const next = () => {
    setRequest(null)
    setAmount('')
    setRef(randomOrderRef())
  }

  const readAuth = (text: string) => {
    const decoded = decodeAuthorization(text)
    if (!decoded) {
      toast.error('That is not a signed Allot payment.')
      return false
    }
    setAuth(decoded)
    return true
  }

  const submitAuth = async () => {
    if (!auth || !VAULT_ADDRESS) return
    const receipt = await run('Relay', () =>
      writeContractAsync({
        address: VAULT,
        abi: allotVaultAbi,
        functionName: 'spend',
        chainId: CHAIN_ID,
        args: [auth.allowanceId, auth.merchant, auth.amount, auth.orderRef, auth.nonce, auth.deadline, auth.signature],
      }),
      'Payment received',
    )
    if (receipt) {
      setAuth(null)
      setRelaying(false)
      setPasted('')
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="Merchant"
        title="Get paid by QR"
        subtitle="Enter an amount and order reference, show the code, and watch the USDC arrive."
      />
      <Gate reason="Connect the wallet that receives payments. Funders approve this address.">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <Card className="space-y-5 p-6">
            {!request ? (
              <>
                <h2 className="text-xl font-semibold">New payment request</h2>
                <Field label="Amount (USDC)">
                  <input className="field num text-lg" inputMode="decimal" placeholder="12.50" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </Field>
                <Field label="Order reference" hint="Up to 32 letters, numbers, dot, dash or underscore. Each reference can be paid once per allowance.">
                  <div className="flex gap-2">
                    <input className="field mono" value={ref} maxLength={32} onChange={(e) => setRef(e.target.value)} />
                    <Button variant="secondary" aria-label="New reference" onClick={() => setRef(randomOrderRef())}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </Field>
                <Button size="lg" className="w-full" disabled={!amountRaw || !refOk || !base} onClick={create}>
                  <QrIcon className="h-5 w-5" /> Generate QR code
                </Button>
                <div className="rounded-2xl bg-white/5 p-4 text-sm text-[var(--muted)]">
                  <p className="mb-1 font-medium text-white">Your merchant address</p>
                  <button
                    className="mono flex w-full items-center justify-between gap-2 break-all text-left text-xs hover:text-white"
                    onClick={() => { if (address) void navigator.clipboard.writeText(address).then(() => toast.success('Address copied')) }}
                  >
                    {address} <Copy className="h-3.5 w-3.5 shrink-0" />
                  </button>
                  <p className="mt-2 text-xs">Give this to funders so they can approve you. Unapproved merchants cannot be paid.</p>
                </div>
              </>
            ) : paid ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-300/15 text-emerald-200">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-semibold">Payment received</h2>
                <p className="num text-3xl font-bold">{usdc(paid.amount)} USDC</p>
                <p className="text-sm text-[var(--muted)]">Order {request.ref} from {shortAddress(paid.recipient)}</p>
                <Link to={`/receipt/${paid.txHash}`} className="w-full"><Button className="w-full">View receipt</Button></Link>
                <Button variant="ghost" onClick={next}>New request</Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 text-center">
                <p className="text-xs uppercase tracking-[0.08em] text-[var(--subtle)]">Ask the customer to scan</p>
                {qrValue && <QrCode value={qrValue} size={248} label={`Payment request for ${usdc(request.amount)} USDC`} />}
                <p className="display num text-3xl font-bold">{usdc(request.amount)} <span className="text-base font-medium text-[var(--muted)]">USDC</span></p>
                <p className="mono text-sm text-[var(--muted)]">{request.ref}</p>
                <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-300" /> Waiting for payment
                </p>
                <div className="flex w-full gap-2">
                  {qrValue && (
                    <Button variant="secondary" className="flex-1" onClick={() => void navigator.clipboard.writeText(qrValue).then(() => toast.success('Payment link copied'))}>
                      <Copy className="h-4 w-4" /> Copy link
                    </Button>
                  )}
                  <Button variant="ghost" className="flex-1" onClick={next}>Cancel</Button>
                </div>
                <Link
                  to={`/pay${buildPaymentQuery(request)}`}
                  className="text-xs text-[var(--muted)] underline-offset-2 hover:text-white hover:underline"
                >
                  Open the payment page in this app
                </Link>
              </div>
            )}
          </Card>

          <div className="space-y-6">
            <Card className="p-6">
              <h2 className="text-xl font-semibold">Customer has no network fee balance?</h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                A customer can sign the payment and show you a QR code instead of submitting it. Scan it here and you submit it for them.
              </p>
              <Button variant="secondary" className="mt-4" onClick={() => setRelaying(true)}>
                <ScanLine className="h-4 w-4" /> Scan signed payment
              </Button>
            </Card>
            <section>
              <h2 className="mb-3 text-xl font-semibold">Incoming payments</h2>
              <SpendHistory
                records={incoming.data}
                loading={incoming.isLoading}
                counterparty="recipient"
                emptyBody="Payments to your address appear here as soon as they confirm."
              />
            </section>
          </div>
        </div>
      </Gate>

      <Sheet open={relaying} onClose={() => { setRelaying(false); setAuth(null) }} title="Submit signed payment">
        {!auth ? (
          <div className="space-y-4">
            <QrScanner onResult={readAuth} />
            <textarea className="field mono min-h-[80px] text-xs" placeholder="Or paste the signed payment code" value={pasted} onChange={(e) => setPasted(e.target.value)} />
            <Button className="w-full" disabled={!pasted.trim()} onClick={() => readAuth(pasted)}>Read code</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Card className="space-y-1 p-5">
              <p className="num text-3xl font-bold">{usdc(auth.amount)} USDC</p>
              <p className="text-sm text-[var(--muted)]">To {shortAddress(auth.merchant)} · order {bytes32ToOrderRef(auth.orderRef)}</p>
              <p className="text-xs text-[var(--subtle)]">Allowance #{auth.allowanceId.toString()} · expires {new Date(Number(auth.deadline) * 1000).toLocaleTimeString()}</p>
            </Card>
            <Button size="lg" className="w-full" loading={busy === 'Relay'} onClick={() => void submitAuth()}>Submit payment</Button>
            <Button variant="ghost" className="w-full" onClick={() => setAuth(null)}>Scan a different code</Button>
          </div>
        )}
      </Sheet>
    </>
  )
}

