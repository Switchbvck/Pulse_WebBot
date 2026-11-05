import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, DollarSign, Pencil, QrCode, Plus, X } from 'lucide-react'
import {
  apiSource,
  createAdminService,
  fetchServiceQr,
  updateAdminService,
} from '../../lib/api'
import { queryKeys, useAdminServices } from '../../lib/queries'
import { haptic, hapticNotify } from '../../lib/telegram'
import ServiceIcon from '../ServiceIcon'
import GlassCard from '../GlassCard'
import Modal from '../Modal'
import Skeleton from '../Skeleton'

const ICON_CHOICES = [
  { key: 'stethoscope', label: 'Stethoscope' },
  { key: 'scan', label: 'Scan' },
  { key: 'heart-pulse', label: 'Heart' },
  { key: 'brain', label: 'Brain' },
  { key: 'clipboard', label: 'Clipboard' },
  { key: 'video', label: 'Video' },
  { key: 'activity', label: 'Activity' },
]

const EMPTY_FORM = { name: '', description: '', price: '', duration_min: 30, icon: 'activity' }

/** Admin section: service catalog CRUD + deep-link QR codes. */
export default function ServicesAdmin() {
  const queryClient = useQueryClient()
  const servicesQuery = useAdminServices()
  const services = servicesQuery.data

  const [editing, setEditing] = useState(null) // service | 'new'
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [qr, setQr] = useState(null) // {name, url?, error?}

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      editing === 'new' ? createAdminService(payload) : updateAdminService(editing.id, payload),
    onSuccess: () => {
      hapticNotify('success')
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: queryKeys.adminServices })
      queryClient.invalidateQueries({ queryKey: queryKeys.services })
    },
    onError: (error) => {
      hapticNotify('error')
      setFormError(error?.message ?? 'Could not save the service')
    },
  })

  function openEdit(service) {
    haptic('light')
    setFormError('')
    setForm(
      service
        ? {
            name: service.name,
            description: service.description,
            price: service.price,
            duration_min: service.duration_min,
            icon: service.icon,
          }
        : EMPTY_FORM,
    )
    setEditing(service ?? 'new')
  }

  function save() {
    if (!form.name.trim() || form.price === '') return
    saveMutation.mutate({
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      duration_min: Number(form.duration_min),
      icon: form.icon,
    })
  }

  async function showQr(service) {
    haptic('light')
    try {
      const blob = await fetchServiceQr(service.id)
      if (!blob) throw new Error('QR unavailable in demo mode')
      setQr({ name: service.name, url: URL.createObjectURL(blob) })
    } catch (error) {
      setQr({ name: service.name, url: null, error: error?.message })
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-mist-dim">Services</h2>
        <button type="button" onClick={() => openEdit(null)} className="btn-ghost h-8 gap-1 rounded-xl px-3 text-[11px]">
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      {servicesQuery.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-card" />
          ))}
        </div>
      ) : servicesQuery.isError ? (
        <GlassCard className="p-4 text-center text-xs text-mist-dim">Could not load services.</GlassCard>
      ) : (
        <div className="flex flex-col gap-2">
          {services.map((service) => (
            <GlassCard key={service.id} className="flex items-center gap-3 !rounded-2xl p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent/15 to-accent-soft/10 text-accent">
                <ServiceIcon name={service.icon} className="h-5 w-5" />
              </span>
              <div className={`min-w-0 flex-1 ${service.isActive ? '' : 'opacity-50'}`}>
                <p className="truncate text-sm font-semibold text-mist">{service.name}</p>
                <p className="text-[11px] text-mist-dim">
                  ${service.price} · {service.duration_min} min {service.isActive ? '' : '· hidden'}
                </p>
              </div>
              {apiSource === 'live' && (
                <button
                  type="button"
                  onClick={() => showQr(service)}
                  aria-label={`QR code for ${service.name}`}
                  className="btn-ghost h-8 w-8 rounded-xl p-0"
                >
                  <QrCode className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => openEdit(service)}
                aria-label={`Edit ${service.name}`}
                className="btn-ghost h-8 w-8 rounded-xl p-0"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Add / edit sheet */}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)}>
        <h2 className="text-base font-bold text-mist">
          {editing === 'new' ? 'Add service' : 'Edit service'}
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Service name"
            aria-label="Service name"
            className="glass-card h-11 bg-transparent px-4 text-sm text-mist outline-none placeholder:text-mist-faint"
          />
          <textarea
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Description"
            aria-label="Service description"
            rows={2}
            className="glass-card bg-transparent px-4 py-2.5 text-sm text-mist outline-none placeholder:text-mist-faint"
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="relative min-w-0">
              <input
                type="number"
                min="0"
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
                placeholder="0"
                aria-label="Price"
                className="glass-card h-11 w-full bg-transparent pl-4 pr-9 text-sm text-mist outline-none placeholder:text-mist-faint"
              />
              <DollarSign className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-faint" />
            </div>
            <div className="relative min-w-0">
              <input
                type="number"
                min="5"
                value={form.duration_min}
                onChange={(event) => setForm({ ...form, duration_min: event.target.value })}
                placeholder="30"
                aria-label="Duration in minutes"
                className="glass-card h-11 w-full bg-transparent pl-4 pr-9 text-sm text-mist outline-none placeholder:text-mist-faint"
              />
              <Clock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-faint" />
            </div>
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {ICON_CHOICES.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setForm({ ...form, icon: key })}
                aria-label={`Icon: ${label}`}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                  form.icon === key
                    ? 'accent-gradient text-ink'
                    : 'border border-white/[0.06] bg-white/[0.04] text-mist-dim'
                }`}
              >
                <ServiceIcon name={key} className="h-5 w-5" />
              </button>
            ))}
          </div>
          {formError && <p className="text-xs text-red-400">{formError}</p>}
          <div className="mt-1 flex gap-3">
            <button type="button" onClick={() => setEditing(null)} className="btn-ghost h-11 flex-1 text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saveMutation.isPending}
              className="btn-accent h-11 flex-1 text-sm disabled:opacity-60"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      {/* QR sheet */}
      <Modal open={Boolean(qr)} onClose={() => setQr(null)}>
        <div className="flex items-start justify-between">
          <h2 className="text-base font-bold text-mist">Service QR code</h2>
          <button
            type="button"
            onClick={() => setQr(null)}
            aria-label="Close QR"
            className="btn-ghost h-8 w-8 rounded-xl p-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {qr && (
          <div className="mt-4 flex flex-col items-center gap-3 text-center">
            {qr.url ? (
              <img src={qr.url} alt={`QR code for ${qr.name}`} className="h-44 w-44 rounded-2xl bg-white p-2" />
            ) : (
              <p className="text-sm text-red-400">{qr.error}</p>
            )}
            <p className="text-xs text-mist-dim">
              Scan to open Pulse and book <span className="text-mist">{qr.name}</span> in two taps.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
