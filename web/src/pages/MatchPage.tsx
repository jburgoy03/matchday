import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, type Incident, type LineupPlayer, type Team, type TeamLineup } from '../api'
import { useApi } from '../useApi'
import { TeamBadge } from '../components/TeamBadge'
import { formatDay, formatTime, isLive, statusLabel } from '../format'

const ICONS: Record<Incident['type'], string> = {
  Goal: '⚽',
  PenaltyGoal: '⚽',
  OwnGoal: '⚽',
  YellowCard: '🟨',
  RedCard: '🟥',
  Substitution: '🔁',
  Other: '•',
}

function describe(i: Incident): string {
  const who = i.player ?? 'Unknown'
  switch (i.type) {
    case 'Goal': return i.secondaryPlayer ? `${who} (assist: ${i.secondaryPlayer})` : who
    case 'PenaltyGoal': return `${who} (pen)`
    case 'OwnGoal': return `${who} (OG)`
    case 'Substitution': return i.secondaryPlayer ? `${who} on for ${i.secondaryPlayer}` : who
    default: return who
  }
}

export default function MatchPage() {
  const { id = '' } = useParams()
  const [tick, setTick] = useState(0)
  const { data, error } = useApi(signal => api.match(id, signal), [id, tick])

  const live = data ? isLive(data.match.status) : false
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => setTick(x => x + 1), 30_000)
    return () => clearInterval(t)
  }, [live])

  if (error) return <p className="error">Couldn't load this match: {error}</p>
  if (!data) return <p className="muted">Loading…</p>

  const { match: m, homeLineup, awayLineup, incidents } = data

  // Goal and card icons to show next to player names in the lineups.
  const marks = new Map<string, string>()
  for (const i of incidents) {
    if (!i.player || i.type === 'Substitution' || i.type === 'Other') continue
    marks.set(i.player, (marks.get(i.player) ?? '') + ICONS[i.type])
  }

  return (
    <section className="match">
      <Link to="/" className="back muted">← Matches</Link>

      <div className="scoreboard card">
        <div className="side">
          {m.home.logoUrl && <img src={m.home.logoUrl} alt="" />}
          <span>{m.home.name}</span>
        </div>
        <div className="score">
          {m.homeScore ?? '–'} – {m.awayScore ?? '–'}
          <span className={`status ${live ? 'live' : ''}`}>{statusLabel(m)}</span>
        </div>
        <div className="side">
          {m.away.logoUrl && <img src={m.away.logoUrl} alt="" />}
          <span>{m.away.name}</span>
        </div>
      </div>
      <p className="meta muted">
        {formatDay(m.kickoffUtc)} · {formatTime(m.kickoffUtc)} ET{m.venue ? ` · ${m.venue}` : ''}
      </p>

      <h2>Timeline</h2>
      {incidents.length === 0 ? (
        <p className="muted">No events yet.</p>
      ) : (
        <ol className="timeline card">
          {incidents.map((i, idx) => (
            <li key={idx}>
              <span className="minute">{i.clock}</span>
              <span>{ICONS[i.type]}</span>
              <span>{describe(i)}</span>
              <span className="muted abbr">{i.teamId === m.home.id ? m.home.abbreviation : m.away.abbreviation}</span>
            </li>
          ))}
        </ol>
      )}

      <h2>Lineups</h2>
      {!homeLineup && !awayLineup ? (
        <p className="muted">Lineups usually appear about an hour before kickoff.</p>
      ) : (
        <div className="lineups">
          <LineupCard team={m.home} lineup={homeLineup} marks={marks} />
          <LineupCard team={m.away} lineup={awayLineup} marks={marks} />
        </div>
      )}
    </section>
  )
}

function LineupCard({ team, lineup, marks }: { team: Team; lineup: TeamLineup | null; marks: Map<string, string> }) {
  return (
    <div className="lineup card">
      <div className="lineup-head">
        <TeamBadge team={team} short />
        <span className="muted">{lineup?.formation}</span>
      </div>
      {!lineup ? (
        <p className="muted">Not announced yet.</p>
      ) : (
        <>
          <ul>{lineup.starters.map(p => <PlayerRow key={p.playerId} p={p} mark={marks.get(p.name)} />)}</ul>
          <h3>Bench</h3>
          <ul>{lineup.bench.map(p => <PlayerRow key={p.playerId} p={p} mark={marks.get(p.name)} />)}</ul>
        </>
      )}
    </div>
  )
}

function PlayerRow({ p, mark }: { p: LineupPlayer; mark?: string }) {
  return (
    <li>
      <span className="jersey">{p.jersey}</span>
      <span>{p.name}</span>
      <span className="marks">{mark}</span>
      <span className="pos muted">{p.position === 'SUB' ? '' : p.position}</span>
    </li>
  )
}