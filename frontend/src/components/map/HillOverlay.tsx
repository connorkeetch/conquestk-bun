import { useMemo } from 'react'
import { getColorValue, type PlayerColor } from '@/constants/colors'

type Territory = {
  id: string
  name?: string
  x: number
  y: number
  owner?: string | null
}

type PlayerLite = {
  id: string
  username: string
  color: string
}

type KothState = {
  currentHillTerritoryId: string
  turnsUntilRotation?: number
  rotationInterval?: number
  previewTurns?: number
} | null

interface HillOverlayProps {
  mapWidth: number
  mapHeight: number
  territories: Territory[]
  players: PlayerLite[]
  state: KothState
}

export function HillOverlay({
  mapWidth,
  mapHeight,
  territories,
  players,
  state,
}: HillOverlayProps) {
  const view = useMemo(() => {
    if (!state) return null
    const hill = territories.find((t) => t.id === state.currentHillTerritoryId)
    if (!hill) return null

    const ownerId = hill.owner ?? null
    const owner = ownerId ? players.find((p) => p.id === ownerId) : null
    const ownerColor = owner ? getColorValue(owner.color as PlayerColor) : 'rgba(250,204,21,0.9)'
    const turnsUntilRotation = state.turnsUntilRotation
    const rotationInterval = state.rotationInterval
    const previewTurns = state.previewTurns ?? 0
    const rotationActive = Boolean(rotationInterval && rotationInterval > 0)
    const showCountdown =
      rotationActive && typeof turnsUntilRotation === 'number' && turnsUntilRotation >= 0

    const labelParts = [
      owner
        ? `Controlled by ${owner.username}`
        : ownerId === 'neutral'
          ? 'Held by neutral forces'
          : 'Currently unclaimed',
    ]
    if (showCountdown) {
      const turns = Math.max(0, turnsUntilRotation ?? 0)
      const unit = turns === 1 ? 'turn' : 'turns'
      if (previewTurns > 0 && turns > previewTurns)
        labelParts.push(`Rotation reveals in ${turns - previewTurns} ${unit}`)
      else labelParts.push(`Rotates in ${turns} ${unit}`)
    }

    const left = (hill.x / mapWidth) * 100
    const top = (hill.y / mapHeight) * 100
    const name = hill.name ?? hill.id ?? 'Hill'

    return { left, top, ownerColor, label: labelParts.join(' · '), name }
  }, [mapWidth, mapHeight, players, state, territories])

  if (!view) return null

  return (
    <div
      className="absolute z-30 pointer-events-none"
      style={{ left: `${view.left}%`, top: `${view.top}%`, transform: 'translate(-50%, -50%)' }}
    >
      <span className="pointer-events-none relative block">
        <span className="absolute -left-12 -top-12 h-24 w-24 rounded-full border-4 border-yellow-300/80 opacity-70 blur-sm" />
        <span className="absolute -left-10 -top-10 h-20 w-20 animate-ping rounded-full border-4 border-yellow-300/60" />
        <span
          className="absolute -left-8 -top-8 h-16 w-16 rounded-full border-4"
          style={{ borderColor: view.ownerColor, boxShadow: '0 0 24px rgba(250,204,21,0.75)' }}
        />
      </span>
      <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 rounded bg-black/70 px-3 py-1 text-xs text-white shadow-lg">
        <p className="font-semibold text-amber-200">{view.name}</p>
        <p>{view.label}</p>
      </div>
    </div>
  )
}

export default HillOverlay
