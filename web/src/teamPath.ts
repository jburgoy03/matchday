import type { Team } from './api'

/** Where a team links to. Arsenal has its own page (and header spot) at /arsenal. */
export const teamPath = (team: Pick<Team, 'id' | 'abbreviation'>) =>
  team.abbreviation === 'ARS' ? '/arsenal' : `/team/${team.id}`