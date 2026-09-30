/**
 * Light / dark theme. The visitor's choice is kept in localStorage; "system" (the default)
 * follows Windows / macOS / the phone. The effective theme lives on <html data-theme>, which
 * index.css reads. index.html applies the same logic inline before first paint — keep them in step.
 */

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'theme'
const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)')

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function saveThemePref(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    // Private mode or blocked storage: the choice still applies for this visit.
  }
}

export function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark().matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

/** While on "system", follow the OS if it switches (e.g. Windows' scheduled dark mode). */
export function watchSystemTheme(onChange: () => void): () => void {
  const mq = systemDark()
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
