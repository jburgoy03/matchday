import { useEffect, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api, type MatchListItem, type SquadPlayer, type Standing, type Team, type TeamStats } from '../api'
import { useApi } from '../useApi'
import { isLive } from '../format'
import { BackLink } from '../components/BackLink'
import { ChevronRight } from '../components/Icons'
import { teamPath } from '../teamPath'

type Tab = 'overview' | 'matches' | 'squad' | 'stats'
type Result = 'W' | 'D' | 'L'

/** A finished match from this team's point of view. */
interface Played {
  match: MatchListItem
  home: boolean
  opponent: Team
  gf: number
  ga: number
  result: Result
}

const ET = 'America/New_York'
const dateFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', month: 'short', day: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' })
const shortDate = (iso: string) => dateFmt.format(new Date(iso))
const kickoffTime = (iso: string) => timeFmt.format(new Date(iso))

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
}

function toPlayed(m: MatchListItem, teamId: number): Played | null {
  if (m.status !== 'FullTime' || m.homeScore === null || m.awayScore === null) return null
  const home = m.home.id === teamId
  const gf = home ? m.homeScore : m.awayScore
  const ga = home ? m.awayScore : m.homeScore
  return { match: m, home, opponent: home ? m.away : m.home, gf, ga, result: gf > ga ? 'W' : gf === ga ? 'D' : 'L' }
}

const ARSENAL = 'ARS'
const DISPLAY_FONT = 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap'

