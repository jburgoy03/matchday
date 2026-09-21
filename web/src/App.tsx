import { BrowserRouter, NavLink, Route, Routes } from 'react-router'
import MatchesPage from './pages/MatchesPage'
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
      </header>
      <main>
        <Routes>
          <Route path="/" element={<MatchesPage />} />
          <Route path="/table" element={<TablePage />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}