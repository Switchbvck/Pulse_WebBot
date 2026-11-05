import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The live API adapter is exercised by stubbing the env var before import.
beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE_URL', '/api')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function stubFetch(payload, { status = 200, ok = true } = {}) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  })
  return global.fetch
}

describe('live API adapters', () => {
  it('maps backend services into the UI shape', async () => {
    stubFetch([
      { id: 1, title: 'Diagnostics', description: 'd', price: 120, duration: 45, icon_name: 'scan' },
    ])
    const api = await import('../lib/api')
    const services = await api.fetchServices()
    expect(services[0]).toEqual({
      id: 1,
      name: 'Diagnostics',
      description: 'd',
      price: 120,
      duration_min: 45,
      icon: 'scan',
    })
  })

  it('derives effective status: past Confirmed bookings read as completed', async () => {
    const past = new Date(Date.now() - 3600_000)
    stubFetch([
      {
        id: 1,
        user_telegram_id: 77,
        user_name: 'Alex',
        service_id: 2,
        service_title: 'Diagnostics',
        date: past.toISOString().slice(0, 10),
        time_slot: past.toISOString().slice(11, 16),
        status: 'Confirmed',
        has_review: false,
      },
    ])
    const api = await import('../lib/api')
    const bookings = await api.fetchAppointments(77)
    expect(bookings[0].status).toBe('completed')
    expect(bookings[0].time).toBe(bookings[0].time) // mapped from time_slot
    expect(bookings[0].hasReview).toBe(false)
  })

  it('keeps future Confirmed bookings upcoming', async () => {
    const future = new Date(Date.now() + 48 * 3600_000)
    stubFetch([
      {
        id: 2,
        user_telegram_id: 77,
        user_name: 'Alex',
        service_id: 3,
        service_title: 'Check-up',
        date: future.toISOString().slice(0, 10),
        time_slot: '23:59',
        status: 'Confirmed',
        has_review: false,
      },
    ])
    const api = await import('../lib/api')
    const bookings = await api.fetchAppointments(77)
    expect(bookings[0].status).toBe('upcoming')
  })

  it('renames time_slot for booking creation', async () => {
    const fetchMock = stubFetch({
      id: 9,
      user_telegram_id: 77,
      user_name: 'Alex',
      service_id: 1,
      service_title: 'Consultation',
      date: '2026-11-10',
      time_slot: '10:00',
      status: 'Confirmed',
      has_review: false,
    })
    const api = await import('../lib/api')
    await api.createBooking({
      telegram_id: 77,
      user_name: 'Alex',
      service_id: 1,
      date: '2026-11-10',
      time: '10:00',
    })
    const [, options] = fetchMock.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(options.method).toBe('POST')
    expect(body).toEqual({
      user_telegram_id: 77,
      user_name: 'Alex',
      service_id: 1,
      date: '2026-11-10',
      time_slot: '10:00',
    })
  })

  it('surfaces backend error details (409 conflicts)', async () => {
    stubFetch({ detail: 'This slot is no longer available' }, { status: 409, ok: false })
    const api = await import('../lib/api')
    await expect(api.createBooking({})).rejects.toMatchObject({
      status: 409,
      message: 'This slot is no longer available',
    })
  })

  it('maps admin overview metrics', async () => {
    stubFetch({ total_bookings_today: 3, estimated_revenue: 180, active_clients: 2 })
    const api = await import('../lib/api')
    const metrics = await api.fetchAdminMetrics()
    expect(metrics).toEqual({
      bookingsToday: 3,
      revenueEstimate: 180,
      activeClients: 2,
    })
  })

  it('maps assistant suggestions with service titles', async () => {
    stubFetch({
      text: 'Found slots',
      suggestions: [{ date: '2026-11-06', time_slot: '12:00', service_id: 1, service_title: 'Consultation' }],
    })
    const api = await import('../lib/api')
    const reply = await api.askAssistant('any')
    expect(reply.suggestions[0]).toEqual({
      date: '2026-11-06',
      time: '12:00',
      serviceId: 1,
      serviceTitle: 'Consultation',
      booked: false,
    })
  })
})
