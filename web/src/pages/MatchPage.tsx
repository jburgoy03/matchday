import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, type LineupPlayer, type Team, type TeamLineup } from '../api'
import { useApi } from '../useApi'
import { TeamBadge } from '../components/TeamBadge'
import { BackLink } from '../components/BackLink'
import { teamPath } from '../teamPath'
import { MatchStats } from '../components/MatchStats'
import { ICONS, Timeline } from '../components/Timeline'
import { formatDay, formatTime, isLive, statusLabel } from '../format'

type Tab = 'timeline' | 'stats' | 'lineups'

export default function MatchPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
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

  const { match: m, homeLineup, awayLineup, incidents, homeStats, awayStats } = data

  // Pre-match ESPN can send all-zero stats, so only offer the tab once the match has started.
  const hasStats = !!homeStats && !!awayStats && Object.keys(homeStats).length > 0 && m.status !== 'Scheduled'

  const tabs: { id: Tab; label: string }[] = [
    { id: 'timeline', label: 'Timeline' },
    ...(hasStats ? [{ id: 'stats' as const, label: 'Stats' }] : []),
    { id: 'lineups', label: 'Lineups' },
  ]
  const requested = params.get('tab')
  const tab: Tab = tabs.find(t => t.id === requested)?.id ?? (m.status === 'Scheduled' ? 'lineups' : 'timeline')
  const select = (t: Tab) => setParams({ tab: t }, { replace: true })

  // Goal and card icons to show next to player names in the lineups.
  const marks = new Map<string, string>()
  for (const i of incidents) {
    if (!i.player || i.type === 'Substitution' || i.type === 'Other') continue
    marks.set(i.player, (marks.get(i.player) ?? '') + ICONS[i.type])
  }

  return (
    <section className="match">
      <BackLink to="/" label="Matches" />

      <div className="scoreboard card">
        <Link to={teamPath(m.home)} className="side team-link">
          {m.home.logoUrl && <img src={m.home.logoUrl} alt="" />}
          <span>{m.home.name}</span>
        </Link>
        <div className="score">
          {m.homeScore ?? '–'} – {m.awayScore ?? '–'}
          <span className={`status ${live ? 'live' : ''}`}>{statusLabel(m)}</span>
        </div>
        <Link to={teamPath(m.away)} className="side team-link">
          {m.away.logoUrl && <img src={m.away.logoUrl} alt="" />}
          <span>{m.away.name}</span>
        </Link>
      </div>
      <p className="meta muted">
        {formatDay(m.kickoffUtc)} · {formatTime(m.kickoffUtc)} ET{m.venue ? ` · ${m.venue}` : ''}
      </p>

      <div className="tabs" role="tablist">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => select(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'timeline' && <Timeline match={m} incidents={incidents} />}

      {tab === 'stats' && homeStats && awayStats && (
        <MatchStats home={m.home} away={m.away} homeStats={homeStats} awayStats={awayStats} />
      )}

      {tab === 'lineups' && (
        !homeLineup && !awayLineup ? (
          <p className="muted">Lineups usually appear about an hour before kickoff.</p>
        ) : (
          <div className="lineups">
            <LineupCard team={m.home} lineup={homeLineup} marks={marks} />
            <LineupCard team={m.away} lineup={awayLineup} marks={marks} />
          </div>
        )
      )}
    </section>
  )
}

function LineupCard({ team, lineup, marks }: { team: Team; lineup: TeamLineup | null; marks: Map<string, string> }) {
  return (
    <div className="lineup card">
      <div className="lineup-head">
        <Link to={teamPath(team)} className="team-link"><TeamBadge team={team} short /></Link>
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