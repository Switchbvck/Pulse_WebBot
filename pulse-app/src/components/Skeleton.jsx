/** Shimmering placeholder block — keep sizes fixed to avoid layout shifts. */
export default function Skeleton({ className = '' }) {
  return <div aria-hidden className={`skeleton ${className}`} />
}
