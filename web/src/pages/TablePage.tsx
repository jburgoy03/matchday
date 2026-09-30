import { Link, useNavigate } from 'react-router'
import { api, type News } from '../api'
import { useApi } from '../useApi'
import { TeamBadge } from '../components/TeamBadge'
import { teamPath } from '../teamPath'
import { ExternalLink } from '../components/Icons'
import { newsAge, NewsImage } from '../components/NewsList'
import { useState } from 'react'

function zone(position: number) {
  if (position <= 4) return 'ucl'
  if (position >= 18) return 'rel'
  return undefined
}

export default function TablePage() {
  const { data, error } = useApi(api.standings, [])
  const { data: news } = useApi(signal => api.news(6, signal), [])
  const navigate = useNavigate()

  // One story above the table, and it needs the photo to carry its weight.
  const story = news?.find(n => n.imageUrl) ?? news?.[0] ?? null

  if (error) return <p className="error">Couldn't load the table: {error}</p>
  if (!data) return <p className="muted">Loading…</p>

  return (
    <section className="table-page">
      <h1>Premier League table</h1>
      {story && <BiggestStory item={story} />}
      <div className="table-wrap">
        <table className="standings">
          <thead>
            <tr>
              <th>#</th>
              <th className="team-col">Team</th>
              <th>P</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th className="hide-sm">GF</th>
              <th className="hide-sm">GA</th>
              <th>GD</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {data.map(r => (
              <tr
                key={r.team.id}
                className={`row-link ${zone(r.position) ?? ''}`}
                onClick={e => {
                  // The team name is a real link (keyboard and middle-click); the rest of the row follows it too.
                  if ((e.target as HTMLElement).closest('a')) return
                  navigate(teamPath(r.team))
                }}
              >
                <td>{r.position}</td>
                <td className="team-col">
                  <Link to={teamPath(r.team)} className="team-link">
                    <TeamBadge team={r.team} />
                  </Link>
                </td>
                <td>{r.played}</td>
                <td>{r.won}</td>
                <td>{r.drawn}</td>
                <td>{r.lost}</td>
                <td className="hide-sm">{r.goalsFor}</td>
                <td className="hide-sm">{r.goalsAgainst}</td>
                <td>{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</td>
                <td className="pts">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="legend muted">
        <span className="swatch ucl" /> Champions League places <span className="swatch rel" /> Relegation
      </p>
    </section>
  )
}

/** The one league story that gets space above the table: photo left, headline right. */
function BiggestStory({ item }: { item: News }) {
  const [hasShot, setHasShot] = useState(item.imageUrl !== null)
  return (
    <a
      className={`story card ${hasShot ? '' : 'no-shot'}`}
      href={item.webUrl ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
    >
      {item.imageUrl && (
        <NewsImage className="story-shot" src={item.imageUrl} onGone={() => setHasShot(false)} />
      )}
      <span className="story-body">
        <span className="story-kicker">Biggest story</span>
        <span className="story-head">
          <strong>{item.headline}</strong>
          <ExternalLink size={14} />
        </span>
        {item.description && <span className="story-desc">{item.description}</span>}
        <span className="story-meta muted">
          {[item.byline, newsAge(item.publishedUtc)].filter(Boolean).join(' · ')}
        </span>
      </span>
    </a>
  )
}