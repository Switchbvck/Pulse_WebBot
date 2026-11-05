import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Check, Loader2, Pencil, BadgeCheck, AlertCircle } from 'lucide-react'
import { createBooking, rescheduleBooking } from '../../lib/api'
import { getUser, hapticNotify } from '../../lib/telegram'
import { formatLongDate } from '../../lib/date'
import ServiceIcon from '../ServiceIcon'

function initialsOf(name) {
  return (
    String(name)
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'P'
  )
}

/**
 * Wizard step 3 — review details pulled automatically from Telegram and
 * confirm. In reschedule mode the existing appointment is updated instead.
 * `identity` is the unified app identity ({id, name}) or null in browser demo.
 */
export default function ConfirmStep({
  services,
  identity,
  serviceId,
  date,
  time,
  rescheduleId,
  onEditService,
  onEditSchedule,
  onDone,
}) {
  const user = getUser()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('idle') // idle | submitting | success
  const [submitError, setSubmitError] = useState('')
  const successTimer = useRef(null)

  useEffect(() => () => clearTimeout(successTimer.current), [])

  const service = services?.find((item) => String(item.id) === String(serviceId))
  const resolvedIdentity =
    identity ??
    (user
      ? {
          id: user.id,
          name: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Guest',
        }
      : null)
  const fullName = resolvedIdentity?.name ?? 'Guest'
  const isReschedule = Boolean(rescheduleId)

  async function submit() {
    if (status === 'submitting' || !service) return
    if (!resolvedIdentity) {
      setSubmitError('Identity unavailable — open the app via the bot button.')
      return
    }
    setSubmitError('')
    setStatus('submitting')
    try {
      if (isReschedule) {
        await rescheduleBooking(rescheduleId, { date, time })
      } else {
        await createBooking({
          telegram_id: resolvedIdentity.id,
          user_name: resolvedIdentity.name,
          service_id: serviceId,
          date,
          time,
        })
      }
      // The profile screen must show the fresh list on the next tab visit.
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      queryClient.invalidateQueries({ queryKey: ['admin-metrics'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      hapticNotify('success')
      setStatus('success')
      successTimer.current = setTimeout(onDone, 1400)
    } catch (error) {
      hapticNotify('error')
      setSubmitError(error?.detail ?? 'Booking failed — please try again.')
      setStatus('idle')
    }
  }

  if (!service) {
    return <p className="py-10 text-center text-sm text-mist-dim">Loading booking details…</p>
  }

  return (
    <div className="relative flex flex-1 flex-col">
      {/* Summary */}
      <div className="glass-card animate-fade-up p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/15 to-accent-soft/10 text-accent">
            <ServiceIcon name={service.icon} className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-mist">{service.name}</h2>
            <p className="text-xs text-mist-dim">
              ${service.price} · {service.duration_min} min session
            </p>
          </div>
          {/* Service is fixed while rescheduling — only the slot changes. */}
          {!isReschedule && (
            <button
              type="button"
              onClick={onEditService}
              aria-label="Change service"
              className="btn-ghost h-8 w-8 rounded-xl p-0"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="my-4 h-px bg-white/[0.06]" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-accent">
              <CalendarDays className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <div>
              <p className="text-sm font-semibold text-mist">{formatLongDate(date)}</p>
              <p className="text-xs text-mist-dim">{time}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onEditSchedule}
            aria-label="Change date and time"
            className="btn-ghost h-8 w-8 rounded-xl p-0"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Auto-filled user details from Telegram */}
      <div className="glass-card mt-4 animate-fade-up p-5" style={{ animationDelay: '80ms' }}>
        <div className="flex items-center gap-3">
          <span className="accent-gradient flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-ink">
            {initialsOf(fullName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-mist">{fullName}</p>
            <p className="text-xs text-mist-dim">
              Telegram ID: •••{String(resolvedIdentity?.id ?? user?.id ?? '').slice(-3)}
            </p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
            <BadgeCheck className="h-3 w-3" />
            Auto
          </span>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-mist-faint">
          Pulled from your Telegram profile — no forms needed.
        </p>
      </div>

      {submitError && (
        <p className="mt-4 flex animate-fade-in items-center justify-center gap-1.5 text-center text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {submitError}
        </p>
      )}

      {/* Big CTA */}
      <button
        type="button"
        onClick={submit}
        disabled={status === 'submitting'}
        className={`btn-accent mt-auto h-14 w-full text-[15px] ${
          status === 'submitting' ? 'opacity-70' : ''
        }`}
      >
        {status === 'submitting' ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <Check className="h-5 w-5" strokeWidth={2.5} />
            {isReschedule ? 'Confirm Reschedule' : 'Confirm Booking'}
          </>
        )}
      </button>

      {/* Success overlay */}
      {status === 'success' && (
        <div className="fixed inset-0 z-50 flex animate-fade-in flex-col items-center justify-center gap-4 bg-ink/95 backdrop-blur-xl">
          <span className="accent-gradient flex h-20 w-20 animate-pop-in items-center justify-center rounded-full text-ink shadow-glow">
            <Check className="h-10 w-10" strokeWidth={3} />
          </span>
          <div className="animate-fade-up text-center">
            <h2 className="text-lg font-bold text-mist">
              {isReschedule ? 'Visit rescheduled' : 'Booking confirmed'}
            </h2>
            <p className="mt-1 text-sm text-mist-dim">We will see you soon.</p>
          </div>
        </div>
      )}
    </div>
  )
}
