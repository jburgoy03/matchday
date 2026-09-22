import { api } from '../api'
import { useApi } from '../useApi'
import TeamPage from './TeamPage'

/** /arsenal: finds Arsenal in the table, then shows its team page (which switches to the Arsenal theme). */
export default function ArsenalPage() {
  const { data, error } = useApi(api.standings, [])

  if (error) return <p className="error">Couldn't load Arsenal: {error}</p>
  if (!data) return <p className="muted">Loading…</p>

  const arsenal = data.find(s => s.team.abbreviation === 'ARS')
  if (!arsenal) return <p className="muted">Arsenal aren't in the table yet.</p>

  return <TeamPage teamId={String(arsenal.team.id)} />
}