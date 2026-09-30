import type { CSSProperties } from 'react'
import type { TeamLineup } from '../api'
import type { Side } from '../goals'
import { surname, type Spot } from '../formation'
import type { PlayerEvents } from '../playerEvents'
import { EventMarks } from './EventMarks'
import { useOpenPlayer } from './PlayerProfile'

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
            style={{ '--x': `${s.x}%`, '--y': `${s.y}%` } as CSSProperties}
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
