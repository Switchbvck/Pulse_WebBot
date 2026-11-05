import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, CalendarCheck, Banknote, Users, CalendarDays, Star } from 'lucide-react'
import { setSlotEnabled } from '../lib/api'
import { queryKeys, useAdminMetrics, useAdminSchedule, useAdminSlots } from '../lib/queries'
import { upcomingDays, toISODate } from '../lib/date'
import { SERVICES } from '../data/catalog'
import GlassCard from '../components/GlassCard'
import Skeleton from '../components/Skeleton'
import ErrorCard from '../components/ErrorCard'
import StatCard from '../components/admin/StatCard'
import Toggle from '../components/admin/Toggle'
import ServicesAdmin from '../components/admin/ServicesAdmin'
import ScheduleAdmin from '../components/admin/ScheduleAdmin'
import AnalyticsAdmin from '../components/admin/AnalyticsAdmin'
import ReviewsAdmin from '../components/admin/ReviewsAdmin'

const DAYPARTS = [
  { key: 'morning', label: 'Morning', icon: null },
  { key: 'afternoon', label: 'Afternoon', icon: null },
  { key: 'evening', label: 'Evening', icon: null },
]

function daypartOf(time) {
  const hour = Number(time.slice(0, 2))
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

const STATUS_BADGES = {
  upcoming: { label: 'Confirmed', className: 'bg-accent/10 text-accent' },
  completed: { label: 'Completed', className: 'bg-white/[0.06] text-mist-dim' },
  cancelled: { label: 'Cancelled', className: 'bg-red-500/10 text-red-400' },
}

function initialsOf(name) {
  return (
    name
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'P'
  )
}

/** Restricted dashboard: metrics, daily schedule, and slot management. */
export default function AdminScreen() {
  const queryClient = useQueryClient()
  const days = upcomingDays(7)
  const [dateISO, setDateISO] = useState(() => toISODate(new Date()))

  const metricsQuery = useAdminMetrics()
  const metrics = metricsQuery.data
  const scheduleQuery = useAdminSchedule(dateISO)
  const schedule = scheduleQuery.data
  const slotsQuery = useAdminSlots(dateISO)
  const slots = slotsQuery.data

  // Optimistic toggle with rollback on failure. Rows carry a stable slot id.
  const toggleMutation = useMutation({
    mutationFn: ({ slot, enabled }) => setSlotEnabled(slot.id, enabled),
    onMutate: async ({ slot, enabled }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.adminSlots(dateISO) })
      const previous = queryClient.getQueryData(queryKeys.adminSlots(dateISO))
      queryClient.setQueryData(queryKeys.adminSlots(dateISO), (current) =>
        current?.map((item) => (item.id === slot.id ? { ...item, enabled } : item)),
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.adminSlots(dateISO), context.previous)
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminSlots(dateISO) }),
  })

  function toggleSlot(slot, enabled) {
    toggleMutation.mutate({ slot, enabled })
  }

  return (
    <section>
      {/* Header */}
      <header className="mb-5 flex animate-fade-in items-center gap-3">
        <div className="flex flex-1 items-center gap-3">
          <span className="accent-gradient flex h-11 w-11 items-center justify-center rounded-2xl text-ink shadow-glow">
            <ShieldCheck className="h-6 w-6" strokeWidth={2} />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-mist">Admin Panel</h1>
            <p className="text-xs text-mist-dim">Pulse operations overview</p>
          </div>
        </div>
        {metrics?.averageRating != null && (
          <span className="flex items-center gap-1 rounded-full bg-white/[0.05] px-2.5 py-1 text-xs font-semibold text-mist">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            {metrics.averageRating}
          </span>
        )}
        <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-accent">
          Staff
        </span>
      </header>

      {/* Metrics summary */}
      {metricsQuery.isPending ? (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[104px] rounded-card" />
          ))}
        </div>
      ) : metricsQuery.isError ? (
        <GlassCard className="p-4 text-center text-xs text-mist-dim">
          Could not load metrics.
        </GlassCard>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={CalendarCheck} label="Total Bookings Today" value={metrics.bookingsToday} index={0} />
          <StatCard icon={Banknote} label="Revenue Estimation" value={`$${metrics.revenueEstimate}`} index={1} />
          <StatCard icon={Users} label="Active Clients" value={metrics.activeClients} index={2} />
        </div>
      )}

      {/* Shared day selector */}
      <div className="no-scrollbar -mx-4 mb-5 mt-6 flex gap-2 overflow-x-auto px-4 pb-1">
        {days.map((day) => {
          const iso = toISODate(day)
          const isSelected = iso === dateISO
          return (
            <button
              key={iso}
              type="button"
              onClick={() => setDateISO(iso)}
              className={`flex min-w-[58px] shrink-0 flex-col items-center gap-0.5 rounded-2xl border py-2.5 transition-all duration-200 active:scale-95 ${
                isSelected
                  ? 'accent-gradient border-transparent text-ink'
                  : 'border-white/[0.06] bg-white/[0.04] text-mist-dim'
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                {iso === toISODate(days[0])
                  ? 'Today'
                  : day.toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
              <span className={`text-base font-bold ${isSelected ? '' : 'text-mist'}`}>
                {day.getDate()}
              </span>
            </button>
          )
        })}
      </div>

      {/* Schedule overview */}
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-dim">
        Schedule Overview
      </h2>
      {scheduleQuery.isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-card" />
          ))}
        </div>
      ) : scheduleQuery.isError ? (
        <ErrorCard onRetry={scheduleQuery.refetch} title='Could not load the schedule' />
      ) : schedule.length === 0 ? (
        <GlassCard className="flex items-center gap-3 p-4">
          <CalendarDays className="h-5 w-5 text-mist-faint" strokeWidth={1.8} />
          <p className="text-sm text-mist-dim">No bookings for this day — clear schedule.</p>
        </GlassCard>
      ) : (
        <ul className="flex flex-col gap-3">
          {schedule.map((appointment, index) => {
            const badge = STATUS_BADGES[appointment.status] ?? STATUS_BADGES.upcoming
            return (
              <li key={appointment.id} className="flex animate-fade-up gap-3" style={{ animationDelay: `${index * 50}ms` }}>
                <p className="w-11 pt-3.5 text-xs font-semibold tabular-nums text-mist-dim">
                  {appointment.time}
                </p>
                <GlassCard className="flex flex-1 items-center gap-3 !rounded-2xl p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-bold text-accent">
                    {initialsOf(appointment.user_name ?? 'Guest')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-mist">
                      {appointment.user_name ?? 'Guest'}
                    </p>
                    <p className="truncate text-[11px] text-mist-dim">
                      {appointment.service_name ??
                        SERVICES.find((service) => service.id === appointment.service_id)?.name ??
                        'Pulse session'}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${badge.className}`}>
                    {badge.label}
                  </span>
                </GlassCard>
              </li>
            )
          })}
        </ul>
      )}

      {/* Slot management */}
      <h2 className="mb-1 mt-6 text-xs font-semibold uppercase tracking-widest text-mist-dim">
        Slot Management
      </h2>
      <p className="mb-3 text-[11px] text-mist-faint">
        Toggles instantly open or close slots for patients on {dateISO}.
      </p>
      {slotsQuery.isError ? (
        <ErrorCard onRetry={slotsQuery.refetch} title='Could not load slots' />
      ) : slotsQuery.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
      ) : (
        DAYPARTS.map(({ key, label }) => {
          const partSlots = slots.filter((slot) => daypartOf(slot.time) === key)
          if (partSlots.length === 0) return null
          return (
            <div key={key} className="mb-4">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-mist-faint">
                {label}
              </h3>
              <GlassCard className="!rounded-2xl p-2">
                {partSlots.map((slot, index) => (
                  <div
                    key={slot.time}
                    className={`flex items-center justify-between px-2 py-2 ${index > 0 ? 'border-t border-white/[0.05]' : ''}`}
                  >
                    <p className="text-sm font-medium tabular-nums text-mist">{slot.time}</p>
                    <Toggle
                      checked={slot.enabled}
                      onChange={(enabled) => toggleSlot(slot, enabled)}
                      label={`${slot.time} availability`}
                    />
                  </div>
                ))}
              </GlassCard>
            </div>
          )
        })
      )}

      <p className="mt-2 text-center text-[10px] leading-relaxed text-mist-faint">
        Demo data — enforce admin role checks server-side in production.
      </p>

      <div className="mt-7 flex flex-col gap-7">
        <ServicesAdmin />
        <ScheduleAdmin />
        <AnalyticsAdmin />
        <ReviewsAdmin />
      </div>
    </section>
  )
}
