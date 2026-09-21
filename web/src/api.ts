export interface Team {
  id: number
  name: string
  shortName: string
  abbreviation: string
  logoUrl: string | null
}

export type MatchStatus = 'Scheduled' | 'Live' | 'HalfTime' | 'FullTime' | 'Postponed' | 'Cancelled' | 'Unknown'

export interface MatchListItem {
  id: number
  kickoffUtc: string
  status: MatchStatus
  clock: string | null
  home: Team
  away: Team
  homeScore: number | null
  awayScore: number | null
  venue: string | null
}

export interface LineupPlayer {
  playerId: number
  name: string
  jersey: string | null
  position: string | null
  starter: boolean
  formationPlace: number | null
}

export interface TeamLineup {
  teamId: number
  formation: string | null
  starters: LineupPlayer[]
  bench: LineupPlayer[]
}

export type IncidentType = 'Goal' | 'PenaltyGoal' | 'OwnGoal' | 'YellowCard' | 'RedCard' | 'Substitution' | 'Other'

export interface Incident {
  type: IncidentType
  minute: number | null
  clock: string
  teamId: number | null
  player: string | null
  secondaryPlayer: string | null
}

export interface MatchDetail {
  match: MatchListItem
  homeLineup: TeamLineup | null
  awayLineup: TeamLineup | null
  incidents: Incident[]
  detailSyncedAt: string | null
}

export interface Standing {
  position: number
  team: Team
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

export const api = {
  matches: (signal?: AbortSignal) => get<MatchListItem[]>('/matches', signal),
  match: (id: string, signal?: AbortSignal) => get<MatchDetail>(`/matches/${id}`, signal),
  standings: (signal?: AbortSignal) => get<Standing[]>('/standings', signal),
}