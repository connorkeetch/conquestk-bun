import type React from 'react'
import { useCallback, useMemo } from 'react'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { selectTerritory } from '@/store/gameSlice'
import { useAttackOddsTooltip } from '@/hooks/useAttackOddsTooltip'
import type { GamePlayer } from '@/types/game'
import CustomMapDisplay from '../CustomMapDisplay'
import ResponsiveMapContainer from '../ResponsiveMapContainer'
import type { TerritoryModifier as IconTerritoryModifier } from '../TerritoryModifierIcon'
import { TerritoryModifierIcon } from '../TerritoryModifierIcon'
import { TerritoryModifierLegend } from '../TerritoryModifierLegend'
import { WorldMapSVG } from '../WorldMapSVG'
import { ConquestTransferOverlay } from './ConquestTransferOverlay'
import type { TerritoryDisplayMap } from './territoryDisplay'

const CLASSIC_MAP_WIDTH = 800
const CLASSIC_MAP_HEIGHT = 500

interface RiskGameMapProps {
  mapId: string
  territories: TerritoryDisplayMap
  players: GamePlayer[]
  hoveredTerritory: string | null
  selectedTerritory: string | null
  selectedTargetTerritory: string | null
  validTargets: string[]
  pendingAction: string | null
  territoryModifierMap: Map<string, IconTerritoryModifier> | null
  onTerritoryClick: (territoryId: string) => void
  onTerritoryHover: (territoryId: string | null) => void
}

