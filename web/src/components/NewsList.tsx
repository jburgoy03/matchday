import { useState } from 'react'
import type { News } from '../api'
import { ExternalLink } from './Icons'

/**
 * Headlines from the provider's feed. Every item leaves the site, so each one is a real <a> with
 * the external-link icon; we only ever have the headline and blurb, never the article itself.
 */

const ET = 'America/New_York'
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short', month: 'short', day: 'numeric' })

/** "2h ago" while it's fresh, then a date — a timestamp is what tells you if news is stale. */
export function newsAge(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 60) return mins <= 1 ? 'Just now' : `${mins}m ago`
  if (mins < 24 * 60) return `${Math.round(mins / 60)}h ago`
  if (mins < 48 * 60) return 'Yesterday'
  return dayFmt.format(new Date(iso))
}

function byline(n: News) {
  return [n.byline, newsAge(n.publishedUtc)].filter(Boolean).join(' · ')
}

/**
 * Photos are hot-linked from the publisher's CDN, so one can vanish. `onGone` lets the card
 * re-lay itself out instead of leaving a broken-image box.
 */
export function NewsImage({ src, className, onGone }: { src: string; className: string; onGone?: () => void }) {
  const [broken, setBroken] = useState(false)
  if (broken) return null
  return (
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      onError={() => { setBroken(true); onGone?.() }}
    />
  )
}

/** The newest story, the only one that gets a photo. */
export function NewsLead({ item }: { item: News }) {
  return (
    <a className="news-lead card" href={item.webUrl ?? '#'} target="_blank" rel="noopener noreferrer">
      {item.imageUrl && <NewsImage className="news-shot" src={item.imageUrl} />}
      <span className="news-lead-body">
        <span className="news-head">
          <strong>{item.headline}</strong>
          <ExternalLink size={13} />
        </span>
        {item.description && <span className="news-desc">{item.description}</span>}
        <span className="news-meta muted">{byline(item)}</span>
      </span>
    </a>
  )
}

export function NewsRow({ item }: { item: News }) {
  return (
    <a className="news-row" href={item.webUrl ?? '#'} target="_blank" rel="noopener noreferrer">
      <span className="news-head">
        <span>{item.headline}</span>
        <ExternalLink size={12} />
      </span>
      <span className="news-meta muted">{byline(item)}</span>
    </a>
  )
}

/**
 * Lead photo plus headline rows. `max` caps the whole block; `lead` turns the photo off for the
 * fuller list on the News tab, where every item is already a row.
 */
export function NewsList({ items, max = 5, lead = true }: { items: News[]; max?: number; lead?: boolean }) {
  if (items.length === 0) return <p className="muted">No news yet.</p>

  const withLead = lead && items[0].imageUrl !== null
  const head = withLead ? items[0] : null
  const rows = items.slice(withLead ? 1 : 0, max)

  return (
    <div className="news-block">
      {head && <NewsLead item={head} />}
      {rows.length > 0 && (
        <div className="news-rows card">
          {rows.map(n => <NewsRow key={n.id} item={n} />)}
        </div>
      )}
    </div>
  )
}