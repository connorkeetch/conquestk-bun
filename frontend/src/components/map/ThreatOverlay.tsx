import { useMemo } from 'react'
import type { GameState } from '@/types/game'
import { arePlayersTeammates } from '@/utils/teamHelpers'
import { useMapViewport } from '../ResponsiveMapContainer'

const clampViewportScale = (scale: number) => Math.min(3, Math.max(0.25, scale))

type Territory = { id: string; x: number; y: number; owner?: string | null; armies?: number }

interface ThreatOverlayProps {
  mapWidth: number
  mapHeight: number
  territories: Territory[]
  adjacency: Record<string, string[]>
  myUserId: string
  game: GameState
}

export function ThreatOverlay({
  mapWidth,
  mapHeight,
  territories,
  adjacency,
  myUserId,
  game,
}: ThreatOverlayProps) {
  const items = useMemo(() => {
    const byId = new Map<string, Territory>()
    for (const t of territories) byId.set(t.id, t)
    const isFriendly = (owner?: string | null) =>
      owner ? owner === myUserId || arePlayersTeammates(game, owner, myUserId) : false
    const out: Array<{ id: string; x: number; y: number; score: number }> = []
    for (const t of territories) {
      if (!isFriendly(t.owner)) continue
      let s = 0
      for (const adjId of adjacency[t.id] || []) {
        const adj = byId.get(adjId)
        if (!adj) continue
        if (!isFriendly(adj.owner)) s += Math.max(0, adj.armies ?? 0)
      }
      if (s > 0) out.push({ id: t.id, x: t.x, y: t.y, score: s })
    }
    return out
  }, [adjacency, game, myUserId, territories])

  const max = useMemo(() => Math.max(1, ...items.map((i) => i.score)), [items])

  return (
    <>
      {items.map((i) => {
        const ratio = Math.min(1, i.score / max)
        const color = colorFor(ratio)
        return (
          <div
            key={`thr-${i.id}`}
            className="absolute z-10 pointer-events-none"
            style={{
              left: `${(i.x / Math.max(1, mapWidth)) * 100}%`,
              top: `${(i.y / Math.max(1, mapHeight)) * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
            title={`Threat score: ${i.score}`}
          >
            <ThreatOverlayRing color={color} ratio={ratio} />
          </div>
        )
      })}
    </>
  )
}

function colorFor(r: number) {
  if (r > 0.66) return 'rgba(239,68,68,0.85)'
  if (r > 0.33) return 'rgba(245,158,11,0.85)'
  if (r > 0.1) return 'rgba(34,197,94,0.85)'
  return 'rgba(148,163,184,0.6)'
}

function ThreatOverlayRing({ color, ratio }: { color: string; ratio: number }) {
  const viewport = useMapViewport()
  const scale = clampViewportScale(viewport?.scale ?? 1)
  const baseSize = 14 + Math.round(10 * ratio)
  const size = Math.max(10, Math.round(baseSize * scale))
  const ringWidth = Math.max(2, Math.round(scale * 3))
  const glowRadius = Math.max(12, Math.round(22 * scale))

  return (
    <span
      className="block rounded-full"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        boxShadow: `0 0 0 ${ringWidth}px ${color}, 0 0 ${glowRadius}px ${color}`,
      }}
    />
  )
}

export default ThreatOverlay
