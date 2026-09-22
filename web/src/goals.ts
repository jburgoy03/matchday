import type { MatchListItem } from './api'

export type Side = 'home' | 'away'

/** The shape both `Goal` (match list) and `Incident` (match page) share. */
export interface GoalLike {
  type: string
  teamId: number | null
  minute: number | null
}

export const isGoalType = (type: string) => type === 'Goal' || type === 'PenaltyGoal' || type === 'OwnGoal'

type Sides = Pick<MatchListItem, 'home' | 'away' | 'homeScore' | 'awayScore'>

/**
 * Which side each goal counts for. The feed's team id on an own goal is ambiguous, so if the
 * plain reading doesn't add up to the final score, own goals are flipped and that reading used.
 */
export function goalSides<T extends GoalLike>(m: Sides, goals: T[]): Map<T, Side> {
  const tally = (flipOwnGoals: boolean) => {
    const sides = new Map<T, Side>()
    for (const g of goals) {
      let side: Side = g.teamId === m.away.id ? 'away' : 'home'
      if (g.type === 'OwnGoal' && flipOwnGoals) side = side === 'home' ? 'away' : 'home'
      sides.set(g, side)
    }
    return sides
  }
  const adds = (sides: Map<T, Side>) => {
    const vals = [...sides.values()]
    return vals.filter(s => s === 'home').length === m.homeScore && vals.filter(s => s === 'away').length === m.awayScore
  }
  const plain = tally(false)
  if (adds(plain) || !goals.some(g => g.type === 'OwnGoal')) return plain
  const flipped = tally(true)
  return adds(flipped) ? flipped : plain
}

/** Score at half time, from goals up to 45' (first-half stoppage time is still minute 45). */
export function halfTimeScore(m: Sides, goals: GoalLike[]): [number, number] | null {
  const sides = goalSides(m, goals)
  const score: [number, number] = [0, 0]
  for (const g of goals) {
    if ((g.minute ?? 0) > 45) continue
    score[sides.get(g) === 'away' ? 1 : 0]++
  }
  return score
}