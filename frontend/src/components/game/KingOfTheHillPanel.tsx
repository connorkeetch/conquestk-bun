import type { FC } from 'react'
import { getColorValue } from '@/constants/colors'
import type { GamePlayer, KingOfTheHillState, Territory } from '@/types/game'

interface KingOfTheHillPanelProps {
  state: KingOfTheHillState
  players: GamePlayer[]
  territories: Territory[]
  viewerId?: string | null
  isSpectator?: boolean
  canPingHill?: boolean
  onPingHill?: () => void
}

const pluralize = (value: number, unit: string) => {
  const abs = Math.abs(value)
  return `${value} ${unit}${abs === 1 ? '' : 's'}`
}

export const KingOfTheHillPanel: FC<KingOfTheHillPanelProps> = ({
  state,
  players,
  territories,
  viewerId,
  isSpectator = false,
  canPingHill = false,
  onPingHill,
}) => {
  const territoryNames = new Map<string, string>(
    territories.map((territory) => [territory.id, territory.name ?? territory.id]),
  )

  const hillName =
    territoryNames.get(state.currentHillTerritoryId) ??
    state.currentHillTerritoryId ??
    'Unknown territory'
  const targetPoints = Math.max(1, state.targetPoints ?? 0)
  const rotationActive = Boolean(state.rotationInterval && state.rotationInterval > 0)
  const turnsUntilRotation = rotationActive
    ? (state.turnsUntilRotation ?? state.rotationInterval ?? null)
    : null
  const upcomingName = state.upcomingHillTerritoryId
    ? (territoryNames.get(state.upcomingHillTerritoryId) ?? state.upcomingHillTerritoryId)
    : null

  const rows = players
    .map((player) => {
      const colorValue = getColorValue(player.color) ?? player.color
      return {
        id: player.id,
        name: player.username,
        color: colorValue,
        points: state.points[player.id] ?? 0,
        isLocal: viewerId ? viewerId === player.id : false,
        eliminated: player.isEliminated,
      }
    })
    .sort((a, b) => {
      if (a.eliminated !== b.eliminated) {
        return a.eliminated ? 1 : -1
      }
      if (a.points !== b.points) {
        return b.points - a.points
      }
      return a.name.localeCompare(b.name)
    })

  return (
    <div className="border-b border-[color:var(--panel-border)] bg-[color:var(--surface-2)] px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            King of the Hill
          </p>
          <p className="text-sm font-semibold text-[color:var(--heading)]">{hillName}</p>
          <p className="text-xs text-muted">
            First to {targetPoints} {targetPoints === 1 ? 'point' : 'points'} wins.
            {turnsUntilRotation !== null && rotationActive
              ? ` Rotation in ${pluralize(turnsUntilRotation, 'turn')}.`
              : ''}
          </p>
        </div>
        {!isSpectator && (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={!canPingHill}
            onClick={() => onPingHill?.()}
          >
            Ping hill location
          </button>
        )}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-1 pr-3 font-medium">Player</th>
              <th className="py-1 text-right font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={
                  row.isLocal
                    ? 'bg-[color:color-mix(in srgb, var(--color-accent) 8%, transparent)] font-semibold'
                    : 'border-t border-[color:var(--panel-border)]/60'
                }
              >
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-2.5 w-2.5 rounded-full border border-[color:var(--panel-border)]"
                      style={{ backgroundColor: row.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-[color:var(--text)]">{row.name}</span>
                    {row.isLocal && <span className="text-xs text-muted">(You)</span>}
                    {row.eliminated && <span className="text-xs text-muted">Eliminated</span>}
                  </div>
                </td>
                <td className="py-2">
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-right text-[color:var(--heading)]">{row.points}</span>
                    <span className="relative block h-1.5 w-20 overflow-hidden rounded-full bg-[color:var(--surface-3)]">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${Math.min(100, (row.points / targetPoints) * 100)}%`,
                          backgroundColor: row.color,
                          opacity: row.isLocal ? 0.9 : 0.65,
                        }}
                      />
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rotationActive && upcomingName && (
        <p className="mt-2 text-xs text-muted">
          Next hill{' '}
          {state.previewTurns && state.previewTurns > 0
            ? `announced ${pluralize(state.previewTurns, 'turn')} ahead`
            : 'up next'}
          : <span className="font-medium text-[color:var(--heading)]">{upcomingName}</span>
        </p>
      )}
      {isSpectator && (
        <p className="mt-2 text-xs text-muted">
          Spectators can view standings but cannot ping the hill.
        </p>
      )}
    </div>
  )
}
