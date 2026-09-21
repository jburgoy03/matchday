import type { MatchListItem, MatchStatus } from './api'

const TZ = 'America/New_York'
const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ })
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
const keyFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ })

export const formatDay = (iso: string) => dayFmt.format(new Date(iso))
export const formatTime = (iso: string) => timeFmt.format(new Date(iso))
/** YYYY-MM-DD in Eastern time, for grouping matches by the day you'd watch them. */
export const dayKey = (iso: string) => keyFmt.format(new Date(iso))
export const isLive = (s: MatchStatus) => s === 'Live' || s === 'HalfTime'

export function statusLabel(m: MatchListItem): string {
  switch (m.status) {
    case 'FullTime': return 'FT'
    case 'HalfTime': return 'HT'
    case 'Live': return m.clock ?? 'Live'
    case 'Postponed': return 'PP'
    case 'Cancelled': return 'Canc'
    default: return formatTime(m.kickoffUtc)
  }
}