import type React from 'react'
import { memo, useMemo } from 'react'
import useReducedMotion from '@/hooks/useReducedMotion'

type Point = { id: string; x: number; y: number }

export interface InteractionOverlayProps {
  width: number
  height: number
  points: Point[]
  selectedId?: string | null
  targetId?: string | null
  hoverId?: string | null
  eligibleIds?: string[]
  phase?: 'idle' | 'deploy' | 'attack' | 'fortify' | 'trade'
  tokenSize?: number // diameter in px at scale 1
}

function dist(a: Point, b: Point) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

function arcPath(a: Point, b: Point) {
  const d = dist(a, b)
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  // perpendicular offset for gentle arc; scale with distance
  const nx = b.y - a.y
  const ny = -(b.x - a.x)
  const len = Math.hypot(nx, ny) || 1
  const ox = (nx / len) * Math.min(60, Math.max(12, d * 0.12))
  const oy = (ny / len) * Math.min(60, Math.max(12, d * 0.12))
  const cx = mid.x + ox
  const cy = mid.y + oy
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`
}

const Crosshair = ({ x, y, r }: { x: number; y: number; r: number }) => (
  <svg
    className="absolute left-0 top-0 pointer-events-none"
    width={r * 2}
    height={r * 2}
    style={{ transform: `translate(${x - r}px, ${y - r}px)` }}
    role="img"
    aria-label="Eligible target crosshair"
  >
    <title>Eligible target crosshair</title>
    <g stroke="currentColor" strokeWidth={1} opacity={0.9}>
      <line x1={r} y1={0} x2={r} y2={Math.max(2, r * 0.25)} />
      <line x1={r} y1={r * 2} x2={r} y2={r * 2 - Math.max(2, r * 0.25)} />
      <line x1={0} y1={r} x2={Math.max(2, r * 0.25)} y2={r} />
      <line x1={r * 2} y1={r} x2={r * 2 - Math.max(2, r * 0.25)} y2={r} />
    </g>
  </svg>
)

export const InteractionOverlay: React.FC<InteractionOverlayProps> = memo(
  ({
    width,
    height,
    points,
    selectedId,
    targetId,
    hoverId,
    eligibleIds = [],
    phase = 'idle',
    tokenSize = 28,
  }) => {
    const reducedMotion = useReducedMotion()
    const posById = useMemo(() => {
      const m = new Map<string, Point>()
      for (const p of points) m.set(p.id, p)
      return m
    }, [points])

    const selected = selectedId ? posById.get(selectedId) || null : null
    const target = targetId ? posById.get(targetId) || null : null
    const hover = hoverId ? posById.get(hoverId) || null : null
    const _eligibleSet = useMemo(() => new Set(eligibleIds), [eligibleIds])
    const animateEligible = !reducedMotion ? eligibleIds.slice(0, 10) : []
    const r = Math.max(12, tokenSize / 2)

    return (
      <div
        className="absolute left-0 top-0 pointer-events-none"
        style={{ width, height, zIndex: 5 }}
      >
        {/* Attack/Fortify arcs */}
        {(phase === 'attack' || phase === 'fortify') &&
          selected &&
          (hover || target) &&
          (() => {
            const dest = target || hover
            if (!dest) return null
            return (
              <svg
                className="absolute left-0 top-0"
                width={width}
                height={height}
                role="img"
                aria-label="Interaction arc"
              >
                <title>Interaction arc</title>
                <path
                  d={arcPath(selected, dest)}
                  fill="none"
                  stroke={phase === 'attack' ? 'var(--attack)' : 'var(--fortify)'}
                  strokeWidth={2}
                  opacity={target ? 1 : 0.75}
                />
              </svg>
            )
          })()}

        {/* Selected ring (breathing) */}
        {selected && !target && (
          <div
            aria-label="selected-overlay"
            role="img"
            className={`${reducedMotion ? '' : 'animate-[breath_1.2s_ease-in-out_infinite]'} rounded-full ring-1 ring-[var(--muted-ring)]`}
            style={{
              position: 'absolute',
              left: selected.x,
              top: selected.y,
              width: tokenSize,
              height: tokenSize,
              transform: 'translate(-50%, -50%)',
            }}
          />
        )}

        {/* Committed target: solid ring */}
        {target && (
          <div
            aria-label="committed-overlay"
            role="img"
            className="rounded-full outline outline-2"
            style={{
              position: 'absolute',
              left: target.x,
              top: target.y,
              width: tokenSize,
              height: tokenSize,
              transform: 'translate(-50%, -50%)',
              outlineColor: phase === 'attack' ? 'var(--attack)' : 'var(--fortify)',
            }}
          />
        )}

        {/* Eligible states */}
        {selected &&
          eligibleIds.map((id, _idx) => {
            if (id === selectedId || id === targetId) return null
            const p = posById.get(id)
            if (!p) return null
            const animate = animateEligible.includes(id)
            if (phase === 'attack') {
              return (
                <div
                  key={id}
                  aria-label="eligible-attack"
                  role="img"
                  className="text-[color:var(--attack-ring)]"
                >
                  <div
                    className={`${animate ? 'animate-[ping-soft_1s_linear_infinite]' : ''} rounded-full outline outline-2 outline-[var(--attack-ring)]`}
                    style={{
                      position: 'absolute',
                      left: p.x,
                      top: p.y,
                      width: tokenSize,
                      height: tokenSize,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                  <div className="text-[color:var(--attack-ring)]">
                    <Crosshair x={p.x} y={p.y} r={r} />
                  </div>
                </div>
              )
            }
            if (phase === 'fortify') {
              const bracket = 6
              return (
                <svg
                  key={id}
                  aria-label="eligible-fortify"
                  role="img"
                  className="absolute left-0 top-0"
                  width={width}
                  height={height}
                >
                  <title>Eligible fortify brackets</title>
                  <g fill="none" stroke={'var(--fortify-ring)'} strokeWidth={2} opacity={0.85}>
                    {/* Top-left */}
                    <line x1={p.x - r} y1={p.y - r} x2={p.x - r + bracket} y2={p.y - r} />
                    <line x1={p.x - r} y1={p.y - r} x2={p.x - r} y2={p.y - r + bracket} />
                    {/* Top-right */}
                    <line x1={p.x + r} y1={p.y - r} x2={p.x + r - bracket} y2={p.y - r} />
                    <line x1={p.x + r} y1={p.y - r} x2={p.x + r} y2={p.y - r + bracket} />
                    {/* Bottom-left */}
                    <line x1={p.x - r} y1={p.y + r} x2={p.x - r + bracket} y2={p.y + r} />
                    <line x1={p.x - r} y1={p.y + r} x2={p.x - r} y2={p.y + r - bracket} />
                    {/* Bottom-right */}
                    <line x1={p.x + r} y1={p.y + r} x2={p.x + r - bracket} y2={p.y + r} />
                    <line x1={p.x + r} y1={p.y + r} x2={p.x + r} y2={p.y + r - bracket} />
                  </g>
                </svg>
              )
            }
            return null
          })}
      </div>
    )
  },
)

export default InteractionOverlay
