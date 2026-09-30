import { BrowserRouter, NavLink, Route, Routes } from 'react-router'
import MatchesPage from './pages/MatchesPage'
import MatchPage from './pages/MatchPage'
import TablePage from './pages/TablePage'
import TeamPage from './pages/TeamPage'
import ArsenalPage from './pages/ArsenalPage'
import { ExternalLink } from './components/Icons'
import { ThemeToggle } from './components/ThemeToggle'
import { PlayerProfileProvider } from './components/PlayerProfile'

export default function App() {
  return (
    <BrowserRouter>
      <PlayerProfileProvider>
      <header className="site-header">
        <span className="brand">Matchday</span>
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
        <ThemeToggle />
      </header>
      <main>
        <Routes>
          <Route path="/" element={<MatchesPage />} />
          <Route path="/table" element={<TablePage />} />
          <Route path="/match/:id" element={<MatchPage />} />
          <Route path="/team/:id" element={<TeamPage />} />
          <Route path="/arsenal" element={<ArsenalPage />} />
        </Routes>
      </main>
      </PlayerProfileProvider>
    </BrowserRouter>
  )
}