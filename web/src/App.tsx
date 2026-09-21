import { BrowserRouter, NavLink, Route, Routes } from 'react-router'
import MatchesPage from './pages/MatchesPage'
import MatchPage from './pages/MatchPage'
import TablePage from './pages/TablePage'

export default function App() {
  return (
    <BrowserRouter>
      <header className="site-header">
        <span className="brand">Matchday</span>
        <nav>
          <NavLink to="/" end>
            Matches
          </NavLink>
          <NavLink to="/table">Table</NavLink>
        </nav>
                <a className="home-link" href="https://deanburgoyne.dev">
          deanburgoyne.dev <span aria-hidden="true">↗</span>
        </a>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<MatchesPage />} />
          <Route path="/table" element={<TablePage />} />
          <Route path="/match/:id" element={<MatchPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}