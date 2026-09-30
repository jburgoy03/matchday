import { Link } from 'react-router'
import type { Goal, MatchListItem } from '../api'
import { goalSides, halfTimeScore, type Side } from '../goals'
import { isLive } from '../format'
import { Crest } from './Crest'
import { CompetitionChip } from '../competitions'

const ET = 'America/New_York'
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' })

/** "Haaland 12', 45+2'" — one entry per scorer, minutes merged, in the order they were scored. */
function scorerLine(goals: Goal[]): string {
  const order: string[] = []
  const minutes = new Map<string, string[]>()
  for (const g of goals) {
    const name = g.player ?? 'Unknown'
    const tag = g.type === 'PenaltyGoal' ? ' (pen)' : g.type === 'OwnGoal' ? ' (og)' : ''
    if (!minutes.has(name)) {
      order.push(name)
      minutes.set(name, [])
    }
    minutes.get(name)!.push(`${g.clock || `${g.minute ?? ''}'`}${tag}`)
  }
  // A non-breaking space keeps "Haaland 12'" together when the line wraps.
  return order.map(name => `${name}\u00a0${minutes.get(name)!.join(', ')}`).join(', ')
}

export function MatchRow({ m }: { m: MatchListItem }) {
  const live = isLive(m.status)
  const finished = m.status === 'FullTime'
  const off = m.status === 'Postponed' || m.status === 'Cancelled'
  const played = finished || live

  const sides = goalSides(m, m.goals)
  const by = (side: Side) => m.goals.filter(g => sides.get(g) === side)
  const ht = finished && m.goals.length > 0 ? halfTimeScore(m, m.goals) : null

  const status = off ? (m.status === 'Postponed' ? 'PP' : 'Off') : live ? m.clock ?? 'Live' : finished ? 'FT' : timeFmt.format(new Date(m.kickoffUtc))

  return (
    <Link to={`/match/${m.id}`} className={`m-row ${live ? 'live' : ''}`}>
      <span className={`m-status ${live ? 'live' : ''}`}>
        {status}
        <CompetitionChip slug={m.competition} />
      </span>

      <span className="m-team home">
        <span>{m.home.shortName}</span>
        <Crest team={m.home} size={26} />
      </span>
      {played ? (
        <>
          <span className="m-score home">{m.homeScore ?? 0}</span>
          <span className="m-sep">–</span>
          <span className="m-score away">{m.awayScore ?? 0}</span>
        </>
      ) : (
        <>
          <span className="m-score home" />
          <span className="m-sep v">v</span>
          <span className="m-score away" />
        </>
      )}
      <span className="m-team away">
        <Crest team={m.away} size={26} />
        <span>{m.away.shortName}</span>
      </span>

      {played && m.goals.length > 0 && (
        <span className="m-scorers">
          <span className="home">{scorerLine(by('home'))}</span>
          <span className="ht">{ht && (ht[0] > 0 || ht[1] > 0) ? `HT ${ht[0]}–${ht[1]}` : ''}</span>
          <span className="away">{scorerLine(by('away'))}</span>
        </span>
      )}
      {!played && m.venue && <span className="m-venue">{m.venue}</span>}
    </Link>
  )
}