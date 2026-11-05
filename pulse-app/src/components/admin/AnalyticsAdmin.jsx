import { useState } from 'react'
import { Download } from 'lucide-react'
import { downloadBookingsCsv } from '../../lib/api'
import { useAnalytics } from '../../lib/queries'
import { hapticNotify } from '../../lib/telegram'
import GlassCard from '../GlassCard'
import Skeleton from '../Skeleton'

function shortDay(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
}

/** Admin section: bookings-per-day chart, top services, CSV export. */
export default function AnalyticsAdmin() {
  const analyticsQuery = useAnalytics()
  const data = analyticsQuery.data
  const error = analyticsQuery.isError
  const [exporting, setExporting] = useState(false)

  async function exportCsv() {
    setExporting(true)
    try {
      await downloadBookingsCsv()
      hapticNotify('success')
    } catch {
      hapticNotify('error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-mist-dim">Analytics</h2>
        <button
          type="button"
          onClick={exportCsv}
          disabled={exporting}
          className="btn-ghost h-8 gap-1.5 rounded-xl px-3 text-[11px] disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {error ? (
        <GlassCard className="p-4 text-center text-xs text-mist-dim">Could not load analytics.</GlassCard>
      ) : data === undefined ? (
        <Skeleton className="h-32 rounded-card" />
      ) : (
        <>
          <GlassCard className="!rounded-2xl p-4">
            <div className="flex h-28 items-end gap-1.5" role="img" aria-label="Bookings per day">
              {(data?.bookingsPerDay ?? []).map(({ date, count }) => {
                const max = Math.max(1, ...data.bookingsPerDay.map((day) => day.count))
                const heightPercent = count === 0 ? 6 : Math.round((count / max) * 100)
                return (
                  <div key={date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <div className="flex h-full w-full items-end">
                      <div
                        className={`w-full rounded-t-lg transition-all duration-500 ${
                          count > 0 ? 'accent-gradient' : 'bg-white/[0.06]'
                        }`}
                        style={{ height: `${heightPercent}%` }}
                        title={`${date}: ${count}`}
                      />
                    </div>
                    <span className="text-[9px] uppercase tracking-wide text-mist-faint">
                      {shortDay(date)}
                    </span>
                  </div>
                )
              })}
            </div>
          </GlassCard>

          <h3 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-widest text-mist-faint">
            Top services
          </h3>
          <div className="flex flex-col gap-1.5">
            {data.topServices.map(({ title, count }, index) => (
              <div key={title} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
                <span className="text-[11px] font-bold text-accent">{index + 1}</span>
                <p className="min-w-0 flex-1 truncate text-xs text-mist">{title}</p>
                <p className="text-xs font-semibold tabular-nums text-mist-dim">{count}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
