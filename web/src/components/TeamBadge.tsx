import type { Team } from '../api'

export function TeamBadge({ team, short = false }: { team: Team; short?: boolean }) {
  return (
    <span className="team">
      {team.logoUrl && <img src={team.logoUrl} alt="" width={20} height={20} loading="lazy" />}
      <span>{short ? team.shortName : team.name}</span>
    </span>
  )
}