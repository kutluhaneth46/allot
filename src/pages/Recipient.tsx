import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { ClipboardPaste, ScanLine, Wallet } from 'lucide-react'
import { Gate } from '@/components/Gate'
import { RecipientAllowanceCard } from '@/components/AllowanceCard'
import { PayFlow } from '@/components/PayFlow'
import { QrScanner } from '@/components/QrScanner'
import { SpendHistory } from '@/components/SpendHistory'
import { Button, Card, EmptyState, PageTitle, Sheet, Skeleton } from '@/components/ui'
import { displayStatus, useAllowances, useSpentRecords } from '@/hooks/useVault'
import { parsePaymentRequest } from '@/lib/payment'
import type { PaymentRequest } from '@/lib/payment'
import { usdc } from '@/lib/format'
import { toast } from 'sonner'

export default function Recipient() {
  const { address } = useAccount()
  const allowances = useAllowances('recipient', address)
  const list = allowances.data
  const ids = useMemo(() => list?.map((a) => a.id), [list])
  const spent = useSpentRecords({ allowanceIds: ids }, Boolean(ids))
  const purposes = useMemo(() => new Map((list ?? []).map((a) => [a.id.toString(), a.purpose])), [list])

  const [sheet, setSheet] = useState<'scan' | 'paste' | null>(null)
  const [pasted, setPasted] = useState('')
  const [request, setRequest] = useState<PaymentRequest | null>(null)

  const spendable = (list ?? []).filter((a) => displayStatus(a) === 'Active')
  const budget = spendable.reduce((sum, a) => sum + a.remaining, 0n)

  const handleText = (text: string) => {
    const parsed = parsePaymentRequest(text)
    if (!parsed) {
      toast.error('That is not an Allot payment code.')
      return false
    }
    setSheet(null)
    setPasted('')
    setRequest(parsed)
    return true
  }

  return (
    <>
      <PageTitle
        eyebrow="Recipient"
        title="Your wallet"
        subtitle="See what you can spend, then scan a merchant's QR code to pay from the right allowance."
      />
      <Gate reason="Connect the wallet your allowances were assigned to.">
        <Card className="relative overflow-hidden p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-violet-400/20 blur-3xl" />
          <p className="text-xs uppercase tracking-[0.08em] text-[var(--subtle)]">Available to spend</p>
          <p className="display num mt-1 text-5xl font-bold sm:text-6xl">
            {allowances.isLoading ? '…' : usdc(budget)} <span className="text-xl font-medium text-[var(--muted)]">USDC</span>
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Across {spendable.length} active allowance{spendable.length === 1 ? '' : 's'}. Only usable at the merchants each funder approved.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="w-full sm:w-auto" onClick={() => setSheet('scan')}>
              <ScanLine className="h-5 w-5" /> Scan to pay
            </Button>
            <Button size="lg" variant="secondary" className="w-full sm:w-auto" onClick={() => setSheet('paste')}>
              <ClipboardPaste className="h-5 w-5" /> Paste payment link
            </Button>
          </div>
        </Card>

        <section className="mt-10">
          <h2 className="mb-4 text-xl font-semibold">Your allowances</h2>
          {allowances.isLoading && <Skeleton className="h-72" />}
          {list && list.length === 0 && (
            <EmptyState
              icon={<Wallet className="h-6 w-6" />}
              title="Nothing assigned to this wallet"
              body="When someone creates an allowance for your address, it shows up here."
            />
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {list?.map((a) => <RecipientAllowanceCard key={a.id.toString()} a={a} />)}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="mb-4 text-xl font-semibold">Your payments</h2>
          <SpendHistory
            records={spent.data}
            loading={allowances.isLoading || (Boolean(ids?.length) && spent.isLoading)}
            counterparty="merchant"
            purposes={purposes}
            emptyBody="Payments you make with Scan to pay show up here, each with a receipt."
          />
        </section>
      </Gate>

      <Sheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet === 'paste' ? 'Paste payment link' : 'Scan to pay'}>
        <div className="space-y-4">
          {sheet === 'scan' ? (
            <>
              <QrScanner onResult={handleText} onUnavailable={() => setSheet('paste')} />
              <p className="text-center text-sm text-[var(--muted)]">Point your camera at the merchant's payment QR code.</p>
              <Button variant="ghost" className="w-full" onClick={() => setSheet('paste')}>
                <ClipboardPaste className="h-4 w-4" /> Paste a payment link instead
              </Button>
            </>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                handleText(pasted)
              }}
            >
              <textarea
                className="field mono min-h-[110px] text-xs"
                placeholder="/pay?m=0x…&amt=12500000&ref=ORD-1234&cid=5042002"
                aria-label="Payment link"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
              />
              <p className="text-xs text-[var(--subtle)]">Paste the full link or just the part starting with /pay.</p>
              <Button type="submit" className="w-full" disabled={!pasted.trim()}>Continue</Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setSheet('scan')}>Use the camera</Button>
            </form>
          )}
        </div>
      </Sheet>

      <Sheet open={request !== null} onClose={() => setRequest(null)} title="Confirm payment">
        {request && <PayFlow request={request} allowances={list ?? []} onClose={() => setRequest(null)} />}
      </Sheet>
    </>
  )
}
