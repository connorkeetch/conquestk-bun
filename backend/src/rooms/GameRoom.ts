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

import { computeChecksum } from '@conquestk/shared/lockstep'
import { type Client, Room } from 'colyseus'
import { query } from '../config/database.js'
import { GameEngine } from '../game/gameEngine.js'
import { gameStateCache } from '../services/cacheService.js'
import { GameService } from '../services/gameService.js'
import { mapService } from '../services/mapService.js'
import type {
  GameAction as EngineGameAction,
  GameState as EngineGameState,
  Territory as EngineTerritory,
  GameConfiguration,
} from '../types/game.js'
import { verifyJwtWithAnySecret } from '../utils/jwtHelpers.js'
import { logger } from '../utils/logger.js'
import { BattleResult, GameState, Player, Territory } from './schemas/index.js'
import { applyEngineStateToSchema, engineBattleResultToSchema } from './utils/stateConverter.js'

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
  gameId?: string
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

  // Authoritative gameplay service. handleAction() is the single WS entry point for
  // gameplay and delegates the read-modify-write to gameService.processGameAction
  // (cache → validate → engine → persist cache+DB → bump version), reusing the proven
  // REST/cache logic instead of duplicating engine ownership in the room. The in-room
  // engineState/processAction/persistFrame path below is legacy/dormant pending the
  // later schema-driven cutover (it is only reached by the unused 'start-game'/AI/timeout
  // paths today). GameService is stateless — it operates on roomId/userId/action.
  private gameService = new GameService()

  // Serializes authoritative action processing per room. Colyseus onMessage handlers
  // are async and interleave at await points, so two rapid actions could both read
  // version N from the cache and both write N+1 (lost update). Chaining every
  // processGameAction through this promise guarantees one-at-a-time read-modify-write.
  private actionQueue: Promise<unknown> = Promise.resolve()

  // Current engine state (kept in sync with schema state)
  private engineState: EngineGameState | null = null

  // Frame sequence for replay persistence
  private frameSeq: number = 0

  // Last authoritative (REST/cache) state version we broadcast a nudge for.
  // -1 = not yet seeded. See broadcastStateChangeIfAdvanced().
  private lastBroadcastCacheVersion: number = -1

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
    const resolvedRoomId = options.roomId || options.gameId
    if (!resolvedRoomId) {
      logger.error('GameRoom created without roomId', { mapId: options.mapId })
    }
    this.state.roomId = resolvedRoomId || ''
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
    // Verify the JWT and derive identity FROM the verified token — NEVER trust the
    // client-supplied options.oderId. The room and its 'action' handler are registered
    // unconditionally (server.ts), and handleAction now delegates to the authoritative
    // gameService.processGameAction, so without this a non-browser WS client could join
    // with a spoofed oderId and commit moves as whichever player's turn it is
    // (COLYSEUS_AUTHORITATIVE only gates the legitimate browser's SEND, not this server
    // handler). JWT verification + the engine's currentPlayer check together close that
    // hole: an action only commits for the verified user, and only on their own turn.
    let verifiedUserId: string
    try {
      const { payload } = verifyJwtWithAnySecret<{ userId?: string }>(options.token ?? '')
      if (!payload || typeof payload.userId !== 'string' || !payload.userId) {
        throw new Error('Invalid token payload')
      }
      verifiedUserId = payload.userId
    } catch (error) {
      logger.warn('GameRoom auth rejected: invalid or missing token', {
        hasToken: !!options.token,
        error: error instanceof Error ? error.message : error,
      })
      throw new Error('Authentication required')
    }

    if (!options.username) {
      throw new Error('Missing username')
    }

    const userData: ClientUserData = {
      playerId: verifiedUserId,
      username: options.username,
      isSpectator: options.spectate || false,
      isHost: this.state.players.size === 0, // First player is host
    }

    // Colyseus assigns the onAuth return value to `client.auth`, NOT `client.userData`
    // (see @colyseus/core Room.js: `client.auth = await this.onAuth(...)`). onJoin,
    // onLeave and handleAction all read `client.userData`, so we must populate it
    // explicitly here — otherwise every join fails with "Client userData is undefined
    // in onJoin" and the client is kicked (ServerError 1000). This is required for the
    // authoritative room to accept players at all.
    client.userData = userData

    logger.info('Auth successful', { userData })
    return userData
  }

  onJoin(client: Client, options: JoinOptions) {
    const userData = client.userData as ClientUserData

    if (!userData) {
      logger.error('Client userData is undefined in onJoin', { clientId: client.sessionId, options })
      client.send('error', { message: 'Authentication failed' })
      client.leave()
      return
    }

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
    const activePlayers = Array.from(this.state.players.values()).filter((p) => !p.isEliminated)
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

  /**
   * Serialize a unit of authoritative work so concurrent WS messages can't interleave
   * a cache read-modify-write. Each task waits for the previous to settle; the returned
   * promise carries the task's real result/rejection, while the internal chain tail is
   * kept non-rejecting so one failure doesn't poison subsequent actions.
   */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.actionQueue.then(() => task())
    this.actionQueue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  /**
   * Authoritative WS gameplay entry point (the 'action' message). The room is the
   * single authoritative writer: it normalizes identity server-side (never trusting the
   * client's roomId/playerId), delegates the state mutation to the proven, HTTP-free
   * gameService.processGameAction, and on commit immediately broadcasts a 'state:changed'
   * nudge so every client refetches the fog-redacted board via REST (no manual refresh,
   * no 1s tick latency, no fog leak). Turn-ownership is enforced authoritatively inside
   * processGameAction.isValidAction against the cached state — NOT against the schema's
   * currentPlayerId, which is not advanced on this delegating path.
   *
   * Note: while COLYSEUS_AUTHORITATIVE is false on the client, no browser sends this
   * message, so this handler is dormant in production; it is exercised by the headless
   * prototype and becomes live at the gated flip.
   */
  private async handleAction(client: Client, action: EngineGameAction) {
    const userData = client.userData as ClientUserData
    const playerId = userData.playerId

    // Spectators can't take actions
    if (userData.isSpectator) {
      client.send('error', { message: 'Spectators cannot take actions' })
      return
    }

    if (!this.state.roomId) {
      client.send('error', { message: 'Game not ready' })
      return
    }

    // Server-authoritative identity: ignore any roomId/playerId the client supplied.
    const normalized = {
      ...action,
      roomId: this.state.roomId,
      playerId,
    } as EngineGameAction

    try {
      const updated = await this.enqueue(() =>
        this.gameService.processGameAction(normalized, playerId),
      )

      // Push the live-update nudge immediately on commit. Record the version we just
      // broadcast so the tick-poll fallback (broadcastStateChangeIfAdvanced) doesn't
      // emit a duplicate nudge for the same advance.
      const version = typeof updated.version === 'number' ? updated.version : undefined
      if (typeof version === 'number' && version > this.lastBroadcastCacheVersion) {
        this.lastBroadcastCacheVersion = version
      }
      this.broadcast('state:changed', version !== undefined ? { version } : {})

      client.send('action-ack', { success: true, version })
    } catch (error) {
      logger.warn('WS action failed', {
        roomId: this.state.roomId,
        playerId,
        actionType: (action as { type?: string })?.type,
        error: error instanceof Error ? error.message : error,
      })
      client.send('error', {
        message: error instanceof Error ? error.message : 'Action failed',
      })
    }
  }

  private async processAction(
    playerId: string,
    action: GameAction,
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

      // Persist frame for replay system
      await this.persistFrame(playerId, action, result.gameState)

      logger.info('Action processed via GameEngine', {
        playerId,
        actionType: action.type,
        newPhase: this.state.phase,
        version: this.state.version,
        frameSeq: this.frameSeq,
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
   * Persist a frame to the database and broadcast to clients
   * Frames are the core of the lockstep replay system
   */
  private async persistFrame(
    playerId: string,
    action: GameAction,
    engineState: EngineGameState,
  ): Promise<void> {
    // Increment frame sequence
    this.frameSeq++
    const seq = this.frameSeq

    // Compute checksum for verification
    const checksum = computeChecksum(engineState)

    // Format command for storage
    const commands = [{ kind: action.type, payload: action }]

    try {
      // Persist frame to match_frames table
      await query(
        `INSERT INTO match_frames (match_id, seq, player_id, commands, committed_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [this.state.roomId, seq, playerId, JSON.stringify(commands)],
      )

      // Persist checksum to match_checksums table
      await query(
        `INSERT INTO match_checksums (match_id, seq, crc32, computed_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (match_id, seq) DO UPDATE SET crc32 = $3, computed_at = NOW()`,
        [this.state.roomId, seq, checksum],
      )

      // Broadcast frame-committed event to all clients
      this.broadcast('frame-committed', {
        seq,
        playerId,
        action: { kind: action.type, payload: action },
        checksum,
        version: engineState.version,
      })

      logger.debug('Frame persisted', {
        roomId: this.state.roomId,
        seq,
        playerId,
        actionType: action.type,
        checksum,
      })
    } catch (error) {
      // Log error but don't fail the action - frame persistence is non-critical
      logger.error('Failed to persist frame', {
        roomId: this.state.roomId,
        seq,
        playerId,
        error: error instanceof Error ? error.message : error,
      })
    }
  }

  /**
   * Build an engine-compatible action from the simplified room action format
   */
  private buildEngineAction(
    playerId: string,
    action: GameAction,
  ): import('../types/game.js').GameAction {
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
    // Live-update bridge: while gameplay still runs on the REST/cache engine, nudge
    // all joined clients to refetch whenever the authoritative cache state advances.
    // Runs regardless of this room's own (currently uninitialized) phase, which is
    // why it precedes the lobby/finished early-return below.
    void this.broadcastStateChangeIfAdvanced()

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

  /**
   * Poll the authoritative game-state cache (written by the REST action path) and
   * broadcast a 'state:changed' nudge to all joined clients when its version
   * advances. Clients respond by refetching via fetchGameState — giving real-time
   * updates without a manual refresh, while gameplay stays on the proven REST/cache
   * engine. The first observation only seeds the baseline (no broadcast); clients
   * load initial state via their own fetchGameState on mount.
   */
  private async broadcastStateChangeIfAdvanced(): Promise<void> {
    if (!this.state.roomId) return
    try {
      const cached = await gameStateCache.getGameState<{ version?: number }>(this.state.roomId)
      const version = cached?.version
      if (typeof version !== 'number') return

      // Broadcast on ANY advance above the highest version we've already nudged for —
      // including the FIRST observation after room (re)creation. The previous code
      // treated the first observation as "seed only, don't broadcast", which swallowed
      // the nudge for a client that mounted (and fetched vN) just before an action
      // advanced the cache to vN+1, leaving it on stale state until the next advance.
      // `lastBroadcastCacheVersion` is a best-effort, monotonic de-dup hint shared with
      // handleAction; it is intentionally NOT routed through the action queue, so the
      // worst case under interleaving is one redundant (idempotent) nudge — never a
      // missed nudge or lost state (the poll never writes game state).
      if (version > this.lastBroadcastCacheVersion) {
        this.lastBroadcastCacheVersion = version
        this.broadcast('state:changed', { version })
      }
    } catch (error) {
      logger.debug('State-change nudge poll failed', {
        roomId: this.state.roomId,
        error: error instanceof Error ? error.message : error,
      })
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
      const map = await mapService.getMapWithFullData(mapId)

      if (!map) {
        logger.error('Map not found', { mapId })
        return
      }

      const neighbors = new Map<string, Set<string>>()
      for (const territory of map.territories) {
        neighbors.set(territory.id, new Set())
      }

      for (const adjacency of map.adjacencies) {
        const fromId = adjacency.fromTerritoryId
        const toId = adjacency.toTerritoryId
        if (!neighbors.has(fromId)) neighbors.set(fromId, new Set())
        if (!neighbors.has(toId)) neighbors.set(toId, new Set())
        neighbors.get(fromId)?.add(toId)
        if (adjacency.isBidirectional !== false) {
          neighbors.get(toId)?.add(fromId)
        }
      }

      const territories = map.territories.map((t) => ({
        id: t.id,
        name: t.name,
        sector: t.sectorId || '',
        armyPosition: t.armyPosition || { x: 0, y: 0 },
        adjacentTerritories: Array.from(neighbors.get(t.id) ?? []),
      }))

      const adjacencies: Array<{ from: string; to: string }> = []
      const seen = new Set<string>()
      for (const [fromId, targets] of neighbors.entries()) {
        for (const toId of targets) {
          const key = fromId < toId ? `${fromId}:${toId}` : `${toId}:${fromId}`
          if (seen.has(key)) continue
          seen.add(key)
          adjacencies.push({ from: fromId, to: toId })
        }
      }

      const sectors = map.sectors.map((s) => ({
        id: s.name,
        name: s.name,
        bonus: s.bonusArmies ?? 0,
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
        aiDifficulty:
          (player.aiDifficulty as 'recruit' | 'commander' | 'grandmaster' | null) || null,
        color: player.color,
      }))

      // Build sector bonuses with correct type shape (SectorBonus interface)
      const mapTerritories = this.mapData.territories
      const sectorBonuses = this.mapData.sectors.map((s) => {
        // Get territories in this sector
        const sectorTerritories = mapTerritories.filter((t) => t.sector === s.id).map((t) => t.id)
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
        mapOverrides,
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
