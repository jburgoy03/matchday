import { useEffect, useState } from 'react'

interface ApiState<T> {
  data?: T
  error?: string
}

/** Loads data on mount and whenever deps change; cancels the request if the component goes away. */
export function useApi<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({})

  useEffect(() => {
    const ctrl = new AbortController()
    load(ctrl.signal)
      .then(data => setState({ data }))
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setState({ error: e instanceof Error ? e.message : String(e) })
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}