import type { Incident } from './api'

export interface GoalMark {
  clock: string
  kind: 'goal' | 'pen' | 'og'
}

/** Everything one player did in a match, keyed by playerId so shared surnames can't collide. */
export interface PlayerEvents {
  goals: GoalMark[]
  assists: string[]
  yellows: string[]
  reds: string[]
  /** Clock when he was substituted off. */
  off: string | null
  /** Clock when he came on. */
  on: string | null
  /** For a sub who came on: the player he replaced. */
  replaced: string | null
}

const empty = (): PlayerEvents => ({ goals: [], assists: [], yellows: [], reds: [], off: null, on: null, replaced: null })

export function playerEvents(incidents: Incident[]): Map<number, PlayerEvents> {
  const map = new Map<number, PlayerEvents>()
  const get = (id: number) => {
    let e = map.get(id)
    if (!e) map.set(id, (e = empty()))
    return e
  }

  for (const i of incidents) {
    const p = i.playerId
    const s = i.secondaryPlayerId
    switch (i.type) {
      case 'Goal':
      case 'PenaltyGoal':
      case 'OwnGoal':
        if (p != null) get(p).goals.push({ clock: i.clock, kind: i.type === 'OwnGoal' ? 'og' : i.type === 'PenaltyGoal' ? 'pen' : 'goal' })
        // Same rule as the timeline: only an open-play goal credits the second participant as the assist.
        if (i.type === 'Goal' && s != null) get(s).assists.push(i.clock)
        break
      case 'YellowCard':
        if (p != null) get(p).yellows.push(i.clock)
        break
      case 'RedCard':
        if (p != null) get(p).reds.push(i.clock)
        break
      case 'Substitution':
        if (p != null) {
          const e = get(p)
          e.on = i.clock
          e.replaced = i.secondaryPlayer
        }
        if (s != null) get(s).off = i.clock
        break
    }
  }
  return map
}

/**
 * "71'" → 71, "45'+2'" → 45.02: stoppage time sorts after the 45th minute but before the 46th.
 * Unknown clocks sort last.
 */
export const clockMinutes = (clock: string | null) => {
  const [base, extra] = (clock ?? '').split('+').map(x => parseInt(x, 10))
  if (Number.isNaN(base)) return 999
  return base + (extra === undefined || Number.isNaN(extra) ? 0 : extra / 100)
}

/** "45'+4'" → 49: where an event actually falls in the match, for plotting on a time axis. */
export const clockPosition = (clock: string | null) => {
  const [base, extra] = (clock ?? '').split('+').map(x => parseInt(x, 10))
  if (Number.isNaN(base)) return null
  return base + (extra === undefined || Number.isNaN(extra) ? 0 : extra)
}
