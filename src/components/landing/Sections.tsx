import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Banknote,
  Building2,
  CalendarClock,
  Coins,
  Gauge,
  GraduationCap,
  HandCoins,
  HeartHandshake,
  Home,
  KeyRound,
  Layers,
  Lock,
  PauseCircle,
  QrCode,
  Receipt,
  ScanLine,
  Store,
  Timer,
  Undo2,
  Users,
  WalletCards,
} from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { ARC_LINKS } from '@/lib/chains'
import { Button, Card } from '../ui'

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-blue-200/80">{eyebrow}</p>
      <h2 className="text-3xl font-bold sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-[var(--muted)]">{body}</p>}
    </div>
  )
}

const Section = ({ children, id }: { children: ReactNode; id?: string }) => (
  <section id={id} className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20">{children}</section>
)

function IconTile({ icon }: { icon: ReactNode }) {
  return <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-300/20 to-violet-300/20 text-blue-100">{icon}</div>
}

export function Problem() {
  const items = [
    { icon: <Banknote className="h-6 w-6" />, title: 'Cash goes anywhere', body: 'Give a teenager lunch money or a worker a stipend and you lose all say over where it ends up.' },
    { icon: <Lock className="h-6 w-6" />, title: 'Closed loop cards are rigid', body: 'Prepaid and gift cards work at one brand, charge fees, and rarely return what is left unused.' },
    { icon: <Undo2 className="h-6 w-6" />, title: 'Unspent money gets stuck', body: 'When a program ends, balances sit idle. Getting them back is manual, slow, or impossible.' },
  ]
  return (
    <Section id="problem">
      <SectionHead eyebrow="The problem" title="Giving money with conditions is still clumsy" body="Families, employers and aid programs all want the same thing: money that helps with a specific need, and nothing else." />
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((i, n) => (
          <Reveal key={i.title} delay={n * 0.08}>
            <Card hover className="h-full p-6"><IconTile icon={i.icon} /><h3 className="text-lg font-semibold">{i.title}</h3><p className="mt-2 text-sm text-[var(--muted)]">{i.body}</p></Card>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

export function HowItWorks() {
  const steps = [
    { n: '01', icon: <HandCoins className="h-6 w-6" />, title: 'Fund', body: 'Lock USDC into an allowance. Set the recipient, a purpose, a per purchase limit, an expiry date and the merchants that can be paid.' },
    { n: '02', icon: <ScanLine className="h-6 w-6" />, title: 'Scan', body: 'At the counter the merchant shows a QR code with the amount and an order reference. The recipient scans it and signs the payment.' },
    { n: '03', icon: <Receipt className="h-6 w-6" />, title: 'Settle', body: 'USDC moves straight from the allowance to the merchant. Both sides get a receipt, and anything unspent returns to you after expiry.' },
  ]
  return (
    <Section id="how">
      <SectionHead eyebrow="How it works" title="Three steps, one tap each" />
      <div className="relative grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal key={s.n} delay={i * 0.1}>
            <Card hover className="relative h-full overflow-hidden p-7">
              <span className="display absolute right-5 top-3 text-6xl font-bold text-white/5">{s.n}</span>
              <IconTile icon={s.icon} />
              <h3 className="text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">{s.body}</p>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

export function Guardrails() {
  const rules = [
    { icon: <Store className="h-5 w-5" />, t: 'Approved merchants only' },
    { icon: <Gauge className="h-5 w-5" />, t: 'Per purchase limit' },
    { icon: <Coins className="h-5 w-5" />, t: 'Fixed total budget' },
    { icon: <CalendarClock className="h-5 w-5" />, t: 'Hard expiry date' },
    { icon: <PauseCircle className="h-5 w-5" />, t: 'Pause or close any time' },
    { icon: <KeyRound className="h-5 w-5" />, t: 'Signed once, never replayed' },
  ]
  return (
    <Section>
      <Card className="p-8 sm:p-12">
        <SectionHead eyebrow="Guardrails" title="The rules live in the contract, not in a promise" body="Every limit is enforced onchain by the AllotVault contract. No admin key, no operator, no way around it." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rules.map((r) => (
            <div key={r.t} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/5 px-4 py-3.5">
              <span className="text-blue-200">{r.icon}</span><span className="font-medium">{r.t}</span>
            </div>
          ))}
        </div>
      </Card>
    </Section>
  )
}

export function Audience() {
  const people = [
    { icon: <Home className="h-6 w-6" />, title: 'Families', body: 'Groceries, school supplies and transport for kids, students or relatives, with money that cannot drift elsewhere.' },
    { icon: <Building2 className="h-6 w-6" />, title: 'Employers', body: 'Meal, travel or equipment stipends that only work where you intend, with unused budget returned on schedule.' },
    { icon: <HeartHandshake className="h-6 w-6" />, title: 'Aid programs', body: 'Targeted support for food, fuel or school fees with a transparent trail from donor to shop.' },
    { icon: <GraduationCap className="h-6 w-6" />, title: 'Schools and communities', body: 'Scholarships, club budgets and grants spent at vetted vendors, receipt by receipt.' },
    { icon: <Store className="h-6 w-6" />, title: 'Merchants', body: 'Show a QR code, get paid in USDC within moments, and see every incoming payment with its order reference.' },
    { icon: <Users className="h-6 w-6" />, title: 'Recipients', body: 'One wallet, a clear remaining budget, and a Scan to pay button that works on a phone.' },
  ]
  return (
    <Section id="who">
      <SectionHead eyebrow="Who it is for" title="Anyone who funds a need and wants it kept on track" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((p, i) => (
          <Reveal key={p.title} delay={(i % 3) * 0.08}>
            <Card hover className="h-full p-6"><IconTile icon={p.icon} /><h3 className="text-lg font-semibold">{p.title}</h3><p className="mt-2 text-sm text-[var(--muted)]">{p.body}</p></Card>
          </Reveal>
        ))}
      </div>
    </Section>
  )
}

export function BuiltOnArc() {
  const points = [
    { icon: <WalletCards className="h-6 w-6" />, title: 'USDC as gas', body: 'Network fees are paid in USDC. Nobody has to find, buy or hold a second token just to move an allowance or pay a shop.' },
    { icon: <Timer className="h-6 w-6" />, title: 'Sub second finality', body: 'Payments are final in under a second, so a QR scan at the counter feels like tapping a card, not waiting on a block.' },
    { icon: <Layers className="h-6 w-6" />, title: 'Stablecoin native design', body: 'Arc is built around USDC from the ground up. Allot uses the official USDC token on Arc, with predictable dollar fees.' },
  ]
  return (
    <Section id="arc">
      <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-blue-400/10 via-[#0d1b2f] to-violet-400/10 p-8 sm:p-14">
        <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-blue-400/15 blur-3xl" />
        <div className="relative">
          <div className="mx-auto mb-3 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-blue-100">
            <TokenUSDC variant="branded" size={16} /> Built on Arc
          </div>
          <SectionHead eyebrow="Built on Arc" title="Made in Arc Studio, settled in USDC" body="Allot was built in Arc Studio and runs on Arc, Circle's blockchain where USDC is the native gas token." />
          <div className="grid gap-4 md:grid-cols-3">
            {points.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.08}>
                <div className="h-full rounded-3xl border border-white/10 bg-[#0a1426]/60 p-6"><IconTile icon={p.icon} /><h3 className="text-lg font-semibold">{p.title}</h3><p className="mt-2 text-sm text-[var(--muted)]">{p.body}</p></div>
              </Reveal>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={ARC_LINKS.site} target="_blank" rel="noopener noreferrer"><Button variant="secondary">Learn about Arc</Button></a>
            <a href="https://studio.arc.io" target="_blank" rel="noopener noreferrer"><Button variant="secondary">Build in Arc Studio</Button></a>
          </div>
        </div>
      </div>
    </Section>
  )
}

export function FinalCta() {
  return (
    <Section>
      <div className="text-center">
        <QrCode className="mx-auto mb-4 h-8 w-8 text-blue-200" />
        <h2 className="text-3xl font-bold sm:text-5xl">Start with Allot on <span className="gradient-text">Arc</span></h2>
        <p className="mx-auto mt-4 max-w-xl text-[var(--muted)]">Pick a role and walk the full flow. Want to practice first? Switch to Arc Testnet from the network menu and use test USDC.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/funder"><Button size="lg" className="w-full sm:w-auto">I am a funder</Button></Link>
          <Link to="/recipient"><Button size="lg" variant="secondary" className="w-full sm:w-auto">I am a recipient</Button></Link>
          <Link to="/merchant"><Button size="lg" variant="secondary" className="w-full sm:w-auto">I am a merchant</Button></Link>
        </div>
      </div>
    </Section>
  )
}
