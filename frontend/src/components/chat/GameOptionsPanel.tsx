import { useMemo } from 'react'
import { useAppSelector } from '../../hooks/redux'

type Props = {
  className?: string
}

export default function GameOptionsPanel({ className = '' }: Props) {
  const room = useAppSelector((state) => state.room.currentRoom)

  const lines = useMemo(() => {
    if (!room) return [] as Array<{ k: string; v: string }>

    const bool = (v?: boolean) => (v ? 'Yes' : 'No')
    const toTitle = (v?: string | null) => (v ? String(v).replaceAll('_', ' ') : '—')
    const fog = room.fogOfWar ?? 'off'
    const ranked = room.isRanked ?? false
    const privateRoom = room.isPrivate
    const teamPlay = room.allowTeamPlay ?? false
    const teamMode = room.teamMode ?? 'none'
    const numberOfTeams = room.numberOfTeams ?? null
    const turnTimer = room.turnTimerSeconds ?? 0

    const treasureSummary = (() => {
      const cfg = room.treasureConfig
      if (!cfg || cfg.enabled === false) return 'Off'
      const mode = cfg.payoutMode || 'triangular'
      if (mode === 'fixed') {
        const fixed = Math.max(1, Math.min(50, Math.trunc(cfg.fixedValue ?? 8)))
        return `Fixed (${fixed}) · Hand ${cfg.handCap} · Diamond +${cfg.diamondSetBonus}`
      }
      const label = mode === 'triangular' ? 'Triangular' : mode === 'classic' ? 'Classic' : 'None'
      return `${label} · Hand ${cfg.handCap} · Diamond +${cfg.diamondSetBonus}`
    })()

    const items: Array<{ k: string; v: string }> = [
      { k: 'Map', v: room.mapName || 'Unknown map' },
      { k: 'Max Players', v: String(room.maxPlayers) },
      { k: 'Ranked', v: ranked ? 'Yes' : 'No' },
      { k: 'Private Room', v: privateRoom ? 'Yes' : 'No' },
      { k: 'Team Play', v: bool(teamPlay) },
      { k: 'Team Mode', v: toTitle(teamMode) },
      ...(teamPlay && numberOfTeams ? [{ k: 'Number of Teams', v: String(numberOfTeams) }] : []),
      { k: 'Fog of War', v: toTitle(fog) },
      { k: 'Turn Timer', v: turnTimer ? `${turnTimer}s` : 'Off' },
      { k: 'Treasures', v: treasureSummary },
    ]

    return items
  }, [room])

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
