import type { LineupPlayer, TeamLineup } from '../api'
import type { Side } from '../goals'
import { readingOrder, roleOf, type Spot } from '../formation'
import { clockMinutes, type PlayerEvents } from '../playerEvents'
import { EventMarks } from './EventMarks'
import { useOpenPlayer } from './PlayerProfile'
import { ChevronRight } from './Icons'

/** Every player in the squad for the match: the XI in reading order, then the bench — used subs first. */
export function LineupList({ lineup, spots, events, side }: {
  lineup: TeamLineup
  spots: Map<number, Spot> | null
  events: Map<number, PlayerEvents>
  side: Side
}) {
  const xi = readingOrder(lineup.starters, spots)
  const cameOn = lineup.bench
    .filter(p => events.get(p.playerId)?.on)
    .sort((a, b) => clockMinutes(events.get(a.playerId)!.on) - clockMinutes(events.get(b.playerId)!.on))
  const unused = lineup.bench.filter(p => !events.get(p.playerId)?.on)

  return (
    <div className="lu-list">
      <h3 className="lu-sub">Starting XI</h3>
      <ul>
        {xi.map(p => (
          <Row key={p.playerId} p={p} side={side} role={spots?.get(p.playerId)?.role ?? roleOf(p)}
            keeper={p.position === 'G'} events={events.get(p.playerId)} />
        ))}
      </ul>
      {lineup.bench.length > 0 && (
        <>
          <h3 className="lu-sub">Substitutes</h3>
          <ul>
            {cameOn.map(p => {
              const e = events.get(p.playerId)!
              return <Row key={p.playerId} p={p} side={side} role={e.replaced ? `On for ${e.replaced}` : 'Came on'} events={e} bench />
            })}
            {unused.map(p => <Row key={p.playerId} p={p} side={side} role="Unused" unused />)}
          </ul>
        </>
      )}
    </div>
  )
}

function Row({ p, side, role, events, keeper = false, bench = false, unused = false }: {
  p: LineupPlayer
  side: Side
  role: string
  events?: PlayerEvents
  keeper?: boolean
  bench?: boolean
  unused?: boolean
}) {
  const open = useOpenPlayer()
  // The whole row is the button: a big target, a hover highlight and a chevron that says "opens something".
  return (
    <li>
      <button type="button" className={`lu-row row-btn${unused ? ' unused' : ''}`} onClick={() => open(p.playerId)}>
        <span className={`lu-num ${side}${keeper ? ' gk' : ''}`}>{p.jersey}</span>
        <span className="lu-who">
          <span className="lu-name">{p.name}</span>
          <span className="lu-role">{role}</span>
        </span>
        <EventMarks events={events} includeOn={bench} className="lu-marks" />
        <span className="row-chev"><ChevronRight size={16} /></span>
      </button>
    </li>
  )
}
