import type { MouseEvent } from 'react'
import { NavLink, useLocation } from 'react-router'
import { BarChart, Calendar, Rows, Shield } from './Icons'

/**
 * Phones only (hidden by CSS above 640px): the main navigation, in thumb reach and never covering the page.
 * The header isn't pinned on phones, so tapping the tab you're already on scrolls back to the top,
 * as in most apps. It also keeps the page's query string (a picked competition) instead of resetting it.
 */
export function BottomTabs() {
  const { pathname } = useLocation()
  const toTop = (path: string) => (e: MouseEvent) => {
    if (pathname !== path) return
    e.preventDefault()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <nav className="tabbar" aria-label="Main">
      <NavLink to="/" end onClick={toTop('/')}><Calendar size={22} /><span>Matches</span></NavLink>
      <NavLink to="/table" onClick={toTop('/table')}><Rows size={22} /><span>Table</span></NavLink>
      <NavLink to="/leaders" onClick={toTop('/leaders')}><BarChart size={22} /><span>Leaders</span></NavLink>
      <NavLink to="/arsenal" className="tab-club" onClick={toTop('/arsenal')}><Shield size={22} /><span>Arsenal</span></NavLink>
    </nav>
  )
}
