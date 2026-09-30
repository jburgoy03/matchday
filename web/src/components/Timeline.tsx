import type { Incident, MatchListItem } from '../api'
import { goalSides, isGoalType, type Side } from '../goals'
import { clockPosition } from '../playerEvents'
import { Ball, CardMark, SubOff, SubOn } from './MatchIcons'

/**
 * The Timeline tab: a match-flow strip (every goal pinned on a 0–90' line, home above, away below)
 * and a feed down a centre spine. Goals are tinted panels in the scorer's club colour with the
 * running score; cards and subs are compact lines; half-time and full-time are markers across the
 * spine. Club colours come from --home / --away on the match page. On phones the feed is one column
 * with the minute on the left.
 */

type Score = [number, number]

type Item =
  | { kind: 'event'; incident: Incident; side: Side; score?: Score; tag?: string; ownGoalFor?: string }
  | { kind: 'divider'; label: string; score: Score | null }

const isGoal = (i: Incident) => isGoalType(i.type)

/**
 * Index of the first second-half event. ESPN lists first-half stoppage time (45'+4')
 * before the half-time subs, which it labels plain 45', so a 45' after a 45'+ is second half.
 */
function halfTimeIndex(incidents: Incident[]): number {
  let sawStoppage = false
  for (let k = 0; k < incidents.length; k++) {
    const i = incidents[k]
    const min = i.minute ?? 0
    const stoppage = i.clock.includes('+')
    if (min > 45) return k
    if (min === 45 && stoppage) sawStoppage = true
    else if (min === 45 && sawStoppage) return k
  }
  return incidents.length
}

/** "Brace" on a player's second goal of the match, "Hat-trick" on the third, then "4 goals"… */
function milestone(n: number): string | undefined {
  if (n === 2) return 'Brace'
  if (n === 3) return 'Hat-trick'
  if (n > 3) return `${n} goals`
  return undefined
}

function buildItems(m: MatchListItem, incidents: Incident[]): Item[] {
  const goals = goalSides(m, incidents.filter(isGoal))
  const htAt = halfTimeIndex(incidents)
  const clockMinute = parseInt(m.clock ?? '', 10)
  const pastHalf =
    m.status === 'HalfTime' || m.status === 'FullTime' ||
    (m.status === 'Live' && (htAt < incidents.length || clockMinute > 45))

  const items: Item[] = []
  const score: Score = [0, 0]
  const tally = new Map<string, number>()
  incidents.forEach((i, k) => {
    if (k === htAt && pastHalf) items.push({ kind: 'divider', label: 'Half-time', score: [...score] })
    const goalSide = goals.get(i)
    if (goalSide) {
      score[goalSide === 'home' ? 0 : 1]++
      let tag: string | undefined
      let ownGoalFor: string | undefined
      if (i.type === 'OwnGoal') {
        // Shown on the side it counts for, naming the club the scorer plays for.
        ownGoalFor = (goalSide === 'home' ? m.away : m.home).shortName
      } else {
        const who = String(i.playerId ?? i.player ?? '')
        const n = (tally.get(who) ?? 0) + 1
        tally.set(who, n)
        tag = milestone(n) ?? (i.type === 'PenaltyGoal' ? 'Pen' : undefined)
      }
      items.push({ kind: 'event', incident: i, side: goalSide, score: [...score], tag, ownGoalFor })
    } else {
      items.push({ kind: 'event', incident: i, side: i.teamId === m.away.id ? 'away' : 'home' })
    }
  })
  if (htAt === incidents.length && pastHalf) items.push({ kind: 'divider', label: 'Half-time', score: [...score] })
  if (m.status === 'FullTime') {
    const final: Score | null = m.homeScore !== null && m.awayScore !== null ? [m.homeScore, m.awayScore] : null
    items.push({ kind: 'divider', label: 'Full-time', score: final })
  }
  return items
}

export function Timeline({ match: m, incidents }: { match: MatchListItem; incidents: Incident[] }) {
  const items = buildItems(m, incidents)
  if (items.length === 0) return <p className="muted">No events yet.</p>

  return (
    <div className="tlx">
      <MatchFlow items={items} />

      <section className="tlx-feed card" aria-label="Match events">
        <div className="tlx-teams">
          <span className="tlx-team home">{m.home.name}<span className="tlx-swatch home" /></span>
          <span className="tlx-ko">KO</span>
          <span className="tlx-team away"><span className="tlx-swatch away" />{m.away.name}</span>
        </div>
        <ol className="tlx-list">
          {items.map((it, idx) =>
            it.kind === 'divider' ? (
              <li key={idx} className="tlx-divider">
                <span className="tlx-divider-pill">
                  <span className="tlx-divider-label">{it.label}</span>
                  {it.score && <ScoreChip score={it.score} />}
                </span>
              </li>
            ) : (
              <EventRow key={idx} item={it} team={it.side === 'home' ? m.home.abbreviation : m.away.abbreviation} />
            ),
          )}
        </ol>
      </section>
    </div>
  )
}

