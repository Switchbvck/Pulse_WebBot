import { describe, expect, it } from 'vitest'
import {
  appointmentDate,
  countdownParts,
  formatLongDate,
  isToday,
  toISODate,
  upcomingDays,
} from '../lib/date'

describe('date helpers', () => {
  it('formats ISO dates in local time', () => {
    expect(toISODate(new Date(2026, 10, 7))).toBe('2026-11-07')
  })

  it('keeps the day selector sorted and midnight-normalized', () => {
    const days = upcomingDays(14)
    expect(days).toHaveLength(14)
    expect(isToday(toISODate(days[0]))).toBe(true)
    for (let i = 1; i < days.length; i += 1) {
      expect(days[i].getTime()).toBeGreaterThan(days[i - 1].getTime())
    }
  })

  it('builds appointment dates from date + time', () => {
    expect(appointmentDate('2026-11-05', '10:30').getMinutes()).toBe(30)
  })

  it('formats long dates in en-US', () => {
    expect(formatLongDate('2026-11-05')).toMatch(/Thu, Nov 5/)
  })

  it('counts down to the target', () => {
    const target = new Date(Date.now() + 2 * 3600_000 + 60_000)
    const parts = countdownParts(target, new Date())
    expect(parts.h).toBeGreaterThanOrEqual(1)
    expect(parts.d).toBe(0)
  })

  it('clamps countdown at zero', () => {
    const parts = countdownParts(new Date(Date.now() - 1000), new Date())
    expect(parts.total).toBe(0)
  })
})
