import type { Team } from '../api'

/** A team's crest, or its abbreviation in a circle when ESPN has no logo. */
export function Crest({ team, size = 24 }: { team: Pick<Team, 'abbreviation' | 'logoUrl'>; size?: number }) {
  return team.logoUrl ? (
    <img className="crest" src={team.logoUrl} alt="" width={size} height={size} />
  ) : (
    <span className="crest crest-fallback" style={{ width: size, height: size, fontSize: Math.round(size * 0.33) }}>
      {team.abbreviation}
    </span>
  )
}