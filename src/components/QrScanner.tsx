import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { CameraOff } from 'lucide-react'

interface Props {
  onResult: (text: string) => void
  /** Called when the camera cannot start so the parent can offer a manual fallback. */
  onUnavailable?: () => void
}

/** Live camera QR scanner. The stream stops as soon as a code is read or the view unmounts. */
export function QrScanner({ onResult, onUnavailable }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const handler = useRef({ onResult, onUnavailable })
  useEffect(() => {
    handler.current = { onResult, onUnavailable }
  })

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false

    const stop = () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }

    const tick = () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (stopped || !video || !canvas) return
      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        const scale = Math.min(1, 640 / video.videoWidth)
        canvas.width = Math.floor(video.videoWidth * scale)
        canvas.height = Math.floor(video.videoHeight * scale)
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
          if (code?.data) {
            stop()
            handler.current.onResult(code.data)
            return
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot open the camera. Paste the payment link instead.')
        handler.current.onUnavailable?.()
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        raf = requestAnimationFrame(tick)
      } catch {
        setError('Camera access was blocked. Allow the camera in your browser, or paste the payment link instead.')
        handler.current.onUnavailable?.()
      }
    }

    void start()
    return stop
  }, [])

  if (error) {
    return (
      <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 bg-black/30 p-6 text-center">
        <CameraOff className="h-8 w-8 text-amber-200" />
        <p className="max-w-xs text-sm text-[var(--muted)]">{error}</p>
      </div>
    )
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-white/10 bg-black">
      <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="h-3/5 w-3/5 rounded-3xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(5,11,23,0.55)]" />
      </div>
    </div>
  )
}
