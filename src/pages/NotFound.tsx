import { Link } from 'react-router-dom'
import { Button, Card } from '@/components/ui'

export default function NotFound() {
  return (
    <Card className="mx-auto max-w-lg px-6 py-14 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--subtle)]">404</p>
      <h1 className="display mt-3 text-3xl font-bold">Page not found</h1>
      <p className="mt-3 text-sm text-[var(--muted)]">
        That route is not part of Allot. Head home or open one of the role pages.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link to="/">
          <Button>Back home</Button>
        </Link>
        <Link to="/funder">
          <Button variant="secondary">Funder</Button>
        </Link>
        <Link to="/recipient">
          <Button variant="secondary">Recipient</Button>
        </Link>
        <Link to="/merchant">
          <Button variant="secondary">Merchant</Button>
        </Link>
      </div>
    </Card>
  )
}
