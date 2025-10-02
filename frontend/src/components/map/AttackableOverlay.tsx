import { useMapViewport } from '../ResponsiveMapContainer'

const clampViewportScale = (scale: number) => Math.min(3, Math.max(0.25, scale))

type Territory = { id: string; x: number; y: number }

interface AttackableOverlayProps {
  mapWidth: number
  mapHeight: number
  territories: Territory[]
  selectedTerritoryId: string
  validTargets: string[]
}

export function AttackableOverlay({
  mapWidth,
  mapHeight,
  territories,
  selectedTerritoryId,
  validTargets,
}: AttackableOverlayProps) {
  const entries: Array<{ id: string; x: number; y: number; kind: 'src' | 'tgt' }> = []
  const src = territories.find((t) => t.id === selectedTerritoryId)
  if (src) entries.push({ id: src.id, x: src.x, y: src.y, kind: 'src' })
  for (const tgt of validTargets) {
    const t = territories.find((tt) => tt.id === tgt)
    if (t) entries.push({ id: t.id, x: t.x, y: t.y, kind: 'tgt' })
  }

  return (
    <>
      {entries.map((e) => (
        <div
          key={`atk-${e.id}`}
          className="absolute z-10 pointer-events-none"
          style={{
            left: `${(e.x / mapWidth) * 100}%`,
            top: `${(e.y / mapHeight) * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <AttackOverlayRing kind={e.kind} />
        </div>
      ))}
    </>
  )
}

function AttackOverlayRing({ kind }: { kind: 'src' | 'tgt' }) {
  const viewport = useMapViewport()
  const scale = clampViewportScale(viewport?.scale ?? 1)
  const baseSize = kind === 'src' ? 48 : 40
  const size = Math.max(14, Math.round(baseSize * scale))
  const ringWidth = Math.max(3, Math.round(scale * 3))
  const glowRadius = Math.max(16, Math.round(24 * scale))
  const baseColor = kind === 'src' ? 'rgba(56,189,248,0.9)' : 'rgba(239,68,68,0.9)'
  const glowColor = kind === 'src' ? 'rgba(56,189,248,0.45)' : 'rgba(239,68,68,0.45)'

  return (
    <span
      className="block rounded-full"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        boxShadow: `0 0 0 ${ringWidth}px ${baseColor}, 0 0 ${glowRadius}px ${glowColor}`,
      }}
    />
  )
}

export default AttackableOverlay
