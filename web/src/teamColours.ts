import type { CSSProperties } from 'react'
import type { Team } from './api'

/**
 * Club colours for a match page. ESPN gives each club a primary and an alternate colour, but
 * raw they don't always work: Leeds and Fulham are white, City's sky blue vanishes on a light
 * background, and Liverpool v Man United is red v red. So for each theme this picks, in order:
 *   1. the primary, then the alternate, if it already stands out from the page (3:1, the WCAG
 *      minimum for UI marks) — or, for a real colour that's too faint, that colour darkened
 *      (light theme) or lightened (dark theme) until it does;
 *   2. white/black/grey adjusted the same way, only when nothing else works;
 *   3. for the away side, never one too close to the home side's pick — it falls back to the
 *      other colour, and then to neutral grey.
 */

type Theme = 'l' | 'd'
type RGB = [number, number, number]

// Must match --surface in index.css for each theme.
const SURFACE: Record<Theme, RGB> = { l: [255, 255, 255], d: [23, 26, 33] }
const NEUTRAL: Record<Theme, string> = { l: '#6b7280', d: '#9aa3b2' }
const INK_DARK = '#16181d'
const MIN_CONTRAST = 3

const toRgb = (hex: string): RGB | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = ([r, g, b]: RGB) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')

function luminance([r, g, b]: RGB) {
  const ch = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}
function contrast(a: RGB, b: RGB) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
/** White, black and greys: fine as a last resort, but not what makes a club recognisable. */
const isNeutral = ([r, g, b]: RGB) => Math.max(r, g, b) - Math.min(r, g, b) < 40

/** "Red-mean" colour distance — cheap and good enough to catch red v red or navy v black. */
function tooClose(a: RGB, b: RGB) {
  const rm = (a[0] + b[0]) / 2
  const [dr, dg, db] = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  const d = Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db)
  return d < 150
}

/** Step towards black (light theme) or white (dark theme) until it clears the contrast bar. */
function fit(c: RGB, theme: Theme): RGB {
  const target: RGB = theme === 'l' ? [0, 0, 0] : [255, 255, 255]
  for (let t = 0; t <= 1; t += 0.05) {
    const mixed = c.map((v, i) => v + (target[i] - v) * t) as RGB
    if (contrast(mixed, SURFACE[theme]) >= MIN_CONTRAST) return mixed
  }
  return target
}

function pick(team: Team, theme: Theme, avoid: RGB | null): RGB | null {
  const cands = [team.color, team.alternateColor].map(c => (c ? toRgb(c) : null)).filter((c): c is RGB => !!c)
  const ok = (c: RGB) => !avoid || !tooClose(c, avoid)
  const passes = (c: RGB) => contrast(c, SURFACE[theme]) >= MIN_CONTRAST
  // Primary first, then alternate. A real colour that's too faint is adjusted rather than skipped;
  // white/black/grey is only adjusted once nothing else works (so City stays sky blue, not black).
  for (const c of cands) {
    if (passes(c) && ok(c)) return c
    if (!isNeutral(c)) {
      const f = fit(c, theme)
      if (ok(f)) return f
    }
  }
  for (const c of cands.filter(isNeutral)) {
    const f = fit(c, theme)
    if (ok(f)) return f
  }
  return null
}

const inkFor = (c: RGB) => (contrast(c, [255, 255, 255]) >= contrast(c, toRgb(INK_DARK)!) ? '#ffffff' : INK_DARK)

/** Inline CSS variables for the match page; the `.team-coloured` rules in index.css pick the theme. */
export function matchColourVars(home: Team, away: Team): CSSProperties {
  const vars: Record<string, string> = {}
  for (const theme of ['l', 'd'] as const) {
    const h = pick(home, theme, null)
    const a = pick(away, theme, h)
    vars[`--home-${theme}`] = h ? toHex(h) : theme === 'l' ? INK_DARK : '#e8eaf0'
    vars[`--home-ink-${theme}`] = h ? inkFor(h) : theme === 'l' ? '#ffffff' : INK_DARK
    vars[`--away-${theme}`] = a ? toHex(a) : NEUTRAL[theme]
    vars[`--away-ink-${theme}`] = a ? inkFor(a) : inkFor(toRgb(NEUTRAL[theme])!)
  }
  return vars as CSSProperties
}
