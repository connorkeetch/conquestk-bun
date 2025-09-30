import type React from 'react'
import { useCallback, useMemo } from 'react'
import { getColorValue, type PlayerColor } from '@/constants/colors'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { useAttackOddsTooltip } from '@/hooks/useAttackOddsTooltip'
import { socketService } from '@/services/socketService'
import { executeAttack } from '@/store/gameActions'
import { selectTargetTerritory, selectTerritory, setPendingAction } from '@/store/gameSlice'
import { setAutoAttacking, setLastPingAt, setOverlay } from '@/store/uiRoomSlice'
import type { GamePlayer } from '@/types/game'
import { arePlayersTeammates } from '@/utils/teamHelpers'
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
  const commit = useAppSelector((s) => s.uiRoom.attackCommit)
  const game = useAppSelector((s) => s.game.currentGame)
  const userId = useAppSelector((s) => s.auth.user?.id)
  const isMyTurn = Boolean(userId && game?.currentPlayer === userId)
  const pings = useAppSelector((s) => s.uiRoom.pings ?? [])
  const lastPingAt = useAppSelector((s) => s.uiRoom.lastPingAt ?? 0)
  const overlays = useAppSelector((s) => s.uiRoom.overlays)
  const myId = useAppSelector((s) => s.auth.user?.id)
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

      const raw = playerColors[territory.owner] ?? '#D1D5DB'
      // Respect colorblind mode setting via getColorValue
      return getColorValue(raw as PlayerColor)
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

  const assumedPending = pendingAction === 'attack' || !!selectedTerritory
  const rawOddsTooltip = useAttackOddsTooltip({
    pendingAction: assumedPending ? 'attack' : null,
    selectedId: selectedTerritory ?? null,
    hoveredId: hoveredTerritory ?? null,
    validTargets,
    territories: classicTerritoriesArray,
    mapWidth: CLASSIC_MAP_WIDTH,
    mapHeight: CLASSIC_MAP_HEIGHT,
  })

  const oddsTooltip = mapId === 'classic' ? rawOddsTooltip : null

  // Swipe to cycle overlays (none -> continents -> attackable -> threat)
  const cycleOverlay = useCallback(
    (dir: 'left' | 'right') => {
      const order = ['none', 'continents', 'attackable', 'threat'] as const
      const current = overlays.continents
        ? 'continents'
        : overlays.attackable
          ? 'attackable'
          : overlays.threat
            ? 'threat'
            : 'none'
      const idx = order.indexOf(current)
      const nextIdx =
        dir === 'left' ? (idx + 1) % order.length : (idx - 1 + order.length) % order.length
      const next = order[nextIdx]
      const setAll = (c: boolean, a: boolean, t: boolean) => {
        dispatchApp(setOverlay({ key: 'continents', value: c }))
        dispatchApp(setOverlay({ key: 'attackable', value: a }))
        dispatchApp(setOverlay({ key: 'threat', value: t }))
      }
      if (next === 'none') setAll(false, false, false)
      else if (next === 'continents') setAll(true, false, false)
      else if (next === 'attackable') setAll(false, true, false)
      else setAll(false, false, true)
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          // subtle haptic on filter change
          ;(navigator as unknown as { vibrate?: (pattern: number | number[]) => void }).vibrate?.(
            10,
          )
        }
      } catch {
        // ignore haptics errors
      }
    },
    [dispatchApp, overlays.attackable, overlays.continents, overlays.threat],
  )

  return (
    <div className="game-board flex-1 relative bg-blue-100 p-4">
      <div className="relative w-full h-full">
        {/* Overlay toggles */}
        <div className="absolute top-2 left-2 z-30 flex items-center gap-2 bg-surface-2/80 backdrop-blur px-2 py-1 rounded border border-border">
          {(() => {
            const haptic = () => {
              try {
                ;(
                  navigator as unknown as { vibrate?: (pattern: number | number[]) => void }
                ).vibrate?.(10)
              } catch {
                // ignore haptics errors
              }
            }
            return (
              <>
                <button
                  type="button"
                  className={`btn btn-ghost btn-xs ${overlays.continents ? 'ring-1 ring-white' : ''}`}
                  onClick={() => {
                    dispatchApp(setOverlay({ key: 'continents', value: !overlays.continents }))
                    haptic()
                  }}
                  title="Toggle sectors overlay (g)"
                >
                  <span aria-hidden>🗺️</span>
                  <span className="hidden sm:inline">Sectors</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost btn-xs ${overlays.attackable ? 'ring-1 ring-white' : ''}`}
                  onClick={() => {
                    dispatchApp(setOverlay({ key: 'attackable', value: !overlays.attackable }))
                    haptic()
                  }}
                  title="Toggle attackable overlay"
                >
                  <span aria-hidden>🎯</span>
                  <span className="hidden sm:inline">Attackable</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-ghost btn-xs ${overlays.threat ? 'ring-1 ring-white' : ''}`}
                  onClick={() => {
                    dispatchApp(setOverlay({ key: 'threat', value: !overlays.threat }))
                    haptic()
                  }}
                  title="Toggle threat overlay (h)"
                >
                  <span aria-hidden>🔥</span>
                  <span className="hidden sm:inline">Threat</span>
                </button>
              </>
            )
          })()}
          {/* Explicit Ping button with simple cooldown */}
          {(() => {
            const now = Date.now()
            const cooldownMs = 2000
            const coolingDown = (lastPingAt ?? 0) > 0 && now - lastPingAt < cooldownMs
            const targetId = selectedTargetTerritory || selectedTerritory || hoveredTerritory
            const disabled = !isMyTurn || !game?.roomId || !targetId || coolingDown
            const label = coolingDown ? 'Ping (cooldown)' : 'Ping'
            return (
              <button
                type="button"
                className={`btn btn-ghost btn-xs ${coolingDown ? 'opacity-60 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (!game?.roomId || !targetId || coolingDown) return
                  try {
                    socketService.emit('ping:territory', {
                      roomId: game.roomId,
                      territoryId: targetId,
                    })
                  } catch {
                    // ignore ping emit errors
                  }
                  dispatchApp(setLastPingAt(now))
                  try {
                    ;(
                      navigator as unknown as { vibrate?: (pattern: number | number[]) => void }
                    ).vibrate?.(15)
                  } catch {
                    // ignore haptics errors
                  }
                }}
                disabled={disabled}
                title={(() => {
                  if (!targetId) return 'Select or hover a territory to ping'
                  const key = targetId as string
                  const name = territories[key]?.name ?? key
                  return `Ping ${name}`
                })()}
              >
                <span aria-hidden>📍</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            )
          })()}
        </div>
        {mapId === 'classic' ? (
          <ResponsiveMapContainer
            mapWidth={CLASSIC_MAP_WIDTH}
            mapHeight={CLASSIC_MAP_HEIGHT}
            showMinimap={true}
            storageKey={`map:${mapId}`}
            focus={focusCoords}
            onSwipeLeft={() => cycleOverlay('left')}
            onSwipeRight={() => cycleOverlay('right')}
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
            {/* Sectors overlay: colored dots per territory */}
            {overlays.continents &&
              (() => {
                // Build deterministic color per continent
                const uniqueContinents = Array.from(
                  new Set(Object.values(territories).map((t) => t.continent || 'unknown')),
                )
                const palette = [
                  '#22c55e',
                  '#06b6d4',
                  '#f59e0b',
                  '#ef4444',
                  '#8b5cf6',
                  '#eab308',
                  '#14b8a6',
                  '#f97316',
                ]
                const cMap = new Map<string, string>(
                  uniqueContinents.map((c, i) => [c, palette[i % palette.length]]),
                )
                return Object.entries(territories).map(([id, t]) => {
                  const color = cMap.get(t.continent) || '#94a3b8'
                  const left = (t.armyPosition.x / CLASSIC_MAP_WIDTH) * 100
                  const top = (t.armyPosition.y / CLASSIC_MAP_HEIGHT) * 100
                  return (
                    <div
                      key={`cont-${id}`}
                      className="absolute z-10 pointer-events-none"
                      style={{
                        left: `${left}%`,
                        top: `${top}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      title={`Sector: ${t.continent}`}
                    >
                      <span
                        className="inline-block w-3 h-3 rounded-full border border-white/60 shadow"
                        style={{ backgroundColor: color }}
                      />
                    </div>
                  )
                })
              })()}
            {/* Attackable overlay: rings for selected + valid targets */}
            {overlays.attackable &&
              selectedTerritory &&
              (() => {
                const src = territories[selectedTerritory]
                const entries: Array<{ x: number; y: number; kind: 'src' | 'tgt'; id: string }> = []
                if (src)
                  entries.push({
                    x: src.armyPosition.x,
                    y: src.armyPosition.y,
                    kind: 'src',
                    id: selectedTerritory,
                  })
                for (const tgt of validTargets) {
                  const t = territories[tgt]
                  if (t)
                    entries.push({
                      x: t.armyPosition.x,
                      y: t.armyPosition.y,
                      kind: 'tgt',
                      id: tgt,
                    })
                }
                return entries.map((e) => (
                  <div
                    key={`atk-${e.id}`}
                    className="absolute z-10 pointer-events-none"
                    style={{
                      left: `${(e.x / CLASSIC_MAP_WIDTH) * 100}%`,
                      top: `${(e.y / CLASSIC_MAP_HEIGHT) * 100}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <span
                      className={`block rounded-full ${e.kind === 'src' ? 'w-12 h-12' : 'w-10 h-10'}`}
                      style={{
                        boxShadow:
                          e.kind === 'src'
                            ? '0 0 0 3px rgba(56,189,248,0.9), 0 0 24px rgba(56,189,248,0.45)'
                            : '0 0 0 3px rgba(239,68,68,0.9), 0 0 24px rgba(239,68,68,0.45)',
                      }}
                    />
                  </div>
                ))
              })()}
            {/* Threat overlay: heat rings on friendly territories proportional to adjacent enemy armies */}
            {overlays.threat &&
              game &&
              myId &&
              (() => {
                const isFriendly = (owner?: string | null) =>
                  owner ? owner === myId || arePlayersTeammates(game, owner, myId) : false
                const items: Array<{ id: string; x: number; y: number; score: number }> = []
                for (const [id, t] of Object.entries(territories)) {
                  if (!isFriendly(t.owner)) continue
                  let s = 0
                  for (const adjId of t.adjacentTerritories || []) {
                    const adj = territories[adjId]
                    if (!adj) continue
                    if (!isFriendly(adj.owner)) s += Math.max(0, adj.armies ?? 0)
                  }
                  if (s > 0) items.push({ id, x: t.armyPosition.x, y: t.armyPosition.y, score: s })
                }
                const max = Math.max(1, ...items.map((i) => i.score))
                const colorFor = (r: number) => {
                  if (r > 0.66) return 'rgba(239,68,68,0.85)'
                  if (r > 0.33) return 'rgba(245,158,11,0.85)'
                  if (r > 0.1) return 'rgba(34,197,94,0.85)'
                  return 'rgba(148,163,184,0.6)'
                }
                return items.map((i) => {
                  const ratio = Math.min(1, i.score / max)
                  const size = 14 + Math.round(10 * ratio)
                  const color = colorFor(ratio)
                  return (
                    <div
                      key={`thr-${i.id}`}
                      className="absolute z-10 pointer-events-none"
                      style={{
                        left: `${(i.x / CLASSIC_MAP_WIDTH) * 100}%`,
                        top: `${(i.y / CLASSIC_MAP_HEIGHT) * 100}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      title={`Threat score: ${i.score}`}
                    >
                      <span
                        className="block rounded-full"
                        style={{
                          width: `${size}px`,
                          height: `${size}px`,
                          boxShadow: `0 0 0 3px ${color}, 0 0 24px ${color}`,
                        }}
                      />
                    </div>
                  )
                })
              })()}
            {/* Sectors legend */}
            {overlays.continents && (
              <div className="absolute bottom-2 right-2 z-30 bg-surface-2/80 backdrop-blur border border-border rounded px-2 py-1 text-xs">
                {(() => {
                  const uniqueContinents = Array.from(
                    new Set(Object.values(territories).map((t) => t.continent || 'unknown')),
                  )
                  const palette = [
                    '#22c55e',
                    '#06b6d4',
                    '#f59e0b',
                    '#ef4444',
                    '#8b5cf6',
                    '#eab308',
                    '#14b8a6',
                    '#f97316',
                  ]
                  const cMap = new Map<string, string>()
                  uniqueContinents.forEach((c, i) => {
                    cMap.set(c, palette[i % palette.length])
                  })
                  return (
                    <div className="flex items-center gap-3 flex-wrap max-w-[320px]">
                      {uniqueContinents.map((c) => (
                        <span key={`legend-${c}`} className="inline-flex items-center gap-1">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full border border-white/60"
                            style={{ backgroundColor: cMap.get(c) || '#94a3b8' }}
                          />
                          <span className="text-white/90 capitalize">{c}</span>
                        </span>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}
            {focusCoords && (
              <output
                className="absolute pointer-events-none z-10"
                style={{
                  left: `${(focusCoords.x / CLASSIC_MAP_WIDTH) * 100}%`,
                  top: `${(focusCoords.y / CLASSIC_MAP_HEIGHT) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                aria-live="polite"
                aria-label={(() => {
                  const focusId = selectedTargetTerritory || selectedTerritory
                  if (!focusId) return 'Focused territory'
                  const name = territories[focusId]?.name ?? focusId
                  return `Focused on ${name}`
                })()}
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
                <div className="rounded bg-surface-2/95 border border-border shadow px-2 py-1 text-xs text-white whitespace-nowrap flex items-center gap-2">
                  <span>{`Odds (${oddsTooltip.att}v${oddsTooltip.def}) · Win ${(oddsTooltip.winChance).toFixed(0)}% · E[Δ] ${oddsTooltip.odds.expected.advantage >= 0 ? '+' : ''}${oddsTooltip.odds.expected.advantage.toFixed(2)}`}</span>
                  {isMyTurn &&
                    selectedTerritory &&
                    validTargets.includes(hoveredTerritory || '') && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs pointer-events-auto"
                        title="Auto-attack this target"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const tgt = hoveredTerritory
                          const src = selectedTerritory
                          if (!tgt || !src) return
                          // Set selection and start auto-attack loop
                          dispatchApp(selectTargetTerritory(tgt))
                          dispatchApp(setPendingAction('attack'))
                          dispatchApp(setAutoAttacking(true))
                          void dispatchApp(
                            executeAttack({
                              fromTerritoryId: src,
                              toTerritoryId: tgt,
                              commitArmies: commit,
                            }),
                          )
                        }}
                      >
                        Auto
                      </button>
                    )}
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
            adjacency={Object.fromEntries(
              territoryEntries.map(([id, t]) => [
                id,
                Array.isArray(t.adjacentTerritories) ? t.adjacentTerritories : [],
              ]),
            )}
          />
        )}

        {mapId === 'classic' &&
          territoryEntries.map(([territoryId, territory]) => {
            if (!territory.armies) return null
            const modifier = territoryModifierMap?.get(territoryId)

            return (
              <div
                key={`army-${territoryId}`}
                className="absolute z-20 pointer-events-none"
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
