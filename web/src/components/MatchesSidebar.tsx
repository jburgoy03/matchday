import { useState } from 'react'
import { Link } from 'react-router'
import type { Leaderboards, MatchListItem, Standing, Team } from '../api'
import { ChevronRight } from './Icons'
import { Crest } from './Crest'
import { teamPath } from '../teamPath'
import { useOpenPlayer } from './PlayerProfile'
import { competitionName, PREMIER_LEAGUE } from '../competitions'

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

type BoardKey = 'goals' | 'assists' | 'cleanSheets'
const BOARD_TABS: { key: BoardKey; label: string }[] = [
  { key: 'goals', label: 'Goals' },
  { key: 'assists', label: 'Assists' },
  { key: 'cleanSheets', label: 'Clean sheets' },
]

/**
 * Scorers, assists and clean sheets in one card behind tabs — three separate cards made the
 * sticky column taller than the screen, so the bottom of it was unreachable until the page ended.
 */
function Leaders({ boards, competition }: { boards: Leaderboards; competition: string }) {
  const [tab, setTab] = useState<BoardKey>('goals')
  const open = useOpenPlayer()
  const rows: Record<BoardKey, BoardRow[]> = {
    goals: boards.scorers.map(l => ({ ...l, value: l.goals })),
    assists: boards.assists.map(l => ({ ...l, value: l.assists })),
    cleanSheets: boards.cleanSheets.map(l => ({ ...l, value: l.cleanSheets })),
  }
  if (Object.values(rows).every(r => r.length === 0)) return null
  const shown = rows[tab]

  return (
    <div className="side-card card">
      <h2>Season leaders{competition === PREMIER_LEAGUE ? '' : ` · ${competitionName(competition)}`}</h2>
      <div className="segmented" role="group" aria-label="Leaderboard">
        {BOARD_TABS.map(t => (
          <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="muted side-empty">Nobody yet.</p>
      ) : (
        <div className="side-scorers">
          {shown.map(r => (
            <button key={r.playerId} type="button" className="side-scorer row-btn" onClick={() => open(r.playerId)}>
              <span className="name">{r.name}</span>
              <span className="muted abbr">{r.team?.abbreviation ?? ''}</span>
              <strong>{r.value}</strong>
              <span className="row-chev"><ChevronRight size={14} /></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** The full table page for a competition; the Premier League is the page's default. */
const tablePath = (competition: string) => (competition === PREMIER_LEAGUE ? '/table' : `/table?comp=${competition}`)

/** Table and leaders follow the matches page's competition; "Arsenal next" is across every competition. */
export function MatchesSidebar({ competition, table, boards, arsenalNext }: {
  competition: string
  table: Standing[] | null
  boards: Leaderboards | null
  arsenalNext: MatchListItem | null
}) {
  return (
    <aside className="matches-side">
      {table && table.length > 0 && (
        <div className="side-card card">
          <h2>{competition === PREMIER_LEAGUE ? 'Table' : competitionName(competition)}</h2>
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
          <Link to={tablePath(competition)} className="tp-more">
            <span>View full table</span>
            <ChevronRight size={16} />
          </Link>
        </div>
      )}

      {boards && <Leaders key={competition} boards={boards} competition={competition} />}

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