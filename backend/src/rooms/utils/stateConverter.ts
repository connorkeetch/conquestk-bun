/**
 * State Converter Utilities
 *
 * Converts between Colyseus Schema state (for sync) and GameEngine state (for logic).
 * Colyseus uses MapSchema/ArraySchema classes, while GameEngine uses plain interfaces.
 */

import type {
  BattleResult as EngineBattleResult,
  GameState as EngineGameState,
} from '../../types/game.js'
import type {
  BattleResult as SchemaBattleResult,
  GameState as SchemaGameState,
} from '../schemas/GameState.js'
import { Card as SchemaCard, Player as SchemaPlayer } from '../schemas/Player.js'
import { Territory as SchemaTerritory } from '../schemas/Territory.js'

/**
 * Apply GameEngine state changes back to Colyseus Schema state
 */
export function applyEngineStateToSchema(
  schemaState: SchemaGameState,
  engineState: EngineGameState,
): void {
  // Update game phase and turn
  schemaState.phase = engineState.phase
  schemaState.currentPlayerId = engineState.currentPlayer
  schemaState.turn = engineState.turn
  schemaState.version = engineState.version ?? schemaState.version + 1

  // Update territories
  for (const engineTerritory of engineState.board) {
    let schemaTerritory = schemaState.territories.get(engineTerritory.id)

    if (!schemaTerritory) {
      // Create new territory if doesn't exist
      schemaTerritory = new SchemaTerritory()
      schemaTerritory.id = engineTerritory.id
      schemaTerritory.name = engineTerritory.name
      schemaTerritory.sector = engineTerritory.sector
      schemaState.territories.set(engineTerritory.id, schemaTerritory)
    }

    schemaTerritory.ownerId = engineTerritory.ownerId || ''
    schemaTerritory.armies = engineTerritory.armies
    schemaTerritory.hasCapital = engineTerritory.isCapital || false

    if (engineTerritory.coordinates) {
      schemaTerritory.armyPositionX = engineTerritory.coordinates.x
      schemaTerritory.armyPositionY = engineTerritory.coordinates.y
    }
  }

  // Update players
  for (const enginePlayer of engineState.players) {
    let schemaPlayer = schemaState.players.get(enginePlayer.id)

    if (!schemaPlayer) {
      // Create new player if doesn't exist
      schemaPlayer = new SchemaPlayer()
      schemaPlayer.oderId = enginePlayer.id
      schemaState.players.set(enginePlayer.id, schemaPlayer)
    }

    schemaPlayer.username = enginePlayer.username
    schemaPlayer.color = enginePlayer.color
    schemaPlayer.reinforcementArmies = enginePlayer.armies
    schemaPlayer.isEliminated = enginePlayer.isEliminated
    schemaPlayer.teamId = enginePlayer.teamId ?? 0
    schemaPlayer.isAi = enginePlayer.isAi ?? false
    schemaPlayer.aiDifficulty = enginePlayer.aiDifficulty || ''

    // Update cards
    schemaPlayer.cards.clear()
    for (const card of enginePlayer.cards) {
      const schemaCard = new SchemaCard()
      schemaCard.id = card.id
      schemaCard.cardType = card.type
      schemaCard.territoryId = card.territory || ''
      schemaPlayer.cards.push(schemaCard)
    }
  }

  // Check for winner
  const activePlayers = engineState.players.filter((p) => !p.isEliminated)
  if (activePlayers.length === 1) {
    schemaState.winnerId = activePlayers[0].id
    schemaState.phase = 'finished'
  }
}

/**
 * Convert a GameEngine BattleResult to Colyseus Schema BattleResult
 */
export function engineBattleResultToSchema(
  engineResult: EngineBattleResult,
  schemaBattle: SchemaBattleResult,
): void {
  schemaBattle.attackerId = engineResult.attackerPlayerId || ''
  schemaBattle.defenderId = engineResult.defenderPlayerId || ''
  schemaBattle.fromTerritoryId = engineResult.fromTerritory.id
  schemaBattle.toTerritoryId = engineResult.toTerritory.id

  schemaBattle.attackerDice.clear()
  for (const die of engineResult.attackerDice) {
    schemaBattle.attackerDice.push(die)
  }

  schemaBattle.defenderDice.clear()
  for (const die of engineResult.defenderDice) {
    schemaBattle.defenderDice.push(die)
  }

  schemaBattle.attackerLosses = engineResult.attackerLosses
  schemaBattle.defenderLosses = engineResult.defenderLosses
  schemaBattle.conquered = engineResult.conquered
}
