import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api, type MatchListItem, type Team } from '../api'
import { useApi } from '../useApi'
import { useMediaQuery } from '../useMediaQuery'
import { isLive } from '../format'
import { MatchRow } from '../components/MatchRow'
import { MatchesSidebar } from '../components/MatchesSidebar'
import { TeamFilter } from '../components/TeamFilter'
import { COMPETITION_ORDER, CompetitionPicker, PREMIER_LEAGUE, WITH_TABLES } from '../competitions'

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

/** Below this width the sidebar can't sit beside the list (matches the 900px rule in index.css). */
const COMPACT = '(max-width: 900px)'
/** Match days shown around today on a compact screen, and how many each "show more" adds. */
const DAYS_BEFORE = 3
const DAYS_AFTER = 5
const DAYS_STEP = 7

export default function MatchesPage() {
  const [params, setParams] = useSearchParams()
  const [tick, setTick] = useState(0)

  const teamId = Number(params.get('team') ?? 0) || 0
  // Phones and tablets: the sidebar becomes its own view, and the list shows a window of days
  // around today instead of the whole season, so the controls and the table are always close by.
  const compact = useMediaQuery(COMPACT)
  const view = compact && params.get('view') === 'table' ? 'table' : 'list'

  const today = dayKey(new Date())
  // The whole season in one request, so the list covers every result and fixture.
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

  // One list for the whole season: results, live and upcoming, grouped into Eastern days in kickoff order.
  const days: { key: string; matches: MatchListItem[] }[] = []
  for (const m of source ?? []) {
    if (m.competition !== comp) continue
    const key = dayKey(m.kickoffUtc)
    const last = days.at(-1)
    if (last?.key === key) last.matches.push(m)
    else days.push({ key, matches: [m] })
  }
  // Where the page opens: today, or the next day with matches (the last day once the season is over).
  const anchorKey = (days.find(d => d.key >= today) ?? days.at(-1))?.key

  // Jump to the anchor day once per list (first load, competition, team or view change), not on live refreshes.
  const listRef = useRef<HTMLDivElement>(null)
  const scrolledFor = useRef('')
  const listId = `${comp}|${teamId}|${view}`

  // Compact screens: a window of match days around the anchor, widened on request. Resets per list.
  const [win, setWin] = useState({ id: listId, before: DAYS_BEFORE, after: DAYS_AFTER })
  const w = win.id === listId ? win : { id: listId, before: DAYS_BEFORE, after: DAYS_AFTER }
  const anchorIndex = Math.max(0, days.findIndex(d => d.key === anchorKey))
  const firstShown = compact ? Math.max(0, anchorIndex - w.before) : 0
  const lastShown = compact ? Math.min(days.length, anchorIndex + w.after) : days.length
  const shown = days.slice(firstShown, lastShown)

  // Showing earlier days adds them above; keep the day that was on top where it was on screen
  // (Safari has no scroll anchoring, so without this the list jumps).
  const keepInPlace = useRef<{ key: string; top: number } | null>(null)
  const showEarlier = () => {
    const first = listRef.current?.querySelector<HTMLElement>('[data-day]')
    if (first) keepInPlace.current = { key: first.dataset.day ?? '', top: first.getBoundingClientRect().top }
    setWin({ ...w, before: w.before + DAYS_STEP })
  }
  const showLater = () => setWin({ ...w, after: w.after + DAYS_STEP })
  useLayoutEffect(() => {
    const keep = keepInPlace.current
    if (!keep) return
    keepInPlace.current = null
    const el = listRef.current?.querySelector<HTMLElement>(`[data-day="${keep.key}"]`)
    if (el) window.scrollBy(0, el.getBoundingClientRect().top - keep.top)
  })

  const switchView = (next: 'list' | 'table') => {
    if (next === view) return
    set('view', next, 'list')
    window.scrollTo(0, 0)
  }
  const jumpToToday = (smooth: boolean) => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-anchor]')
    el?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
  }
  useEffect(() => {
    if (loading || !anchorKey || scrolledFor.current === listId) return
    scrolledFor.current = listId
    // Nothing to skip past when the anchor is the first day shown.
    if (view === 'list' && anchorKey !== shown[0]?.key) jumpToToday(false)
  })

  if (error) return <p className="error">Couldn't load matches: {error}</p>

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
          {view === 'list' && <div className="rail-group">
            <button type="button" className="rail-btn" onClick={() => jumpToToday(true)} disabled={!anchorKey}>
              Jump to today
            </button>
          </div>}

          {view === 'list' && teams.length > 0 && (
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

        {/* On phones the heading sits above the controls. */}
        <div className="matches-head">
          <div className="matches-title">
            <h1>Matches</h1>
            {compact && (
              <div className="segmented matches-view" role="group" aria-label="Show">
                <button type="button" aria-pressed={view === 'list'} onClick={() => switchView('list')}>
                  Matches
                </button>
                <button type="button" aria-pressed={view === 'table'} onClick={() => switchView('table')}>
                  {hasTable ? 'Table & leaders' : 'Leaders'}
                </button>
              </div>
            )}
          </div>
        </div>

        {view === 'list' && <div className="matches-list">
          {loading ? (
            <p className="muted">Loading…</p>
          ) : (
            <div className="matches-days" ref={listRef}>
              {firstShown > 0 && (
                <button type="button" className="rail-btn more-days" onClick={showEarlier}>Earlier results</button>
              )}
              {shown.map(d => (
                <section
                  key={d.key}
                  className="match-day"
                  data-day={d.key}
                  data-anchor={d.key === anchorKey ? '' : undefined}
                >
                  <h2 className="day-head">{dayLabel(d.key, today)}</h2>
                  <div className="m-list card">
                    {d.matches.map(m => <MatchRow key={m.id} m={m} />)}
                  </div>
                </section>
              ))}
              {lastShown < days.length && (
                <button type="button" className="rail-btn more-days" onClick={showLater}>Later fixtures</button>
              )}
              {days.length === 0 && (
                <p className="muted">{teamId ? 'No matches for this team yet.' : 'Nothing to show here yet.'}</p>
              )}
            </div>
          )}
        </div>}

        {(!compact || view === 'table') && (
          <MatchesSidebar competition={comp} table={table} boards={boards} arsenalNext={arsenalNext} />
        )}
      </div>
    </section>
  )
}
