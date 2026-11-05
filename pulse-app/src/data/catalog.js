// Pulse service catalog.
// Mirrors the shape returned by GET /services so the UI is identical with or
// without a live backend. `icon` is a key resolved in ServiceIcon.jsx.

export const SERVICES = [
  {
    id: 'svc-consult',
    name: 'General Consultation',
    description: 'One-on-one session to map out your personal health plan.',
    price: 60,
    duration_min: 30,
    icon: 'stethoscope',
  },
  {
    id: 'svc-diagnostics',
    name: 'Diagnostics',
    description: 'Lab work and imaging with same-day digital results.',
    price: 120,
    duration_min: 45,
    icon: 'scan',
  },
  {
    id: 'svc-specialist',
    name: 'Specialist Care',
    description: 'Targeted treatment programs led by senior specialists.',
    price: 95,
    duration_min: 40,
    icon: 'heart-pulse',
  },
  {
    id: 'svc-therapy',
    name: 'Therapy Session',
    description: 'Guided recovery and wellness therapy, tailored to you.',
    price: 80,
    duration_min: 50,
    icon: 'brain',
  },
  {
    id: 'svc-checkup',
    name: 'Check-up',
    description: 'Preventive annual screening to keep your health on track.',
    price: 45,
    duration_min: 25,
    icon: 'clipboard',
  },
  {
    id: 'svc-telemedicine',
    name: 'Telemedicine',
    description: 'A video visit with your provider, from wherever you are.',
    price: 35,
    duration_min: 20,
    icon: 'video',
  },
]
