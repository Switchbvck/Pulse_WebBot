import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import {
  addAdminHoliday,
  deleteAdminHoliday,
  updateAdminScheduleRules,
} from '../../lib/api'
import { queryKeys, useHolidays, useScheduleRules } from '../../lib/queries'
import { haptic, hapticNotify } from '../../lib/telegram'
import GlassCard from '../GlassCard'
import Skeleton from '../Skeleton'
import Toggle from './Toggle'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const EMPTY_HOLIDAY = { date: '', note: '' }

// The bookable grid runs 09:00 – 20:30 in 30-minute steps (matches the backend
// defaults). Selects are used instead of native time inputs so the rows stay
// pixel-aligned and always render in 24-hour format regardless of OS locale.
const GRID_TIMES = []
for (let minutes = 9 * 60; minutes <= 20 * 60 + 30; minutes += 30) {
  GRID_TIMES.push(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`)
}

function TimeSelect({ value, onChange, disabled, minAfter, label }) {
  const options = GRID_TIMES.filter((time) => {
    if (minAfter == null) return time < GRID_TIMES[GRID_TIMES.length - 1] // opening: not the last slot
    return time > minAfter // closing: must be after the opening time
  })
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-label={label}
      className="h-8 rounded-xl border border-white/[0.06] bg-white/[0.04] px-2 text-xs tabular-nums text-mist outline-none transition-colors disabled:opacity-40"
    >
      {options.map((time) => (
        <option key={time} value={time} className="bg-ink text-mist">
          {time}
        </option>
      ))}
    </select>
  )
}

/** Admin section: per-weekday opening hours and closed dates. */
export default function ScheduleAdmin() {
  const queryClient = useQueryClient()
  const rulesQuery = useScheduleRules()
  const holidaysQuery = useHolidays()
  const rules = rulesQuery.data
  const holidays = holidaysQuery.data?.holidays ?? []

  const [newHoliday, setNewHoliday] = useState(EMPTY_HOLIDAY)
  const [error, setError] = useState('')

  const rulesMutation = useMutation({
    mutationFn: updateAdminScheduleRules,
    onSuccess: (updated) => {
      hapticNotify('success')
      queryClient.setQueryData(queryKeys.scheduleRules, updated)
      // Hours affect every slot list and the public day selector.
      queryClient.invalidateQueries({ queryKey: ['slots'] })
      queryClient.invalidateQueries({ queryKey: ['admin-slots'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.publicSchedule })
    },
    onError: () => {
      hapticNotify('error')
      setError('Could not save the schedule — try again.')
    },
  })

  function patchRule(weekday, patch) {
    haptic('light')
    queryClient.setQueryData(queryKeys.scheduleRules, (current) =>
      current?.map((rule) => (rule.weekday === weekday ? { ...rule, ...patch } : rule)),
    )
  }

  const holidayMutation = useMutation({
    mutationFn: ({ action, date, note }) =>
      action === 'add' ? addAdminHoliday(date, note) : deleteAdminHoliday(date),
    onSuccess: () => {
      hapticNotify('success')
      setNewHoliday(EMPTY_HOLIDAY)
      queryClient.invalidateQueries({ queryKey: queryKeys.holidays })
      queryClient.invalidateQueries({ queryKey: queryKeys.publicSchedule })
      queryClient.invalidateQueries({ queryKey: ['slots'] })
      queryClient.invalidateQueries({ queryKey: ['admin-slots'] })
    },
    onError: (err) => {
      hapticNotify('error')
      setError(err?.message ?? 'Could not update closed dates.')
    },
  })

  function addHoliday() {
    if (!newHoliday.date) return
    holidayMutation.mutate({ action: 'add', date: newHoliday.date, note: newHoliday.note })
  }

  function removeHoliday(date) {
    haptic('light')
    holidayMutation.mutate({ action: 'remove', date })
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-mist-dim">Working hours</h2>
        <button
          type="button"
          onClick={() => rules && rulesMutation.mutate(rules)}
          disabled={rulesMutation.isPending || !rules}
          className="btn-accent h-8 px-4 text-[11px] disabled:opacity-50"
        >
          {rulesMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p className="mb-3 text-[11px] text-mist-faint">
        Closed days and off-hours disappear from booking instantly.
      </p>

      {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

      {rulesQuery.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-12 rounded-card" />
          ))}
        </div>
      ) : rulesQuery.isError ? (
        <GlassCard className="p-4 text-center text-xs text-mist-dim">
          Could not load the schedule.
        </GlassCard>
      ) : (
        <GlassCard className="!rounded-2xl px-3 py-1.5">
          {rules.map((rule, index) => (
            <div
              key={rule.weekday}
              className={`grid grid-cols-[44px_1fr_44px] items-center gap-2 py-2.5 ${
                index > 0 ? 'border-t border-white/[0.05]' : ''
              }`}
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-mist">
                {DAY_LABELS[rule.weekday]}
              </span>
              <div className="flex items-center justify-center gap-1.5">
                <TimeSelect
                  value={rule.start_time}
                  disabled={!rule.is_open}
                  minAfter={null}
                  onChange={(value) => patchRule(rule.weekday, { start_time: value })}
                  label={`${DAY_LABELS[rule.weekday]} opening time`}
                />
                <span className="text-xs text-mist-faint">—</span>
                <TimeSelect
                  value={rule.end_time}
                  disabled={!rule.is_open}
                  minAfter={rule.start_time}
                  onChange={(value) => patchRule(rule.weekday, { end_time: value })}
                  label={`${DAY_LABELS[rule.weekday]} closing time`}
                />
              </div>
              <span className="justify-self-end">
                <Toggle
                  checked={rule.is_open}
                  onChange={(isOpen) => patchRule(rule.weekday, { is_open: isOpen })}
                  label={`${DAY_LABELS[rule.weekday]} open`}
                />
              </span>
            </div>
          ))}
        </GlassCard>
      )}

      {/* Holidays */}
      <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-widest text-mist-faint">
        Closed dates
      </h3>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={newHoliday.date}
          onChange={(event) => setNewHoliday({ ...newHoliday, date: event.target.value })}
          aria-label="Holiday date"
          className="glass-card h-10 flex-1 bg-transparent px-3 text-xs text-mist outline-none"
        />
        <input
          value={newHoliday.note}
          onChange={(event) => setNewHoliday({ ...newHoliday, note: event.target.value })}
          placeholder="Note"
          aria-label="Holiday note"
          className="glass-card h-10 flex-1 bg-transparent px-3 text-xs text-mist outline-none placeholder:text-mist-faint"
        />
        <button
          type="button"
          onClick={addHoliday}
          disabled={!newHoliday.date || holidayMutation.isPending}
          aria-label="Add holiday"
          className="btn-accent h-10 w-10 shrink-0 rounded-2xl p-0 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {holidays.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {holidays.map((holiday) => (
            <div key={holiday.date} className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
              <p className="text-xs tabular-nums text-mist">{holiday.date}</p>
              <p className="min-w-0 flex-1 truncate text-xs text-mist-dim">{holiday.note || '—'}</p>
              <button
                type="button"
                onClick={() => removeHoliday(holiday.date)}
                aria-label={`Remove holiday ${holiday.date}`}
                className="btn-ghost h-7 w-7 rounded-lg p-0 text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