/** Arsenal's page gets its own look: the tokens on <body> are swapped while it's open, plus a display face. */
function useClubTheme(active: boolean) {
  useEffect(() => {
    if (!active) return
    if (!document.querySelector(`link[href="${DISPLAY_FONT}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = DISPLAY_FONT
      document.head.appendChild(link)
    }
    document.body.classList.add('theme-arsenal')
    return () => document.body.classList.remove('theme-arsenal')
  }, [active])
}

/** /team/:id, or rendered by ArsenalPage with the id already resolved. */
export default function TeamPage({ teamId }: { teamId?: string }) {
  const routeParams = useParams()
  const id = teamId ?? routeParams.id ?? ''
  const [params, setParams] = useSearchParams()
  const { data, error } = useApi(signal => api.team(id, signal), [id])
  const isArsenal = data?.team.abbreviation === ARSENAL
  useClubTheme(isArsenal)

  if (error) return <p className="error">Couldn't load this team: {error}</p>
  if (!data) return <p className="muted">Loading…</p>

  const { team, venue, table, matches, squad, stats } = data
  const standing = table.find(s => s.team.id === team.id) ?? null
  const results = matches.map(m => toPlayed(m, team.id)).filter((p): p is Played => p !== null)
  const upcoming = matches.filter(m => m.status === 'Scheduled' || isLive(m.status))

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'matches', label: 'Matches' },
    ...(squad.length > 0 ? [{ id: 'squad' as const, label: 'Squad' }] : []),
    ...(stats ? [{ id: 'stats' as const, label: 'Stats' }] : []),
  ]
  const tab: Tab = tabs.find(t => t.id === params.get('tab'))?.id ?? 'overview'
  const select = (t: Tab) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })

  return (
    <section className={`team-page ${isArsenal ? 'club-page' : ''}`}>
      {isArsenal ? (
        <ClubHero team={team} venue={venue} standing={standing} results={results} />
      ) : (
        <>
          <BackLink to="/table" label="Table" />
          <div className="team-head card">
            <Crest team={team} size={72} />
            <div className="team-name">
              <h1>{team.name}</h1>
              {venue && <span className="muted">{venue}</span>}
            </div>
            {standing && (
              <div className="team-standing">
                <div className="team-pos">
                  <strong>{ordinal(standing.position)}</strong>
                  <span className="muted">{standing.points} pts · {standing.played} played</span>
                </div>
                <FormStrip results={results.slice(-5)} />
              </div>
            )}
          </div>
        </>
      )}

      <div className="tabs" role="tablist">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => select(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <Overview team={team} table={table} results={results} next={upcoming[0] ?? null} squad={squad} />
      )}
      {tab === 'matches' && <MatchesTab team={team} upcoming={upcoming} results={results} />}
      {tab === 'squad' && <SquadTab squad={squad} />}
      {tab === 'stats' && stats && <StatsTab team={team} stats={stats} results={results} table={table} />}
    </section>
  )
}

/** Arsenal's header: a full-width red band with the crest, a display-face name and the season at a glance. */
function ClubHero({ team, venue, standing, results }: {
  team: Team; venue: string | null; standing: Standing | null; results: Played[]
}) {
  return (
    <header className="club-hero">
      <div className="club-hero-inner">
        <Crest team={team} size={104} />
        <div className="club-hero-name">
          <p className="club-kicker">{venue ?? 'North London'}</p>
          <h1>{team.name}</h1>
        </div>
        {standing && (
          <dl className="club-hero-stats">
            <div><dt>Position</dt><dd>{ordinal(standing.position)}</dd></div>
            <div><dt>Points</dt><dd>{standing.points}</dd></div>
            <div><dt>Played</dt><dd>{standing.played}</dd></div>
          </dl>
        )}
      </div>
      {results.length > 0 && (
        <div className="club-hero-form">
          <span>Form</span>
          <FormStrip results={results.slice(-5)} />
        </div>
      )}
    </header>
  )
}

function Crest({ team, size }: { team: Team; size: number }) {
  return team.logoUrl ? (
    <img className="crest" src={team.logoUrl} alt="" width={size} height={size} />
  ) : (
    <span className="crest crest-fallback" style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}>
      {team.abbreviation}
    </span>
  )
}

function ResultPill({ result }: { result: Result }) {
  const label = { W: 'Win', D: 'Draw', L: 'Loss' }[result]
  return <span className={`result r-${result}`} title={label} aria-label={label}>{result}</span>
}

function FormStrip({ results }: { results: Played[] }) {
  if (results.length === 0) return null
  return (
    <ol className="form-strip" aria-label="Last five results">
      {results.map(p => (
        <li key={p.match.id}>
          <Link to={`/match/${p.match.id}`} title={`${p.home ? 'vs' : 'at'} ${p.opponent.name}: ${p.gf}–${p.ga}`}>
            <ResultPill result={p.result} />
            <span className="muted">{p.opponent.abbreviation}</span>
          </Link>
        </li>
      ))}
    </ol>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="tp-card card">
      <h2>{title}</h2>
      {children}
    </div>
  )
}

/* ---------- Overview ---------- */

function Overview({ team, table, results, next, squad }: {
  team: Team; table: Standing[]; results: Played[]; next: MatchListItem | null; squad: SquadPlayer[]
}) {
  const last = results.at(-1) ?? null
  const scorers = squad
    .filter(p => p.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
    .slice(0, 3)

  return (
    <div className="tp-grid">
      <div className="tp-col">
        {next && <NextMatch team={team} m={next} />}
        {last && (
          <Card title="Last result">
            <Link to={`/match/${last.match.id}`} className="tp-fixture">
              <Crest team={last.opponent} size={40} />
              <span className="tp-fixture-text">
                <strong>{last.home ? 'vs' : 'at'} {last.opponent.name}</strong>
                <span className="muted">{shortDate(last.match.kickoffUtc)} · {last.home ? 'Home' : 'Away'}</span>
              </span>
              <span className="tp-score">{last.gf}–{last.ga}</span>
              <ResultPill result={last.result} />
            </Link>
          </Card>
        )}
        <Record results={results} />
      </div>
      <div className="tp-col">
        {table.length > 0 && <MiniTable team={team} table={table} />}
        {scorers.length > 0 && (
          <Card title="Top scorers">
            <div className="tp-scorers">
              <span /><span /><span className="muted">G</span><span className="muted">A</span>
              {scorers.map(p => (
                <ScorerRow key={p.playerId} p={p} />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function ScorerRow({ p }: { p: SquadPlayer }) {
  return (
    <>
      <span className="jersey-chip">{p.jersey}</span>
      <span>{p.name}</span>
      <strong>{p.goals}</strong>
      <span className="muted">{p.assists}</span>
    </>
  )
}

function NextMatch({ team, m }: { team: Team; m: MatchListItem }) {
  const home = m.home.id === team.id
  const opponent = home ? m.away : m.home
  const live = isLive(m.status)
  const days = daysUntil(m.kickoffUtc)
  return (
    <Card title={live ? 'Live now' : 'Next match'}>
      <Link to={`/match/${m.id}`} className="tp-fixture">
        <Crest team={opponent} size={40} />
        <span className="tp-fixture-text">
          <strong>{home ? 'vs' : 'at'} {opponent.name}</strong>
          <span className="muted">
            {shortDate(m.kickoffUtc)} · {kickoffTime(m.kickoffUtc)} ET · {home ? 'Home' : 'Away'}
          </span>
        </span>
        {live ? (
          <span className="tp-score live">{m.homeScore ?? 0}–{m.awayScore ?? 0}</span>
        ) : (
          <span className="tp-chip">{days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days} days`}</span>
        )}
      </Link>
    </Card>
  )
}

