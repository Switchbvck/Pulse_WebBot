import { CalendarPlus, ChevronLeft, Clock, ShieldCheck, Star } from 'lucide-react'
import { useServiceReviews } from '../lib/queries'
import { haptic } from '../lib/telegram'
import { createPortal } from 'react-dom'
import { useEffect, useRef } from 'react'
import ServiceIcon from './ServiceIcon'
import StarRating from './StarRating'
import Skeleton from './Skeleton'

const GOOD_TO_KNOW = [
  { icon: Clock, text: 'Arrive 5–10 minutes before your slot.' },
  { icon: ShieldCheck, text: 'Free reschedule and cancellation any time.' },
  { icon: Star, text: 'You can rate the visit right from your profile.' },
]

/**
 * Full-screen service detail: description, good-to-know, latest reviews,
 * and a sticky booking CTA. Opened by tapping a service card on Home.
 */
export default function ServiceDetail({ service, onClose, onBook }) {
  const containerRef = useRef(null)
  const { data: reviews, isPending } = useServiceReviews(service.id)

  // Native Telegram back button closes the detail screen.
  useEffect(() => {
    const handler = () => onClose()
    const raw = window.Telegram?.WebApp
    if (!raw?.BackButton) return undefined
    raw.BackButton.onClick(handler)
    raw.BackButton.show()
    return () => {
      raw.BackButton.offClick(handler)
      raw.BackButton.hide()
    }
  }, [onClose])

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-ink"
      role="dialog"
      aria-modal="true"
      aria-label={`${service.name} details`}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-24 -top-32 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <header className="relative z-10 flex items-center gap-3 border-b border-white/[0.06] px-4 pb-3 pt-[max(env(safe-area-inset-top),14px)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="glass-card flex h-10 w-10 items-center justify-center text-mist transition-all active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-sm font-bold text-mist">Service details</p>
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-5">
        {/* Hero */}
        <div className="glass-card flex animate-fade-up items-center gap-4 p-5">
          <span className="accent-gradient flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-ink shadow-glow">
            <ServiceIcon name={service.icon} className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold leading-tight text-mist">{service.name}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">
                from ${service.price}
              </span>
              <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-mist-dim">
                {service.duration_min} min
              </span>
            </div>
          </div>
        </div>

        <p className="mt-4 animate-fade-up text-sm leading-relaxed text-mist-dim">
          {service.description}
        </p>

        {/* Good to know */}
        <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-mist-dim">
          Good to know
        </h2>
        <div className="flex flex-col gap-2">
          {GOOD_TO_KNOW.map(({ icon: Icon, text }) => (
            <div key={text} className="glass-card flex items-center gap-3 p-3">
              <Icon className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.8} />
              <p className="text-xs leading-relaxed text-mist-dim">{text}</p>
            </div>
          ))}
        </div>

        {/* Reviews */}
        <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-widest text-mist-dim">
          Recent reviews
        </h2>
        {isPending ? (
          <Skeleton className="h-20 rounded-card" />
        ) : !reviews || reviews.length === 0 ? (
          <p className="text-xs leading-relaxed text-mist-faint">
            No reviews for this service yet — be the first to share how it went.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {reviews.map((review) => (
              <div key={`${review.user_name}-${review.created_at}`} className="glass-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs font-semibold text-mist">
                    {review.user_name ?? 'Guest'}
                  </p>
                  <StarRating value={review.rating} size="sm" />
                </div>
                {review.comment && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">“{review.comment}”</p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="h-24" /> {/* CTA clearance */}
      </div>

      {/* Sticky CTA */}
      <div className="relative z-10 border-t border-white/[0.06] px-4 pb-safe pt-3">
        <button
          type="button"
          onClick={() => {
            haptic('medium')
            onBook(service.id)
          }}
          className="btn-accent h-13 h-14 w-full text-[15px]"
        >
          <CalendarPlus className="h-5 w-5" />
          Book — from ${service.price}
        </button>
      </div>
    </div>,
    document.body,
  )
}
