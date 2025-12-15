import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema'
import { Player } from './Player.js'
import { Territory } from './Territory.js'

export class BattleResult extends Schema {
  @type('string') attackerId: string = ''
  @type('string') defenderId: string = ''
  @type('string') fromTerritoryId: string = ''
  @type('string') toTerritoryId: string = ''
  @type(['number']) attackerDice = new ArraySchema<number>()
  @type(['number']) defenderDice = new ArraySchema<number>()
  @type('number') attackerLosses: number = 0
  @type('number') defenderLosses: number = 0
  @type('boolean') conquered: boolean = false
  @type('number') armiesTransferred: number = 0
}

export type GamePhase = 'lobby' | 'reinforcement' | 'attack' | 'fortify' | 'finished'

export class GameState extends Schema {
  @type('string') roomId: string = ''
  @type('string') mapId: string = ''
  @type('string') phase: GamePhase = 'lobby'
  @type('string') currentPlayerId: string = ''
  @type('number') turn: number = 0
  @type('number') version: number = 0

  @type({ map: Player }) players = new MapSchema<Player>()
  @type({ map: Territory }) territories = new MapSchema<Territory>()

  // Last battle result for UI animation
  @type(BattleResult) lastBattle: BattleResult | null = null

  // Game configuration (set once at start)
  @type('string') gameMode: string = 'classic'
  @type('boolean') fogOfWar: boolean = false
  @type('number') turnTimerSeconds: number = 86400 // 24 hours default
  @type('boolean') teamMode: boolean = false
  @type('number') numberOfTeams: number = 0

  // Timestamps
  @type('number') turnStartedAt: number = 0
  @type('number') turnExpiresAt: number = 0
  @type('number') gameStartedAt: number = 0

  // Game result
  @type('string') winnerId: string = ''
  @type('string') winningTeamId: string = ''

  // Card trade tracking
  @type('number') cardTradeCount: number = 0
  @type('number') nextCardTradeValue: number = 4

  // Map adjacency data (loaded once, not synced to clients - they have their own copy)
  private adjacencyMap: Map<string, Set<string>> = new Map()

  // Set adjacency data from map definition
  setAdjacencies(adjacencies: Array<{ from: string; to: string }>) {
    this.adjacencyMap.clear()
    for (const adj of adjacencies) {
      if (!this.adjacencyMap.has(adj.from)) {
        this.adjacencyMap.set(adj.from, new Set())
      }
      this.adjacencyMap.get(adj.from)!.add(adj.to)

      // Bidirectional by default
      if (!this.adjacencyMap.has(adj.to)) {
        this.adjacencyMap.set(adj.to, new Set())
      }
      this.adjacencyMap.get(adj.to)!.add(adj.from)
    }
  }

  // Check if two territories are adjacent
  areAdjacent(territoryA: string, territoryB: string): boolean {
    return this.adjacencyMap.get(territoryA)?.has(territoryB) ?? false
  }

  // Check if a territory is adjacent to any territory owned by the given player
  isAdjacentToOwned(territoryId: string, playerId: string): boolean {
    const adjacentIds = this.adjacencyMap.get(territoryId)
    if (!adjacentIds) return false

    for (const adjId of adjacentIds) {
      const adjTerritory = this.territories.get(adjId)
      if (adjTerritory?.ownerId === playerId) {
        return true
      }
    }
    return false
  }

  // Get all territories owned by a player
  getPlayerTerritories(playerId: string): Territory[] {
    const territories: Territory[] = []
    this.territories.forEach((territory) => {
      if (territory.ownerId === playerId) {
        territories.push(territory)
      }
    })
    return territories
  }

  // Get the next player in turn order
  getNextPlayer(): Player | null {
    const activePlayers = Array.from(this.players.values())
      .filter((p) => !p.isEliminated)
      .sort((a, b) => a.playerOrder - b.playerOrder)

    if (activePlayers.length === 0) return null

    const currentIndex = activePlayers.findIndex((p) => p.oderId === this.currentPlayerId)
    const nextIndex = (currentIndex + 1) % activePlayers.length
    return activePlayers[nextIndex]
  }
}
