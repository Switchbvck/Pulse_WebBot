import ServiceIcon from './ServiceIcon'

/** Interactive service tile: tap opens details, Book starts the wizard. */
export default function ServiceCard({ service, index = 0, onBook, onOpen }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && onOpen) onOpen()
      }}
      className="glass-card flex animate-fade-up cursor-pointer flex-col gap-3 p-4"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/15 to-accent-soft/10 text-accent">
          <ServiceIcon name={service.icon} className="h-5 w-5" />
        </span>
        <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-mist-dim">
          {service.duration_min} min
        </span>
      </div>

      <div>
        <h3 className="text-[15px] font-semibold leading-snug text-mist">{service.name}</h3>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-mist-dim">
          {service.description}
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between pt-1">
        <p className="text-base font-bold text-mist">
          from ${service.price}
        </p>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onBook()
          }}
          className="btn-accent h-9 px-4 text-xs"
        >
          Book
        </button>
      </div>
    </div>
  )
}
