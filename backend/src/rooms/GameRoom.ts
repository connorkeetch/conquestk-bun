/**
 * GameRoom - Colyseus room for ConquestK game sessions
 *
 * Handles:
 * - Player join/leave lifecycle
 * - Game actions (deploy, attack, fortify, etc.)
 * - AI player turns
 * - Turn timer management
 * - Frame persistence for replay
 */

import { Room, type Client } from 'colyseus'
import { GameState, Player, Territory, BattleResult } from './schemas/index.js'
import { logger } from '../utils/logger.js'
import { GameEngine } from '../game/gameEngine.js'
import { query } from '../config/database.js'
import {
  applyEngineStateToSchema,
  engineBattleResultToSchema,
} from './utils/stateConverter.js'
import type {
  GameState as EngineGameState,
  GameConfiguration,
  Territory as EngineTerritory,
} from '../types/game.js'

// Type for raw map data from database
interface MapTerritoryData {
  id: string
  name: string
  sector?: string
  continentId?: string
  armyPosition?: { x: number; y: number }
  adjacentTerritories?: string[]
}

interface MapSectorData {
  id: string
  name: string
  bonus?: number
  armyBonus?: number
}

interface MapDatabaseData {
  territories?: MapTerritoryData[]
  continents?: MapSectorData[]
  sectors?: MapSectorData[]
}

// Action types from the game engine
export type GameAction =
  | { type: 'deploy'; territoryId: string; armies: number }
  | { type: 'attack'; from: string; to: string; dice: number }
  | { type: 'fortify'; from: string; to: string; armies: number }
  | { type: 'transfer_conquest'; armies: number }
  | { type: 'end_turn' }
  | { type: 'trade_cards'; cardIds: string[] }
  | { type: 'undo_fortify' }
  | { type: 'go_back_to_reinforcement' }
  | { type: 'go_back_to_attack' }

interface RoomOptions {
  roomId: string
  mapId: string
  hostId: string
  maxPlayers?: number
  gameMode?: string
  fogOfWar?: boolean
  turnTimerSeconds?: number
  teamMode?: boolean
  numberOfTeams?: number
}

interface JoinOptions {
  token?: string
  oderId: string
  username: string
  spectate?: boolean
  color?: string
  teamId?: number
}

interface ClientUserData {
  playerId: string
  username: string
  isSpectator: boolean
  isHost: boolean
}

export class GameRoom extends Room<GameState> {
  // Game engine for processing actions (deterministic, stateless)
  private engine: GameEngine = new GameEngine()

  // Current engine state (kept in sync with schema state)
  private engineState: EngineGameState | null = null

  // Frame sequence for replay persistence
  private frameSeq: number = 0

  // AI processing throttle
  private lastAiActionTime: number = 0
  private readonly AI_ACTION_DELAY = 1500 // ms between AI actions

  // Map data (loaded once)
  private mapData: {
    territories: Array<{
      id: string
      name: string
      sector: string
      armyPosition: { x: number; y: number }
      adjacentTerritories: string[]
    }>
    adjacencies: Array<{ from: string; to: string }>
    sectors: Array<{ id: string; name: string; bonus: number }>
  } | null = null

  onCreate(options: RoomOptions) {
    logger.info('GameRoom created', { roomId: options.roomId, mapId: options.mapId })

    // Initialize game state
    this.setState(new GameState())
    this.state.roomId = options.roomId
    this.state.mapId = options.mapId
    this.state.gameMode = options.gameMode || 'classic'
    this.state.fogOfWar = options.fogOfWar || false
    this.state.turnTimerSeconds = options.turnTimerSeconds || 86400
    this.state.teamMode = options.teamMode || false
    this.state.numberOfTeams = options.numberOfTeams || 0

    // Register message handlers
    this.onMessage('action', this.handleAction.bind(this))
    this.onMessage('chat', this.handleChat.bind(this))
    this.onMessage('ready', this.handleReady.bind(this))
    this.onMessage('start-game', this.handleStartGame.bind(this))
    this.onMessage('ping-territory', this.handlePingTerritory.bind(this))

    // Set tick rate for turn timer and AI processing (1 second)
    this.setSimulationInterval(() => this.tick(), 1000)

    // Load map data asynchronously
    this.loadMapData(options.mapId)
  }

  async onAuth(client: Client, options: JoinOptions): Promise<ClientUserData> {
    // TODO: Validate JWT token
    // For now, trust the provided userId
    logger.info('Client authenticating', { oderId: options.oderId })

    return {
      playerId: options.oderId,
      username: options.username,
      isSpectator: options.spectate || false,
      isHost: this.state.players.size === 0, // First player is host
    }
  }

