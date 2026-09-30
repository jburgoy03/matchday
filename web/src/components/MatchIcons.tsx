import { useId } from 'react'

/** Match-event marks for the pitch and the lineup list. Each carries its own label for screen readers. */

export function Ball({ ownGoal = false, size = 13 }: { ownGoal?: boolean; size?: number }) {
  const clip = useId()
  const patch = ownGoal ? 'var(--live)' : '#16181d'
  return (
    <svg className="mk-icon" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={ownGoal ? 'Own goal' : 'Goal'}>
      <defs>
        <clipPath id={clip}><circle cx="12" cy="12" r="11" /></clipPath>
      </defs>
      <circle cx="12" cy="12" r="11" fill="#fff" />
      <path
        clipPath={`url(#${clip})`}
        fill={patch}
        d="M12 4.4L8.6 1.9L9.9-2.1L14.1-2.1L15.4 1.9ZM19.2 9.7L20.5 5.6L24.8 5.6L26.1 9.7L22.7 12.1ZM16.5 18.1L20.7 18.1L22 22.2L18.6 24.7L15.2 22.2ZM7.5 18.1L8.8 22.2L5.4 24.7L2 22.2L3.3 18.1ZM4.8 9.7L1.3 12.1L-2.1 9.7L-.8 5.6L3.5 5.6Z"
      />
      <path fill={patch} d="M12 7.8L16 10.7L14.5 15.4L9.5 15.4L8 10.7Z" />
      <path stroke={patch} strokeWidth="1.3" fill="none" d="M12 7.8L12 4.4M16 10.7L19.2 9.7M14.5 15.4L16.5 18.1M9.5 15.4L7.5 18.1M8 10.7L4.8 9.7" />
      <circle cx="12" cy="12" r="11" fill="none" stroke={patch} strokeWidth="1.4" />
    </svg>
  )
}

export function AssistMark() {
  return <span className="mk-assist" role="img" aria-label="Assist">A</span>
}

export function CardMark({ red = false }: { red?: boolean }) {
  return <span className={`mk-card ${red ? 'red' : 'yellow'}`} role="img" aria-label={red ? 'Red card' : 'Yellow card'} />
}

export function SubOff({ size = 13 }: { size?: number }) {
  return (
    <svg className="mk-icon mk-off" width={size} height={size} viewBox="0 0 12 12" role="img" aria-label="Subbed off">
      <path d="M6 1.8v8.4M2.6 6.8L6 10.2l3.4-3.4" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SubOn({ size = 13 }: { size?: number }) {
  return (
    <svg className="mk-icon mk-on" width={size} height={size} viewBox="0 0 12 12" role="img" aria-label="Came on">
      <path d="M6 10.2V1.8M2.6 5.2L6 1.8l3.4 3.4" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
