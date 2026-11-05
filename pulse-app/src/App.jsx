import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCcw } from 'lucide-react'
import BottomNav from './components/BottomNav'
import HomeScreen from './screens/HomeScreen'
import BookingScreen from './screens/BookingScreen'
import ProfileScreen from './screens/ProfileScreen'
import AdminScreen from './screens/AdminScreen'
import { initTelegram, hideBackButton, getUser, getStartParam, isTelegram } from './lib/telegram'
import { queryKeys, useMe } from './lib/queries'
import { exchangeOtt, fetchAppointments } from './lib/api'

// Prefill payload handed to the booking wizard.
// serviceId    -> skip step 1 (opened from a service card)
// rescheduleId -> replace that appointment on confirm instead of creating one
// initialDate  -> preselect a day (waitlist pings: day:<date>)
const DEFAULT_DRAFT = { serviceId: null, rescheduleId: null, initialDate: null }

export default function App() {
  const queryClient = useQueryClient()
  const meQuery = useMe()
  const me = meQuery.data
  const [tab, setTab] = useState('home')
  const [draft, setDraft] = useState(DEFAULT_DRAFT)
  // ?ott=<token> in the URL: a one-time login issued by the bot's Open Pulse button.
  const [ott] = useState(() => new URLSearchParams(window.location.search).get('ott'))

  useEffect(() => {
    initTelegram()
  }, [])

  const user = getUser() // real identity inside Telegram; demo profile in a browser

  // Exchange a bot-issued one-time login token once, then drop it from the URL.
  useEffect(() => {
    if (!ott) return
    exchangeOtt(ott)
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.me }))
      .catch(() => {})
      .finally(() => window.history.replaceState({}, '', window.location.pathname))
  }, [ott, queryClient])

  /**
   * Unified identity for the whole app:
   * - Telegram initData profile (best)
   * - Session resolved from a bot-issued login token (survives lost params)
   * - Browser: null here, screens use the demo identity themselves
   */
  const identity = useMemo(() => {
    if (user) {
      return {
        id: user.id,
        name: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Guest',
      }
    }
    if (me?.id != null) return { id: me.id, name: me.name ?? 'Guest' }
    return null
  }, [user, me])

  // Admin tab comes from the server's opinion (PULSE_ADMIN_IDS), not build env.
  const showAdmin = Boolean(me?.is_admin)

  // Inside Telegram with no identity at all: fail loudly, do not fake it.
  const identityBlocked = isTelegram && meQuery.isSuccess && identity == null

  /** Open the wizard, optionally with a prefilled service / reschedule target / day. */
  const startBooking = useCallback((serviceId = null, rescheduleId = null, initialDate = null) => {
    setDraft({ serviceId, rescheduleId, initialDate })
    setTab('book')
  }, [])

  // Deep link: t.me/<bot>?startapp=<param> (or ?service=<id> in a browser).
  //   svc:<id>  -> open the wizard on that service
  //   apt:<id>  -> reschedule that appointment (resolved from the user's list)
  //   day:<date>-> open the wizard with that day preselected (waitlist pings)
  useEffect(() => {
    if (identityBlocked) return
    const param = getStartParam()
    if (!param) return
    if (param.startsWith('apt:')) {
      if (!identity) return // cannot resolve whose booking it is (yet)
      const bookingId = param.slice(4)
      queryClient
        .fetchQuery({
          queryKey: queryKeys.appointments(identity.id),
          queryFn: () => fetchAppointments(identity.id),
        })
        .then((list) => {
          const appointment = list.find((item) => String(item.id) === String(bookingId))
          if (appointment) startBooking(appointment.service_id, appointment.id)
        })
        .catch(() => {})
      return
    }
    if (param.startsWith('day:')) {
      startBooking(null, null, param.slice(4))
      return
    }
    const serviceId = param.startsWith('svc:') ? param.slice(4) : param
    startBooking(serviceId)
  }, [startBooking, queryClient, user, identity, identityBlocked])

  const changeTab = useCallback((next) => {
    if (next !== 'book') {
      hideBackButton()
      setDraft(DEFAULT_DRAFT)
    }
    setTab(next)
  }, [])

  // Identity notice: Telegram opened the app but handed over no profile.
  if (identityBlocked) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <h1 className="text-lg font-bold text-mist">Identity unavailable</h1>
        <p className="text-sm leading-relaxed text-mist-dim">
          Telegram did not pass your profile to the app. Tap{' '}
          <span className="text-mist">Open Pulse</span> in the bot once more — or
          send <span className="text-mist">/login</span> to the bot and open the
          fresh link it replies with.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-accent h-11 px-6 text-sm"
        >
          <RefreshCcw className="h-4 w-4" />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col">
      {/* Ambient brand glows */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-24 -top-32 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute -left-28 top-1/3 h-72 w-72 rounded-full bg-accent-soft/10 blur-3xl" />
      </div>

      <main className="relative z-10 flex-1 px-4 pb-32 pt-6">
        {tab === 'home' && <HomeScreen onBook={startBooking} />}
        {tab === 'book' && (
          <BookingScreen
            draft={draft}
            identity={identity}
            onDone={() => changeTab('profile')}
            onExit={() => changeTab('home')}
          />
        )}
        {tab === 'profile' && (
          <ProfileScreen
            identity={identity}
            onBook={() => changeTab('book')}
            onReschedule={startBooking}
          />
        )}
        {tab === 'admin' && showAdmin && <AdminScreen />}
      </main>

      <BottomNav active={tab} onChange={changeTab} showAdmin={showAdmin} />
    </div>
  )
}