function Record({ results }: { results: Played[] }) {
  if (results.length === 0) return null
  const tally = (ps: Played[]) => ({
    w: ps.filter(p => p.result === 'W').length,
    d: ps.filter(p => p.result === 'D').length,
    l: ps.filter(p => p.result === 'L').length,
    gf: ps.reduce((n, p) => n + p.gf, 0),
    ga: ps.reduce((n, p) => n + p.ga, 0),
  })
  const all = tally(results)
  const gd = all.gf - all.ga
  const splits = [
    { label: 'Home', ...tally(results.filter(p => p.home)) },
    { label: 'Away', ...tally(results.filter(p => !p.home)) },
  ]

  return (
    <Card title="Season record">
      <div className="tp-record">
        <Big n={all.w} label="Won" cls="r-W" />
        <Big n={all.d} label="Drawn" cls="r-D" />
        <Big n={all.l} label="Lost" cls="r-L" />
        <span className="tp-divider" aria-hidden="true" />
        <Big n={all.gf} label="For" />
        <Big n={all.ga} label="Against" />
        <Big n={gd > 0 ? `+${gd}` : gd} label="Diff" />
      </div>
      <div className="tp-splits">
        {splits.map(s => (
          <div key={s.label} className="tp-split">
            <span className="muted">{s.label}</span>
            <span className="tp-split-bar" aria-hidden="true">
              {s.w + s.d + s.l === 0 ? (
                <span className="empty" style={{ flexGrow: 1 }} />
              ) : (
                <>
                  <span className="r-W" style={{ flexGrow: s.w }} />
                  <span className="r-D" style={{ flexGrow: s.d }} />
                  <span className="r-L" style={{ flexGrow: s.l }} />
                </>
              )}
            </span>
            <span className="tp-split-nums">{s.w}-{s.d}-{s.l} · {s.gf}:{s.ga}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Big({ n, label, cls = '' }: { n: number | string; label: string; cls?: string }) {
  return (
    <div className="tp-big">
      <strong className={cls}>{n}</strong>
      <span className="muted">{label}</span>
    </div>
  )
}

function MiniTable({ team, table }: { team: Team; table: Standing[] }) {
  const idx = table.findIndex(s => s.team.id === team.id)
  const start = Math.max(0, Math.min(idx - 2, table.length - 5))
  const rows = idx < 0 ? table.slice(0, 5) : table.slice(start, start + 5)
  return (
    <Card title="League position">
      <div className="tp-mini">
        <div className="tp-mini-row head muted">
          <span>#</span><span>Team</span><span>P</span><span>GD</span><span>Pts</span>
        </div>
        {rows.map(s => (
          <Link
            key={s.team.id}
            to={teamPath(s.team)}
            className={`tp-mini-row ${s.team.id === team.id ? 'me' : ''}`}
            aria-current={s.team.id === team.id ? 'page' : undefined}
          >
            <span className="muted">{s.position}</span>
            <span className="tp-mini-team"><Crest team={s.team} size={20} /><span>{s.team.shortName}</span></span>
            <span>{s.played}</span>
            <span>{s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}</span>
            <strong>{s.points}</strong>
          </Link>
        ))}
      </div>
      <Link to="/table" className="tp-more">
        <span>View full table</span>
        <ChevronRight size={16} />
      </Link>
    </Card>
  )
}

/* ---------- Matches ---------- */

function MatchesTab({ team, upcoming, results }: { team: Team; upcoming: MatchListItem[]; results: Played[] }) {
  return (
    <div className="tp-sections">
      {upcoming.length > 0 && (
        <section>
          <h2 className="tp-section-title">Upcoming</h2>
          <ul className="tp-list card">
            {upcoming.map(m => {
              const home = m.home.id === team.id
              const live = isLive(m.status)
              return (
                <li key={m.id}>
                  <MatchRow
                    id={m.id}
                    date={shortDate(m.kickoffUtc)}
                    home={home}
                    opponent={home ? m.away : m.home}
                    right={live ? `${m.homeScore ?? 0}–${m.awayScore ?? 0}` : kickoffTime(m.kickoffUtc)}
                    rightClass={live ? 'live' : 'muted'}
                  />
                </li>
              )
            })}
          </ul>
        </section>
      )}
      <section>
        <h2 className="tp-section-title">Results</h2>
        {results.length === 0 ? (
          <p className="muted">No results yet this season.</p>
        ) : (
          <ul className="tp-list card">
            {[...results].reverse().map(p => (
              <li key={p.match.id}>
                <MatchRow
                  id={p.match.id}
                  date={shortDate(p.match.kickoffUtc)}
                  home={p.home}
                  opponent={p.opponent}
                  right={`${p.gf}–${p.ga}`}
                  rightClass="strong"
                  result={p.result}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function MatchRow({ id, date, home, opponent, right, rightClass, result }: {
  id: number; date: string; home: boolean; opponent: Team; right: string; rightClass: string; result?: Result
}) {
  return (
    <Link to={`/match/${id}`} className="tp-match">
      <span className="tp-date muted">{date}</span>
      <span className="tp-ha" title={home ? 'Home' : 'Away'}>{home ? 'H' : 'A'}</span>
      <span className="tp-opp"><Crest team={opponent} size={24} /><span>{opponent.name}</span></span>
      <span className={`tp-right ${rightClass}`}>{right}</span>
      <span className="tp-res">{result && <ResultPill result={result} />}</span>
    </Link>
  )
}

/* ---------- Squad ---------- */

const GROUPS: { code: string; title: string }[] = [
  { code: 'G', title: 'Goalkeepers' },
  { code: 'D', title: 'Defenders' },
  { code: 'M', title: 'Midfielders' },
  { code: 'F', title: 'Forwards' },
]

function SquadTab({ squad }: { squad: SquadPlayer[] }) {
  const known = new Set(GROUPS.map(g => g.code))
  const groups = [
    ...GROUPS.map(g => ({ title: g.title, players: squad.filter(p => p.position === g.code) })),
    { title: 'Other', players: squad.filter(p => !known.has(p.position ?? '')) },
  ].filter(g => g.players.length > 0)

  return (
    <div className="tp-sections">
      {groups.map(g => (
        <table key={g.title} className="tp-squad card">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Number</span></th>
              <th scope="col" className="name">{g.title}</th>
              <th scope="col" className="hide-sm">Nation</th>
              <th scope="col" className="num hide-sm">Age</th>
              <th scope="col" className="num"><abbr title="Appearances">Apps</abbr></th>
              <th scope="col" className="num"><abbr title="Goals">G</abbr></th>
              <th scope="col" className="num"><abbr title="Assists">A</abbr></th>
            </tr>
          </thead>
          <tbody>
            {g.players.map(p => (
              <tr key={p.playerId}>
                <td><span className="jersey-chip">{p.jersey ?? '–'}</span></td>
                <td className="name">
                  {p.flagUrl && <img className="flag show-sm" src={p.flagUrl} alt={p.nationality ?? ''} width={18} height={12} />}
                  {p.name}
                </td>
                <td className="hide-sm nation">
                  {p.flagUrl && <img className="flag" src={p.flagUrl} alt="" width={18} height={12} />}
                  <span className="muted">{p.nationality}</span>
                </td>
                <td className="num hide-sm muted">{p.age ?? '–'}</td>
                <td className="num">{p.apps}</td>
                <td className={`num ${p.goals ? 'strong' : 'muted'}`}>{p.goals}</td>
                <td className={`num ${p.assists ? '' : 'muted'}`}>{p.assists}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  )
}

/* ---------- Stats ---------- */

interface StatRow {
  label: string
  team: number | null
  league: number | null
  pct?: boolean
  /** No bar, just the number (e.g. clean sheets) */
  plain?: boolean
}

function StatsTab({ team, stats, results, table }: {
  team: Team; stats: { matches: number; team: TeamStats; league: TeamStats }; results: Played[]; table: Standing[]
}) {
  const t = stats.team
  const l = stats.league
  const ratio = (s: TeamStats, part: string, whole: string) =>
    s[part] !== undefined && s[whole] ? (s[part] / s[whole]) * 100 : null
  const val = (s: TeamStats, k: string) => s[k] ?? null

  const played = results.length
  const leaguePlayed = table.reduce((n, s) => n + s.played, 0)
  const leagueGoals = leaguePlayed ? table.reduce((n, s) => n + s.goalsFor, 0) / leaguePlayed : null
  const perGame = (n: number) => (played ? n / played : null)

  const sections: { title: string; rows: StatRow[] }[] = [
    {
      title: 'Attack',
      rows: [
        { label: 'Goals', team: perGame(results.reduce((n, p) => n + p.gf, 0)), league: leagueGoals },
        { label: 'Shots', team: val(t, 'totalShots'), league: val(l, 'totalShots') },
        { label: 'Shots on target', team: val(t, 'shotsOnTarget'), league: val(l, 'shotsOnTarget') },
        { label: 'Corners', team: val(t, 'wonCorners'), league: val(l, 'wonCorners') },
      ],
    },
    {
      title: 'Possession & passing',
      rows: [
        { label: 'Possession', team: val(t, 'possessionPct'), league: val(l, 'possessionPct'), pct: true },
        { label: 'Passes', team: val(t, 'totalPasses'), league: val(l, 'totalPasses') },
        { label: 'Pass accuracy', team: ratio(t, 'accuratePasses', 'totalPasses'), league: ratio(l, 'accuratePasses', 'totalPasses'), pct: true },
      ],
    },
    {
      title: 'Defence',
      rows: [
        { label: 'Goals conceded', team: perGame(results.reduce((n, p) => n + p.ga, 0)), league: leagueGoals },
        { label: 'Tackles won', team: ratio(t, 'effectiveTackles', 'totalTackles'), league: ratio(l, 'effectiveTackles', 'totalTackles'), pct: true },
        { label: 'Interceptions', team: val(t, 'interceptions'), league: val(l, 'interceptions') },
        { label: 'Clean sheets', team: results.filter(p => p.ga === 0).length, league: null, plain: true },
      ],
    },
    {
      title: 'Discipline',
      rows: [
        { label: 'Fouls', team: val(t, 'foulsCommitted'), league: val(l, 'foulsCommitted') },
        { label: 'Yellow cards', team: val(t, 'yellowCards'), league: val(l, 'yellowCards') },
      ],
    },
  ]

  return (
    <div className="tp-sections">
      <div className="tp-legend muted">
        <span>Per match, over {stats.matches} {stats.matches === 1 ? 'match' : 'matches'}</span>
        <span className="tp-key"><span className="tp-key-bar" />{team.shortName}</span>
        <span className="tp-key"><span className="tp-key-mark" />League average</span>
      </div>
      {sections.map(s => {
        const rows = s.rows.filter(r => r.team !== null)
        if (rows.length === 0) return null
        return (
          <section key={s.title}>
            <h2 className="tp-section-title">{s.title}</h2>
            <ul className="tp-stats card">
              {rows.map(r => <StatLine key={r.label} row={r} />)}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function StatLine({ row }: { row: StatRow }) {
  const fmt = (n: number) =>
    row.pct ? `${Math.round(n)}%` : row.plain || Math.abs(n) >= 100 ? String(Math.round(n)) : n.toFixed(1)
  const value = row.team ?? 0
  const scale = row.pct ? 100 : Math.max(value, row.league ?? 0) * 1.4 || 1
  return (
    <li className="tp-stat">
      <span className="tp-stat-label">{row.label}</span>
      <strong className="tp-stat-val">{fmt(value)}</strong>
      {row.plain ? (
        <span className="muted tp-stat-note">This season</span>
      ) : (
        <span className="tp-bar" aria-hidden="true">
          <span className="tp-bar-fill" style={{ width: `${Math.min(100, (value / scale) * 100)}%` }} />
          {row.league !== null && <span className="tp-bar-mark" style={{ left: `${Math.min(100, (row.league / scale) * 100)}%` }} />}
        </span>
      )}
      <span className="tp-stat-league muted">{row.league !== null ? `League ${fmt(row.league)}` : ''}</span>
    </li>
  )
}