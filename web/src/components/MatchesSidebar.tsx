import { Link } from 'react-router'
import type { Leader, MatchListItem, Standing } from '../api'
import { ChevronRight } from './Icons'
import { teamPath } from '../teamPath'

const ET = 'America/New_York'
const whenFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ET, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
})

function Crest({ team, size = 20 }: { team: Standing['team']; size?: number }) {
  return team.logoUrl ? (
    <img className="crest" src={team.logoUrl} alt="" width={size} height={size} />
  ) : (
    <span className="crest crest-fallback" style={{ width: size, height: size, fontSize: Math.round(size * 0.33) }}>
      {team.abbreviation}
    </span>
  )
}

/** Top of the table, plus Arsenal's row when they're outside it, so the snapshot always answers "where are we?". */
function snapshot(table: Standing[]): Standing[] {
  const top = table.slice(0, 6)
  const arsenal = table.find(s => s.team.abbreviation === 'ARS')
  return arsenal && !top.includes(arsenal) ? [...top, arsenal] : top
}

export function MatchesSidebar({ table, leaders, arsenalNext }: {
  table: Standing[] | null
  leaders: Leader[] | null
  arsenalNext: MatchListItem | null
}) {
  return (
    <aside className="matches-side">
      {table && table.length > 0 && (
        <div className="side-card card">
          <h2>Table</h2>
          <div className="side-table">
            {snapshot(table).map(s => (
              <Link
                key={s.team.id}
                to={teamPath(s.team)}
                className={`side-row ${s.team.abbreviation === 'ARS' ? 'me' : ''}`}
              >
                <span className="muted">{s.position}</span>
                <span className="side-team"><Crest team={s.team} /><span>{s.team.shortName}</span></span>
                <span className="muted">{s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}</span>
                <strong>{s.points}</strong>
              </Link>
            ))}
          </div>
          <Link to="/table" className="tp-more">
            <span>View full table</span>
            <ChevronRight size={16} />
          </Link>
        </div>
      )}

      {leaders && leaders.length > 0 && (
        <div className="side-card card">
          <h2>Top scorers</h2>
          <div className="side-scorers">
            {leaders.map(l => (
              <div key={l.playerId} className="side-scorer">
                <span className="name">{l.name}</span>
                <span className="muted abbr">{l.team?.abbreviation ?? ''}</span>
                <strong>{l.goals}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      {arsenalNext && (
        <div className="side-card card">
          <h2>Arsenal next</h2>
          <Link to={`/match/${arsenalNext.id}`} className="side-next">
            {(() => {
              const home = arsenalNext.home.abbreviation === 'ARS'
              const opponent = home ? arsenalNext.away : arsenalNext.home
              return (
                <>
                  <Crest team={opponent} size={34} />
                  <span className="side-next-text">
                    <strong>{home ? 'vs' : 'at'} {opponent.shortName}</strong>
                    <span className="muted">{whenFmt.format(new Date(arsenalNext.kickoffUtc))}</span>
                  </span>
                </>
              )
            })()}
          </Link>
        </div>
      )}
    </aside>
  )
}