import { useEffect } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, X } from 'lucide-react'
import clsx from 'clsx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const variants: Record<Variant, string> = {
  primary: 'btn-primary font-semibold',
  secondary: 'glass text-white hover:bg-white/10 font-medium',
  ghost: 'text-[var(--muted)] hover:text-white hover:bg-white/5 font-medium',
  danger: 'border border-rose-300/30 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20 font-medium',
}

const sizes = {
  sm: 'min-h-[40px] px-3.5 text-sm rounded-xl',
  md: 'min-h-[46px] px-5 text-[15px] rounded-2xl',
  lg: 'min-h-[54px] px-7 text-base rounded-2xl',
}

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function Card({ className, children, hover }: { className?: string; children: ReactNode; hover?: boolean }) {
  return <div className={clsx('glass rounded-3xl', hover && 'glass-hover', className)}>{children}</div>
}

type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'info'

const tones: Record<Tone, string> = {
  neutral: 'bg-white/8 text-[var(--muted)] border-white/10',
  success: 'bg-emerald-300/10 text-emerald-200 border-emerald-300/25',
  warn: 'bg-amber-300/10 text-amber-200 border-amber-300/25',
  danger: 'bg-rose-300/10 text-rose-200 border-rose-300/25',
  info: 'bg-blue-300/10 text-blue-200 border-blue-300/25',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium', tones[tone])}>
      {children}
    </span>
  )
}

export function statusTone(status: string): Tone {
  if (status === 'Active') return 'success'
  if (status === 'Paused') return 'warn'
  if (status === 'Expired') return 'danger'
  return 'neutral'
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--subtle)]">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-[var(--subtle)]">{hint}</span>}
    </label>
  )
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button aria-label="Close" className="absolute inset-0 bg-[#050b17]/75 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="glass relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] bg-[#0d1b2f]/95 p-5 sm:max-w-lg sm:rounded-[2rem] sm:p-7"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20 sm:hidden" />
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{title}</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="grid h-10 w-10 place-items-center rounded-full text-[var(--muted)] transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/8 text-blue-200">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-[var(--muted)]">{body}</p>
      {action}
    </Card>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-2xl bg-white/8', className)} />
}

export function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-blue-200/80">{eyebrow}</p>
        <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-xl text-[var(--muted)]">{subtitle}</p>
      </div>
      {action}
    </div>
  )
}
