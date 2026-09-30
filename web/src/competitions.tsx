/** The competitions the site follows, keyed by ESPN's league slug. Mirrors Competitions.cs on the server. */

export const PREMIER_LEAGUE = 'eng.1'

const NAMES: Record<string, { name: string; short: string }> = {
  'eng.1': { name: 'Premier League', short: 'PL' },
  'uefa.champions': { name: 'Champions League', short: 'UCL' },
  'uefa.europa': { name: 'Europa League', short: 'UEL' },
  'uefa.europa.conf': { name: 'Conference League', short: 'UECL' },
  'eng.fa': { name: 'FA Cup', short: 'FA Cup' },
  'eng.league_cup': { name: 'League Cup', short: 'League Cup' },
  'eng.charity': { name: 'Community Shield', short: 'Shield' },
}

/** Display order everywhere: the league first, then Europe, then the domestic cups. */
export const COMPETITION_ORDER = Object.keys(NAMES)

/** Competitions with a league table (the Premier League and the UEFA league phases). */
export const WITH_TABLES = ['eng.1', 'uefa.champions', 'uefa.europa', 'uefa.europa.conf']

export const isLeague = (slug: string) => slug === PREMIER_LEAGUE
export const competitionName = (slug: string) => NAMES[slug]?.name ?? slug
export const competitionShort = (slug: string) => NAMES[slug]?.short ?? slug

/** Pill buttons to switch competition. Scrolls sideways on a phone rather than wrapping. */
export function CompetitionPicker({ options, value, onChange, label }: {
  options: string[]; value: string; onChange: (slug: string) => void; label: string
}) {
  return (
    <div className="comp-picker" role="group" aria-label={label}>
      {options.map(slug => (
        <button key={slug} type="button" aria-pressed={slug === value} onClick={() => onChange(slug)}>
          {competitionName(slug)}
        </button>
      ))}
    </div>
  )
}

/** A small label for anything that isn't a league match; league matches carry none. */
export function CompetitionChip({ slug }: { slug: string }) {
  if (isLeague(slug)) return null
  return <span className={`comp-chip comp-${slug.replace(/\./g, '-')}`} title={competitionName(slug)}>{competitionShort(slug)}</span>
}
