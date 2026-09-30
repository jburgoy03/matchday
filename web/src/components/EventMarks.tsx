import type { ReactNode } from 'react'
import type { PlayerEvents } from '../playerEvents'
import { AssistMark, Ball, CardMark, SubOff, SubOn } from './MatchIcons'

interface Chip {
  key: string
  icon: ReactNode
  /** Every minute: "43' 57'". */
  full: string
  /** Compact form for the mobile pitch: "×2", or the minute where one number matters. */
  compact: string
}

const times = (n: number) => (n > 1 ? `×${n}` : '')

function chips(e: PlayerEvents, includeOn: boolean): Chip[] {
  const out: Chip[] = []
  if (includeOn && e.on) out.push({ key: 'on', icon: <SubOn />, full: e.on, compact: e.on })

  const scored = e.goals.filter(g => g.kind !== 'og')
  if (scored.length) {
    out.push({
      key: 'g',
      icon: <Ball />,
      full: scored.map(g => (g.kind === 'pen' ? `${g.clock} pen` : g.clock)).join(' '),
      compact: times(scored.length),
    })
  }
  const own = e.goals.filter(g => g.kind === 'og')
  if (own.length) {
    out.push({ key: 'og', icon: <Ball ownGoal />, full: `OG ${own.map(g => g.clock).join(' ')}`, compact: `OG${own.length > 1 ? ` ×${own.length}` : ''}` })
  }
  if (e.assists.length) out.push({ key: 'a', icon: <AssistMark />, full: e.assists.join(' '), compact: times(e.assists.length) })
  if (e.yellows.length) out.push({ key: 'y', icon: <CardMark />, full: e.yellows.join(' '), compact: times(e.yellows.length) })
  if (e.reds.length) out.push({ key: 'r', icon: <CardMark red />, full: e.reds.join(' '), compact: e.reds[0] })
  if (e.off) out.push({ key: 'off', icon: <SubOff />, full: e.off, compact: e.off })
  return out
}

/** A player's marks. Renders nothing when he did nothing worth marking. */
export function EventMarks({ events, includeOn = false, className }: { events?: PlayerEvents; includeOn?: boolean; className: string }) {
  if (!events) return null
  const list = chips(events, includeOn)
  if (list.length === 0) return null
  return (
    <span className={className}>
      {list.map(c => (
        <span key={c.key} className="mk">
          {c.icon}
          {c.full && <span className="mk-full">{c.full}</span>}
          {c.compact && <span className="mk-compact">{c.compact}</span>}
        </span>
      ))}
    </span>
  )
}
