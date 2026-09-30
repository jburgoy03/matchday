export interface Team {
  id: number
  name: string
  shortName: string
  abbreviation: string
  logoUrl: string | null
  /** Club colours as "#rrggbb"; null until the sync has seen the club on a scoreboard. */
  color: string | null
  alternateColor: string | null
}

export type MatchStatus = 'Scheduled' | 'Live' | 'HalfTime' | 'FullTime' | 'Postponed' | 'Cancelled' | 'Unknown'

export type IncidentType = 'Goal' | 'PenaltyGoal' | 'OwnGoal' | 'YellowCard' | 'RedCard' | 'Substitution' | 'Other'

export interface Goal {
  type: IncidentType
  minute: number | null
  clock: string
  teamId: number | null
  player: string | null
}

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
  /** Goals only, in order. Cards and subs live on the match page. */
  goals: Goal[]
  /** ESPN league slug: eng.1, uefa.champions, eng.fa… See competitions.tsx. */
  competition: string
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


export interface Incident {
  type: IncidentType
  minute: number | null
  clock: string
  teamId: number | null
  /** Scorer or booked player; for a substitution, the player coming on. */
  player: string | null
  /** Assist on a goal; for a substitution, the player going off. */
  secondaryPlayer: string | null
  playerId: number | null
  secondaryPlayerId: number | null
}

/** ESPN stat name → value, e.g. { possessionPct: 55, totalShots: 16 } */
export type TeamStats = Record<string, number>

export interface MatchDetail {
  match: MatchListItem
  homeLineup: TeamLineup | null
  awayLineup: TeamLineup | null
  incidents: Incident[]
  detailSyncedAt: string | null
  homeStats: TeamStats | null
  awayStats: TeamStats | null
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

export interface SquadPlayer {
  playerId: number
  name: string
  jersey: string | null
  /** G, D, M or F */
  position: string | null
  age: number | null
  nationality: string | null
  flagUrl: string | null
  apps: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
}

export interface SeasonStats {
  /** How many of this team's matches the averages cover */
  matches: number
  team: TeamStats
  league: TeamStats
}

/** A headline and a link out to the publisher. Paywalled articles never reach the browser. */
export interface News {
  id: number
  headline: string
  description: string | null
  byline: string | null
  publishedUtc: string
  imageUrl: string | null
  imageCredit: string | null
  webUrl: string | null
  /** Every club the article is filed under */
  teamIds: number[]
}

export interface TeamPage {
  team: Team
  venue: string | null
  table: Standing[]
  /** This season's matches, oldest first */
  matches: MatchListItem[]
  squad: SquadPlayer[]
  stats: SeasonStats | null
  news: News[]
}

export interface Leader {
  playerId: number
  name: string
  team: Team | null
  goals: number
  assists: number
}

export interface CleanSheetLeader {
  playerId: number
  name: string
  team: Team | null
  cleanSheets: number
  /** League starts this season */
  starts: number
}

/** This season in the league, from our own match data. cleanSheets is only set for keepers. */
export interface PlayerSeason {
  /** "2026-27" */
  label: string
  apps: number
  starts: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  cleanSheets: number | null
}

export interface PlayerProfile {
  id: number
  name: string
  team: Team | null
  jersey: string | null
  /** G, D, M or F */
  position: string | null
  age: number | null
  nationality: string | null
  flagUrl: string | null
  season: PlayerSeason
}

/** League stats for one season at one club, from ESPN. year = the season's start year. */
export interface CareerSeason {
  year: number
  label: string
  league: string
  starts: number
  goals: number
  assists: number
}

export interface CareerClub {
  providerId: string
  name: string
  /** Six hex digits without '#', or null */
  color: string | null
  current: boolean
  /** Newest first; empty when ESPN has no numbers for that club */
  seasons: CareerSeason[]
}

/** Clubs oldest first; national sides are left out. */
export interface PlayerCareer {
  clubs: CareerClub[]
}

export interface Leaderboards {
  scorers: Leader[]
  assists: Leader[]
  cleanSheets: CleanSheetLeader[]
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

export const api = {
  matches: (range?: { from: string; to: string }, signal?: AbortSignal) =>
    get<MatchListItem[]>(range ? `/matches?from=${range.from}&to=${range.to}` : '/matches', signal),
  match: (id: string, signal?: AbortSignal) => get<MatchDetail>(`/matches/${id}`, signal),
  /** The Premier League table, or a UEFA league phase by slug (uefa.champions, uefa.europa, uefa.europa.conf). */
  standings: (signal?: AbortSignal, competition = 'eng.1') =>
    get<Standing[]>(competition === 'eng.1' ? '/standings' : `/standings?competition=${encodeURIComponent(competition)}`, signal),
  leaders: (top = 5, signal?: AbortSignal) => get<Leader[]>(`/leaders?top=${top}`, signal),
  leaderboards: (top = 5, signal?: AbortSignal) => get<Leaderboards>(`/leaderboards?top=${top}`, signal),
  player: (id: number, signal?: AbortSignal) => get<PlayerProfile>(`/players/${id}`, signal),
  playerCareer: (id: number, signal?: AbortSignal) => get<PlayerCareer>(`/players/${id}/career`, signal),
  team: (id: string, signal?: AbortSignal) => get<TeamPage>(`/teams/${id}`, signal),
  news: (top = 10, signal?: AbortSignal) => get<News[]>(`/news?top=${top}`, signal),
}