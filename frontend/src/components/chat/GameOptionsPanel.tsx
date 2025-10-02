import { useMemo } from 'react'
import {
  getCardTradeDescription,
  getFogDescription,
  getTreasureDescription,
} from '@/utils/tooltips'
import { useAppSelector } from '../../hooks/redux'
import InfoTooltip from '../InfoTooltip'

type Props = {
  className?: string
}

export default function GameOptionsPanel({ className = '' }: Props) {
  const room = useAppSelector((state) => state.room.currentRoom)
  const currentGame = useAppSelector((state) => state.game.currentGame)

  const lines = useMemo(() => {
    if (!room) return [] as Array<{ k: string; v: string; help?: string }>

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
    const cardTradeMode = room.cardTradeMode ?? null
    const bonusType = room.bonusType ?? null

    const playersLabel = 'Players'

    const teamsValue = (() => {
      if (!teamPlay || teamMode === 'none') return 'Off'
      if (teamMode === 'auto_balance') return 'Auto-balance'
      if (teamMode === 'teams') {
        return numberOfTeams && numberOfTeams > 0 ? `${numberOfTeams}` : 'Teams'
      }
      return toTitle(teamMode)
    })()

    const fogValue = fog === 'off' ? 'Off' : toTitle(fog)

    const cardTradesValue = (() => {
      if (!cardTradeMode) return 'Progressive'
      const normalized = cardTradeMode.toLowerCase()
      if (normalized === 'fixed') return 'Fixed'
      if (normalized === 'progressive' || normalized === 'escalating') return 'Progressive'
      if (normalized === 'none' || normalized === 'disabled') return 'Disabled'
      return toTitle(cardTradeMode)
    })()

    const bonusesValue = bonusType ? toTitle(bonusType) : 'Classic'

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
      const mode = cfg.payoutMode || 'classic'
      if (mode === 'fixed') return 'Fixed'
      return mode === 'triangular' ? 'Progressive' : mode === 'classic' ? 'Classic' : 'Off'
    })()

    const modifiersValue = (() => {
      // Prefer live game state if available; otherwise assume Disabled
      const enabled = Boolean(currentGame?.gameConfig?.useTerritoryModifiers)
      return enabled ? 'Enabled' : 'Disabled'
    })()

    const items: Array<{ k: string; v: string; help?: string }> = [
      ...(gameMode ? [{ k: 'Game Mode', v: toTitle(gameMode) }] : []),
      { k: 'Map', v: room.mapName || 'Unknown map' },
      { k: playersLabel, v: String(room.maxPlayers) },
      { k: 'Teams', v: teamsValue },
      { k: 'Fog of War', v: fogValue, help: getFogDescription(fog) },
      { k: 'Turn Timer', v: formatTimer(turnTimer) },
      { k: 'Card Trades', v: cardTradesValue, help: getCardTradeDescription(cardTradeMode) },
      { k: 'Fortification', v: fortificationValue },
      { k: 'Treasures', v: treasureSummary, help: getTreasureDescription(room.treasureConfig) },
      { k: 'Bonuses', v: bonusesValue },
      { k: 'Modifiers', v: modifiersValue },
      { k: 'Ranked', v: ranked ? 'Yes' : 'No' },
      { k: 'Private Room', v: privateRoom ? 'Yes' : 'No' },
    ]

    return items
  }, [room, currentGame?.gameConfig?.useTerritoryModifiers])

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
              <div className="flex items-center gap-1">
                <div className="text-xs uppercase tracking-wide text-muted">{line.k}</div>
                {line.help ? <InfoTooltip title={line.help} /> : null}
              </div>
              <div className="text-sm text-white">{line.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
