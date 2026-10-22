import { useSyncExternalStore } from 'react'

/** True while a CSS media query matches; re-renders when it flips (rotation, window resize). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    onChange => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
