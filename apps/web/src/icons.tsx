// Generic device icons. One stroke weight, drawn on a 24 grid, currentColor only. No brand marks.
import type { DeviceCategory } from '@dr4w-home/device-sdk'
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

const Svg = ({ size = 24, children, ...rest }: P) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...rest}
  >
    {children}
  </svg>
)

export const TvIcon = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="4.5" width="19" height="12" rx="1.5" />
    <path d="M8 20h8M12 16.5V20" />
  </Svg>
)

export const ConsoleIcon = (p: P) => (
  <Svg {...p}>
    <rect x="7" y="4.5" width="10" height="15" rx="1.5" />
    <path d="M7 7.5H5.5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2H7M17 7.5h1.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H17" />
    <circle cx="5.5" cy="10" r="0.6" fill="currentColor" />
    <circle cx="18.5" cy="14" r="0.6" fill="currentColor" />
  </Svg>
)

export const LampIcon = (p: P) => (
  <Svg {...p}>
    <path d="M8 3.5h8l2.5 7h-13z" />
    <path d="M12 10.5V20M8.5 20.5h7" />
  </Svg>
)

export const ControllerIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 8h10a4 4 0 0 1 3.9 4.8l-.8 3.9a2 2 0 0 1-3.4 1L14.5 15.5h-5l-2.2 2.2a2 2 0 0 1-3.4-1l-.8-3.9A4 4 0 0 1 7 8z" />
    <path d="M8 11v3M6.5 12.5h3" />
    <circle cx="15.5" cy="11.5" r="0.7" fill="currentColor" />
    <circle cx="17" cy="13.5" r="0.7" fill="currentColor" />
  </Svg>
)

export const HubIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="9" width="17" height="8" rx="1.5" />
    <path d="M7 13h.01M10 13h.01M8 9V6.5a4 4 0 0 1 8 0V9" />
  </Svg>
)

export const PowerIcon = (p: P) => (
  <Svg {...p} strokeWidth={2.2}>
    <path d="M12 3v8.5" />
    <path d="M6.6 6.6a7.5 7.5 0 1 0 10.8 0" />
  </Svg>
)

export const MicIcon = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Svg>
)

export const deviceIcon: Record<DeviceCategory, (p: P) => React.JSX.Element> = {
  tv: TvIcon,
  console: ConsoleIcon,
  light: LampIcon,
  speaker: HubIcon,
  fan: HubIcon,
  other: HubIcon,
}