  onJoin(client: Client, options: JoinOptions) {
    const userData = client.userData as ClientUserData
    logger.info('Client joined', {
      playerId: userData.playerId,
      username: userData.username,
      isSpectator: userData.isSpectator,
    })

    if (userData.isSpectator) {
      // Spectator logic
      if (this.state.fogOfWar) {
        client.send('spectator-blocked', {
          message: 'Spectating is disabled for fog-of-war games',
        })
      }
      return
    }

    // Check if player already exists (reconnecting)
    const existingPlayer = this.state.players.get(userData.playerId)
    if (existingPlayer) {
      existingPlayer.isConnected = true
      logger.info('Player reconnected', { playerId: userData.playerId })
      return
    }

    // Check max players
    const activePlayers = Array.from(this.state.players.values()).filter(
      (p) => !p.isEliminated
    )
    if (activePlayers.length >= 8) {
      // Max 8 players
      client.send('error', { message: 'Game is full' })
      client.leave()
      return
    }

    // Add new player
    const player = new Player()
    player.oderId = userData.playerId
    player.username = userData.username
    player.color = options.color || this.getNextAvailableColor()
    player.teamId = options.teamId || 0
    player.playerOrder = this.state.players.size
    player.isConnected = true
    this.state.players.set(userData.playerId, player)

    // Broadcast player joined
    this.broadcast('player-joined', {
      oderId: userData.playerId,
      username: userData.username,
      color: player.color,
    })
  }

  onLeave(client: Client, consented: boolean) {
    const userData = client.userData as ClientUserData
    logger.info('Client left', {
      playerId: userData.playerId,
      consented,
    })

    if (userData.isSpectator) return

    const player = this.state.players.get(userData.playerId)
    if (!player) return

    player.isConnected = false

    // If game hasn't started, remove the player
    if (this.state.phase === 'lobby') {
      this.state.players.delete(userData.playerId)
      this.broadcast('player-left', { oderId: userData.playerId })
      return
    }

    // If consented (intentional leave), handle as abandoned
    if (consented && this.state.phase !== 'finished') {
      // TODO: Start disconnect timer or convert to AI
      logger.info('Player abandoned game', { playerId: userData.playerId })
    }

    // Broadcast disconnection
    this.broadcast('player-disconnected', { oderId: userData.playerId })
  }

  private async handleAction(client: Client, action: GameAction) {
    const userData = client.userData as ClientUserData
    const playerId = userData.playerId

    // Spectators can't take actions
    if (userData.isSpectator) {
      client.send('error', { message: 'Spectators cannot take actions' })
      return
    }

    // Validate it's this player's turn (except for certain actions)
    if (this.state.currentPlayerId !== playerId) {
      const allowedOffTurn = ['resign']
      if (!allowedOffTurn.includes(action.type)) {
        client.send('error', { message: 'Not your turn' })
        return
      }
    }

    // Process the action
    try {
      const result = await this.processAction(playerId, action)

      if (!result.success) {
        client.send('error', { message: result.error })
        return
      }

      // Update state version
      this.state.version++

      // Persist frame for replay
      await this.persistFrame(action, result)

      // Acknowledge action
      client.send('action-ack', {
        seq: this.frameSeq,
        success: true,
        version: this.state.version,
      })

    } catch (error) {
      logger.error('Action processing error', { error, action, playerId })
      client.send('error', {
        message: error instanceof Error ? error.message : 'Action failed',
      })
    }
  }

