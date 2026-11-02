import { Link } from 'react-router-dom'
import { ArrowDownLeft, ChevronRight, History } from 'lucide-react'
import type { SpentRecord } from '@/lib/logs'
import { bytes32ToOrderRef, formatDateTime, shortAddress, usdc } from '@/lib/format'
import { Card, EmptyState, Skeleton } from './ui'

interface Props {
  records: SpentRecord[] | undefined
  loading: boolean
  /** Who the counterparty column shows. */
  counterparty: 'merchant' | 'recipient'
  purposes?: Map<string, string>
  emptyBody: string
}

export function SpendHistory({ records, loading, counterparty, purposes, emptyBody }: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-[72px]" />
        <Skeleton className="h-[72px]" />
      </div>
    )
  }
  if (!records || records.length === 0) {
    return <EmptyState icon={<History className="h-6 w-6" />} title="No payments yet" body={emptyBody} />
  }
  return (
    <Card className="divide-y divide-white/8 overflow-hidden">
      {records.map((r) => {
        const who = counterparty === 'merchant' ? r.merchant : r.recipient
        const purpose = purposes?.get(r.allowanceId.toString())
        return (
          <Link
            key={`${r.txHash}-${r.logIndex}`}
            to={`/receipt/${r.txHash}`}
            className="group flex min-h-[72px] items-center gap-3 px-4 py-3 transition hover:bg-white/5 sm:px-5"
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-300/10 text-emerald-200">
              <ArrowDownLeft className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {bytes32ToOrderRef(r.orderRef)}
                {purpose && <span className="font-normal text-[var(--muted)]"> · {purpose}</span>}
              </p>
              <p className="truncate text-xs text-[var(--muted)]">
                {counterparty === 'merchant' ? 'To' : 'From'} <span className="mono">{shortAddress(who)}</span> · {formatDateTime(r.timestamp)}
              </p>
            </div>
            <p className="num shrink-0 font-semibold">{usdc(r.amount)}</p>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--subtle)] transition group-hover:translate-x-0.5" />
          </Link>
        )
      })}
    </Card>
  )
}
