import { useEffect, useMemo, useState } from 'react'
import { mapService } from '@/services/mapService'
import { useAppSelector } from '../../hooks/redux'

type Props = {
  className?: string
}

export default function GameOptionsPanel({ className = '' }: Props) {
  const room = useAppSelector((state) => state.room.currentRoom)
  const currentGame = useAppSelector((state) => state.game.currentGame)
  const [resolvedMapName, setResolvedMapName] = useState<string | null>(null)

  // Resolve map name if backend response lacks it
  useEffect(() => {
    let isActive = true
    setResolvedMapName(null)
    if (!room?.mapName && room?.mapId) {
      ;(async () => {
        try {
          const data = await mapService.getMap(room.mapId as string)
          if (!isActive) return
          setResolvedMapName(data.map.name || null)
        } catch {
          if (!isActive) return
          setResolvedMapName(null)
        }
      })()
    }
    return () => {
      isActive = false
    }
  }, [room?.mapId, room?.mapName])

  const lines = useMemo(() => {
    if (!room) return [] as Array<{ k: string; v: string }>

    const toTitle = (v?: string | null) => (v ? String(v).replace(/_/g, ' ') : '—')
    const fog = room.fogOfWar ?? 'off'
    const ranked = room.isRanked ?? false
    const privateRoom = room.isPrivate
    const teamPlay = room.allowTeamPlay ?? false
    const teamMode = room.teamMode ?? 'none'
    const numberOfTeams = room.numberOfTeams ?? null
    const turnTimer = room.turnTimerSeconds ?? 0
    const movementType = room.movementType ?? null
    const gameMode = room.gameMode ?? null

    const playersLabel = 'Players'

    const teamsValue = (() => {
      if (!teamPlay || teamMode === 'none') return 'Off'
      if (teamMode === 'auto_balance') return 'Auto-balance'
      if (teamMode === 'teams') {
        return numberOfTeams && numberOfTeams > 0 ? `${numberOfTeams}` : 'Teams'
      }
      return toTitle(teamMode)
    })()

    const fogValue = fog === 'off' ? 'Disabled' : 'Enabled'

    const formatTimer = (seconds?: number | null) => {
      const s = seconds ?? 0
      if (!s || s <= 0) return 'Off'
      if (s >= 3600) {
        const hours = Math.floor(s / 3600)
        const rem = Math.floor((s % 3600) / 60)
        return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`
      }
      const minutes = Math.ceil(s / 60)
      return `${minutes}m`
    }

    const fortificationValue = (() => {
      switch (movementType) {
        case 'classic_adjacent':
          return 'Adjacent'
        case 'adjacent_multi':
          return 'Adjacent (multi)'
        case 'path_single':
          return 'Chained'
        case 'path_multi':
          return 'Unlimited'
        default:
          return 'Adjacent'
      }
    })()

    const treasureSummary = (() => {
      const cfg = room.treasureConfig
      if (!cfg || cfg.enabled === false) return 'Off'
      const mode = cfg.payoutMode || 'triangular'
      if (mode === 'fixed') return 'Fixed'
      return mode === 'triangular' ? 'Triangular' : mode === 'classic' ? 'Classic' : 'Off'
    })()

    const modifiersValue = (() => {
      // Prefer live game state if available; otherwise assume Disabled
      const enabled = Boolean(currentGame?.gameConfig?.useTerritoryModifiers)
      return enabled ? 'Enabled' : 'Disabled'
    })()

    const items: Array<{ k: string; v: string }> = [
      ...(gameMode ? [{ k: 'Game Mode', v: toTitle(gameMode) }] : []),
      { k: 'Map', v: room.mapName || resolvedMapName || 'Unknown map' },
      { k: playersLabel, v: String(room.maxPlayers) },
      { k: 'Teams', v: teamsValue },
      { k: 'Fog of War', v: fogValue },
      { k: 'Turn Timer', v: formatTimer(turnTimer) },
      { k: 'Fortification', v: fortificationValue },
      { k: 'Treasures', v: treasureSummary },
      { k: 'Modifiers', v: modifiersValue },
      { k: 'Ranked', v: ranked ? 'Yes' : 'No' },
      { k: 'Private Room', v: privateRoom ? 'Yes' : 'No' },
    ]

    return items
  }, [room, resolvedMapName, currentGame?.gameConfig?.useTerritoryModifiers])

  if (!room) {
    return (
      <div className={`flex flex-col h-full bg-surface-1 rounded-lg ${className}`}>
        <div className="flex-1 flex items-center justify-center text-sm text-muted">
          No room data available.
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full bg-surface-1 rounded-lg ${className}`}>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-white">Game Options</h3>
          <div className="text-xs text-muted">Settings chosen at game creation</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {lines.map((line) => (
            <div
              key={line.k}
              className="flex items-center justify-between rounded border border-border bg-surface-1/60 px-3 py-2"
            >
              <div className="text-xs uppercase tracking-wide text-muted">{line.k}</div>
              <div className="text-sm text-white">{line.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
