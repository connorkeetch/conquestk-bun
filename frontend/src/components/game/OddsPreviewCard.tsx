import type React from 'react'

export type OddsSummary = { favored: number; even: number; risky: number }

export interface OddsPreviewCardProps {
  attacker: number
  defender: number
  summary?: OddsSummary
  anchor?: { left: number; top: number } // pixel coordinates inside stage
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function estimate(att: number, def: number): OddsSummary {
  const d = att - def
  const favored = clamp(50 + d * 4, 10, 90)
  const even = clamp(30 - Math.abs(d) * 2, 5, 60)
  const risky = clamp(100 - favored - even, 5, 85)
  const total = favored + even + risky
  return {
    favored: Math.round((favored / total) * 100),
    even: Math.round((even / total) * 100),
    risky: Math.max(
      0,
      100 - Math.round((favored / total) * 100) - Math.round((even / total) * 100),
    ),
  }
}

export const OddsPreviewCard: React.FC<OddsPreviewCardProps> = ({
  attacker,
  defender,
  summary,
  anchor,
}) => {
  const s = summary ?? estimate(attacker, defender)
  return (
    <div
      className="absolute z-30 select-none"
      style={{
        left: anchor?.left ?? 0,
        top: (anchor?.top ?? 0) - 36,
        transform: 'translate(-50%, -100%)',
      }}
      role="dialog"
      aria-label="Attack odds preview"
    >
      <div className="rounded bg-[color:var(--surface-1)]/90 border border-[color:var(--panel-border)] shadow px-2 py-1 text-xs text-[color:var(--text)] min-w-[140px]">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold">{attacker}</span>
          <span className="opacity-60">vs</span>
          <span className="font-semibold">{defender}</span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          <div className="flex flex-col items-start">
            <span className="opacity-70">Win</span>
            <span className="font-semibold">{s.favored}%</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="opacity-70">Even</span>
            <span className="font-semibold">{s.even}%</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="opacity-70">Risk</span>
            <span className="font-semibold">{s.risky}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OddsPreviewCard
