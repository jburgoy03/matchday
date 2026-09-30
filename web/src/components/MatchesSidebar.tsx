import { Link } from 'react-router'
import type { Leaderboards, MatchListItem, Standing, Team } from '../api'
import { ChevronRight } from './Icons'
import { Crest } from './Crest'
import { teamPath } from '../teamPath'

const ET = 'America/New_York'
const whenFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ET, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
})

/** Top of the table, plus Arsenal's row when they're outside it, so the snapshot always answers "where are we?". */
function snapshot(table: Standing[]): Standing[] {
  const top = table.slice(0, 6)
  const arsenal = table.find(s => s.team.abbreviation === 'ARS')
  return arsenal && !top.includes(arsenal) ? [...top, arsenal] : top
}

interface BoardRow {
  playerId: number
  name: string
  team: Team | null
  value: number
}

/** One leaderboard: name, club, number. Hidden when nobody has a number yet. */
function Board({ title, rows }: { title: string; rows: BoardRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="side-card card">
      <h2>{title}</h2>
      <div className="side-scorers">
        {rows.map(r => (
          <div key={r.playerId} className="side-scorer">
            <span className="name">{r.name}</span>
            <span className="muted abbr">{r.team?.abbreviation ?? ''}</span>
            <strong>{r.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MatchesSidebar({ table, boards, arsenalNext }: {
  table: Standing[] | null
  boards: Leaderboards | null
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
                <span className="side-team"><Crest team={s.team} size={20} /><span>{s.team.shortName}</span></span>
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

      {boards && (
        <>
          <Board title="Top scorers" rows={boards.scorers.map(l => ({ ...l, value: l.goals }))} />
          <Board title="Top assists" rows={boards.assists.map(l => ({ ...l, value: l.assists }))} />
          <Board title="Clean sheets" rows={boards.cleanSheets.map(l => ({ ...l, value: l.cleanSheets }))} />
        </>
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