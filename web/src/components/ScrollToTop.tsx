import { useLayoutEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router'

/**
 * Start each new page at the top. A single-page app keeps the window's scroll position across
 * navigation, so a page opened from halfway down a long list arrived part-scrolled, its top hidden
 * under the sticky header. Keyed on the path only, so tabs and filters in the query string don't
 * jump; Back (POP) is left alone so the browser can return to where you were.
 */
export function ScrollToTop() {
  const { pathname } = useLocation()
  const type = useNavigationType()
  useLayoutEffect(() => {
    if (type !== 'POP') window.scrollTo(0, 0)
  }, [pathname, type])
  return null
}
