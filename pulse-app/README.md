# Pulse App

**Pulse** — a premium appointment-booking Telegram Mini App. Patients pick a
service, choose a date and time slot, and confirm with their Telegram identity
auto-filled — no forms. A profile screen tracks upcoming sessions with a live
countdown and supports cancel/reschedule.

Built with **Vite + React 18 + Tailwind CSS 3** and **Lucide icons**.
Runs standalone on built-in demo data (`npm run dev`) or against a real backend.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173 — runs on demo data, no backend needed
npm run build    # production bundle in dist/
```

Requires Node 18+.

## Connecting to a backend

A ready-to-run **FastAPI backend** ships in `../backend` (SQLite, seeded with
services and two weeks of slots):

```bash
# terminal 1 — backend on :8000
cd ../backend && py -3 -m uvicorn main:app --reload --port 8000
# terminal 2 — frontend with VITE_API_BASE_URL=/api
npm run dev
```

With `VITE_API_BASE_URL` set, every request carries the header
`X-Telegram-Init-Data: <raw initData>` so the server can authenticate the
Telegram user (validate the HMAC-SHA256 signature with your bot token —
see the [Telegram Web App docs](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)).
Outside Telegram the header is empty and the demo identity is used.
`src/lib/api.js` maps the backend naming (`title`/`time_slot`/`Confirmed`)
into the UI shape; without a backend the in-memory mock keeps the app demoable.

### API contract

| Method | Endpoint                        | Body / Query                                   | Response |
|--------|---------------------------------|------------------------------------------------|----------|
| GET    | `/api/services`                 | —                                              | `Service[]` |
| GET    | `/api/slots`                    | `?date=YYYY-MM-DD`                             | `string[]` — available `"HH:MM"` times |
| GET    | `/api/bookings`                 | `?user_id=&date=` (both optional)              | `Booking[]` |
| POST   | `/api/bookings`                 | `{ user_telegram_id, user_name, service_id, date, time_slot }` | `Booking` |
| POST   | `/api/bookings/:id/cancel`      | —                                              | `Booking` |
| POST   | `/api/bookings/:id/reschedule`  | `{ date, time_slot }`                          | `Booking` |
| POST   | `/api/assistant/query`          | `{ message }`                                  | `{ text, suggestions: [{ date, time_slot, service_id, service_title }] }` |
| GET    | `/api/admin/overview`           | —                                              | `{ total_bookings_today, estimated_revenue, active_clients }` |
| GET    | `/api/admin/slots`              | `?date=YYYY-MM-DD`                             | `{ id, date, time_slot, is_available }[]` |
| PATCH  | `/api/admin/slots/:id`          | `{ is_available }`                             | `Slot` |

Types:

```ts
interface Service {
  id: string | number
  name: string           // backend: title
  description: string
  price: number          // USD
  duration_min: number   // backend: duration
  icon: string           // backend: icon_name
}

