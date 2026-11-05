import { useEffect, useRef, useState } from 'react'
import { countdownParts, pad2 } from '../lib/date'

const BLOCKS = [
  { key: 'd', label: 'Days' },
  { key: 'h', label: 'Hours' },
  { key: 'm', label: 'Min' },
  { key: 's', label: 'Sec' },
]

/** Live seconds-precision countdown to the nearest appointment. */
export default function CountdownTimer({ target }) {
  const [now, setNow] = useState(() => new Date())
  const doneRef = useRef(false)

  useEffect(() => {
    doneRef.current = false
    const timer = setInterval(() => {
      if (!doneRef.current && target.getTime() - Date.now() <= 0) {
        doneRef.current = true
        clearInterval(timer) // countdown over — stop ticking
      }
      setNow(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [target])

  const parts = countdownParts(target, now)

  if (parts.total <= 0) {
    return (
      <p className="text-sm font-semibold text-accent" aria-live="polite">
        Starting now
      </p>
    )
  }

  return (
    <div className="grid grid-cols-4 gap-2" role="timer" aria-live="off">
      {BLOCKS.map(({ key, label }) => (
        <div
          key={key}
          className="flex flex-col items-center gap-0.5 rounded-xl border border-white/[0.06] bg-white/[0.05] py-2"
        >
          <span className="text-xl font-bold tabular-nums text-mist">{pad2(parts[key])}</span>
          <span className="text-[10px] uppercase tracking-wider text-mist-faint">{label}</span>
        </div>
      ))}
    </div>
  )
}
