import type { CSSProperties } from 'react'
import type { TeamLineup } from '../api'
import type { Side } from '../goals'
import { surname, type Spot } from '../formation'
import type { PlayerEvents } from '../playerEvents'
import { EventMarks } from './EventMarks'
import { useOpenPlayer } from './PlayerProfile'

/**
 * How wide a shirt's label may be, as a % of the pitch width: the gap to the nearest shirt on the
 * same line, and never so wide it runs off the touchline. Labels wrap their marks inside that, so a
 * busy forward (three goals and a sub) no longer spills over his neighbour.
 */
function labelRoom(id: number, spots: Map<number, Spot>): number {
  const s = spots.get(id)!
  let room = 2 * Math.min(s.x, 100 - s.x)
  for (const [other, o] of spots) {
    if (other !== id && Math.abs(o.y - s.y) < 12) room = Math.min(room, Math.abs(o.x - s.x))
  }
  return room
}

/**
 * One club's starting eleven on a half-pitch, attacking up the page. A grid of positioned divs,
 * not an SVG, so names stay selectable text. Markings are CSS borders sized in container units.
 */
export function Pitch({ lineup, spots, events, side, teamName }: {
  lineup: TeamLineup
  spots: Map<number, Spot>
  events: Map<number, PlayerEvents>
  side: Side
  teamName: string
}) {
  const openPlayer = useOpenPlayer()
  return (
    <div className="pitch" role="group" aria-label={`${teamName} ${lineup.formation ?? ''} on the pitch`}>
      <div className="pitch-line pitch-circle" />
      <div className="pitch-dot pitch-dot-centre" />
      <div className="pitch-arc" />
      <div className="pitch-line pitch-box" />
      <div className="pitch-line pitch-six" />
      <div className="pitch-dot pitch-dot-pen" />

      {lineup.starters.map(p => {
        const s = spots.get(p.playerId)
        if (!s) return null
        const keeper = s.line === 0
        return (
          <button
            type="button"
            key={p.playerId}
            className="shirt"
            style={{ '--x': `${s.x}%`, '--y': `${s.y}%`, '--room': `${labelRoom(p.playerId, spots)}cqw` } as CSSProperties}
            onClick={() => openPlayer(p.playerId)}
            aria-label={`${p.name}, number ${p.jersey ?? ''}. Open profile`}
          >
            <span className={`shirt-num ${side}${keeper ? ' gk' : ''}`}>{p.jersey}</span>
            <span className="shirt-label">
              <span className="shirt-name" title={p.name}>{surname(p.name)}</span>
              <EventMarks events={events.get(p.playerId)} className="shirt-marks" />
            </span>
          </button>
        )
      })}
    </div>
  )
}
