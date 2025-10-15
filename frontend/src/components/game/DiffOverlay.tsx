import { useEffect, useMemo, useState } from 'react'

type Point = { id: string; x: number; y: number }
type Path = { from: string; to: string; kind: 'attack' | 'fortify' }

export function DiffOverlay({
  width,
  height,
  points,
  flips,
  armyChanges,
  paths,
  fadeMs = 1200,
}: {
  width: number
  height: number
  points: Point[]
  flips: string[]
  armyChanges: Array<{ territoryId: string; delta: number }>
  paths: Path[]
  fadeMs?: number
}) {
  const pointMap = useMemo(() => new Map(points.map((p) => [p.id, p])), [points])
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    setVisible(true)
    const id = window.setTimeout(() => setVisible(false), fadeMs)
    return () => window.clearTimeout(id)
  }, [fadeMs])

  if (!visible) return null

  return (
    <div
      className="absolute left-0 top-0 pointer-events-none"
      style={{ width, height, zIndex: 25 }}
    >
      {/* Paths */}
      <svg
        width={width}
        height={height}
        style={{ position: 'absolute', inset: 0 }}
        aria-hidden="true"
      >
        {paths.map((p, idx) => {
          const a = pointMap.get(p.from)
          const b = pointMap.get(p.to)
          if (!a || !b) return null
          const color = p.kind === 'attack' ? 'rgba(239,68,68,0.8)' : 'rgba(59,130,246,0.8)'
          return (
            <g key={`${p.from}-${p.to}-${idx}`}>
              <defs>
                <marker
                  id={`arrow-${p.kind}`}
                  markerWidth="6"
                  markerHeight="6"
                  refX="5"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L0,6 L6,3 z" fill={color} />
                </marker>
              </defs>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={color}
                strokeWidth={2}
                markerEnd={`url(#arrow-${p.kind})`}
                opacity={0.9}
              />
            </g>
          )
        })}
      </svg>

      {/* Ownership flips: pulse ring */}
      {flips.map((id) => {
        const p = pointMap.get(id)
        if (!p) return null
        const size = 34
        return (
          <div
            key={`flip-${id}`}
            className="absolute rounded-full"
            style={{
              left: p.x - size / 2,
              top: p.y - size / 2,
              width: size,
              height: size,
              border: '3px solid rgba(250,204,21,0.95)',
              boxShadow: '0 0 12px rgba(250,204,21,0.85)',
              animation: 'rk-pulse 1.2s ease-out forwards',
            }}
          />
        )
      })}

      {/* Army deltas: chips */}
      {armyChanges.map((ch) => {
        const p = pointMap.get(ch.territoryId)
        if (!p || ch.delta === 0) return null
        const positive = ch.delta > 0
        const text = positive ? `+${ch.delta}` : `${ch.delta}`
        return (
          <div
            key={`chg-${ch.territoryId}`}
            className={`absolute px-2 py-0.5 text-xs font-bold rounded-full ${positive ? 'bg-green-600/85' : 'bg-red-600/85'} text-white`}
            style={{
              left: p.x + 18,
              top: p.y - 18,
              transform: 'translate(-50%,-50%)',
              animation: 'rk-fade 1.2s ease-out forwards',
            }}
          >
            {text}
          </div>
        )
      })}

      <style>{`
        @keyframes rk-pulse {
          0% { transform: scale(0.8); opacity: 1; }
          60% { transform: scale(1.15); opacity: 0.9; }
          100% { transform: scale(1.0); opacity: 0; }
        }
        @keyframes rk-fade {
          0% { opacity: 1; transform: translate(-50%,-50%) translateY(0px); }
          100% { opacity: 0; transform: translate(-50%,-50%) translateY(-12px); }
        }
      `}</style>
    </div>
  )
}

export default DiffOverlay
