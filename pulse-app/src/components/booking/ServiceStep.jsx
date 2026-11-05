import { Check } from 'lucide-react'
import ServiceIcon from '../ServiceIcon'
import Skeleton from '../Skeleton'

/** Wizard step 1 — pick a service. */
export default function ServiceStep({ services, selectedId, onSelect }) {
  if (!services) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[74px] rounded-card" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {services.map((service, index) => {
        const isSelected = service.id === selectedId
        return (
          <button
            key={service.id}
            type="button"
            onClick={() => onSelect(service.id)}
            className={`glass-card flex animate-fade-up items-center gap-3 p-4 text-left transition-all duration-200 active:scale-[0.98] ${
              isSelected ? 'ring-1 ring-accent/60' : ''
            }`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/15 to-accent-soft/10 text-accent">
              <ServiceIcon name={service.icon} className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-mist">{service.name}</span>
              <span className="mt-0.5 block text-xs text-mist-dim">
                ${service.price} · {service.duration_min} min
              </span>
            </span>
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
                isSelected ? 'accent-gradient text-ink' : 'border border-white/15'
              }`}
            >
              {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
