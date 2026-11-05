// TanStack Query hooks: query keys and fetchers in one place.

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { getUser } from './telegram'
import * as api from './api'

export const queryKeys = {
  me: ['me'],
  services: ['services'],
  appointments: (userId) => ['appointments', userId],
  slots: (date, serviceId = null) => ['slots', date, serviceId],
  publicSchedule: ['public-schedule'],
  waitlist: (userId) => ['waitlist', userId],
  serviceReviews: (serviceId) => ['service-reviews', serviceId],
  adminMetrics: ['admin-metrics'],
  adminSchedule: (date) => ['admin-schedule', date],
  adminSlots: (date) => ['admin-slots', date],
  adminServices: ['admin-services'],
  adminReviews: ['admin-reviews'],
  analytics: ['analytics'],
  scheduleRules: ['schedule-rules'],
  holidays: ['holidays'],
}

/** Server-side identity { id, name, is_admin } — drives the admin tab. */
export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: api.fetchMe, staleTime: 60_000 })
}

export function useServices() {
  return useQuery({ queryKey: queryKeys.services, queryFn: api.fetchServices })
}

export function useAppointments(userId) {
  return useQuery({
    queryKey: queryKeys.appointments(userId),
    queryFn: () => api.fetchAppointments(userId),
    enabled: userId != null,
  })
}

export function useSlots(date, serviceId = null) {
  return useQuery({
    queryKey: queryKeys.slots(date, serviceId),
    queryFn: () => api.fetchSlots(date, serviceId),
    placeholderData: keepPreviousData, // no skeleton flash between day switches
  })
}

export function usePublicSchedule() {
  return useQuery({
    queryKey: queryKeys.publicSchedule,
    queryFn: api.fetchPublicSchedule,
    staleTime: 60_000,
  })
}

export function useWaitlist(userId) {
  return useQuery({
    queryKey: queryKeys.waitlist(userId),
    queryFn: () => api.fetchWaitlist(userId),
    enabled: userId != null,
  })
}

export function useServiceReviews(serviceId) {
  return useQuery({
    queryKey: queryKeys.serviceReviews(serviceId),
    queryFn: () => api.fetchServiceReviews(serviceId),
    enabled: serviceId != null,
    staleTime: 60_000,
  })
}

export function useAdminMetrics() {
  return useQuery({ queryKey: queryKeys.adminMetrics, queryFn: api.fetchAdminMetrics })
}

export function useAdminSchedule(date) {
  return useQuery({
    queryKey: queryKeys.adminSchedule(date),
    queryFn: () => api.fetchAdminSchedule(date),
    placeholderData: keepPreviousData,
  })
}

export function useAdminSlots(date) {
  return useQuery({
    queryKey: queryKeys.adminSlots(date),
    queryFn: () => api.fetchAdminSlots(date),
    placeholderData: keepPreviousData,
  })
}

export function useAdminServices() {
  return useQuery({ queryKey: queryKeys.adminServices, queryFn: api.fetchAdminServices })
}

export function useAdminReviews() {
  return useQuery({ queryKey: queryKeys.adminReviews, queryFn: api.fetchAdminReviews })
}

export function useAnalytics() {
  return useQuery({ queryKey: queryKeys.analytics, queryFn: api.fetchAnalytics })
}

export function useScheduleRules() {
  return useQuery({ queryKey: queryKeys.scheduleRules, queryFn: api.fetchAdminScheduleRules })
}

export function useHolidays() {
  return useQuery({ queryKey: queryKeys.holidays, queryFn: api.fetchPublicSchedule })
}

/** Join the waitlist for a day (used from the wizard's empty-slot panel). */
export function useJoinWaitlist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (date) => {
      const user = getUser()
      const name = user
        ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Guest'
        : 'Guest'
      return api.joinWaitlist(date, user ? { id: user.id, name } : null)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] })
    },
  })
}
