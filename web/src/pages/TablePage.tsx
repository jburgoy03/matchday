import { Link, useNavigate } from 'react-router'
import { api } from '../api'
import { useApi } from '../useApi'
import { teamPath } from '../teamPath'
import { NewsList } from '../components/NewsList'

type Zone = 'ucl' | 'uel' | 'uecl' | 'rel'

/**
 * The standard Premier League allocation: top four to the Champions League, fifth to the Europa
 * League, sixth to the Conference League, bottom three down. Cup winners and UEFA's extra
 * Champions League place can push these around at season's end — the legend says so.
 */
function zone(position: number): Zone | undefined {
  if (position <= 4) return 'ucl'
  if (position === 5) return 'uel'
  if (position === 6) return 'uecl'
  if (position >= 18) return 'rel'
  return undefined
}

/** Last row of each zone, so a divider can mark where one ends. */
const ZONE_END = new Set([4, 5, 6, 17])

export default function TablePage() {
  const { data, error } = useApi(api.standings, [])
  const { data: news } = useApi(signal => api.news(6, signal), [])
  const navigate = useNavigate()

  if (error) return <p className="error">Couldn't load the table: {error}</p>
  if (!data) return <p className="muted">Loading…</p>

  return (
    <section className="table-page">
      <h1>Premier League table</h1>
      <div className="table-layout">
        <div className="table-main">
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
                    className={['row-link', zone(r.position), ZONE_END.has(r.position) && 'zone-end'].filter(Boolean).join(' ')}
                    onClick={e => {
                      // The team name is a real link (keyboard and middle-click); the rest of the row follows it too.
                      if ((e.target as HTMLElement).closest('a')) return
                      navigate(teamPath(r.team))
                    }}
                  >
                    <td>{r.position}</td>
                    <td className="team-col">
                      <Link to={teamPath(r.team)} className="team-link">
                        {/* Full name on desktop, short name on phones so the table fits without scrolling */}
                        <span className="team">
                          {r.team.logoUrl && <img src={r.team.logoUrl} alt="" width={20} height={20} loading="lazy" />}
                          <span className="hide-sm">{r.team.name}</span>
                          <span className="show-sm">{r.team.shortName}</span>
                        </span>
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
          <ul className="legend muted">
            <li><span className="swatch ucl" /> Champions League</li>
            <li><span className="swatch uel" /> Europa League</li>
            <li><span className="swatch uecl" /> Conference League</li>
            <li><span className="swatch rel" /> Relegation</li>
          </ul>
          <p className="legend-note muted">
            The usual places. The FA Cup and League Cup winners also qualify for Europe, so if they already
            finished high enough, those places pass down the table — and England can earn an extra Champions
            League place through UEFA's season rankings.
          </p>
        </div>

        {/* Desktop only: hidden under 1000px by CSS, so phones get the table and nothing else. */}
        {news && news.length > 0 && (
          <aside className="table-news" aria-labelledby="table-news-h">
            <h2 id="table-news-h" className="side-h">Latest news</h2>
            <NewsList items={news} max={6} />
          </aside>
        )}
      </div>
    </section>
  )
}