interface Appointment {
  id: string | number
  service_id: string | number
  service_name?: string  // backend: service_title
  user_name?: string
  date: string           // "YYYY-MM-DD" (local)
  time: string           // "HH:MM", 24h (backend: time_slot)
  status: 'upcoming' | 'completed' | 'cancelled'  // backend: Confirmed/Completed/Cancelled
}
```

## AI Booking Assistant

A floating button on Home opens a full-screen chat (`AssistantOverlay`). The
built-in demo brain (`src/lib/assistant.js`) parses service names, relative
dates ("today", "tomorrow", weekdays, "weekend"), and day-parts, then answers
with real availability and one-tap **Book Now** slot cards. In live mode the
same conversation is delegated to `POST /assistant/query`, so an LLM backend
can replace the rule-based parser without UI changes.

## Admin Panel (role-restricted)

A fourth **Admin** tab appears only for administrators:

- **Metrics summary** — bookings today, revenue estimation, active clients,
  average rating.
- **Schedule overview** — daily timeline of every booking with customer
  initials, service, and status badges (Confirmed / Completed / Cancelled).
- **Slot management** — toggle switches per time slot; closing a slot is
  instantly reflected in patient-facing availability and assistant results.
- **Services** — full CRUD (name, description, price, duration, icon) plus a
  printable QR code with the service deep link (live mode).
- **Working hours** — per-weekday opening hours, closed dates (holidays);
  changes rebuild the slot grid instantly.
- **Analytics** — bookings-per-day chart, top services, CSV export.
- **Reviews** — latest post-visit ratings and comments.

## Waiting list & service details

- Days with no open slots offer a one-tap **"Notify me"** — when a booking is
  cancelled, rescheduled, or a slot is re-opened, everyone on that day's
  waitlist gets a Telegram ping with the freed times and a **Book now**
  deep link (`startapp=day:<date>`).
- Tapping a service card opens a **detail screen**: description, price,
  duration, good-to-know notes, and the latest reviews for that service.
- All data fetching runs on **TanStack Query** (cached, deduplicated, with
  optimistic slot toggles and `keepPreviousData` day switching).

Access rules (`src/lib/roles.js`): in demo mode the panel is always shown;
in live mode only Telegram IDs listed in `VITE_ADMIN_IDS` see the tab. The
frontend gate is cosmetic — the backend must authorize `/admin/*` requests
via the signed `X-Telegram-Init-Data` header.

## Deep links & calendar

- `https://t.me/<bot>?startapp=<serviceId>` opens the Mini App with the wizard
  already on that service (outside Telegram: `?service=<id>` works too).
- Every upcoming booking has an **Add to calendar** button that downloads an
  `.ics` file (floating local time, service duration included).

## Wiring into Telegram

1. Deploy `dist/` over **HTTPS** (Vercel/Netlify work out of the box; locally
   use `ngrok http 5173` during development).
2. In @BotFather: **/newapp** (or Bot Settings → Menu Button) and point it at
   the HTTPS URL. The app expands full-screen via `WebApp.expand()`.
3. The chrome (header/background) is synced to the brand color `#0F1115`, and
   haptic feedback fires on selections and confirmations when available.

## Project structure

```
pulse-app/
├── index.html                  # Telegram SDK + Inter font, dark base color
├── vite.config.js              # /api proxy to localhost:8000 for dev
├── tailwind.config.js          # brand palette, radii, animations
└── src/
    ├── App.jsx                 # tab routing + booking draft prefill
    ├── index.css               # glass/accent utility classes, skeletons
    ├── data/catalog.js         # service catalog (mirrors GET /services)
    ├── lib/
    │   ├── telegram.js         # WebApp SDK wrapper: user, haptics, back button
    │   ├── api.js              # REST client + initData header, mock fallback
    │   ├── mockApi.js          # in-memory backend for standalone demo
    │   ├── assistant.js        # rule-based AI brain (parse + slot search)
    │   ├── roles.js            # admin gate (VITE_ADMIN_IDS / demo mode)
    │   └── date.js             # ISO helpers, countdown math
    ├── components/
    │   ├── BottomNav.jsx       # fixed glass tab bar (+ conditional Admin tab)
    │   ├── ServiceCard.jsx     # home dashboard tile
    │   ├── AppointmentCard.jsx # profile list row
    │   ├── CountdownTimer.jsx  # live nearest-visit countdown
    │   ├── Modal.jsx           # bottom sheet (portal)
    │   ├── assistant/          # chat overlay, bubbles, prompt chips
    │   ├── admin/              # StatCard, Toggle switch
    │   ├── ServiceIcon.jsx / GlassCard.jsx / Skeleton.jsx / ErrorCard.jsx
    │   └── booking/
    │       ├── ServiceStep.jsx # wizard step 1
    │       ├── ScheduleStep.jsx# wizard step 2 (days + daypart slot grid)
    │       └── ConfirmStep.jsx # wizard step 3 (+ success overlay)
    └── screens/
        ├── HomeScreen.jsx      # dashboard + AI assistant entry point
        ├── BookingScreen.jsx   # 3-step wizard shell
        ├── ProfileScreen.jsx   # My Bookings
        └── AdminScreen.jsx     # metrics, schedule, slot management
```

## Design notes

- Deep dark base `#0F1115`, glassmorphic cards (`bg-white/[0.04]` + blur +
  hairline borders), neon mint→blue accents `#00F2FE → #4FACFE`, 16–24 px radii.
- Telegram dark/black themes are fully supported; light themes still get the
  premium dark brand look (intentional — see `src/lib/telegram.js`).
- No layout shifts: async content renders fixed-size shimmer skeletons, the
  bottom bar is always present, and the CTA keeps a constant height.
- All UI text is English; haptics fire on taps, slot picks, and outcomes.
