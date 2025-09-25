import { aiDecisionService, type DecisionRequest } from '../services/aiDecisionService'
import type { GamePlayer, GameState, Territory } from '../types/game'

const baseTerritories: Territory[] = [
  {
    id: 't1',
    name: 'Alpha',
    continent: 'north',
    ownerId: 'ai-player',
    armies: 5,
    adjacentTerritories: ['t2', 't3'],
    isCapital: false,
  },
  {
    id: 't2',
    name: 'Bravo',
    continent: 'north',
    ownerId: 'ai-player',
    armies: 2,
    adjacentTerritories: ['t1', 't4'],
    isCapital: false,
  },
  {
    id: 't3',
    name: 'Charlie',
    continent: 'north',
    ownerId: 'opponent',
    armies: 2,
    adjacentTerritories: ['t1', 't4'],
    isCapital: false,
  },
  {
    id: 't4',
    name: 'Delta',
    continent: 'south',
    ownerId: 'opponent',
    armies: 3,
    adjacentTerritories: ['t2', 't3'],
    isCapital: false,
  },
]

const createGameState = (overrides: Partial<GameState> = {}): GameState => {
  const players: GamePlayer[] = [
    {
      id: 'ai-player',
      username: 'Recruit AI',
      color: '#ff0000',
      armies: 5,
      territories: ['t1', 't2'],
      cards: [],
      isEliminated: false,
      isAi: true,
      aiDifficulty: 'recruit',
      aiPersonalitySeed: 17,
    },
    {
      id: 'opponent',
      username: 'Opponent',
      color: '#0000ff',
      armies: 5,
      territories: ['t3', 't4'],
      cards: [],
      isEliminated: false,
      isAi: false,
    },
  ]

  const state: GameState = {
    roomId: 'room-1',
    players,
    currentPlayer: 'ai-player',
    phase: 'reinforcement',
    turn: 1,
    board: baseTerritories.map((territory) => ({
      ...territory,
      adjacentTerritories: [...territory.adjacentTerritories],
    })),
    cards: [],
    hasAttackedThisTurn: false,
    gameConfig: {
      movementType: 'classic_adjacent',
      allowTeamPlay: false,
      teamMode: 'none',
      numberOfTeams: null,
      teamAssignments: undefined,
      maxPlayers: 4,
      mapId: 'test-map',
      gameMode: 'standard',
      continentBonuses: [],
      useTerritoryModifiers: false,
      modifierDistribution: 'none',
    },
  }

  return Object.assign(state, overrides)
}

const buildRequest = (overrides: Partial<GameState> = {}): DecisionRequest => {
  const gameState = createGameState(overrides)
  const player = gameState.players.find((entry) => entry.id === gameState.currentPlayer)
  if (!player) {
    throw new Error('Missing current player in test state')
  }

  return {
    gameState,
    player,
    difficulty: player.aiDifficulty ?? 'recruit',
    budget: {
      maxThinkTimeMs: 500,
      maxPlannedActions: 4,
    },
  }
}

describe('aiDecisionService', () => {
  it('generates a Recruit plan that reinforces, attacks, and advances phases when possible', async () => {
    const request = buildRequest()
    const plan = await aiDecisionService.chooseAction(request)

    expect(plan.usedFallback).toBe(false)
    const actionTypes = plan.actions.map((action) => action.type)
    expect(actionTypes).toEqual(['deploy', 'end_turn', 'attack', 'end_turn'])

    const deployAction = plan.actions[0]
    expect(deployAction.type).toBe('deploy')
    expect(deployAction.payload).toEqual({ territoryId: 't2', armies: 5 })
  })

  it('returns a fallback plan when the decision budget is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const request = buildRequest({ phase: 'attack' })

    const plan = await aiDecisionService.chooseAction({
      ...request,
      budget: {
        ...request.budget,
        signal: controller.signal,
      },
    })

    expect(plan.usedFallback).toBe(true)
    expect(plan.reason).toBe('aborted')
    expect(plan.actions).toHaveLength(2)
    expect(plan.actions[0].type).toBe('end_turn')
  })
})
