import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { decodeEventLog, isHash } from 'viem'
import type { Hex } from 'viem'
import { usePublicClient } from 'wagmi'
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, FileX, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Skeleton } from '@/components/ui'
import { allotVaultAbi } from '@/lib/allotVaultAbi'
import { ACTIVE_CHAIN, CHAIN_ID, VAULT_ADDRESS, explorerAddress, explorerTx } from '@/lib/chains'
import { bytes32ToOrderRef, formatDateTime, shortAddress, usdc } from '@/lib/format'
import { buildShareLink } from '@/lib/share'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/8 py-3.5 last:border-0">
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium">{children}</dd>
    </div>
  )
}

const AddressLink = ({ address }: { address: string }) => (
  <a className="mono inline-flex items-center gap-1 hover:underline" href={explorerAddress(address)} target="_blank" rel="noopener noreferrer">
    {shortAddress(address)} <ExternalLink className="h-3 w-3 opacity-60" />
  </a>
)

export default function ReceiptPage() {
  const { txHash } = useParams()
  const client = usePublicClient({ chainId: CHAIN_ID })
  const valid = Boolean(txHash && isHash(txHash))
  const [shareLink, setShareLink] = useState<string | null>(null)

  useEffect(() => {
    if (txHash && valid) void buildShareLink(`/receipt/${txHash}`).then(setShareLink)
  }, [txHash, valid])

  const receipt = useQuery({
    queryKey: ['allot', 'receipt', txHash],
    enabled: Boolean(client && valid && VAULT_ADDRESS),
    retry: 2,
    queryFn: async () => {
      if (!client || !txHash || !VAULT_ADDRESS) return null
      const tx = await client.getTransactionReceipt({ hash: txHash as Hex })
      for (const log of tx.logs) {
        if (log.address.toLowerCase() !== VAULT_ADDRESS.toLowerCase()) continue
        try {
          const decoded = decodeEventLog({ abi: allotVaultAbi, data: log.data, topics: log.topics })
          if (decoded.eventName !== 'Spent') continue
          const [block, allowance] = await Promise.all([
            client.getBlock({ blockNumber: tx.blockNumber }),
            client.readContract({ address: VAULT_ADDRESS, abi: allotVaultAbi, functionName: 'getAllowance', args: [decoded.args.id] }),
          ])
          return { tx, spent: decoded.args, timestamp: Number(block.timestamp), purpose: allowance.purpose, category: allowance.category }
        } catch {
          continue
        }
      }
      return null
    },
  })

  const data = receipt.data

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/" className="no-print mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      {!valid && <NotFound text="That receipt link is not valid." />}
      {valid && receipt.isLoading && <Skeleton className="h-96" />}
      {valid && !receipt.isLoading && !data && <NotFound text="No Allot payment was found in this transaction." />}
      {data && (
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-blue-300/15 to-violet-300/15 px-6 py-8 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-300/15 text-emerald-200">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--subtle)]">Payment receipt</p>
            <p className="display num mt-1 text-5xl font-bold">{usdc(data.spent.amount ?? 0n)}</p>
            <p className="text-sm text-[var(--muted)]">USDC</p>
          </div>
          <dl className="px-6 py-2">
            <Row label="Order reference"><span className="mono">{bytes32ToOrderRef(data.spent.orderRef ?? '0x')}</span></Row>
            <Row label="Purpose">{data.purpose}{data.category ? ` · ${data.category}` : ''}</Row>
            <Row label="Paid to">{data.spent.merchant && <AddressLink address={data.spent.merchant} />}</Row>
            <Row label="Paid by">{data.spent.recipient && <AddressLink address={data.spent.recipient} />}</Row>
            <Row label="Allowance">#{data.spent.id?.toString()}</Row>
            <Row label="Budget left after">{usdc(data.spent.remaining ?? 0n)} USDC</Row>
            <Row label="Date">{formatDateTime(data.timestamp)}</Row>
            <Row label="Network">{ACTIVE_CHAIN.name}</Row>
            <Row label="Transaction"><span className="mono text-xs">{shortAddress(data.tx.transactionHash)}</span></Row>
          </dl>
          <div className="no-print flex flex-col gap-2 border-t border-white/8 p-5 sm:flex-row">
            <a className="flex-1" href={explorerTx(data.tx.transactionHash)} target="_blank" rel="noopener noreferrer">
              <Button className="w-full"><ExternalLink className="h-4 w-4" /> View on Arc explorer</Button>
            </a>
            <Button variant="secondary" disabled={!shareLink} onClick={() => shareLink && void navigator.clipboard.writeText(shareLink).then(() => toast.success('Receipt link copied'))}>
              <Copy className="h-4 w-4" /> Copy link
            </Button>
            <Button variant="ghost" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
          </div>
        </Card>
      )}
    </div>
  )
}

function NotFound({ text }: { text: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <FileX className="h-8 w-8 text-amber-200" />
      <p className="text-[var(--muted)]">{text}</p>
    </Card>
  )
}
