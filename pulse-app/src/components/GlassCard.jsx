/** Shared glassmorphic surface. */
export default function GlassCard({ className = '', children, ...rest }) {
  return (
    <div className={`glass-card ${className}`} {...rest}>
      {children}
    </div>
  )
}
