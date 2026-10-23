import type { ReactNode } from 'react'

/** Small stroke icons that inherit the text colour. Decorative: the link or button text carries the meaning. */

interface IconProps {
  size?: number
}

function Svg({ size = 16, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const ChevronLeft = (p: IconProps) => <Svg {...p}><path d="M15 18l-6-6 6-6" /></Svg>
export const ChevronRight = (p: IconProps) => <Svg {...p}><path d="M9 18l6-6-6-6" /></Svg>
export const ChevronDown = (p: IconProps) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>
export const ChevronUp = (p: IconProps) => <Svg {...p}><path d="M18 15l-6-6-6 6" /></Svg>
export const Check = (p: IconProps) => <Svg {...p}><path d="M20 6L9 17l-5-5" /></Svg>
export const Sun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
)
export const Moon = (p: IconProps) => <Svg {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Svg>
export const Monitor = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </Svg>
)
export const ExternalLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Svg>
)
// Bottom tab bar (phones)
export const Calendar = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></Svg>
)
export const Rows = (p: IconProps) => <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>
export const BarChart = (p: IconProps) => <Svg {...p}><path d="M6 20V10M12 20V4M18 20v-7" /></Svg>
export const Shield = (p: IconProps) => <Svg {...p}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /></Svg>
