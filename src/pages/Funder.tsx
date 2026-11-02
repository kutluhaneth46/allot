import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { HandCoins, Plus } from 'lucide-react'
import { Gate } from '@/components/Gate'
import { FunderAllowanceCard } from '@/components/AllowanceCard'
import { CreateAllowance } from '@/components/CreateAllowance'
import { SpendHistory } from '@/components/SpendHistory'
import { Button, Card, EmptyState, PageTitle, Skeleton } from '@/components/ui'
import { displayStatus, useAllowances, useSpentRecords } from '@/hooks/useVault'
import { usdc } from '@/lib/format'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs uppercase tracking-[0.08em] text-[var(--subtle)]">{label}</p>
      <p className="display num mt-1 text-2xl font-bold">{value}</p>
    </Card>
  )
}

export default function Funder() {
  const { address } = useAccount()
  const [creating, setCreating] = useState(false)
  const allowances = useAllowances('funder', address)
  const list = allowances.data
  const ids = useMemo(() => list?.map((a) => a.id), [list])
  const spent = useSpentRecords({ allowanceIds: ids }, Boolean(ids))
  const purposes = useMemo(() => new Map((list ?? []).map((a) => [a.id.toString(), a.purpose])), [list])

  const locked = (list ?? []).reduce((sum, a) => sum + a.remaining, 0n)
  const totalSpent = (list ?? []).reduce((sum, a) => sum + a.spent, 0n)
  const active = (list ?? []).filter((a) => displayStatus(a) === 'Active').length

  return (
    <>
      <PageTitle
        eyebrow="Funder"
        title="Your allowances"
        subtitle="Lock USDC for a purpose, choose the merchants it can be spent at, and take back whatever is left."
        action={
          <Button size="lg" onClick={() => setCreating(true)} disabled={!address}>
            <Plus className="h-5 w-5" /> New allowance
          </Button>
        }
      />
      <Gate reason="Connect the wallet you want to fund allowances from.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Locked in allowances" value={`${usdc(locked)} USDC`} />
          <Metric label="Spent so far" value={`${usdc(totalSpent)} USDC`} />
          <Metric label="Active allowances" value={String(active)} />
        </div>

        <section className="mt-10">
          <h2 className="mb-4 text-xl font-semibold">Allowances</h2>
          {allowances.isLoading && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-80" />
              <Skeleton className="h-80" />
            </div>
          )}
          {list && list.length === 0 && (
            <EmptyState
              icon={<HandCoins className="h-6 w-6" />}
              title="No allowances yet"
              body="Create your first allowance: pick a purpose, a recipient and the merchants they can pay."
              action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New allowance</Button>}
            />
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {list?.map((a) => <FunderAllowanceCard key={a.id.toString()} a={a} />)}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="mb-4 text-xl font-semibold">Spending history</h2>
          <SpendHistory
            records={spent.data}
            loading={allowances.isLoading || (Boolean(ids?.length) && spent.isLoading)}
            counterparty="merchant"
            purposes={purposes}
            emptyBody="Payments from your allowances appear here the moment a merchant is paid."
          />
        </section>
      </Gate>
      <CreateAllowance open={creating} onClose={() => setCreating(false)} />
    </>
  )
}
