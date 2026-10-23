import { NavLink } from 'react-router'
import { BarChart, Calendar, Rows, Shield } from './Icons'

/** Phones only (hidden by CSS above 640px): the main navigation, in thumb reach and never covering the page. */
export function BottomTabs() {
  return (
    <nav className="tabbar" aria-label="Main">
      <NavLink to="/" end><Calendar size={22} /><span>Matches</span></NavLink>
      <NavLink to="/table"><Rows size={22} /><span>Table</span></NavLink>
      <NavLink to="/leaders"><BarChart size={22} /><span>Leaders</span></NavLink>
      <NavLink to="/arsenal" className="tab-club"><Shield size={22} /><span>Arsenal</span></NavLink>
    </nav>
  )
}
