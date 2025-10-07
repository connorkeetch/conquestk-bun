import type React from 'react'
import { memo, useId, useMemo } from 'react'
import useReducedMotion from '@/hooks/useReducedMotion'

type Point = { id: string; x: number; y: number }
type XY = { x: number; y: number }

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

// distance helper was inlined; keep minimal helpers local to functions

// Deprecated quadratic arc kept for reference; use cubicArcPath for correct arrowhead tangent
// function arcPath(a: XY, b: XY) {
//   const d = dist(a, b)
//   const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
//   // perpendicular offset for gentle arc; scale with distance
//   const nx = b.y - a.y
//   const ny = -(b.x - a.x)
//   const len = Math.hypot(nx, ny) || 1
//   const ox = (nx / len) * Math.min(60, Math.max(12, d * 0.12))
//   const oy = (ny / len) * Math.min(60, Math.max(12, d * 0.12))
//   const cx = mid.x + ox
//   const cy = mid.y + oy
//   return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`
// }

function trimSegment(a: XY, b: XY, startOffset: number, endOffset: number): { a: XY; b: XY } {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const len = Math.hypot(vx, vy) || 1
  // Avoid over-trimming when points are very close
  const s = Math.min(startOffset, Math.max(0, len * 0.45))
  const e = Math.min(endOffset, Math.max(0, len * 0.45))
  const nx = vx / len
  const ny = vy / len
  return {
    a: { x: a.x + nx * s, y: a.y + ny * s },
    b: { x: b.x - nx * e, y: b.y - ny * e },
  }
}

function cubicArcPath(a: XY, b: XY): string {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d
  const uy = dy / d
  const px = -uy
  const py = ux
  // Gentle curvature scaled by distance
  const offset = Math.min(50, Math.max(10, d * 0.1))
  const handle = Math.min(60, Math.max(14, d * 0.25))
  const c1x = a.x + ux * handle + px * offset
  const c1y = a.y + uy * handle + py * offset
  // Ensure arrowhead points to center: end tangent aligned with (b - a)
  const c2x = b.x - ux * handle
  const c2y = b.y - uy * handle
  return `M ${a.x} ${a.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${b.x} ${b.y}`
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
    const animateEligible = !reducedMotion ? eligibleIds.slice(0, 10) : []
    const r = Math.max(12, tokenSize / 2)
    const uid = useId()
    const markerColoredAttack = `${uid}-arrow-colored-attack`
    const markerColoredFortify = `${uid}-arrow-colored-fortify`
    const markerWhite = `${uid}-arrow-white`

    return (
      <div
        className="absolute left-0 top-0 pointer-events-none"
        style={{ width, height, zIndex: 5 }}
      >
        {/* Attack/Fortify arrows */}
        {(phase === 'attack' || phase === 'fortify') &&
          selected &&
          (hover || target) &&
          (() => {
            const dest = target || hover
            if (!dest) return null
            const color = phase === 'attack' ? 'var(--attack)' : 'var(--fortify)'
            const colorRing = phase === 'attack' ? 'var(--attack-ring)' : 'var(--fortify-ring)'
            // Path thickness: colored glow underlay and white dashed top layer (smaller)
            const underW = 3.5
            const topW = 2
            // Shorten the segment so arrows start/end outside token circles
            const { a: from, b: to } = trimSegment(selected, dest, r + 4, r + 8)
            const pathD = cubicArcPath(from, to)
            return (
              <svg
                className="absolute left-0 top-0"
                width={width}
                height={height}
                role="img"
                aria-label="Interaction arrow"
              >
                <defs>
                  {/* Colored arrowhead (soft glow underlay) */}
                  <marker
                    id={markerColoredAttack}
                    viewBox="0 0 12 12"
                    refX="11"
                    refY="6"
                    markerWidth="9"
                    markerHeight="9"
                    orient="auto"
                  >
                    <path d="M0,0 L12,6 L0,12 Z" fill="var(--attack)" opacity="0.28" />
                  </marker>
                  <marker
                    id={markerColoredFortify}
                    viewBox="0 0 12 12"
                    refX="11"
                    refY="6"
                    markerWidth="9"
                    markerHeight="9"
                    orient="auto"
                  >
                    <path d="M0,0 L12,6 L0,12 Z" fill="var(--fortify)" opacity="0.28" />
                  </marker>
                  {/* Crisp white arrowhead */}
                  <marker
                    id={markerWhite}
                    viewBox="0 0 12 12"
                    refX="11"
                    refY="6"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto"
                  >
                    <path d="M0,0 L12,6 L0,12 Z" fill="#ffffff" />
                  </marker>
                </defs>
                {/* Subtle straight line for direction cue in phase color */}
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={colorRing}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  opacity={0.35}
                />
                <title>Interaction arrow</title>
                {/* Colored underlay (glow) */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={color}
                  strokeWidth={underW}
                  opacity={0.22}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerEnd={`url(#${phase === 'attack' ? markerColoredAttack : markerColoredFortify})`}
                />
                {/* White dashed top layer with crisp arrowhead */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={topW}
                  opacity={0.85}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="8 6"
                  markerEnd={`url(#${markerWhite})`}
                />
              </svg>
            )
          })()}

        {/* Selected ring (breathing) */}
        {selected && (
          <div
            aria-label="selected-overlay"
            role="img"
            className="absolute"
            style={{ left: selected.x, top: selected.y, transform: 'translate(-50%, -50%)' }}
          >
            <div
              className={`${reducedMotion ? '' : 'animate-[breath_1.2s_ease-in-out_infinite]'} rounded-full ring-2 ring-[var(--muted-ring)]`}
              style={{ width: tokenSize, height: tokenSize }}
            />
          </div>
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
                    className="absolute"
                    style={{ left: p.x, top: p.y, transform: 'translate(-50%, -50%)' }}
                  >
                    <div
                      className={`${animate ? 'animate-[ping-soft_1s_linear_infinite]' : ''} rounded-full outline outline-[3px] outline-[var(--attack-ring)]`}
                      style={{ width: tokenSize, height: tokenSize }}
                    />
                  </div>
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
