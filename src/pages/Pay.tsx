import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { ScanLine } from 'lucide-react'
import { Gate } from '@/components/Gate'
import { PayFlow } from '@/components/PayFlow'
import { Button, Card, PageTitle, Skeleton } from '@/components/ui'
import { useAllowances } from '@/hooks/useVault'
import { parsePaymentRequest } from '@/lib/payment'

/** Landing page for a merchant QR code opened with the phone's own camera. */
export default function Pay() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { address } = useAccount()
  const allowances = useAllowances('recipient', address)
  const request = useMemo(() => parsePaymentRequest(`?${params.toString()}`), [params])

  return (
    <div className="mx-auto max-w-md">
      <PageTitle eyebrow="Pay" title="Confirm payment" subtitle="Review the merchant and amount, then sign." />
      {!request ? (
        <Card className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <h3 className="text-lg font-semibold">This payment link is not valid</h3>
          <p className="text-sm text-[var(--muted)]">Ask the merchant to show a new QR code, or scan it from your wallet.</p>
          <Link to="/recipient"><Button><ScanLine className="h-4 w-4" /> Open my wallet</Button></Link>
        </Card>
      ) : (
        <Gate reason="Connect the wallet that holds your allowance to pay this merchant.">
          {allowances.isLoading ? (
            <Skeleton className="h-72" />
          ) : (
            <Card className="p-5 sm:p-6">
              <PayFlow request={request} allowances={allowances.data ?? []} onClose={() => void navigate('/recipient')} />
            </Card>
          )}
        </Gate>
      )}
    </div>
  )
}
