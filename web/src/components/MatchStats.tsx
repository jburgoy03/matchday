import type { Team, TeamStats } from '../api'
import { TeamBadge } from './TeamBadge'

/** [value the bar compares, text shown], or null when ESPN didn't send the stat. */
type Reading = [number, string] | null

interface RowDef {
  label: string
  read: (s: TeamStats) => Reading
  /** Hide the row entirely, e.g. penalties when neither side had one. */
  hide?: (home: TeamStats, away: TeamStats) => boolean
}

const count = (key: string) => (s: TeamStats): Reading =>
  s[key] === undefined ? null : [s[key], String(Math.round(s[key]))]

const percent = (key: string) => (s: TeamStats): Reading =>
  s[key] === undefined ? null : [s[key], `${Math.round(s[key])}%`]

/** part/whole as a percentage. ESPN's own *Pct fields are rounded to one decimal, so compute it. */
const share = (part: string, whole: string) => (s: TeamStats): Reading => {
  if (s[part] === undefined || s[whole] === undefined) return null
  if (s[whole] === 0) return [0, '–']
  const p = Math.round((s[part] / s[whole]) * 100)
  return [p, `${p}%`]
}

/** "accurate/total", bar compares the accurate count. */
const ratio = (acc: string, total: string) => (s: TeamStats): Reading =>
  s[acc] === undefined || s[total] === undefined ? null : [s[acc], `${s[acc]}/${s[total]}`]

const GROUPS: { title: string; rows: RowDef[] }[] = [
  {
    title: 'Top stats',
    rows: [
      { label: 'Possession', read: percent('possessionPct') },
      { label: 'Shots', read: count('totalShots') },
      { label: 'Shots on target', read: count('shotsOnTarget') },
      { label: 'Corners', read: count('wonCorners') },
    ],
  },
  {
    title: 'Attack',
    rows: [
      { label: 'Shot accuracy', read: share('shotsOnTarget', 'totalShots') },
      { label: 'Blocked shots', read: count('blockedShots') },
      { label: 'Crosses', read: ratio('accurateCrosses', 'totalCrosses') },
      {
        label: 'Penalties',
        read: ratio('penaltyKickGoals', 'penaltyKickShots'),
        hide: (h, a) => !h.penaltyKickShots && !a.penaltyKickShots,
      },
    ],
  },
  {
    title: 'Passing',
    rows: [
      { label: 'Passes', read: count('totalPasses') },
      { label: 'Pass accuracy', read: share('accuratePasses', 'totalPasses') },
      { label: 'Long balls', read: ratio('accurateLongBalls', 'totalLongBalls') },
    ],
  },
  {
    title: 'Defence',
    rows: [
      { label: 'Tackles won', read: ratio('effectiveTackles', 'totalTackles') },
      { label: 'Interceptions', read: count('interceptions') },
      { label: 'Clearances', read: count('effectiveClearance') },
      { label: 'Saves', read: count('saves') },
    ],
  },
  {
    title: 'Discipline',
    rows: [
      { label: 'Fouls', read: count('foulsCommitted') },
      { label: 'Offsides', read: count('offsides') },
      { label: 'Yellow cards', read: count('yellowCards') },
      { label: 'Red cards', read: count('redCards') },
    ],
  },
]

interface Props {
  home: Team
  away: Team
  homeStats: TeamStats
  awayStats: TeamStats
}

export function MatchStats({ home, away, homeStats, awayStats }: Props) {
  const groups = GROUPS.map(g => ({
    title: g.title,
    rows: g.rows
      .filter(r => !r.hide?.(homeStats, awayStats))
      .map(r => ({ label: r.label, h: r.read(homeStats), a: r.read(awayStats) }))
      .filter(r => r.h !== null || r.a !== null),
  })).filter(g => g.rows.length > 0)

  if (groups.length === 0) return <p className="muted">No stats available for this match.</p>

  return (
    <div className="stats card">
      <div className="stats-head">
        <span className="key-team"><span className="key home" /><TeamBadge team={home} short /></span>
        <span className="key-team"><TeamBadge team={away} short /><span className="key away" /></span>
      </div>
      {groups.map(g => (
        <section key={g.title}>
          <h3>{g.title}</h3>
          <ul>
            {g.rows.map(r => <StatRow key={r.label} label={r.label} home={r.h ?? [0, '–']} away={r.a ?? [0, '–']} />)}
          </ul>
        </section>
      ))}
    </div>
  )
}

function StatRow({ label, home, away }: { label: string; home: [number, string]; away: [number, string] }) {
  const [hv, ht] = home
  const [av, at] = away
  const empty = hv + av === 0
  return (
    <li className="stat">
      <span className={`stat-home ${hv > av ? 'lead' : ''}`}>{ht}</span>
      <span className="stat-label">{label}</span>
      <span className={`stat-away ${av > hv ? 'lead' : ''}`}>{at}</span>
      <div className={`stat-bar ${empty ? 'empty' : ''}`} aria-hidden="true">
        <span className="home" style={{ flexGrow: empty ? 1 : hv }} />
        <span className="away" style={{ flexGrow: empty ? 1 : av }} />
      </div>
    </li>
  )
}