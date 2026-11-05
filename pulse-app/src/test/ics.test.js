import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { downloadIcsAppointment } from '../lib/ics'

describe('ics generation', () => {
  let created

  beforeEach(() => {
    created = { url: 'blob:mock', click: vi.fn(), remove: vi.fn() }
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') return created
      return document.createElement(tag)
    })
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {})
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('downloads an .ics with the appointment window', () => {
    downloadIcsAppointment({ title: 'Diagnostics', date: '2026-11-06', time: '10:00', durationMin: 45 })
    expect(created.click).toHaveBeenCalledOnce()
    expect(created.download).toBe('pulse-2026-11-06-10:00.ics')
  })

  it('escapes commas in the summary line', () => {
    let blobContent = ''
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob) => {
        blob.text?.()
        return 'blob:mock'
      }),
      revokeObjectURL: vi.fn(),
    })
    const BlobMock = class {
      constructor(parts) {
        blobContent = parts.join('')
      }
    }
    vi.stubGlobal('Blob', BlobMock)

    downloadIcsAppointment({ title: 'Consult, review', date: '2026-11-06', time: '09:00' })
    expect(blobContent).toContain('SUMMARY:Consult\\, review — Pulse')
    expect(blobContent).toContain('DTSTART:20261106T090000')
    expect(blobContent).toContain('DTEND:20261106T100000') // default 60 min
  })
})
