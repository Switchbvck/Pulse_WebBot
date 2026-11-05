import { Check } from 'lucide-react'
import { SERVICES } from '../../data/catalog'
import { formatLongDate } from '../../lib/date'

function resolveServiceName(slot) {
  return (
    slot.serviceTitle ??
    SERVICES.find((service) => service.id === slot.serviceId)?.name ??
    'Pulse session'
  )
}

/**
 * One chat message. Bot messages may carry bookable slot suggestions
 * with a one-tap "Book Now" action (or a "Booked" state after success).
 */
export default function ChatBubble({ message, onBookSlot }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex animate-fade-up ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser ? '' : 'flex w-[85%] flex-col items-stretch gap-2'}`}>
        <div
          className={
            isUser
              ? 'accent-gradient rounded-2xl rounded-br-md px-4 py-2.5 text-sm font-medium text-ink'
              : 'glass-card rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed text-mist whitespace-pre-line'
          }
        >
          {message.text}
        </div>

        {message.suggestions?.map((slot, index) => (
          <div
            key={`${slot.date}-${slot.time}-${index}`}
            className="glass-card flex items-center justify-between gap-2 !rounded-2xl p-2.5 pl-3"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-mist">
                {formatLongDate(slot.date)} · {slot.time}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-mist-dim">
                {resolveServiceName(slot)}
              </p>
            </div>
            {slot.booked ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-3 py-1.5 text-[11px] font-semibold text-accent">
                <Check className="h-3 w-3" strokeWidth={3} />
                Booked
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onBookSlot(message.id, index)}
                className="btn-accent h-8 shrink-0 px-3 text-[11px]"
              >
                Book Now
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
