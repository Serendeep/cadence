import type { SVGProps } from 'react'

const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
}

export const TimerIcon = () => <svg {...base}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></svg>
export const ListIcon = () => <svg {...base}><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>
export const ChartIcon = () => <svg {...base}><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></svg>
export const SettingsIcon = () => <svg {...base}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>
export const CopyIcon = () => <svg {...base}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>
export const TrashIcon = () => <svg {...base}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
export const CloseIcon = () => <svg {...base}><path d="M6 6l12 12M18 6L6 18" /></svg>
export const BackIcon = () => <svg {...base}><path d="M15 6l-6 6 6 6" /></svg>

/** The app mark: a 3x3 face in the cube's colours. */
export function Mark({ size = 26 }: { size?: number }) {
  const c = ['#f5f5f5', '#d8343a', '#2fa84f', '#f08a24', '#f5f5f5', '#2f6fd6', '#f4d23a', '#2fa84f', '#d8343a']
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-label="Cadence" role="img">
      {c.map((fill, i) => (
        <rect key={i} x={(i % 3) * 9} y={Math.floor(i / 3) * 9} width="8" height="8" rx="1.6" fill={fill} />
      ))}
    </svg>
  )
}
