import { Link, useNavigate, useSearchParams } from 'react-router'
import { api } from '../api'
import { useApi } from '../useApi'
import { teamPath } from '../teamPath'
import { NewsList } from '../components/NewsList'
import { CompetitionPicker, competitionName, PREMIER_LEAGUE, WITH_TABLES } from '../competitions'

type Zone = 'ucl' | 'uel' | 'uecl' | 'rel' | 'ko' | 'po' | 'out'

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

/**
 * UEFA league phases (36 clubs): the top eight go straight to the round of 16, 9th–24th play a
 * knockout play-off, 25th and below are out.
 */
function uefaZone(position: number): Zone {
  if (position <= 8) return 'ko'
  if (position <= 24) return 'po'
  return 'out'
}
const UEFA_ZONE_END = new Set([8, 24])

export default function TablePage() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('comp') ?? PREMIER_LEAGUE
  const comp = WITH_TABLES.includes(requested) ? requested : PREMIER_LEAGUE
  const league = comp === PREMIER_LEAGUE

  const { data, error } = useApi(signal => api.standings(signal, comp), [comp])
  const { data: news } = useApi(signal => api.news(6, signal), [])
  const navigate = useNavigate()

  const pick = (slug: string) => {
    const next = new URLSearchParams(params)
    if (slug === PREMIER_LEAGUE) next.delete('comp')
    else next.set('comp', slug)
    setParams(next, { replace: true })
  }
  const zoneOf = (p: number) => (league ? zone(p) : uefaZone(p))
  const endsZone = (p: number) => (league ? ZONE_END : UEFA_ZONE_END).has(p)

  const picker = <CompetitionPicker options={WITH_TABLES} value={comp} onChange={pick} label="Competition" />

  if (error) return <section className="table-page"><h1>{competitionName(comp)} table</h1>{picker}<p className="error">Couldn't load the table: {error}</p></section>
  if (!data) return <section className="table-page"><h1>{competitionName(comp)} table</h1>{picker}<p className="muted">Loading…</p></section>

  return (
    <section className="table-page">
      <h1>{competitionName(comp)} table</h1>
      {picker}
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
                    className={['row-link', zoneOf(r.position), endsZone(r.position) && 'zone-end'].filter(Boolean).join(' ')}
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
          {data.length === 0 && (
            <p className="muted">No table yet. It appears once the league phase has started.</p>
          )}
          {league ? (
            <>
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
            </>
          ) : (
            <ul className="legend muted">
              <li><span className="swatch ko" /> Round of 16</li>
              <li><span className="swatch po" /> Knockout play-offs</li>
              <li><span className="swatch out" /> Eliminated</li>
            </ul>
          )}
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
