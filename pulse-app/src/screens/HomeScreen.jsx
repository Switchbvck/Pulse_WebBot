import { useState } from 'react'
import { Activity, Sparkles } from 'lucide-react'
import { useServices } from '../lib/queries'
import { apiSource } from '../lib/api'
import { getUser } from '../lib/telegram'
import { dayGreeting } from '../lib/date'
import ServiceCard from '../components/ServiceCard'
import Skeleton from '../components/Skeleton'
import ErrorCard from '../components/ErrorCard'
import AssistantOverlay from '../components/assistant/AssistantOverlay'
import ServiceDetail from '../components/ServiceDetail'

/** Screen 1 — service dashboard with the welcome header. */
export default function HomeScreen({ onBook }) {
  const user = getUser()
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)
  // TanStack Query: cached, deduplicated — BookingScreen reuses the same key.
  const { data: services, isPending, isError, refetch } = useServices()

  const detailService = services?.find((service) => String(service.id) === String(detailId)) ?? null

  return (
    /* Extra bottom padding keeps the last card clear of the floating FAB. */
    <section className="pb-8">
      {/* Header: Pulse logo + personalized greeting */}
      <header className="mb-5 flex animate-fade-in items-center gap-3">
        <div className="accent-gradient flex h-11 w-11 items-center justify-center rounded-2xl text-ink shadow-glow">
          <Activity className="h-6 w-6" strokeWidth={2.4} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-mist-dim">
            Good {dayGreeting()}, {user?.first_name ?? 'friend'}
          </p>
          <h1 className="text-lg font-bold tracking-tight text-mist">Pulse</h1>
        </div>
      </header>

      {/* Status badge */}
      <div className="glass-card mb-6 flex animate-fade-up items-center gap-3 p-4">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-accent" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-mist">Book your session in two clicks</p>
          <p className="mt-0.5 truncate text-xs text-mist-dim">
            Pick a service, choose a time — done.
          </p>
        </div>
        <Sparkles className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.8} />
      </div>

      {/* Floating AI assistant entry point */}
      <button
        type="button"
        onClick={() => setAssistantOpen(true)}
        aria-label="Ask AI Assistant"
        className="accent-gradient fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full text-ink shadow-glow transition-transform active:scale-95"
      >
        <Sparkles className="h-6 w-6" strokeWidth={2} />
      </button>

      {assistantOpen && <AssistantOverlay onClose={() => setAssistantOpen(false)} />}
      {detailService && (
        <ServiceDetail
          service={detailService}
          onClose={() => setDetailId(null)}
          onBook={(serviceId) => {
            setDetailId(null)
            onBook(serviceId)
          }}
        />
      )}

      {/* Section header */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-mist-dim">Services</h2>
        <span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-mist-faint">
          {services ? `${services.length} available` : apiSource === 'mock' ? 'Demo data' : 'Loading…'}
        </span>
      </div>

      {/* Service grid (or fixed-size skeletons / error state) */}
      {isError ? (
        <ErrorCard onRetry={refetch} title="Could not load services" />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {isPending
            ? Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-44 rounded-card" />
              ))
            : services.map((service, index) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  index={index}
                  onBook={() => onBook(service.id)}
                  onOpen={() => setDetailId(service.id)}
                />
              ))}
        </div>
      )}
    </section>
  )
}
