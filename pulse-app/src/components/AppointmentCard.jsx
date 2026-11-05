import { Check, CalendarClock, CalendarPlus, Pencil, RotateCcw, X } from 'lucide-react'
import ServiceIcon from './ServiceIcon'
import StarRating from './StarRating'
import { SERVICES } from '../data/catalog'
import { formatLongDate } from '../lib/date'
import { downloadIcsAppointment } from '../lib/ics'

const PAST_STATUS_PILLS = {
  completed: { label: 'Completed', icon: Check, className: 'bg-white/[0.05] text-mist-dim' },
  cancelled: { label: 'Cancelled', icon: X, className: 'bg-red-500/10 text-red-400' },
}

function resolveService(appointment) {
  return (
    SERVICES.find((service) => service.id === appointment.service_id) ?? {
      name: appointment.service_name ?? 'Pulse session',
      icon: 'activity',
    }
  )
}

function addToCalendar(appointment, service) {
  downloadIcsAppointment({
    title: service.name,
    date: appointment.date,
    time: appointment.time,
    durationMin: service.duration_min ?? 60,
  })
}

/** Single appointment row in the profile list. */
export default function AppointmentCard({
  appointment,
  variant = 'upcoming',
  onCancel,
  onReschedule,
  onRate,
}) {
  const service = resolveService(appointment)
  const isPast = variant === 'past'
  const canRate = isPast && appointment.status === 'completed' && onRate && !appointment.hasReview

  return (
    <div
      className={`glass-card flex animate-fade-up gap-3 p-4 ${isPast ? 'opacity-70' : ''}`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
          isPast
            ? 'bg-white/[0.05] text-mist-faint'
            : 'bg-gradient-to-br from-accent/15 to-accent-soft/10 text-accent'
        }`}
      >
        <ServiceIcon name={service.icon} className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-mist">{service.name}</h3>
          {isPast &&
            (appointment.hasReview ? (
              <StarRating value={appointment.rating ?? 5} size="sm" />
            ) : (
              (() => {
                const pill = PAST_STATUS_PILLS[appointment.status] ?? PAST_STATUS_PILLS.completed
                const PillIcon = pill.icon
                return (
                  <span
                    className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${pill.className}`}
                  >
                    <PillIcon className="h-3 w-3" />
                    {pill.label}
                  </span>
                )
              })()
            ))}
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-mist-dim">
          <CalendarClock className="h-3.5 w-3.5" />
          {formatLongDate(appointment.date)} · {appointment.time}
        </p>

        {canRate && (
          <button
            type="button"
            onClick={() => onRate(appointment)}
            className="btn-ghost mt-3 h-8 gap-1.5 rounded-xl px-3 text-[11px]"
          >
            <Pencil className="h-3 w-3" />
            Rate this visit
          </button>
        )}

        {!isPast && (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onReschedule(appointment)}
              className="btn-ghost h-8 gap-1.5 rounded-xl px-3 text-[11px]"
            >
              <RotateCcw className="h-3 w-3" />
              Reschedule
            </button>
            <button
              type="button"
              onClick={() => addToCalendar(appointment, service)}
              aria-label="Add to calendar"
              className="btn-ghost h-8 w-8 rounded-xl p-0"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onCancel(appointment)}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 text-[11px] font-medium text-red-400 transition-all active:scale-[0.97]"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
