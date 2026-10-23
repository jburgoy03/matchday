import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router'
import MatchesPage from './pages/MatchesPage'
import MatchPage from './pages/MatchPage'
import TablePage from './pages/TablePage'
import TeamPage from './pages/TeamPage'
import ArsenalPage from './pages/ArsenalPage'
import LeadersPage from './pages/LeadersPage'
import { ExternalLink } from './components/Icons'
import { ThemeToggle } from './components/ThemeToggle'
import { PlayerProfileProvider } from './components/PlayerProfile'
import { BottomTabs } from './components/BottomTabs'
import { ScrollToTop } from './components/ScrollToTop'

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <PlayerProfileProvider>
      <header className="site-header">
        <Link to="/" className="brand">Matchday</Link>
        {/* Desktop navigation; phones use the bottom tab bar instead. */}
        <nav>
          <NavLink to="/" end>
            Matches
          </NavLink>
          <NavLink to="/table">Table</NavLink>
          <NavLink to="/arsenal" className="club-nav">
            <span className="club-dot" aria-hidden="true" />
            Arsenal
          </NavLink>
        </nav>
        <a className="home-link" href="https://deanburgoyne.dev">
          <span>deanburgoyne.dev</span>
          <ExternalLink size={14} />
        </a>
        {/* Phones: a page can put its own controls here (the matches page's competition chip). */}
        <div id="header-slot" className="header-slot" />
        <ThemeToggle />
      </header>
      <main>
        <Routes>
          <Route path="/" element={<MatchesPage />} />
          <Route path="/table" element={<TablePage />} />
          <Route path="/leaders" element={<LeadersPage />} />
          <Route path="/match/:id" element={<MatchPage />} />
          <Route path="/team/:id" element={<TeamPage />} />
          <Route path="/arsenal" element={<ArsenalPage />} />
        </Routes>
      </main>
      <BottomTabs />
      </PlayerProfileProvider>
    </BrowserRouter>
  )
}
