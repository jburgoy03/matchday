import type { Incident, MatchListItem } from '../api'
import { TeamBadge } from './TeamBadge'

export const ICONS: Record<Incident['type'], string> = {
  Goal: '⚽',
  PenaltyGoal: '⚽',
  OwnGoal: '⚽',
  YellowCard: '🟨',
  RedCard: '🟥',
  Substitution: '🔁',
  Other: '•',
}

type Side = 'home' | 'away'
type Score = [number, number]

type Item =
  | { kind: 'event'; incident: Incident; side: Side; score?: Score }
  | { kind: 'divider'; label: string; score: Score | null }

const isGoal = (i: Incident) => i.type === 'Goal' || i.type === 'PenaltyGoal' || i.type === 'OwnGoal'

/**
 * Index of the first second-half event. ESPN lists first-half stoppage time (45'+4')
 * before the half-time subs, which it labels plain 45', so a 45' after a 45'+ is second half.
 */
function halfTimeIndex(incidents: Incident[]): number {
  let sawStoppage = false
  for (let k = 0; k < incidents.length; k++) {
    const i = incidents[k]
    const min = i.minute ?? 0
    const stoppage = i.clock.includes('+')
    if (min > 45) return k
    if (min === 45 && stoppage) sawStoppage = true
    else if (min === 45 && sawStoppage) return k
  }
  return incidents.length
}

/** Which side a goal counts for. Own goals are checked against the final score, since the feed's team id is ambiguous. */
function goalSides(m: MatchListItem, incidents: Incident[]): Map<Incident, Side> {
  const tally = (flipOwnGoals: boolean) => {
    const sides = new Map<Incident, Side>()
    for (const i of incidents.filter(isGoal)) {
      let side: Side = i.teamId === m.away.id ? 'away' : 'home'
      if (i.type === 'OwnGoal' && flipOwnGoals) side = side === 'home' ? 'away' : 'home'
      sides.set(i, side)
    }
    return sides
  }
  const matches = (sides: Map<Incident, Side>) => {
    const vals = [...sides.values()]
    return vals.filter(s => s === 'home').length === m.homeScore && vals.filter(s => s === 'away').length === m.awayScore
  }
  const plain = tally(false)
  if (matches(plain) || !incidents.some(i => i.type === 'OwnGoal')) return plain
  const flipped = tally(true)
  return matches(flipped) ? flipped : plain
}

function buildItems(m: MatchListItem, incidents: Incident[]): Item[] {
  const goals = goalSides(m, incidents)
  const htAt = halfTimeIndex(incidents)
  const clockMinute = parseInt(m.clock ?? '', 10)
  const pastHalf =
    m.status === 'HalfTime' || m.status === 'FullTime' ||
    (m.status === 'Live' && (htAt < incidents.length || clockMinute > 45))

  const items: Item[] = []
  const score: Score = [0, 0]
  incidents.forEach((i, k) => {
    if (k === htAt && pastHalf) items.push({ kind: 'divider', label: 'HT', score: [...score] })
    const goalSide = goals.get(i)
    if (goalSide) {
      score[goalSide === 'home' ? 0 : 1]++
      items.push({ kind: 'event', incident: i, side: goalSide, score: [...score] })
    } else {
      items.push({ kind: 'event', incident: i, side: i.teamId === m.away.id ? 'away' : 'home' })
    }
  })
  if (htAt === incidents.length && pastHalf) items.push({ kind: 'divider', label: 'HT', score: [...score] })
  if (m.status === 'FullTime') {
    const final: Score | null = m.homeScore !== null && m.awayScore !== null ? [m.homeScore, m.awayScore] : null
    items.push({ kind: 'divider', label: 'FT', score: final })
  }
  return items
}

export function Timeline({ match: m, incidents }: { match: MatchListItem; incidents: Incident[] }) {
  const items = buildItems(m, incidents)
  if (items.length === 0) return <p className="muted">No events yet.</p>

  return (
    <ol className="timeline card">
      <li className="tl-head">
        <span className="tl-side home"><TeamBadge team={m.home} short /></span>
        <span className="tl-side away"><TeamBadge team={m.away} short /></span>
      </li>
      {items.map((it, idx) =>
        it.kind === 'divider' ? (
          <li key={idx} className="tl-divider">
            <span>{it.label}{it.score ? ` ${it.score[0]}–${it.score[1]}` : ''}</span>
          </li>
        ) : (
          <li key={idx} className={`tl-event ${it.score ? 'goal' : ''}`}>
            <span className="tl-min">
              {it.incident.clock}
              {it.score && <span className="tl-score">{it.score[0]}–{it.score[1]}</span>}
            </span>
            <span className={`tl-side ${it.side}`}>
              <EventBody i={it.incident} goal={!!it.score} />
            </span>
          </li>
        )
      )}
    </ol>
  )
}

function EventBody({ i, goal }: { i: Incident; goal: boolean }) {
  const who = i.player ?? 'Unknown'

  if (i.type === 'Substitution') {
    return (
      <>
        <span className="tl-icon" aria-label="Substitution">🔁</span>
        <span className="tl-text">
          <span><span className="sub-in" aria-label="On">↑</span> {who}</span>
          {i.secondaryPlayer && <small><span className="sub-out" aria-label="Off">↓</span> {i.secondaryPlayer}</small>}
        </span>
      </>
    )
  }

  if (goal) {
    const tag = i.type === 'PenaltyGoal' ? ' (pen)' : i.type === 'OwnGoal' ? ' (OG)' : ''
    return (
      <>
        <span className="tl-icon">{ICONS[i.type]}</span>
        <span className="tl-text">
          <strong>{who}{tag}</strong>
          {i.type === 'Goal' && i.secondaryPlayer && <small>Assist: {i.secondaryPlayer}</small>}
        </span>
      </>
    )
  }

  return (
    <>
      <span className="tl-icon">{ICONS[i.type]}</span>
      <span className="tl-text"><span>{who}</span></span>
    </>
  )
}