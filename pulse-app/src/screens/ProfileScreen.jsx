import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, CalendarX, Bell } from 'lucide-react'
import { cancelBooking, createReview, deleteWaitlistEntry } from '../lib/api'
import { queryKeys, useAppointments, useWaitlist } from '../lib/queries'
import { getUser, hapticNotify } from '../lib/telegram'
import { appointmentDate, formatLongDate } from '../lib/date'
import { SERVICES } from '../data/catalog'
import AppointmentCard from '../components/AppointmentCard'
import CountdownTimer from '../components/CountdownTimer'
import ServiceIcon from '../components/ServiceIcon'
import Modal from '../components/Modal'
import Skeleton from '../components/Skeleton'
import ErrorCard from '../components/ErrorCard'
import StarRating from '../components/StarRating'
import { downloadIcsAppointment } from '../lib/ics'

function serviceNameOf(appointment) {
  return (
    SERVICES.find((service) => service.id === appointment.service_id)?.name ??
    appointment.service_name ??
    'Pulse session'
  )
}

/** Screen 3 — "My Bookings": countdown to the nearest visit, history, actions. */
export default function ProfileScreen({ identity, onBook, onReschedule }) {
  const user = getUser() ?? identity ?? null
  const userId = user?.id ?? null
  const queryClient = useQueryClient()
  const appointmentsQuery = useAppointments(userId)
  const waitlistQuery = useWaitlist(userId)

  const [cancelTarget, setCancelTarget] = useState(null)
  const [rateTarget, setRateTarget] = useState(null)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [reviewError, setReviewError] = useState(false)

  const cancelMutation = useMutation({
    mutationFn: cancelBooking,
    onSuccess: () => {
      hapticNotify('success')
      setCancelTarget(null)
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments(userId) })
    },
    onError: () => hapticNotify('error'),
  })

  const reviewMutation = useMutation({
    mutationFn: ({ bookingId, payload }) => createReview(bookingId, payload),
    onSuccess: () => {
      hapticNotify('success')
      setRateTarget(null)
      setRating(5)
      setComment('')
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments(userId) })
    },
    onError: (error) => {
      hapticNotify('error')
      setReviewError(error?.detail ?? 'Could not submit the review.')
    },
  })

  const removeWaitlist = useMutation({
    mutationFn: deleteWaitlistEntry,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.waitlist(userId) }),
  })

  const appointments = appointmentsQuery.data
  const error = appointmentsQuery.isError
  const loading = appointmentsQuery.isPending

  const { nearest, upcoming, past } = useMemo(() => {
    if (!appointments) return { nearest: null, upcoming: [], past: [] }
    const now = new Date()
    const sorted = [...appointments].sort(
      (a, b) => appointmentDate(a.date, a.time) - appointmentDate(b.date, b.time),
    )
    const future = sorted.filter(
      (appointment) =>
        appointment.status === 'upcoming' && appointmentDate(appointment.date, appointment.time) > now,
    )
    const history = sorted.filter((appointment) => !future.includes(appointment))
    return { nearest: future[0] ?? null, upcoming: future.slice(1), past: history }
  }, [appointments])

  function confirmCancel() {
    if (!cancelTarget) return
    cancelMutation.mutate(cancelTarget.id)
  }

  function submitReview() {
    if (!rateTarget) return
    reviewMutation.mutate({
      bookingId: rateTarget.id,
      payload: { rating, comment },
    })
  }

  return (
    <section>
      <header className="mb-5 animate-fade-in">
        <p className="text-xs text-mist-dim">Your activity</p>
        <h1 className="text-xl font-bold tracking-tight text-mist">My Bookings</h1>
      </header>

      {error ? (
        <ErrorCard onRetry={appointmentsQuery.refetch} title="Could not load your bookings" />
      ) : loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-52 rounded-card" />
          <Skeleton className="h-20 rounded-card" />
          <Skeleton className="h-20 rounded-card" />
        </div>
      ) : appointments.length === 0 ? (
        /* Empty state */
        <div className="glass-card flex animate-fade-up flex-col items-center gap-4 p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/15 to-accent-soft/10 text-accent">
            <CalendarX className="h-7 w-7" strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-sm font-semibold text-mist">No bookings yet</p>
            <p className="mt-1 text-xs text-mist-dim">Your scheduled sessions will appear here.</p>
          </div>
          <button type="button" onClick={onBook} className="btn-accent h-10 px-6 text-xs">
            Book a session
          </button>
        </div>
      ) : (
        <>
          {/* Nearest visit with live countdown */}
          {nearest && (
            <div className="glass-card mb-6 animate-fade-up border-accent/20 p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">
                  Next session
                </p>
                <p className="text-xs text-mist-dim">
                  {nearest.date} · {nearest.time}
                </p>
              </div>
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent/15 to-accent-soft/10 text-accent">
                  <ServiceIcon name={SERVICES.find((s) => s.id === nearest.service_id)?.icon} className="h-5 w-5" />
                </span>
                <h2 className="text-sm font-semibold text-mist">{serviceNameOf(nearest)}</h2>
              </div>
              <CountdownTimer target={appointmentDate(nearest.date, nearest.time)} />
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => onReschedule(nearest.service_id, nearest.id)}
                  className="btn-ghost h-10 flex-1 text-xs"
                >
                  Reschedule
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const service = SERVICES.find((s) => s.id === nearest.service_id)
                    downloadIcsAppointment({
                      title: service?.name ?? serviceNameOf(nearest),
                      date: nearest.date,
                      time: nearest.time,
                      durationMin: service?.duration_min ?? 60,
                    })
                  }}
                  aria-label="Add to calendar"
                  className="btn-ghost h-10 w-10 shrink-0 rounded-2xl p-0"
                >
                  <CalendarPlus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCancelTarget(nearest)}
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-xs font-semibold text-red-400 transition-all active:scale-[0.97]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Other upcoming bookings */}
          {upcoming.length > 0 && (
            <>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-dim">
                Upcoming
              </h2>
              <div className="mb-6 flex flex-col gap-3">
                {upcoming.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    onCancel={setCancelTarget}
                    onReschedule={(item) => onReschedule(item.service_id, item.id)}
                  />
                ))}
              </div>
            </>
          )}

          {/* History */}
          {past.length > 0 && (
            <>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist-dim">
                History
              </h2>
              <div className="flex flex-col gap-3">
                {past.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    variant="past"
                    onRate={setRateTarget}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

          {/* Waitlist */}
          {(waitlistQuery.data?.length ?? 0) > 0 && (
            <>
              <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-mist-dim">
                <Bell className="h-3.5 w-3.5 text-accent" />
                Waitlist
              </h2>
              <div className="mb-6 flex flex-col gap-2">
                {waitlistQuery.data.map((entry) => (
                  <div
                    key={entry.id}
                    className="glass-card flex animate-fade-up items-center gap-3 p-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                      <Bell className="h-4 w-4" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-mist">
                        {formatLongDate(entry.date)}
                      </p>
                      <p className="text-[11px] text-mist-dim">
                        We will ping you when a slot opens.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeWaitlist.mutate(entry.id)}
                      aria-label={`Leave waitlist for ${entry.date}`}
                      className="btn-ghost h-7 rounded-lg px-2.5 text-[10px]"
                    >
                      Leave
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}


      {/* Cancel confirmation sheet */}
      <Modal open={Boolean(cancelTarget)} onClose={() => setCancelTarget(null)}>
        <h2 className="text-base font-bold text-mist">Cancel this booking?</h2>
        <p className="mt-2 text-sm text-mist-dim">
          Your slot will be released and this action cannot be undone.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setCancelTarget(null)}
            className="btn-ghost h-11 flex-1 text-sm"
          >
            Keep booking
          </button>
          <button
            type="button"
            onClick={confirmCancel}
            disabled={cancelMutation.isPending}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/15 text-sm font-semibold text-red-400 transition-all active:scale-[0.97]"
          >
            {cancelMutation.isPending ? 'Cancelling…' : 'Yes, cancel it'}
          </button>
        </div>
      </Modal>

      {/* Rate your visit sheet */}
      <Modal open={Boolean(rateTarget)} onClose={() => setRateTarget(null)}>
        <h2 className="text-base font-bold text-mist">Rate your visit</h2>
        {rateTarget && (
          <p className="mt-1 text-xs text-mist-dim">
            {serviceNameOf(rateTarget)} · {rateTarget.date} at {rateTarget.time}
          </p>
        )}
        <div className="mt-5 flex justify-center">
          <StarRating value={rating} onChange={setRating} size="lg" />
        </div>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Share a few words (optional)"
          aria-label="Review comment"
          rows={3}
          maxLength={500}
          className="glass-card mt-4 w-full bg-transparent px-4 py-3 text-sm text-mist outline-none placeholder:text-mist-faint"
        />
        {reviewError && <p className="mt-2 text-center text-xs text-red-400">{reviewError}</p>}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => setRateTarget(null)}
            className="btn-ghost h-11 flex-1 text-sm"
          >
            Later
          </button>
          <button
            type="button"
            onClick={submitReview}
            disabled={reviewMutation.isPending}
            className="btn-accent h-11 flex-1 text-sm disabled:opacity-60"
          >
            {reviewMutation.isPending ? 'Sending…' : 'Submit review'}
          </button>
        </div>
      </Modal>
    </section>
  )
}
