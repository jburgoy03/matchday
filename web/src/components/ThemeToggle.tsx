import { useEffect, useState } from 'react'
import { applyTheme, readThemePref, saveThemePref, watchSystemTheme, type ThemePref } from '../theme'
import { Monitor, Moon, Sun } from './Icons'

const NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const LABEL: Record<ThemePref, string> = { system: 'System', light: 'Light', dark: 'Dark' }

/** Header button that cycles System → Light → Dark. The icon shows the current setting. */
export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(readThemePref)

  useEffect(() => {
    applyTheme(pref)
    saveThemePref(pref)
    if (pref !== 'system') return
    return watchSystemTheme(() => applyTheme('system'))
  }, [pref])

  const Icon = pref === 'light' ? Sun : pref === 'dark' ? Moon : Monitor
  const label = `Theme: ${LABEL[pref]}. Switch to ${LABEL[NEXT[pref]]}.`
  return (
    <button type="button" className="theme-toggle" onClick={() => setPref(NEXT[pref])} aria-label={label} title={label}>
      <Icon size={18} />
    </button>
  )
}
