import { useEffect, useRef } from 'react'
import type { Team } from '../api'
import { Crest } from './Crest'
import { Check } from './Icons'
import { competitionName } from '../competitions'

/**
 * Phones: a bottom sheet for the matches page's competition and team, opened from the chip in the header.
 * A native modal <dialog>, so focus, Escape and the backdrop come for free. Picking anything closes it.
 */
export function CompetitionSheet({ open, onClose, options, value, onPick, teams, teamId, onTeam }: {
  open: boolean
  onClose: () => void
  options: string[]
  value: string
  onPick: (slug: string) => void
  teams: Team[]
  teamId: number
  onTeam: (id: number) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  }, [open])

  const sorted = [...teams].sort((a, b) => a.shortName.localeCompare(b.shortName))
  const pick = (slug: string) => { onPick(slug); onClose() }
  const team = (id: number) => { onTeam(id); onClose() }

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label="Competition and team"
      onClose={onClose}
      // A tap on the backdrop lands on the dialog itself; the content sits in .sheet-body.
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="sheet-body">
        <span className="sheet-handle" aria-hidden="true" />
        <h2 className="sheet-label">Competition</h2>
        <div className="sheet-group">
          {options.map(slug => (
            <button key={slug} type="button" className="sheet-opt" aria-pressed={slug === value} onClick={() => pick(slug)}>
              <span className={`sheet-dot dot-${slug.replace(/\./g, '-')}`} aria-hidden="true" />
              <span className="sheet-name">{competitionName(slug)}</span>
              {slug === value && <Check size={18} />}
            </button>
          ))}
        </div>

        {teams.length > 0 && (
          <>
            <h2 className="sheet-label">Team</h2>
            <div className="sheet-group sheet-teams">
              <button type="button" className="sheet-opt" aria-pressed={teamId === 0} onClick={() => team(0)}>
                <span className="tf-all" aria-hidden="true" />
                <span className="sheet-name">All teams</span>
                {teamId === 0 && <Check size={18} />}
              </button>
              {sorted.map(t => (
                <button key={t.id} type="button" className="sheet-opt" aria-pressed={t.id === teamId} onClick={() => team(t.id)}>
                  <Crest team={t} size={22} />
                  <span className="sheet-name">{t.shortName}</span>
                  {t.id === teamId && <Check size={18} />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}
