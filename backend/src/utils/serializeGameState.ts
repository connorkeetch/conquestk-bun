import type { GameState, GameTerritoryModifier, SerializedGameState } from '../types/game.js'

export const toSerializedGameState = (state: GameState): SerializedGameState => {
  const { territoryModifiers, ...rest } = state
  const base = structuredClone(rest) as SerializedGameState

  if (territoryModifiers instanceof Map) {
    base.territoryModifiers = Object.fromEntries(territoryModifiers.entries()) as Record<
      string,
      GameTerritoryModifier
    >
  } else if (territoryModifiers) {
    base.territoryModifiers = territoryModifiers as Record<string, GameTerritoryModifier>
  }

  return base
}

export const hydrateSerializedGameState = (state: SerializedGameState): GameState => {
  const clone = structuredClone(state) as GameState & {
    territoryModifiers?: Map<string, GameTerritoryModifier> | Record<string, GameTerritoryModifier>
  }
  if (
    clone.territoryModifiers &&
    !(clone.territoryModifiers instanceof Map) &&
    typeof clone.territoryModifiers === 'object'
  ) {
    clone.territoryModifiers = new Map(
      Object.entries(clone.territoryModifiers as Record<string, GameTerritoryModifier>),
    )
  }
  return clone as GameState
}