export const RiskGameMap: React.FC<RiskGameMapProps> = ({
  mapId,
  territories,
  players,
  hoveredTerritory,
  selectedTerritory,
  selectedTargetTerritory,
  validTargets,
  pendingAction,
  territoryModifierMap,
  onTerritoryClick,
  onTerritoryHover,
}) => {
  const dispatchApp = useAppDispatch()
  const pings = useAppSelector((s) => s.uiRoom.pings ?? [])
  const playerColors = useMemo(
    () => Object.fromEntries(players.map((player) => [player.id, player.color])),
    [players],
  )

  const getTerritoryColor = useCallback(
    (territoryId: string): string => {
      const territory = territories[territoryId]
      if (!territory || !territory.owner) {
        return '#D1D5DB'
      }

      return playerColors[territory.owner] ?? '#D1D5DB'
    },
    [territories, playerColors],
  )

  const territoryEntries = useMemo(() => Object.entries(territories), [territories])

  const focusCoords = useMemo(() => {
    const id = selectedTargetTerritory || selectedTerritory
    if (!id) return null
    const t = territories[id]
    if (!t) return null
    return { x: t.armyPosition.x, y: t.armyPosition.y }
  }, [selectedTargetTerritory, selectedTerritory, territories])

  // Odds tooltip on attack hover - use shared hook for classic map
  const classicTerritoriesArray = useMemo(
    () =>
      Object.entries(territories).map(([id, t]) => ({
        id,
        x: t.armyPosition.x,
        y: t.armyPosition.y,
        armies: t.armies,
      })),
    [territories],
  )

  const rawOddsTooltip = useAttackOddsTooltip({
    pendingAction: pendingAction ?? null,
    selectedId: selectedTerritory ?? null,
    hoveredId: hoveredTerritory ?? null,
    validTargets,
    territories: classicTerritoriesArray,
    mapWidth: CLASSIC_MAP_WIDTH,
    mapHeight: CLASSIC_MAP_HEIGHT,
  })

  const oddsTooltip = mapId === 'classic' ? rawOddsTooltip : null

  return (
    <div className="game-board flex-1 relative bg-blue-100 p-4">
      <div className="relative w-full h-full">
        {mapId === 'classic' ? (
          <ResponsiveMapContainer
            mapWidth={CLASSIC_MAP_WIDTH}
            mapHeight={CLASSIC_MAP_HEIGHT}
            showMinimap={true}
            focus={focusCoords}
          >
            <WorldMapSVG
              territories={territories}
              onTerritoryClick={onTerritoryClick}
              onTerritoryHover={onTerritoryHover}
              getTerritoryColor={getTerritoryColor}
              hoveredTerritory={hoveredTerritory}
              selectedTerritory={selectedTerritory}
              selectedTargetTerritory={selectedTargetTerritory}
              validTargets={validTargets}
              pendingAction={pendingAction}
            />
            {focusCoords && (
              <output
                className="absolute pointer-events-none z-10"
                style={{
                  left: `${(focusCoords.x / CLASSIC_MAP_WIDTH) * 100}%`,
                  top: `${(focusCoords.y / CLASSIC_MAP_HEIGHT) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                aria-live="polite"
                aria-label={`Focused on ${territories[selectedTargetTerritory || selectedTerritory]?.name || 'territory'}`}
              >
                <div className="w-10 h-10 rounded-full border-2 border-cyan-300/80 animate-ping" />
              </output>
            )}
            {oddsTooltip && (
              <div
                role="tooltip"
                className="absolute z-20 pointer-events-none"
                style={{
                  left: `${oddsTooltip.left}%`,
                  top: `${oddsTooltip.top}%`,
                  transform:
                    oddsTooltip.top > 20 ? 'translate(-50%, -140%)' : 'translate(-50%, 40%)',
                }}
              >
                <div className="rounded bg-surface-2/95 border border-border shadow px-2 py-1 text-xs text-white whitespace-nowrap">
                  {`Odds (${oddsTooltip.att}v${oddsTooltip.def}) · Win ${(oddsTooltip.winChance).toFixed(0)}% · E[Δ] ${oddsTooltip.odds.expected.advantage >= 0 ? '+' : ''}${oddsTooltip.odds.expected.advantage.toFixed(2)}`}
                </div>
              </div>
            )}
            {/* Ping markers */}
            {pings
              .filter((p) => p.expiresAt > Date.now())
              .map((ping) => {
                const t = territories[ping.territoryId]
                if (!t) return null
                const left = (t.armyPosition.x / CLASSIC_MAP_WIDTH) * 100
                const top = (t.armyPosition.y / CLASSIC_MAP_HEIGHT) * 100
                return (
                  <button
                    key={`ping-${ping.id}`}
                    type="button"
                    className="absolute z-30"
                    style={{ left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -50%)' }}
                    onClick={() => dispatchApp(selectTerritory(ping.territoryId))}
                    title={ping.username ? `${ping.username} pinged` : 'Ping'}
                  >
                    <span className="relative block w-10 h-10">
                      <span className="absolute inset-0 rounded-full border-2 border-cyan-300/80 animate-ping" />
                      <span className="absolute inset-2 rounded-full bg-cyan-400/70" />
                    </span>
                  </button>
                )
              })}
          </ResponsiveMapContainer>
        ) : (
          <CustomMapDisplay
            mapId={mapId}
            territories={territoryEntries.map(([, territory]) => ({
              id: territory.id,
              name: territory.name,
              x: territory.armyPosition.x,
              y: territory.armyPosition.y,
              armies: territory.armies,
              owner: territory.owner,
              continent: territory.continent,
            }))}
            onTerritoryClick={onTerritoryClick}
            onTerritoryHover={onTerritoryHover}
            selectedTerritoryId={selectedTerritory}
            playerColors={playerColors}
            pendingAction={pendingAction}
            validTargets={validTargets}
            focus={focusCoords}
          />
        )}

        {mapId === 'classic' &&
          territoryEntries.map(([territoryId, territory]) => {
            if (!territory.armies) return null
            const modifier = territoryModifierMap?.get(territoryId)

            return (
              <div
                key={`army-${territoryId}`}
                className="absolute pointer-events-none"
                style={{
                  left: `${(territory.armyPosition.x / CLASSIC_MAP_WIDTH) * 100}%`,
                  top: `${(territory.armyPosition.y / CLASSIC_MAP_HEIGHT) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div className="flex flex-col items-center gap-1">
                  <div className="bg-white border-2 border-gray-800 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg">
                    {territory.armies}
                  </div>
                  {modifier && (
                    <TerritoryModifierIcon modifier={modifier} size="small" showTooltip={true} />
                  )}
                </div>
              </div>
            )
          })}
        {/* Inline post-conquest transfer overlay */}
        {mapId === 'classic' && (
          <ConquestTransferOverlay
            territories={territories}
            mapWidth={CLASSIC_MAP_WIDTH}
            mapHeight={CLASSIC_MAP_HEIGHT}
          />
        )}
      </div>

      {territoryModifierMap && territoryModifierMap.size > 0 && (
        <TerritoryModifierLegend
          modifiers={territoryModifierMap}
          position="bottom-right"
          collapsible={true}
        />
      )}
    </div>
  )
}
