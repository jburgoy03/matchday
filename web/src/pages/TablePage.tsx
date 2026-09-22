import { Link } from 'react-router'
import { api } from '../api'
import { useApi } from '../useApi'
import { TeamBadge } from '../components/TeamBadge'

function zone(position: number) {
  if (position <= 4) return 'ucl'
  if (position >= 18) return 'rel'
  return undefined
}

export default function TablePage() {
  const { data, error } = useApi(api.standings, [])

  if (error) return <p className="error">Couldn't load the table: {error}</p>
  if (!data) return <p className="muted">Loading…</p>

  return (
    <section>
      <h1>Premier League table</h1>
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
              <tr key={r.team.id} className={zone(r.position)}>
                <td>{r.position}</td>
                <td className="team-col">
                  <Link to={`/team/${r.team.id}`} className="team-link">
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