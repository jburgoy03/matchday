import type { LineupPlayer, TeamLineup } from './api'

/**
 * Where a starter stands on a half-pitch. x and y are percentages with the team attacking up
 * the page and its right on the right; `line` counts from the keeper (0) forwards, for list order.
 */
export interface Spot {
  x: number
  y: number
  line: number
  role: string
}

/**
 * ESPN's formationPlace is a slot id (the classic positional numbering), not line order — place 4
 * and 8 are the holding pair in a 4-2-3-1, 9 is the striker. Verified for 4-2-3-1 on 30 Sep 2026
 * against Man City v Sunderland. Add a formation here once its places have been checked;
 * anything else falls back to laying out by position code.
 */
const SLOTS: Record<string, Record<number, Spot>> = {
  '4-2-3-1': {
    1: { x: 50, y: 88, line: 0, role: 'Goalkeeper' },
    2: { x: 88, y: 67, line: 1, role: 'Right back' },
    5: { x: 63, y: 72, line: 1, role: 'Centre back' },
    6: { x: 37, y: 72, line: 1, role: 'Centre back' },
    3: { x: 12, y: 67, line: 1, role: 'Left back' },
    8: { x: 64, y: 51, line: 2, role: 'Defensive midfield' },
    4: { x: 36, y: 51, line: 2, role: 'Defensive midfield' },
    7: { x: 84, y: 30, line: 3, role: 'Right wing' },
    10: { x: 50, y: 32, line: 3, role: 'Attacking midfield' },
    11: { x: 16, y: 30, line: 3, role: 'Left wing' },
    9: { x: 50, y: 12, line: 4, role: 'Striker' },
  },
}

/** ESPN position code → depth band (0 keeper … 5 forwards) and a readable role. */
const CODES: Record<string, { depth: number; role: string }> = {
  G: { depth: 0, role: 'Goalkeeper' },
  SW: { depth: 1, role: 'Sweeper' },
  CB: { depth: 1, role: 'Centre back' },
  CD: { depth: 1, role: 'Centre back' },
  'CD-R': { depth: 1, role: 'Centre back' },
  'CD-L': { depth: 1, role: 'Centre back' },
  RB: { depth: 1, role: 'Right back' },
  LB: { depth: 1, role: 'Left back' },
  DM: { depth: 2, role: 'Defensive midfield' },
  'DM-R': { depth: 2, role: 'Defensive midfield' },
  'DM-L': { depth: 2, role: 'Defensive midfield' },
  RWB: { depth: 3, role: 'Right wing-back' },
  LWB: { depth: 3, role: 'Left wing-back' },
  M: { depth: 3, role: 'Midfield' },
  CM: { depth: 3, role: 'Central midfield' },
  'CM-R': { depth: 3, role: 'Central midfield' },
  'CM-L': { depth: 3, role: 'Central midfield' },
  RM: { depth: 3, role: 'Right midfield' },
  LM: { depth: 3, role: 'Left midfield' },
  AM: { depth: 4, role: 'Attacking midfield' },
  'AM-R': { depth: 4, role: 'Attacking midfield' },
  'AM-L': { depth: 4, role: 'Attacking midfield' },
  RW: { depth: 5, role: 'Right wing' },
  LW: { depth: 5, role: 'Left wing' },
  F: { depth: 5, role: 'Forward' },
  CF: { depth: 5, role: 'Striker' },
  'CF-R': { depth: 5, role: 'Striker' },
  'CF-L': { depth: 5, role: 'Striker' },
  ST: { depth: 5, role: 'Striker' },
}

/** -1 left, 0 centre, 1 right — from the team's own point of view. */
function sideOf(code: string): number {
  if (code.endsWith('-R') || (code.startsWith('R') && code !== 'R')) return 1
  if (code.endsWith('-L') || (code.startsWith('L') && code !== 'L')) return -1
  return 0
}

export const roleOf = (p: LineupPlayer) => CODES[p.position ?? '']?.role ?? p.position ?? ''

/**
 * Pitch positions for the eleven starters, or null when they can't be placed with confidence —
 * the caller then shows the list alone. Never a broken pitch.
 */
export function placeLineup(lineup: TeamLineup): Map<number, Spot> | null {
  const xi = lineup.starters
  if (xi.length !== 11) return null

  const table = lineup.formation ? SLOTS[lineup.formation] : undefined
  if (table) {
    const places = new Set(xi.map(p => p.formationPlace))
    if (places.size === 11 && xi.every(p => p.formationPlace != null && table[p.formationPlace])) {
      return new Map(xi.map(p => [p.playerId, table[p.formationPlace!]]))
    }
  }
  return byPositionCode(xi)
}

function byPositionCode(xi: LineupPlayer[]): Map<number, Spot> | null {
  if (xi.some(p => !CODES[p.position ?? ''])) return null
  if (xi.filter(p => p.position === 'G').length !== 1) return null

  const bands = new Map<number, LineupPlayer[]>()
  for (const p of xi) {
    const d = CODES[p.position!].depth
    bands.set(d, [...(bands.get(d) ?? []), p])
  }
  const depths = [...bands.keys()].sort((a, b) => a - b)
  const spots = new Map<number, Spot>()
  depths.forEach((d, line) => {
    const y = depths.length === 1 ? 50 : 88 - (line / (depths.length - 1)) * 76
    const row = bands.get(d)!.slice().sort((a, b) =>
      sideOf(a.position!) - sideOf(b.position!) || (b.formationPlace ?? 0) - (a.formationPlace ?? 0))
    row.forEach((p, i) => {
      spots.set(p.playerId, { x: ((i + 1) / (row.length + 1)) * 100, y, line, role: CODES[p.position!].role })
    })
  })
  return spots
}

/** Starters back to front, right to left within a line — the order you'd read the team out. */
export function readingOrder(xi: LineupPlayer[], spots: Map<number, Spot> | null): LineupPlayer[] {
  if (!spots) return xi
  return xi.slice().sort((a, b) => {
    const sa = spots.get(a.playerId)!
    const sb = spots.get(b.playerId)!
    return sa.line - sb.line || sb.x - sa.x
  })
}

/** "Enzo Le Fée" → "Le Fée", "Rúben Dias" → "Dias". */
export function surname(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name
  const particles = new Set(['le', 'la', 'de', 'da', 'di', 'do', 'dos', 'del', 'van', 'von', 'der', 'den', 'el', 'al', 'ter'])
  let start = parts.length - 1
  while (start > 1 && particles.has(parts[start - 1].toLowerCase())) start--
  return parts.slice(start).join(' ')
}
