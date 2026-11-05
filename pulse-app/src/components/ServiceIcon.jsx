import { Activity, Stethoscope, ScanLine, HeartPulse, Brain, ClipboardCheck, Video } from 'lucide-react'

const ICON_MAP = {
  stethoscope: Stethoscope,
  scan: ScanLine,
  'heart-pulse': HeartPulse,
  brain: Brain,
  clipboard: ClipboardCheck,
  video: Video,
  activity: Activity,
}

/** Resolve a catalog `icon` key to a Lucide component (Activity as fallback). */
export default function ServiceIcon({ name, className }) {
  const Icon = ICON_MAP[name] ?? Activity
  return <Icon className={className} strokeWidth={1.8} />
}
