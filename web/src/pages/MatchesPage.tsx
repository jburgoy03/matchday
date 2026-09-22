import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api, type MatchListItem } from '../api'
import { useApi } from '../useApi'
import { isLive } from '../format'
import { MatchRow } from '../components/MatchRow'
import { MatchesSidebar } from '../components/MatchesSidebar'
import { ChevronLeft, ChevronRight } from '../components/Icons'

type Show = 'all' | 'results' | 'fixtures'

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

const FINISHED = new Set(['FullTime', 'Postponed', 'Cancelled'])

export default function MatchesPage() {
  const [params, setParams] = useSearchParams()
  const [tick, setTick] = useState(0)
  const mainRef = useRef<HTMLDivElement>(null)

  const show = (params.get('show') ?? 'all') as Show
  const offset = Number(params.get('week') ?? 0) || 0
  const teamId = Number(params.get('team') ?? 0) || 0

  const today = dayKey(new Date())
  const range = useMemo(
    () => ({ from: shiftKey(today, -7 + offset * 7), to: shiftKey(today, 21 + offset * 7) }),
    [today, offset],
  )

  const { data: matches, error } = useApi(signal => api.matches(range, signal), [range.from, range.to, tick])
  const { data: table } = useApi(api.standings, [tick])
  const { data: leaders } = useApi(signal => api.leaders(5, signal), [tick])

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

  const jumpToToday = () => {
    if (offset !== 0) {
      set('week', 0, 0)
      return
    }
    const target = mainRef.current?.querySelector('[data-upcoming="true"]') ?? mainRef.current?.lastElementChild
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (error) return <p className="error">Couldn't load matches: {error}</p>

  const visible = (matches ?? []).filter(m => {
    if (teamId && m.home.id !== teamId && m.away.id !== teamId) return false
    if (show === 'results') return FINISHED.has(m.status)
    if (show === 'fixtures') return !FINISHED.has(m.status)
    return true
  })

  // Group into Eastern days, keeping the API's kickoff order.
  const days: { key: string; matches: MatchListItem[] }[] = []
  for (const m of visible) {
    const key = dayKey(m.kickoffUtc)
    const last = days.at(-1)
    if (last?.key === key) last.matches.push(m)
    else days.push({ key, matches: [m] })
  }

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
          <div className="rail-group">
            <span className="rail-label">Show</span>
            <div className="segmented" role="group" aria-label="Filter matches">
              {(['all', 'results', 'fixtures'] as Show[]).map(v => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={show === v}
                  onClick={() => set('show', v, 'all')}
                >
                  {v === 'all' ? 'All' : v === 'results' ? 'Results' : 'Fixtures'}
                </button>
              ))}
            </div>
          </div>

          <div className="rail-group">
            <span className="rail-label">Week</span>
            <div className="rail-buttons">
              <button type="button" className="rail-btn" onClick={() => set('week', offset - 1, 0)}>
                <ChevronLeft size={16} />
                <span>Previous week</span>
              </button>
              <button type="button" className="rail-btn" onClick={() => set('week', offset + 1, 0)}>
                <ChevronRight size={16} />
                <span>Next week</span>
              </button>
              <button type="button" className="rail-btn" onClick={jumpToToday}>
                <span>Jump to today</span>
              </button>
            </div>
          </div>

          {table && table.length > 0 && (
            <div className="rail-group">
              <label className="rail-label" htmlFor="team-filter">Team</label>
              <select
                id="team-filter"
                className="rail-select"
                value={teamId || ''}
                onChange={e => set('team', e.target.value || 0, 0)}
              >
                <option value="">All teams</option>
                {[...table].sort((a, b) => a.team.name.localeCompare(b.team.name)).map(s => (
                  <option key={s.team.id} value={s.team.id}>{s.team.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="matches-main">
          <h1>Matches</h1>

          {!matches ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              <NowStrip live={live} todays={todays} next={next} today={today} />

              <div className="matches-days" ref={mainRef}>
                {days.map(d => (
                  <section key={d.key} data-upcoming={d.key >= today ? 'true' : undefined}>
                    <h2 className="day-head">{dayLabel(d.key, today)}</h2>
                    <div className="m-list card">
                      {d.matches.map(m => <MatchRow key={m.id} m={m} />)}
                    </div>
                  </section>
                ))}
                {days.length === 0 && <p className="muted">No matches in this range.</p>}
              </div>
            </>
          )}
        </div>

        <MatchesSidebar table={table ?? null} leaders={leaders ?? null} arsenalNext={arsenalNext} />
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
    <div className="now-strip card">
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