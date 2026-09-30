import { useState } from 'react'
import { Link } from 'react-router'
import type { Team, TeamLineup } from '../api'
import type { Side } from '../goals'
import { placeLineup } from '../formation'
import type { PlayerEvents } from '../playerEvents'
import { teamPath } from '../teamPath'
import { TeamBadge } from './TeamBadge'
import { Pitch } from './Pitch'
import { LineupList } from './LineupList'
import { AssistMark, Ball, CardMark, SubOff, SubOn } from './MatchIcons'

interface TeamSide {
  side: Side
  team: Team
  lineup: TeamLineup | null
}

/**
 * The Lineups tab. Wide screens show both clubs side by side with a key; under 640px one club at a
 * time behind a toggle, and no key (the list under the pitch spells the marks out).
 */
export function Lineups({ home, away, homeLineup, awayLineup, events }: {
  home: Team
  away: Team
  homeLineup: TeamLineup | null
  awayLineup: TeamLineup | null
  events: Map<number, PlayerEvents>
}) {
  const [shown, setShown] = useState<Side>('home')
  const teams: TeamSide[] = [
    { side: 'home', team: home, lineup: homeLineup },
    { side: 'away', team: away, lineup: awayLineup },
  ]

  return (
    <div className="lu">
      <div className="lu-legend" aria-hidden="true">
        <span><Ball /> Goal</span>
        <span><Ball ownGoal /> Own goal</span>
        <span><AssistMark /> Assist</span>
        <span><CardMark /> Yellow</span>
        <span><CardMark red /> Red</span>
        <span><SubOff /> Subbed off</span>
        <span><SubOn /> Came on</span>
      </div>

      <div className="lu-toggle" role="group" aria-label="Show lineup for">
        {teams.map(t => (
          <button key={t.side} type="button" aria-pressed={shown === t.side} onClick={() => setShown(t.side)}>
            <TeamBadge team={t.team} short />
          </button>
        ))}
      </div>

      <div className="lu-teams">
        {teams.map(t => (
          <TeamLineupView key={t.side} {...t} events={events} active={shown === t.side} />
        ))}
      </div>
    </div>
  )
}

function TeamLineupView({ side, team, lineup, events, active }: TeamSide & { events: Map<number, PlayerEvents>; active: boolean }) {
  const spots = lineup ? placeLineup(lineup) : null
  return (
    <section className={`lu-team${active ? ' active' : ''}`}>
      <div className="lu-head">
        <Link to={teamPath(team)} className="team-link"><TeamBadge team={team} /></Link>
        {lineup?.formation && <span className="lu-formation">{lineup.formation}</span>}
        <span className="lu-where">{side === 'home' ? 'Home' : 'Away'}</span>
      </div>
      {!lineup ? (
        <p className="muted">Not announced yet.</p>
      ) : (
        <>
          {spots && <Pitch lineup={lineup} spots={spots} events={events} side={side} teamName={team.name} />}
          <LineupList lineup={lineup} spots={spots} events={events} side={side} />
        </>
      )}
    </section>
  )
}
