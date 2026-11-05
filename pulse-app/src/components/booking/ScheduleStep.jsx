import { useState } from 'react'
import { Sunrise, Sun, MoonStar, ChevronRight, Bell } from 'lucide-react'
import { useJoinWaitlist, usePublicSchedule, useSlots, useWaitlist } from '../../lib/queries'
import { getUser } from '../../lib/telegram'
import { upcomingDays, toISODate, isToday } from '../../lib/date'
import GlassCard from '../../components/GlassCard'
import Skeleton from '../../components/Skeleton'
import ErrorCard from '../../components/ErrorCard'

const DAYPARTS = [
  { key: 'morning', label: 'Morning', icon: Sunrise },
  { key: 'afternoon', label: 'Afternoon', icon: Sun },
  { key: 'evening', label: 'Evening', icon: MoonStar },
]

function daypartOf(time) {
  const hour = Number(time.slice(0, 2))
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

/**
 * Wizard step 2 — scrollable day selector and categorized time-slot grid.
 * `date` is always provided by the parent (initialized to today or a deep
 * link's day). `serviceId` makes availability duration-aware: only starts
 * where the whole appointment fits into free grid time are offered. When a
 * day has no slots, patients can join the waitlist.
 */
export default function ScheduleStep({ date, time, serviceId, onDate, onTime, onNext }) {
  const days = upcomingDays(14)
  const user = getUser()
  const [joinedDays, setJoinedDays] = useState([])

  const { data: slots, isPending, isError, refetch } = useSlots(date, serviceId)
  const { data: schedule } = usePublicSchedule()
  const { data: waitlist } = useWaitlist(user?.id)
  const joinWaitlist = useJoinWaitlist()

  const closedDays = {
    weekdays: (schedule?.weekdays ?? []).filter((rule) => !rule.is_open).map((rule) => rule.weekday),
    holidays: (schedule?.holidays ?? []).map((holiday) => holiday.date),
  }

  function isClosedDay(iso) {
    if (closedDays.holidays.includes(iso)) return true
    const weekday = (new Date(`${iso}T12:00:00`).getDay() + 6) % 7 // 0 = Monday
    return closedDays.weekdays.includes(weekday)
  }

  const dayClosed = isClosedDay(date)
  const dayEmpty = Array.isArray(slots) && slots.length === 0 && !dayClosed
  const alreadyOnList =
    joinedDays.includes(date) || Boolean(waitlist?.some((entry) => entry.date === date))

  return (
    <div className="flex flex-1 flex-col">
      {/* Horizontal day selector */}
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {days.map((day) => {
          const iso = toISODate(day)
          const isSelected = iso === date
          const closed = isClosedDay(iso)
          return (
            <button
              key={iso}
              type="button"
              onClick={() => !closed && onDate(iso)}
              disabled={closed}
              aria-disabled={closed}
              className={`flex min-w-[58px] shrink-0 flex-col items-center gap-0.5 rounded-2xl border py-2.5 transition-all duration-200 ${
                closed
                  ? 'cursor-not-allowed border-white/[0.03] bg-white/[0.02] text-mist-faint opacity-40'
                  : isSelected
                    ? 'accent-gradient border-transparent text-ink active:scale-95'
                    : 'border-white/[0.06] bg-white/[0.04] text-mist-dim active:scale-95'
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                {isToday(iso) ? 'Today' : day.toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
              <span className={`text-base font-bold ${isSelected ? '' : 'text-mist'}`}>
                {day.getDate()}
              </span>
            </button>
          )
        })}
      </div>

      {/* Time slots */}
      <div className="flex-1">
        {isError ? (
          <ErrorCard onRetry={refetch} title="Could not load time slots" />
        ) : isPending ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 9 }).map((_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : dayClosed ? (
          <GlassCard className="p-5 text-center">
            <p className="text-sm text-mist-dim">The clinic is closed on this day.</p>
          </GlassCard>
        ) : dayEmpty ? (
          <WaitlistPanel
            joined={alreadyOnList}
            joining={joinWaitlist.isPending}
            onJoin={() =>
              joinWaitlist.mutate(date, {
                onSuccess: () => setJoinedDays((current) => [...current, date]),
              })
            }
          />
        ) : (
          DAYPARTS.map(({ key, label, icon: Icon }) => {
            const partSlots = slots.filter((slot) => daypartOf(slot) === key)
            if (partSlots.length === 0) return null
            return (
              <div key={key} className="mb-5">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-mist-dim">
                  <Icon className="h-3.5 w-3.5 text-accent" />
                  {label}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {partSlots.map((slot) => {
                    const isSelected = slot === time
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => onTime(slot)}
                        className={`h-10 rounded-xl border text-sm transition-all duration-200 active:scale-95 ${
                          isSelected
                            ? 'accent-gradient border-transparent font-semibold text-ink'
                            : 'border-white/[0.06] bg-white/[0.04] text-mist'
                        }`}
                      >
                        {slot}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Continue CTA — fixed height, always rendered to prevent shifts */}
      <button
        type="button"
        onClick={onNext}
        disabled={!time}
        className={`btn-accent mt-2 h-12 w-full text-sm ${
          !time ? 'pointer-events-none opacity-40' : ''
        }`}
      >
        Continue
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

/** Shown when a day has no open slots: join the waitlist with one tap. */
function WaitlistPanel({ joined, joining, onJoin }) {
  return (
    <GlassCard className="animate-fade-up p-5 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/15 to-accent-soft/10 text-accent">
        <Bell className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <p className="mt-3 text-sm font-semibold text-mist">No slots left on this day</p>
      <p className="mx-auto mt-1 max-w-[260px] text-xs leading-relaxed text-mist-dim">
        Join the waitlist and we will ping you here the moment a slot frees up.
      </p>
      <button
        type="button"
        onClick={onJoin}
        disabled={joined || joining}
        className={`mt-4 h-10 w-full text-xs ${joined ? 'btn-ghost text-accent' : 'btn-accent'}`}
      >
        {joined ? "🔔 You're on the list" : joining ? 'Joining…' : '🔔 Notify me'}
      </button>
    </GlassCard>
  )
}
