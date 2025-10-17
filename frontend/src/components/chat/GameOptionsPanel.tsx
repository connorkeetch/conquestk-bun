import { useMemo } from 'react'
import { getFogDescription, getTreasureDescription } from '@/utils/tooltips'
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
    const capFirst = (s: string) => (s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s)
    const fog = room.fogOfWar ?? 'off'
    const ranked = room.isRanked ?? false
    const privateRoom = room.isPrivate
    const teamPlay = room.allowTeamPlay ?? false
    const teamMode = room.teamMode ?? 'none'
    const numberOfTeams = room.numberOfTeams ?? null
    const turnTimer = room.turnTimerSeconds ?? 0
    const timeBank = (room as unknown as { timeBankSeconds?: number | null }).timeBankSeconds ?? 0
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

    const fogValue = fog === 'off' ? 'Off' : toTitle(fog)

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

    const { value: treasureSummary, help: treasureHelp } = (() => {
      const config = currentGame?.gameConfig?.treasureConfig ?? room.treasureConfig ?? null
      const legacyMode = currentGame?.gameConfig?.cardTradeMode ?? room.cardTradeMode ?? undefined

      if (config && config.enabled !== false) {
        const mode = (config.payoutMode || 'classic').toLowerCase()
        const value = mode === 'fixed' ? 'Fixed' : mode === 'triangular' ? 'Progressive' : 'Classic'
        return { value, help: getTreasureDescription(config) }
      }

      if (legacyMode) {
        const normalized = legacyMode.toLowerCase()
        if (normalized === 'none' || normalized === 'disabled' || normalized === 'off') {
          return { value: 'Off', help: 'Treasures are disabled for this match.' }
        }

        const value =
          normalized === 'fixed'
            ? 'Fixed'
            : normalized === 'progressive' || normalized === 'escalating'
              ? 'Progressive'
              : normalized === 'classic'
                ? 'Classic'
                : toTitle(legacyMode)

        const help =
          normalized === 'fixed'
            ? 'Each treasure set pays a fixed reinforcement bonus.'
            : normalized === 'progressive' || normalized === 'escalating'
              ? 'Treasure payouts escalate with each set traded.'
              : normalized === 'classic'
                ? 'Treasures follow the classic escalating set values (4, 6, 8, 10, ...).'
                : 'Treasures award bonus troops based on the configured payout mode.'

        return { value, help }
      }

      return { value: 'Off', help: 'Treasures are disabled for this match.' }
    })()

    const modifiersValue = (() => {
      // Prefer live game state if available; otherwise assume Disabled
      const enabled = Boolean(currentGame?.gameConfig?.useTerritoryModifiers)
      return enabled ? 'Enabled' : 'Disabled'
    })()

    const formatBank = (seconds?: number | null) => {
      const s = typeof seconds === 'number' ? Math.max(0, Math.trunc(seconds)) : 0
      if (s <= 0) return '0'
      const h = Math.floor(s / 3600)
      const m = Math.floor((s % 3600) / 60)
      if (h > 0 && m === 0) return `${h}hrs`
      if (h > 0 && m > 0) return `${h}h ${m}m`
      return `${Math.ceil(s / 60)} mins`
    }

    const items: Array<{ k: string; v: string; help?: string }> = [
      ...(gameMode ? [{ k: 'Game Mode', v: capFirst(toTitle(gameMode)) }] : []),
      { k: 'Map', v: room.mapName || 'Unknown map' },
      { k: playersLabel, v: String(room.maxPlayers) },
      { k: 'Teams', v: teamsValue },
      { k: 'Fog of War', v: fogValue, help: getFogDescription(fog) },
      { k: 'Turn Timer', v: formatTimer(turnTimer) },
      { k: 'Time Bank', v: formatBank(timeBank) },
      { k: 'Fortification', v: fortificationValue },
      { k: 'Treasures', v: treasureSummary, help: treasureHelp },
      { k: 'Modifiers', v: modifiersValue },
      { k: 'Ranked', v: ranked ? 'Yes' : 'No' },
      { k: 'Private Room', v: privateRoom ? 'Yes' : 'No' },
    ]

    return items
  }, [
    room,
    currentGame?.gameConfig?.useTerritoryModifiers,
    currentGame?.gameConfig?.treasureConfig,
    currentGame?.gameConfig?.cardTradeMode,
  ])

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
          <h3 className="font-semibold text-white">Game Settings</h3>
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
