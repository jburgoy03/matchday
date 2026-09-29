import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Team } from '../api'
import { Crest } from './Crest'
import { ChevronDown, Check } from './Icons'

interface Option {
  id: number
  label: string
  team?: Team
}

/**
 * Team picker: a listbox rather than a native <select>, so options can carry crests.
 * Keyboard: arrows move, Home/End jump, typing jumps to a name, Enter picks, Escape closes.
 */
export function TeamFilter({ teams, value, onChange }: {
  teams: Team[]
  value: number
  onChange: (teamId: number) => void
}) {
  const options: Option[] = [
    { id: 0, label: 'All teams' },
    ...[...teams].sort((a, b) => a.name.localeCompare(b.name)).map(t => ({ id: t.id, label: t.name, team: t })),
  ]
  const selected = options.find(o => o.id === value) ?? options[0]

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])
  const typed = useRef({ text: '', at: 0 })

  // Open on the current pick so the list starts where the eye expects.
  useLayoutEffect(() => {
    if (!open) return
    const i = Math.max(0, options.findIndex(o => o.id === value))
    setActive(i)
    items.current[i]?.focus()
    items.current[i]?.scrollIntoView({ block: 'nearest' })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const move = (to: number) => {
    const i = (to + options.length) % options.length
    setActive(i)
    items.current[i]?.focus()
    items.current[i]?.scrollIntoView({ block: 'nearest' })
  }

  const pick = (id: number) => {
    onChange(id)
    setOpen(false)
    trigger.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(active + 1); break
      case 'ArrowUp': e.preventDefault(); move(active - 1); break
      case 'Home': e.preventDefault(); move(0); break
      case 'End': e.preventDefault(); move(options.length - 1); break
      case 'Escape': e.preventDefault(); setOpen(false); trigger.current?.focus(); break
      case 'Tab': setOpen(false); break
      default:
        if (e.key.length !== 1 || e.metaKey || e.ctrlKey) return
        // Type-ahead: letters typed within a second form one prefix.
        const now = Date.now()
        typed.current = { text: now - typed.current.at < 1000 ? typed.current.text + e.key : e.key, at: now }
        const hit = options.findIndex(o => o.label.toLowerCase().startsWith(typed.current.text.toLowerCase()))
        if (hit >= 0) move(hit)
    }
  }

  return (
    <div className="team-filter" ref={wrap}>
      <button
        type="button"
        ref={trigger}
        className="tf-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        {selected.team && <Crest team={selected.team} size={20} />}
        <span className="tf-label">{selected.label}</span>
        <ChevronDown size={16} />
      </button>

      {open && (
        <div className="tf-menu card" role="listbox" aria-label="Filter by team" onKeyDown={onKeyDown}>
          {options.map((o, i) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === value}
              tabIndex={i === active ? 0 : -1}
              ref={el => { items.current[i] = el }}
              className={`tf-option ${o.id === value ? 'chosen' : ''}`}
              onClick={() => pick(o.id)}
            >
              {o.team ? <Crest team={o.team} size={20} /> : <span className="tf-all" aria-hidden="true" />}
              <span className="tf-name">{o.label}</span>
              {o.id === value && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}