function ScoreChip({ score, scorer }: { score: Score; scorer?: Side }) {
  return (
    <span className="tlx-score" aria-label={`${score[0]}–${score[1]}`}>
      <span className={scorer === 'home' ? 'home' : ''}>{score[0]}</span>
      <span className="dash">–</span>
      <span className={scorer === 'away' ? 'away' : ''}>{score[1]}</span>
    </span>
  )
}

function EventRow({ item, team }: { item: Extract<Item, { kind: 'event' }>; team: string }) {
  const i = item.incident
  const who = i.player ?? 'Unknown'
  const side = item.side

  if (item.score) {
    const assist = i.type === 'Goal' ? i.secondaryPlayer : null
    const meta = item.ownGoalFor ? `Own goal · ${item.ownGoalFor}` : assist ? `Assist · ${assist}` : null
    return (
      <li className={`tlx-row goal ${side}`}>
        <span className="tlx-min">
          {i.clock}
          <span className="tlx-min-score"><ScoreChip score={item.score} scorer={side} /></span>
        </span>
        <div className="tlx-body">
          <Ball ownGoal={i.type === 'OwnGoal'} size={18} />
          <div className="tlx-text">
            <span className="tlx-head">
              <strong>{who}</strong>
              {item.tag && <span className="tlx-tag">{item.tag}</span>}
            </span>
            {meta && <span className="tlx-meta"><span className="tlx-abbr">{team} · </span>{meta}</span>}
            {!meta && <span className="tlx-meta tlx-abbr-only">{team}</span>}
          </div>
          <span className="tlx-body-score"><ScoreChip score={item.score} scorer={side} /></span>
        </div>
      </li>
    )
  }

  if (i.type === 'Substitution') {
    return (
      <li className={`tlx-row sub ${side}`}>
        <span className="tlx-min">{i.clock}</span>
        <div className="tlx-body">
          <SubOn />
          <span className="tlx-on">{who}</span>
          {i.secondaryPlayer && <><SubOff /><span className="tlx-off">{i.secondaryPlayer}</span></>}
          <span className="tlx-abbr">{team}</span>
        </div>
      </li>
    )
  }

  const card = i.type === 'YellowCard' || i.type === 'RedCard'
  return (
    <li className={`tlx-row minor ${side}`}>
      <span className="tlx-min">{i.clock}</span>
      <div className="tlx-body">
        {card ? <CardMark red={i.type === 'RedCard'} /> : <span className="tlx-dot" aria-hidden="true" />}
        <span className="tlx-name">{who}</span>
        {card && <span className="tlx-kind">{i.type === 'RedCard' ? 'Red card' : 'Yellow card'}</span>}
        <span className="tlx-abbr">{team}</span>
      </div>
    </li>
  )
}

/** Goals pinned on a 0–90' line (home above, away below); cards and subs as small marks on it. */
function MatchFlow({ items }: { items: Item[] }) {
  const events = items.filter((it): it is Extract<Item, { kind: 'event' }> => it.kind === 'event')
  const end = Math.max(95, ...events.map(e => (clockPosition(e.incident.clock) ?? 0) + 2))
  const x = (clock: string) => `${(Math.min(clockPosition(clock) ?? 0, end) / end) * 100}%`
  const ticks: [number, string][] = [[0, "0'"], [15, "15'"], [30, "30'"], [45, 'HT'], [60, "60'"], [75, "75'"], [90, "90'"]]

  return (
    <section className="tlx-flow card" aria-label="Match flow">
      <div className="tlx-flow-head">
        <span className="tlx-flow-title">Match flow</span>
        <span className="tlx-flow-legend">
          <span><i className="home" />Home goals</span>
          <span><i className="away" />Away goals</span>
        </span>
      </div>
      <div className="tlx-flow-plot">
        <div className="tlx-axis" />
        <div className="tlx-ht" style={{ left: `${(45 / end) * 100}%` }} />
        {events.map((e, k) => {
          const i = e.incident
          const left = x(i.clock)
          if (e.score) {
            return (
              <span key={k} className={`tlx-pin ${e.side}`} style={{ left }} title={`${i.clock} ${i.player ?? ''}`}>
                <span className="tlx-stem" />
                <span className="tlx-head-dot"><Ball ownGoal={i.type === 'OwnGoal'} size={12} /></span>
              </span>
            )
          }
          if (i.type === 'YellowCard' || i.type === 'RedCard') {
            return <span key={k} className={`tlx-card-mark ${e.side} ${i.type === 'RedCard' ? 'red' : ''}`} style={{ left }} title={`${i.clock} ${i.player ?? ''}`} />
          }
          if (i.type === 'Substitution') return <span key={k} className="tlx-sub-mark" style={{ left }} />
          return null
        })}
        {ticks.map(([t, label]) => (
          <span key={t} className={`tlx-tick ${t === 45 ? 'ht' : ''}`} style={{ left: `${(t / end) * 100}%` }}>{label}</span>
        ))}
      </div>
    </section>
  )
}
