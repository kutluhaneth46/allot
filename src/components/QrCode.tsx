import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** Renders a QR code on a white tile so any phone camera can read it. */
export function QrCode({ value, size = 260, label }: { value: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0a1426', light: '#ffffff' } })
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(null))
    return () => {
      cancelled = true
    }
  }, [value, size])

  return (
    <div className="inline-block rounded-3xl bg-white p-3 shadow-[0_20px_60px_-20px_rgba(140,160,255,0.6)]">
      {src ? (
        <img src={src} alt={label} width={size} height={size} className="block max-w-full" style={{ width: size, height: 'auto' }} />
      ) : (
        <div style={{ width: size, height: size }} className="animate-pulse rounded-2xl bg-slate-200" />
      )}
    </div>
  )
}
