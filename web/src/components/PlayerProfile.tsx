import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, type CareerClub, type PlayerSeason } from '../api'
import { useApi } from '../useApi'
import { inkOn } from '../teamColours'

/**
 * Player profile popup. Any player name on the site can open it through <PlayerName>; one dialog
 * lives at the app root. This season comes from our own data (instant); the career comes from ESPN
 * on first open and is cached server-side, so it loads separately and fills in a moment later.
 */

const Ctx = createContext<(playerId: number) => void>(() => {})

export function PlayerProfileProvider({ children }: { children: ReactNode }) {
  const [playerId, setPlayerId] = useState<number | null>(null)
  return (
    <Ctx.Provider value={setPlayerId}>
      {children}
      {playerId !== null && <PlayerDialog playerId={playerId} onClose={() => setPlayerId(null)} />}
    </Ctx.Provider>
  )
}

/** A player's name as a button that opens their profile. Looks like the text it replaces. */
export function PlayerName({ id, children, className = '' }: { id: number; children: ReactNode; className?: string }) {
  const open = useContext(Ctx)
  return (
    <button type="button" className={`player-link ${className}`} onClick={() => open(id)}>
      {children}
    </button>
  )
}

/** For wrappers that are already a button (a pitch shirt): the open function itself. */
export const useOpenPlayer = () => useContext(Ctx)

const POSITION: Record<string, string> = { G: 'Goalkeeper', D: 'Defender', M: 'Midfielder', F: 'Forward' }

/** Start year of the current season (1 August onwards), matching Season.cs on the server. */
function currentSeasonYear(): number {
  const now = new Date()
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
}

function PlayerDialog({ playerId, onClose }: { playerId: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { data: p, error } = useApi(signal => api.player(playerId, signal), [playerId])
  const { data: career, error: careerError } = useApi(signal => api.playerCareer(playerId, signal), [playerId])

  // Native <dialog>: showModal gives the backdrop, focus trapping and Escape for free.
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  const colour = p?.team?.color ?? null
  const sub = p ? [p.team?.name, POSITION[p.position ?? '']].filter(Boolean).join(' · ') : ''
  const meta = p ? [p.age, p.nationality].filter(v => v != null && v !== '').join(' · ') : ''
  return (
    <dialog
      ref={ref}
      className="pp"
      aria-label={p?.name ?? 'Player'}
      onClose={onClose}
      onClick={e => { if (e.target === e.currentTarget) ref.current?.close() }} // click on the backdrop
    >
      <div className="pp-band" style={{ background: colour ?? 'var(--accent)' }} />
      <div className="pp-body">
        <span className="pp-handle" aria-hidden="true" />
        <div className="pp-head">
          {p?.jersey && (
            <span
              className="pp-num"
              style={colour ? { background: colour, color: inkOn(colour), boxShadow: `0 0 0 3px var(--surface), 0 0 0 5px ${colour}` } : undefined}
            >
              {p.jersey}
            </span>
          )}
          <div className="pp-title">
            <h2>{p?.name ?? (error ? 'Player' : 'Loading…')}</h2>
            {sub && <span className="pp-sub">{sub}</span>}
            {(meta || p?.flagUrl) && (
              <span className="pp-meta">
                {p?.flagUrl && <img src={p.flagUrl} alt="" width={18} height={12} />}
                {meta}
              </span>
            )}
          </div>
          <button type="button" className="pp-close" aria-label="Close" onClick={() => ref.current?.close()}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && <p className="muted">Couldn't load this player: {error}</p>}
        {/* Only for Premier League players; the API sends no season for anyone else. */}
        {p?.season && <ThisSeason s={p.season} />}

        <section className="pp-section">
          <h3>Career</h3>
          {careerError ? (
            <p className="muted pp-note">Career history isn't available right now.</p>
          ) : !career ? (
            <p className="muted pp-note">Loading career…</p>
          ) : career.clubs.length === 0 ? (
            <p className="muted pp-note">No career history from ESPN for this player.</p>
          ) : (
            <Career clubs={career.clubs} currentYear={currentSeasonYear()} />
          )}
        </section>
      </div>
    </dialog>
  )
}

function ThisSeason({ s }: { s: PlayerSeason }) {
  const tiles: [string, number][] = [
    ['Apps', s.apps],
    ['Starts', s.starts],
    ['Goals', s.goals],
    ['Assists', s.assists],
    ['Yellow cards', s.yellowCards],
    s.cleanSheets != null ? ['Clean sheets', s.cleanSheets] : ['Red cards', s.redCards],
  ]
  return (
    <section className="pp-section">
      <h3>{s.label} Premier League</h3>
      <div className="pp-tiles">
        {tiles.map(([label, value]) => (
          <div key={label} className="pp-tile">
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** "2019–22", or "2022–" for the club he's at now. From the seasons ESPN has; there are no transfer dates. */
function span(c: CareerClub): string | null {
  if (c.seasons.length === 0) return null
  const years = c.seasons.map(s => s.year)
  const first = Math.min(...years)
  const last = Math.max(...years)
  return c.current ? `${first}–` : `${first}–${String(last + 1).slice(2)}`
}

const swatch = (c: CareerClub) => (c.color ? `#${c.color}` : 'var(--muted)')

function Career({ clubs, currentYear }: { clubs: CareerClub[]; currentYear: number }) {
  const rows = clubs
    .flatMap(c => c.seasons.map(s => ({ ...s, club: c })))
    .sort((a, b) => b.year - a.year)
  const total = rows.reduce((t, r) => ({ starts: t.starts + r.starts, goals: t.goals + r.goals, assists: t.assists + r.assists }), { starts: 0, goals: 0, assists: 0 })

  return (
    <>
      <ol className="pp-clubs">
        {clubs.map(c => {
          const years = span(c)
          return (
            <li key={c.providerId} className={years ? '' : 'none'}>
              <span className="pp-club-name"><span className="pp-swatch" style={{ background: swatch(c) }} />{c.name}</span>
              <span className="pp-club-years">{years ?? 'No stats from ESPN'}</span>
            </li>
          )
        })}
      </ol>

      {rows.length > 0 && (
        <>
          <h3 className="pp-table-h">League seasons</h3>
          <table className="pp-table">
            <thead>
              <tr>
                <th scope="col">Season</th>
                <th scope="col">Club</th>
                <th scope="col" className="hide-sm">League</th>
                <th scope="col" className="num">Starts</th>
                <th scope="col" className="num"><abbr title="Goals">G</abbr></th>
                <th scope="col" className="num"><abbr title="Assists">A</abbr></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.club.providerId}-${r.year}`} className={r.year === currentYear && r.club.current ? 'now' : ''}>
                  <td>{r.label}</td>
                  <td><span className="pp-club-name"><span className="pp-swatch" style={{ background: swatch(r.club) }} />{r.club.name}</span></td>
                  <td className="hide-sm muted">{r.league}</td>
                  <td className="num">{r.starts}</td>
                  <td className="num strong">{r.goals}</td>
                  <td className="num">{r.assists}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={2}>League total</th>
                <td className="hide-sm" />
                <td className="num">{total.starts}</td>
                <td className="num">{total.goals}</td>
                <td className="num">{total.assists}</td>
              </tr>
            </tfoot>
          </table>
          <p className="muted pp-note">Past seasons count league starts only. Cups and internationals are left out.</p>
        </>
      )}
    </>
  )
}