  private async processAction(
    playerId: string,
    action: GameAction
  ): Promise<{ success: boolean; error?: string; battleResult?: BattleResult }> {
    // Ensure we have engine state initialized
    if (!this.engineState) {
      return { success: false, error: 'Game not initialized' }
    }

    try {
      // Build the engine-compatible action
      const engineAction = this.buildEngineAction(playerId, action)

      // Validate action first
      if (!this.engine.validateAction(this.engineState, engineAction)) {
        return { success: false, error: `Invalid action: ${action.type}` }
      }

      // Process through the deterministic engine
      const result = await this.engine.processAction(this.engineState, engineAction)

      // Update our cached engine state
      this.engineState = result.gameState

      // Apply engine state changes back to Colyseus Schema state
      applyEngineStateToSchema(this.state, result.gameState)

      // Handle battle result if present
      let schemaBattleResult: BattleResult | undefined
      if (result.battleResult) {
        schemaBattleResult = new BattleResult()
        engineBattleResultToSchema(result.battleResult, schemaBattleResult)
        this.state.lastBattle = schemaBattleResult

        // Check for eliminations
        if (result.battleResult.eliminatedPlayers) {
          for (const eliminatedId of result.battleResult.eliminatedPlayers) {
            const player = this.state.players.get(eliminatedId)
            if (player) {
              player.isEliminated = true
              player.eliminationReason = 'defeated'
              this.broadcast('player-eliminated', {
                oderId: eliminatedId,
                reason: 'defeated',
              })
            }
          }
        }

        // Check for game end
        if (result.battleResult.gameEnded && result.battleResult.winner) {
          this.state.winnerId = result.battleResult.winner.id
          this.state.phase = 'finished'
          this.broadcast('game-finished', {
            winnerId: result.battleResult.winner.id,
            winnerUsername: result.battleResult.winner.username,
          })
        }
      }

      // Update turn timer if turn changed
      if (this.state.phase === 'reinforcement' && action.type === 'end_turn') {
        this.state.turnStartedAt = Date.now()
        this.state.turnExpiresAt = Date.now() + this.state.turnTimerSeconds * 1000
      }

      logger.info('Action processed via GameEngine', {
        playerId,
        actionType: action.type,
        newPhase: this.state.phase,
        version: this.state.version,
      })

      return { success: true, battleResult: schemaBattleResult }

    } catch (error) {
      logger.error('GameEngine action processing failed', { error, action, playerId })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Action processing failed',
      }
    }
  }

  /**
   * Build an engine-compatible action from the simplified room action format
   */
  private buildEngineAction(playerId: string, action: GameAction): import('../types/game.js').GameAction {
    const base = { roomId: this.state.roomId, playerId }

    switch (action.type) {
      case 'deploy':
        return {
          ...base,
          type: 'deploy',
          payload: { territoryId: action.territoryId, armies: action.armies },
        }
      case 'attack':
        return {
          ...base,
          type: 'attack',
          payload: {
            fromTerritoryId: action.from,
            toTerritoryId: action.to,
            armies: action.dice,
          },
        }
      case 'fortify':
        return {
          ...base,
          type: 'fortify',
          payload: {
            fromTerritoryId: action.from,
            toTerritoryId: action.to,
            armies: action.armies,
          },
        }
      case 'transfer_conquest': {
        // Get from/to from the last battle result
        const lastBattle = this.state.lastBattle
        if (!lastBattle) {
          throw new Error('No conquest to transfer armies to')
        }
        return {
          ...base,
          type: 'transfer_conquest',
          payload: {
            fromTerritoryId: lastBattle.fromTerritoryId,
            toTerritoryId: lastBattle.toTerritoryId,
            armies: action.armies,
          },
        }
      }
      case 'end_turn':
        return { ...base, type: 'end_turn' }
      case 'trade_cards':
        return {
          ...base,
          type: 'trade_cards',
          payload: action.cardIds ? { cards: action.cardIds } : undefined,
        }
      case 'undo_fortify':
        return { ...base, type: 'undo_fortify' }
      case 'go_back_to_reinforcement':
        return { ...base, type: 'go_back_to_reinforcement' }
      case 'go_back_to_attack':
        return { ...base, type: 'go_back_to_attack' }
      default:
        throw new Error(`Unknown action type: ${(action as GameAction).type}`)
    }
  }

  // Note: All game action processing is now delegated to GameEngine via processAction()
  // Old stub methods (processDeploy, processAttack, processFortify, processEndTurn,
  // processTransferConquest) have been removed in favor of the deterministic engine.

  private handleChat(client: Client, message: { text: string }) {
    const userData = client.userData as ClientUserData

    this.broadcast('chat', {
      oderId: userData.playerId,
      username: userData.username,
      text: message.text,
      timestamp: Date.now(),
    })
  }

  private handleReady(client: Client) {
    const userData = client.userData as ClientUserData
    const player = this.state.players.get(userData.playerId)

    if (player && this.state.phase === 'lobby') {
      player.isReady = !player.isReady

      this.broadcast('player-ready', {
        oderId: userData.playerId,
        isReady: player.isReady,
      })
    }
  }

  private async handleStartGame(client: Client) {
    const userData = client.userData as ClientUserData

    // Only host can start the game
    if (!userData.isHost) {
      client.send('error', { message: 'Only the host can start the game' })
      return
    }

    if (this.state.phase !== 'lobby') {
      client.send('error', { message: 'Game has already started' })
      return
    }

    // Check minimum players
    if (this.state.players.size < 2) {
      client.send('error', { message: 'Need at least 2 players to start' })
      return
    }

    // Check all players ready
    const allReady = Array.from(this.state.players.values()).every((p) => p.isReady)
    if (!allReady) {
      client.send('error', { message: 'Not all players are ready' })
      return
    }

    // Initialize game
    await this.initializeGame()
  }

  private handlePingTerritory(client: Client, data: { territoryId: string }) {
    const userData = client.userData as ClientUserData

    this.broadcast('ping-territory', {
      oderId: userData.playerId,
      username: userData.username,
      territoryId: data.territoryId,
      timestamp: Date.now(),
    })
  }

  private tick() {
    if (this.state.phase === 'finished' || this.state.phase === 'lobby') {
      return
    }

    // Check turn timer
    if (this.state.turnExpiresAt && Date.now() > this.state.turnExpiresAt) {
      this.handleTurnTimeout()
    }

    // Process AI turn if current player is AI
    const currentPlayer = this.state.players.get(this.state.currentPlayerId)
    if (currentPlayer?.isAi) {
      this.processAiTurn(currentPlayer)
    }
  }

  private async handleTurnTimeout() {
    const currentPlayer = this.state.players.get(this.state.currentPlayerId)
    if (!currentPlayer) return

    logger.info('Turn timeout', { playerId: this.state.currentPlayerId })

    // TODO: Implement time bank logic
    // For now, auto-end turn via engine
    await this.processAction(this.state.currentPlayerId, { type: 'end_turn' })
  }

  private async processAiTurn(aiPlayer: Player) {
    // Throttle AI actions
    const now = Date.now()
    if (now - this.lastAiActionTime < this.AI_ACTION_DELAY) {
      return
    }
    this.lastAiActionTime = now

    // TODO: Implement actual AI decision making using AI service
    // For now, just end turn
    logger.info('AI turn processing', { playerId: aiPlayer.oderId })

    // Simple AI: end turn if nothing to do
    if (this.state.phase === 'attack' || this.state.phase === 'fortify') {
      await this.processAction(aiPlayer.oderId, { type: 'end_turn' })
    }
  }

  private async loadMapData(mapId: string) {
    logger.info('Loading map data from database', { mapId })

    try {
      // Load map from database
      const mapResult = await query(
        `SELECT id, name, data FROM maps WHERE id = $1`,
        [mapId]
      )

      if (mapResult.rows.length === 0) {
        logger.error('Map not found', { mapId })
        return
      }

      const mapRow = mapResult.rows[0]
      const mapData: MapDatabaseData = typeof mapRow.data === 'string'
        ? JSON.parse(mapRow.data)
        : mapRow.data

      // Extract territories with adjacencies
      const territories = (mapData.territories || []).map((t: MapTerritoryData) => ({
        id: t.id,
        name: t.name,
        sector: t.sector || t.continentId || '',
        armyPosition: t.armyPosition || { x: 0, y: 0 },
        adjacentTerritories: t.adjacentTerritories || [],
      }))

      // Build adjacencies from territory data
      const adjacencies: Array<{ from: string; to: string }> = []
      for (const t of territories) {
        for (const adjId of t.adjacentTerritories) {
          // Only add one direction to avoid duplicates
          if (t.id < adjId) {
            adjacencies.push({ from: t.id, to: adjId })
          }
        }
      }

      // Extract sector bonuses
      const sectors = (mapData.continents || mapData.sectors || []).map((s: MapSectorData) => ({
        id: s.id,
        name: s.name,
        bonus: s.bonus || s.armyBonus || 0,
      }))

      this.mapData = { territories, adjacencies, sectors }

      // Set adjacencies on the schema state for validation
      this.state.setAdjacencies(adjacencies)

      logger.info('Map data loaded', {
        mapId,
        territories: territories.length,
        adjacencies: adjacencies.length,
        sectors: sectors.length,
      })

    } catch (error) {
      logger.error('Failed to load map data', { mapId, error })
      this.mapData = null
    }
  }

  private async initializeGame() {
    if (!this.mapData || this.mapData.territories.length === 0) {
      logger.error('Cannot initialize game: map data not loaded')
      this.broadcast('error', { message: 'Failed to load map data' })
      return
    }

    logger.info('Initializing game via GameEngine')

    try {
      // Build player configs for the engine (uses userId, not oderId)
      const playerConfigs = Array.from(this.state.players.values()).map((player) => ({
        userId: player.oderId,
        username: player.username,
        teamId: player.teamId || null,
        isAi: player.isAi,
        aiDifficulty: player.aiDifficulty as 'recruit' | 'commander' | 'grandmaster' | null || null,
        color: player.color,
      }))

      // Build sector bonuses with correct type shape (SectorBonus interface)
      const mapTerritories = this.mapData.territories
      const sectorBonuses = this.mapData.sectors.map((s) => {
        // Get territories in this sector
        const sectorTerritories = mapTerritories
          .filter((t) => t.sector === s.id)
          .map((t) => t.id)
        return {
          id: s.id,
          name: s.name,
          bonusArmies: s.bonus,
          territories: sectorTerritories,
        }
      })

      // Build game configuration
      const gameConfig: GameConfiguration = {
        movementType: 'classic_adjacent',
        maxPlayers: 8,
        mapId: this.state.mapId,
        gameMode: this.state.gameMode,
        allowTeamPlay: this.state.teamMode,
        numberOfTeams: this.state.numberOfTeams || null,
        fogOfWar: this.state.fogOfWar ? 'adjacent' : 'off',
        sectorBonuses,
      }

      // Build map overrides for the engine
      const mapOverrides = {
        territories: this.mapData.territories.map((t) => ({
          id: t.id,
          name: t.name,
          sector: t.sector,
          ownerId: null,
          armies: 0,
          adjacentTerritories: t.adjacentTerritories,
          coordinates: t.armyPosition,
        })) as EngineTerritory[],
        sectorBonuses,
      }

      // Initialize game through the engine
      this.engineState = this.engine.initializeGame(
        this.state.roomId,
        playerConfigs,
        gameConfig,
        mapOverrides
      )

      // Apply engine state to Colyseus Schema state
      applyEngineStateToSchema(this.state, this.engineState)

      // Initialize territories in schema from engine state
      for (const territory of this.engineState.board) {
        const schemaTerritory = new Territory()
        schemaTerritory.id = territory.id
        schemaTerritory.name = territory.name
        schemaTerritory.sector = territory.sector
        schemaTerritory.ownerId = territory.ownerId || ''
        schemaTerritory.armies = territory.armies
        schemaTerritory.hasCapital = territory.isCapital || false
        if (territory.coordinates) {
          schemaTerritory.armyPositionX = territory.coordinates.x
          schemaTerritory.armyPositionY = territory.coordinates.y
        }
        this.state.territories.set(territory.id, schemaTerritory)
      }

      // Update player order from engine
      for (let i = 0; i < this.engineState.players.length; i++) {
        const enginePlayer = this.engineState.players[i]
        const schemaPlayer = this.state.players.get(enginePlayer.id)
        if (schemaPlayer) {
          schemaPlayer.playerOrder = i
          schemaPlayer.reinforcementArmies = enginePlayer.armies
        }
      }

      // Set timestamps
      this.state.gameStartedAt = Date.now()
      this.state.turnStartedAt = Date.now()
      this.state.turnExpiresAt = Date.now() + this.state.turnTimerSeconds * 1000

      logger.info('Game initialized via GameEngine', {
        roomId: this.state.roomId,
        firstPlayer: this.state.currentPlayerId,
        turn: this.state.turn,
        phase: this.state.phase,
        territories: this.engineState.board.length,
        players: this.engineState.players.length,
      })

      // Broadcast game started
      this.broadcast('game-started', {
        roomId: this.state.roomId,
        firstPlayer: this.state.currentPlayerId,
        turn: this.state.turn,
      })

    } catch (error) {
      logger.error('Failed to initialize game via GameEngine', { error })
      this.broadcast('error', {
        message: error instanceof Error ? error.message : 'Failed to initialize game',
      })
    }
  }

  private async persistFrame(action: GameAction, result: { success: boolean }) {
    this.frameSeq++

    // TODO: Persist to match_frames table
    logger.debug('Frame persisted', {
      roomId: this.state.roomId,
      seq: this.frameSeq,
      action: action.type,
    })
  }

  // Note: checkElimination, checkGameEnd, calculateReinforcements, and rollDice
  // are now handled by the GameEngine. Battle results include elimination info.

  private getNextAvailableColor(): string {
    const colors = [
      '#ff0000', // Red
      '#0000ff', // Blue
      '#00ff00', // Green
      '#ffff00', // Yellow
      '#ff00ff', // Magenta
      '#00ffff', // Cyan
      '#ff8800', // Orange
      '#8800ff', // Purple
    ]

    const usedColors = Array.from(this.state.players.values()).map((p) => p.color)
    return colors.find((c) => !usedColors.includes(c)) || colors[0]
  }

  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[array[i], array[j]] = [array[j], array[i]]
    }
    return array
  }
}
