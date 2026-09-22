import { Link } from 'react-router'
import { ChevronLeft } from './Icons'

/** A real button-sized target for "back to X", instead of a bare arrow in text. */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="back-link">
      <ChevronLeft size={16} />
      <span>{label}</span>
    </Link>
  )
}