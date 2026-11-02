import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useSwitchChain } from 'wagmi'
import { ArrowUpRight, Check, ChevronDown, Github, ExternalLink, Wallet } from 'lucide-react'
import clsx from 'clsx'
import { ARC_LINKS, CHAIN_ID, GITHUB_URL, IS_MAINNET, NETWORKS, NETWORK_LIST, PORTFOLIO_URL, VAULT_ADDRESS, X_URL, explorerAddress } from '@/lib/chains'
import { useNetwork } from './NetworkProvider'
import { Button } from './ui'

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden>
        <defs>
          <linearGradient id="allot-g" x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8fb8ff" />
            <stop offset="1" stopColor="#b39bff" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="10" fill="url(#allot-g)" />
        <path d="M9 23 16 8l7 15M11.8 18h8.4" stroke="#0a1426" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="display text-xl font-bold tracking-tight">Allot</span>
    </span>
  )
}

const NAV = [
  { to: '/funder', label: 'Funder' },
  { to: '/recipient', label: 'Recipient' },
  { to: '/merchant', label: 'Merchant' },
]

function NetworkSelector() {
  const { isConnected, chainId: walletChainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()
  const { select } = useNetwork()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const walletMismatch = isConnected && walletChainId !== CHAIN_ID
  return (
    <div className="flex items-center gap-2">
      {walletMismatch && (
        <Button size="sm" variant="secondary" className="hidden sm:inline-flex" loading={isPending} onClick={() => switchChain({ chainId: CHAIN_ID })}>
          Switch wallet to {NETWORKS[CHAIN_ID].label}
        </Button>
      )}
      <div ref={ref} className="relative">
        <button
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Select network"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs font-medium text-[var(--muted)] transition hover:bg-white/10 hover:text-white"
        >
          <span className={clsx('h-2 w-2 rounded-full', IS_MAINNET ? 'bg-emerald-300' : 'bg-amber-300')} />
          <span className="hidden sm:inline">{NETWORKS[CHAIN_ID].label}</span>
          <span className="sm:hidden">{IS_MAINNET ? 'Mainnet' : 'Testnet'}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
        </button>
        {open && (
          <ul role="listbox" aria-label="Network" className="glass absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-2xl bg-[#0d1b2f]/95 p-1.5">
            {NETWORK_LIST.map((n) => {
              const selected = n.chain.id === CHAIN_ID
              return (
                <li key={n.chain.id} role="option" aria-selected={selected}>
                  <button
                    onClick={() => {
                      setOpen(false)
                      select(n.chain.id)
                    }}
                    className={clsx(
                      'flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition',
                      selected ? 'bg-white/10 text-white' : 'text-[var(--muted)] hover:bg-white/5 hover:text-white',
                    )}
                  >
                    <span className={clsx('h-2 w-2 rounded-full', n.isMainnet ? 'bg-emerald-300' : 'bg-amber-300')} />
                    <span className="flex-1">
                      {n.label}
                      <span className="block text-[11px] text-[var(--subtle)]">{n.isMainnet ? 'Real USDC' : 'Test USDC'}</span>
                    </span>
                    {selected && <Check className="h-4 w-4" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function MainnetNotice() {
  if (!IS_MAINNET) return null
  return (
    <div className="border-b border-amber-300/20 bg-amber-300/10 px-4 py-2 text-center text-xs text-amber-100 no-print">
      You are on Arc mainnet. Payments use real USDC and cannot be undone. Allot has not had an independent audit.
    </div>
  )
}

export function ConnectButton({ compact }: { compact?: boolean }) {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, show, truncatedAddress, ensName }) => (
        <Button
          size={compact ? 'sm' : 'md'}
          variant={isConnected ? 'secondary' : 'primary'}
          onClick={show}
          aria-label={isConnected ? `Wallet ${ensName ?? truncatedAddress}` : 'Connect wallet'}
        >
          <Wallet className="h-4 w-4" aria-hidden />
          {isConnected ? (ensName ?? truncatedAddress) : 'Connect wallet'}
          {isConnected && <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />}
        </Button>
      )}
    </ConnectKitButton.Custom>
  )
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-[#0a1426]/70 backdrop-blur-xl no-print">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link to="/" aria-label="Allot home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                clsx(
                  'rounded-full px-4 py-2 text-sm font-medium transition',
                  isActive ? 'bg-white/10 text-white' : 'text-[var(--muted)] hover:bg-white/5 hover:text-white',
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <NetworkSelector />
          <ConnectButton compact />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden" aria-label="Primary mobile">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              clsx(
                'flex min-h-[40px] flex-1 items-center justify-center rounded-xl px-4 text-sm font-medium transition',
                isActive ? 'bg-white/12 text-white' : 'text-[var(--muted)] hover:bg-white/5',
              )
            }
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-1 text-sm text-[var(--muted)] transition hover:text-white"
    >
      {children}
      <ArrowUpRight className="h-3.5 w-3.5 opacity-50 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
    </a>
  )
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-white/8 bg-[#081120]/60 no-print">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-[var(--muted)]">
            Purpose restricted USDC allowances on Arc. Money that can only be spent where you meant it.
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--subtle)]">App</p>
          {NAV.map((n) => (
            <div key={n.to}>
              <Link to={n.to} className="text-sm text-[var(--muted)] transition hover:text-white">
                {n.label}
              </Link>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--subtle)]">Arc</p>
          <div><FooterLink href={ARC_LINKS.site}>Arc</FooterLink></div>
          <div><FooterLink href={ARC_LINKS.explorer}>Arc explorer</FooterLink></div>
          <div><FooterLink href={ARC_LINKS.docs}>Arc docs</FooterLink></div>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--subtle)]">Project</p>
          <div>
            <FooterLink href={GITHUB_URL}>
              <Github className="h-4 w-4" aria-hidden /> GitHub repo
            </FooterLink>
          </div>
          <div>
            <FooterLink href={X_URL}>X @kutluhaneth</FooterLink>
          </div>
          <div>
            <FooterLink href={PORTFOLIO_URL}>kutluhaneth.com</FooterLink>
          </div>
          <div><FooterLink href="https://studio.arc.io">Built in Arc Studio</FooterLink></div>
        </div>
      </div>
      <div className="border-t border-white/8 px-4 py-5 pb-20 text-center text-xs text-[var(--subtle)] sm:px-6">
        <p>
          Running on {NETWORKS[CHAIN_ID].label}, chain {CHAIN_ID}.{' '}
          {IS_MAINNET ? 'Real USDC.' : 'Test funds only.'} Allot is experimental software and has not had an independent audit.
        </p>
        {VAULT_ADDRESS ? (
          <p className="mt-2">
            <span>Vault: </span>
            <a
              className="mono inline-flex items-center gap-1 underline-offset-2 transition hover:text-white hover:underline"
              href={explorerAddress(VAULT_ADDRESS)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {VAULT_ADDRESS.slice(0, 6)}…{VAULT_ADDRESS.slice(-4)}
              <ExternalLink className="h-3 w-3 opacity-60" aria-hidden />
            </a>
          </p>
        ) : null}
      </div>
    </footer>
  )
}

export function Shell() {
  const { pathname } = useLocation()
  const wide = pathname === '/'
  return (
    <div className="flex min-h-dvh flex-col">
      <MainnetNotice />
      <Header />
      <main className={clsx('flex-1', wide ? '' : 'mx-auto w-full max-w-6xl px-4 py-10 sm:px-6')}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
