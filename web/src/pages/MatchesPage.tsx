import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api, type MatchListItem, type Team } from '../api'
import { useApi } from '../useApi'
import { isLive } from '../format'
import { MatchRow } from '../components/MatchRow'
import { MatchesSidebar } from '../components/MatchesSidebar'
import { TeamFilter } from '../components/TeamFilter'
import { COMPETITION_ORDER, CompetitionPicker, PREMIER_LEAGUE, WITH_TABLES } from '../competitions'

type Show = 'results' | 'fixtures'

const ET = 'America/New_York'
const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', month: 'short', day: 'numeric' })

/** Eastern calendar day as YYYY-MM-DD; the API's date range works in the same days. */
const dayKey = (iso: string | Date) => keyFmt.format(new Date(iso))
const shiftKey = (key: string, days: number) => {
  const d = new Date(`${key}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const dayLabel = (key: string, today: string) => {
  if (key === today) return 'Today'
  if (key === shiftKey(today, 1)) return 'Tomorrow'
  if (key === shiftKey(today, -1)) return 'Yesterday'
  return dayFmt.format(new Date(`${key}T12:00:00Z`))
}

/** Season boundaries, matching Season.cs on the server: 1 August to the following 30 June. */
const seasonStart = (today: string) => {
  const [y, m] = today.split('-').map(Number)
  return `${m >= 7 ? y : y - 1}-08-01`
}
const seasonEnd = (today: string) => `${Number(seasonStart(today).slice(0, 4)) + 1}-06-30`

const FINISHED = new Set(['FullTime', 'Postponed', 'Cancelled'])

export default function MatchesPage() {
  const [params, setParams] = useSearchParams()
  const [tick, setTick] = useState(0)

  // Fixtures by default. Old links with ?show=all land on Fixtures too.
  const show: Show = params.get('show') === 'results' ? 'results' : 'fixtures'
  const teamId = Number(params.get('team') ?? 0) || 0

  const today = dayKey(new Date())
  // The whole season in one request, so switching Show is instant and every fixture is present.
  const range = useMemo(() => ({ from: seasonStart(today), to: seasonEnd(today) }), [today])

  const { data: matches, error } = useApi(signal => api.matches(range, signal), [range.from, range.to, tick])
  // Filtering by team switches the list to that club's season from the team endpoint.
  const { data: teamSeason } = useApi(
    signal => (teamId ? api.team(String(teamId), signal) : Promise.resolve(null)),
    [teamId, tick],
  )

  const source = teamId ? teamSeason?.matches : matches
  const loading = teamId ? !teamSeason : !matches

  // Competitions that have matches in what's loaded, in the usual order; the Premier League is always offered.
  const present = COMPETITION_ORDER.filter(c => c === PREMIER_LEAGUE || (source ?? []).some(m => m.competition === c))
  const requestedComp = params.get('comp') ?? PREMIER_LEAGUE
  // Until the list arrives, trust the URL so the sidebar starts loading the right competition straight away.
  const comp = source
    ? (present.includes(requestedComp) ? requestedComp : PREMIER_LEAGUE)
    : (COMPETITION_ORDER.includes(requestedComp) ? requestedComp : PREMIER_LEAGUE)
  const hasTable = WITH_TABLES.includes(comp)

  // The sidebar follows the picked competition. Each result is tagged with the competition it was
  // loaded for, so the previous competition's table never shows under the new one while it loads.
  const { data: tableFor } = useApi(
    async signal => ({ comp, rows: hasTable ? await api.standings(signal, comp) : [] }),
    [comp, tick],
  )
  const { data: boardsFor } = useApi(
    async signal => ({ comp, boards: await api.leaderboards(5, signal, comp) }),
    [comp, tick],
  )
  const table = tableFor?.comp === comp ? tableFor.rows : null
  const boards = boardsFor?.comp === comp ? boardsFor.boards : null

  const anyLive = !!matches?.some(m => isLive(m.status))
  useEffect(() => {
    if (!anyLive) return
    const t = setInterval(() => setTick(x => x + 1), 30_000)
    return () => clearInterval(t)
  }, [anyLive])

  const set = (key: string, value: string | number, fallback: string | number) => {
    const next = new URLSearchParams(params)
    if (String(value) === String(fallback)) next.delete(key)
    else next.set(key, String(value))
    setParams(next, { replace: true })
  }

  if (error) return <p className="error">Couldn't load matches: {error}</p>

  // Clubs in this competition: its table (when it has one) plus anyone with a match in it this season,
  // so a cup's lower-league sides and a knockout-only club are pickable too.
  const compTeams = new Map<number, Team>()
  for (const s of table ?? []) compTeams.set(s.team.id, s.team)
  for (const m of matches ?? []) {
    if (m.competition !== comp) continue
    if (!compTeams.has(m.home.id)) compTeams.set(m.home.id, m.home)
    if (!compTeams.has(m.away.id)) compTeams.set(m.away.id, m.away)
  }
  // Keep the picked club in the list even if the URL pairs it with another competition.
  if (teamSeason && !compTeams.has(teamSeason.team.id)) compTeams.set(teamSeason.team.id, teamSeason.team)
  const teams = [...compTeams.values()]

  const visible = (source ?? []).filter(m => {
    if (m.competition !== comp) return false
    const finished = FINISHED.has(m.status)
    return show === 'results' ? finished : !finished
  })

  // Group into Eastern days, keeping the API's kickoff order. Results read newest first.
  const days: { key: string; matches: MatchListItem[] }[] = []
  for (const m of visible) {
    const key = dayKey(m.kickoffUtc)
    const last = days.at(-1)
    if (last?.key === key) last.matches.push(m)
    else days.push({ key, matches: [m] })
  }
  if (show === 'results') days.reverse()

  const live = visible.filter(m => isLive(m.status))
  const todays = visible.filter(m => dayKey(m.kickoffUtc) === today)
  const next = visible.find(m => !FINISHED.has(m.status) && new Date(m.kickoffUtc) > new Date()) ?? null
  const arsenalNext = (matches ?? []).find(
    m => !FINISHED.has(m.status) && (m.home.abbreviation === 'ARS' || m.away.abbreviation === 'ARS'),
  ) ?? null

  return (
    <section className="matches-page">
      <div className="matches-layout">
        <div className="matches-rail">
          {present.length > 1 && (
            <div className="rail-group rail-comp">
              <span className="rail-label">Competition</span>
              <CompetitionPicker options={present} value={comp} onChange={c => set('comp', c, PREMIER_LEAGUE)} label="Competition" />
            </div>
          )}
          <div className="rail-group">
            <span className="rail-label">Show</span>
            <div className="segmented" role="group" aria-label="Filter matches">
              {(['fixtures', 'results'] as Show[]).map(v => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={show === v}
                  onClick={() => set('show', v, 'fixtures')}
                >
                  {v === 'results' ? 'Results' : 'Fixtures'}
                </button>
              ))}
            </div>
          </div>

          {teams.length > 0 && (
            <div className="rail-group">
              <span className="rail-label">Team</span>
              <TeamFilter
                teams={teams}
                value={teamId}
                onChange={id => set('team', id, 0)}
              />
              {teamId > 0 && <p className="rail-note">Showing the whole season</p>}
            </div>
          )}
        </div>

        {/* Heading and the live / today / next-up strip. On phones this sits above the controls. */}
        <div className="matches-head">
          <h1>Matches</h1>
          {!loading && <NowStrip live={live} todays={todays} next={next} today={today} />}
        </div>

        <div className="matches-list">
          {loading ? (
            <p className="muted">Loading…</p>
          ) : (
            <div className="matches-days">
              {days.map(d => (
                <section key={d.key} className="match-day">
                  <h2 className="day-head">{dayLabel(d.key, today)}</h2>
                  <div className="m-list card">
                    {d.matches.map(m => <MatchRow key={m.id} m={m} />)}
                  </div>
                </section>
              ))}
              {days.length === 0 && (
                <p className="muted">{teamId ? 'No matches for this team yet.' : 'Nothing to show here yet.'}</p>
              )}
            </div>
          )}
        </div>

        <MatchesSidebar competition={comp} table={table} boards={boards} arsenalNext={arsenalNext} />
      </div>
    </section>
  )
}

/** Live matches, else today's, else a countdown to the next kickoff. */
function NowStrip({ live, todays, next, today }: {
  live: MatchListItem[]; todays: MatchListItem[]; next: MatchListItem | null; today: string
}) {
  const shown = live.length > 0 ? live : todays
  if (shown.length > 0) {
    return (
      <div className="now-strip card">
        <span className="now-label">{live.length > 0 ? 'Live now' : 'Today'}</span>
        <div className="m-list">{shown.map(m => <MatchRow key={m.id} m={m} />)}</div>
      </div>
    )
  }
  if (!next) return null

  const days = Math.max(0, Math.ceil((new Date(next.kickoffUtc).getTime() - Date.now()) / 86_400_000))
  const when = new Intl.DateTimeFormat('en-US', {
    timeZone: ET, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(next.kickoffUtc))
  const sameDay = dayKey(next.kickoffUtc) === today

  return (
    <div className="now-strip card next">
      <span className="now-label">Next up{live.length === 0 && todays.length === 0 ? ' · no matches today' : ''}</span>
      <div className="now-next">
        <MatchRow m={next} />
        <span className="now-when">
          {when} ET · {sameDay ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}
        </span>
      </div>
    </div>
  )
}