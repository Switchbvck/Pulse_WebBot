import GlassCard from '../GlassCard'

/** Compact metric tile for the admin dashboard. */
export default function StatCard({ icon: Icon, label, value, index = 0 }) {
  return (
    <GlassCard
      className="flex animate-fade-up flex-col gap-2 p-3.5"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-accent/15 to-accent-soft/10 text-accent">
        <Icon className="h-4 w-4" strokeWidth={1.9} />
      </span>
      <p className="text-lg font-bold leading-none text-mist">{value}</p>
      <p className="text-[9px] font-semibold uppercase leading-tight tracking-wider text-mist-faint">
        {label}
      </p>
    </GlassCard>
  )
}
