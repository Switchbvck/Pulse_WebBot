import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useServices } from '../lib/queries'
import { showBackButton, hideBackButton, haptic } from '../lib/telegram'
import { toISODate } from '../lib/date'
import ServiceStep from '../components/booking/ServiceStep'
import ScheduleStep from '../components/booking/ScheduleStep'
import ConfirmStep from '../components/booking/ConfirmStep'

const STEP_TITLES = ['Choose a service', 'Pick date & time', 'Confirm booking']

/**
 * Screen 2 — three-step booking wizard.
 * Steps: 0 service selection, 1 date & time, 2 confirmation.
 */
export default function BookingScreen({ draft, identity, onDone, onExit }) {
  // Cached catalog (shared with HomeScreen via the same query key).
  const { data: services } = useServices()
  const rescheduleId = draft?.rescheduleId ?? null
  // Draft service is resolved once the catalog arrives: deep links may carry
  // ids that do not exist — the wizard then simply starts at step 1 unselected.
  const requestedServiceId = draft?.serviceId ?? null
  const [serviceId, setServiceId] = useState(null)
  // Date is owned here so ScheduleStep always receives a concrete day.
  // Waitlist deep links (day:<date>) preselect the day they refer to.
  const [date, setDate] = useState(() => draft?.initialDate ?? toISODate(new Date()))
  const [time, setTime] = useState(null)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!services || requestedServiceId == null) return
    // Match loosely (deep-link params are strings), store the canonical id.
    const known = services.find((service) => String(service.id) === String(requestedServiceId))
    if (known) {
      setServiceId(known.id)
      setStep(1)
    }
  }, [services, requestedServiceId])

  const goBack = () => {
    haptic('light')
    // Reschedule flow never offers service selection — back exits the wizard.
    if (step === 0 || (step === 1 && rescheduleId)) onExit()
    else setStep((current) => current - 1)
  }

  // Mirror the in-app back arrow onto the native Telegram back button.
  useEffect(() => {
    if (step === 0) {
      hideBackButton()
      return undefined
    }
    showBackButton(goBack)
    return () => hideBackButton()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, onExit])

  const body = useMemo(() => {
    if (step === 0) {
      return (
        <ServiceStep
          services={services}
          selectedId={serviceId}
          onSelect={(id) => {
            haptic('light')
            setServiceId(id)
            setStep(1)
          }}
        />
      )
    }
    if (step === 1) {
      return (
        <ScheduleStep
          date={date}
          time={time}
          serviceId={serviceId}
          onDate={(nextDate) => {
            setDate(nextDate)
            setTime(null)
          }}
          onTime={(nextTime) => {
            haptic('light')
            setTime(nextTime)
          }}
          onNext={() => {
            haptic('light')
            setStep(2)
          }}
        />
      )
    }
    return (
      <ConfirmStep
        services={services}
        identity={identity}
        serviceId={serviceId}
        date={date}
        time={time}
        rescheduleId={rescheduleId}
        onEditService={() => setStep(0)}
        onEditSchedule={() => setStep(1)}
        onDone={onDone}
      />
    )
  }, [step, services, serviceId, date, time, rescheduleId, identity, onDone])

  return (
    <section className="flex min-h-[75dvh] flex-col">
      {/* Header with back control and progress */}
      <header className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={goBack}
          aria-label="Go back"
          className="glass-card flex h-10 w-10 items-center justify-center text-mist transition-all active:scale-95"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-[11px] uppercase tracking-widest text-mist-faint">
            Step {step + 1} of 3
          </p>
          <h1 className="text-base font-bold text-mist">{STEP_TITLES[step]}</h1>
        </div>
      </header>

      <div className="mb-5 flex gap-1.5" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              index <= step ? 'bg-gradient-to-r from-accent-soft to-accent' : 'bg-white/[0.07]'
            }`}
          />
        ))}
      </div>

      <div key={step} className="flex flex-1 animate-step-in flex-col">
        {body}
      </div>
    </section>
  )
}
