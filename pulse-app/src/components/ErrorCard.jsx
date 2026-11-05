import { AlertCircle, RotateCcw } from 'lucide-react'

/** Inline error state with a retry action. */
export default function ErrorCard({ onRetry, title = 'Something went wrong' }) {
  return (
    <div className="glass-card flex animate-fade-up flex-col items-center gap-3 p-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
        <AlertCircle className="h-6 w-6" strokeWidth={1.8} />
      </span>
      <div>
        <p className="text-sm font-semibold text-mist">{title}</p>
        <p className="mt-1 text-xs text-mist-dim">Check your connection and try again.</p>
      </div>
      <button type="button" onClick={onRetry} className="btn-ghost h-9 px-5 text-xs">
        <RotateCcw className="h-3.5 w-3.5" />
        Retry
      </button>
    </div>
  )
}
