import { useSearchParams } from 'react-router'
import { api } from '../api'
import { useApi } from '../useApi'
import { COMPETITION_ORDER, CompetitionPicker, PREMIER_LEAGUE } from '../competitions'
import { Leaders } from '../components/MatchesSidebar'

/** The Community Shield is one match, so it has no leaderboard worth a pill. */
const OPTIONS = COMPETITION_ORDER.filter(c => c !== 'eng.charity')

/**
 * Season leaders on a page of their own: the Leaders tab on phones, where the matches page has no sidebar.
 * Desktop keeps them in the matches sidebar and doesn't link here, but the route works at any width.
 */
export default function LeadersPage() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('comp') ?? PREMIER_LEAGUE
  const comp = OPTIONS.includes(requested) ? requested : PREMIER_LEAGUE
  const { data, error } = useApi(async signal => ({ comp, boards: await api.leaderboards(10, signal, comp) }), [comp])
  const boards = data?.comp === comp ? data.boards : null

  const choose = (slug: string) => {
    const next = new URLSearchParams(params)
    if (slug === PREMIER_LEAGUE) next.delete('comp')
    else next.set('comp', slug)
    setParams(next, { replace: true })
  }

  return (
    <section className="leaders-page">
      <h1>Season leaders</h1>
      <CompetitionPicker options={OPTIONS} value={comp} onChange={choose} label="Competition" />
      {error ? (
        <p className="error">Couldn't load leaders: {error}</p>
      ) : !boards ? (
        <p className="muted">Loading…</p>
      ) : (
        <Leaders key={comp} boards={boards} competition={comp} heading={false} empty="Nobody yet in this competition." />
      )}
    </section>
  )
}
