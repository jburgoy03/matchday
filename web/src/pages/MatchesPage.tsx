import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, type MatchListItem } from '../api'
import { useApi } from '../useApi'
import { TeamBadge } from '../components/TeamBadge'
import { dayKey, formatDay, isLive, statusLabel } from '../format'

export default function MatchesPage() {
  const [tick, setTick] = useState(0)
  const { data, error } = useApi(api.matches, [tick])

  const anyLive = data?.some(m => isLive(m.status)) ?? false
  useEffect(() => {
    if (!anyLive) return
    const t = setInterval(() => setTick(x => x + 1), 30_000)
    return () => clearInterval(t)
  }, [anyLive])

  if (error) return <p className="error">Couldn't load matches: {error}</p>
  if (!data) return <p className="muted">Loading…</p>
  if (data.length === 0) return <p className="muted">No matches in the next few weeks.</p>

  const groups = new Map<string, MatchListItem[]>()
  for (const m of data) {
    const key = dayKey(m.kickoffUtc)
    const group = groups.get(key)
    if (group) group.push(m)
    else groups.set(key, [m])
  }

  return (
    <section>
      <h1>Matches</h1>
      {[...groups.entries()].map(([key, matches]) => (
        <div key={key}>
          <h2 className="day">{formatDay(matches[0].kickoffUtc)}</h2>
          <ul className="match-list card">
            {matches.map(m => (
              <li key={m.id}>
                <Link to={`/match/${m.id}`} className="match-row">
                  <span className={`status ${isLive(m.status) ? 'live' : ''}`}>{statusLabel(m)}</span>
                  <span className="home"><TeamBadge team={m.home} short /></span>
                  <span className="hs">{m.homeScore}</span>
                  <span className="sep">{m.homeScore === null ? 'v' : '–'}</span>
                  <span className="as">{m.awayScore}</span>
                  <span className="away"><TeamBadge team={m.away} short /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}