import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, CalendarClock, QrCode, ShieldCheck, Store } from 'lucide-react'
import { Button } from '../ui'

function ExampleCard() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-blue-400/25 via-violet-400/20 to-transparent blur-2xl" />
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="glass relative rounded-[2rem] p-6"
      >
        <div className="flex items-center justify-between">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[var(--muted)]">Example allowance</span>
          <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-0.5 text-xs text-emerald-200">Active</span>
        </div>
        <h3 className="mt-5 text-2xl font-semibold">School supplies</h3>
        <p className="text-sm text-[var(--muted)]">For Maya · 3 approved stores</p>
        <p className="display num mt-5 text-5xl font-bold">
          120.00 <span className="text-lg font-medium text-[var(--muted)]">USDC</span>
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-blue-300 to-violet-300" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl bg-white/5 px-3.5 py-2.5"><p className="text-[11px] uppercase tracking-[0.08em] text-[var(--subtle)]">Per purchase</p><p className="num font-semibold">40.00</p></div>
          <div className="rounded-2xl bg-white/5 px-3.5 py-2.5"><p className="text-[11px] uppercase tracking-[0.08em] text-[var(--subtle)]">Expires</p><p className="font-semibold">in 30 days</p></div>
        </div>
      </motion.div>
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
        className="glass absolute -bottom-6 -left-2 flex items-center gap-3 rounded-2xl px-4 py-3 sm:-left-8"
      >
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-300/15 text-violet-200"><QrCode className="h-5 w-5" /></div>
        <div><p className="text-sm font-semibold">Scan to pay</p><p className="text-xs text-[var(--muted)]">Signed, then settled</p></div>
      </motion.div>
    </div>
  )
}

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-24 pt-14 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-24">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-blue-100">
            <ShieldCheck className="h-3.5 w-3.5" /> Purpose restricted USDC on Arc
          </span>
          <h1 className="mt-6 text-5xl font-bold leading-[1.02] sm:text-6xl lg:text-7xl">
            Money that knows <span className="gradient-text">what it is for.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-[var(--muted)]">
            Allot lets you lock USDC into an allowance for groceries, school supplies or transport. The recipient can only
            spend it at merchants you approved, by scanning a QR code. Whatever is left comes back to you.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link to="/funder"><Button size="lg" className="w-full sm:w-auto">Create an allowance <ArrowRight className="h-5 w-5" /></Button></Link>
            <Link to="/merchant"><Button size="lg" variant="secondary" className="w-full sm:w-auto"><Store className="h-5 w-5" /> Accept payments</Button></Link>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[var(--muted)]">
            <li className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-blue-200" /> Expiry and reclaim</li>
            <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-blue-200" /> Per purchase limits</li>
            <li className="flex items-center gap-2"><QrCode className="h-4 w-4 text-blue-200" /> Pay by QR</li>
          </ul>
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.15 }}>
          <ExampleCard />
        </motion.div>
      </div>
    </section>
  )
}
