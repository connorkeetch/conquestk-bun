import { describe, expect, it, jest } from '@jest/globals'

jest.mock('../config/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}))

import { GameEngine } from '../game/gameEngine.js'
import type { GamePlayer, GameState, Territory } from '../types/game.js'

const base = (): GameState => {
  const players: GamePlayer[] = [
    {
      id: 'p1',
      username: 'A',
      color: 'red',
      armies: 0,
      territories: [],
      cards: [],
      isEliminated: false,
      teamId: 1,
    },
    {
      id: 'p2',
      username: 'B',
      color: 'blue',
      armies: 0,
      territories: [],
      cards: [],
      isEliminated: false,
      teamId: 1,
    },
    {
      id: 'p3',
      username: 'C',
      color: 'green',
      armies: 0,
      territories: [],
      cards: [],
      isEliminated: false,
      teamId: 2,
    },
  ]
  const board: Territory[] = [
    { id: 't1', name: 'T1', sector: 's', ownerId: 'p1', armies: 3, adjacentTerritories: ['t2'] },
    {
      id: 't2',
      name: 'T2',
      sector: 's',
      ownerId: 'p2',
      armies: 3,
      adjacentTerritories: ['t1', 't3'],
    },
    { id: 't3', name: 'T3', sector: 's', ownerId: 'p3', armies: 1, adjacentTerritories: ['t2'] },
  ]
  return {
    roomId: 'r',
    players,
    currentPlayer: 'p1',
    phase: 'attack',
    turn: 1,
    board,
    cards: [],
    gameConfig: {
      movementType: 'classic_adjacent',
      allowTeamPlay: true,
      maxPlayers: 6,
      mapId: 'classic',
      gameMode: 'standard',
    },
  }
}

describe('Team victory when one team remains', () => {
  it('engine.checkGameEnd ends the game when all active players belong to one team', () => {
    const engine = new GameEngine()
    const state = base()

    // Eliminate p3 by removing territory
    state.board = state.board.map((t) =>
      t.ownerId === 'p3' ? { ...t, ownerId: 'p2', armies: 1 } : t,
    )
    const check = engine.checkGameEnd(state)
    expect(check.gameEnded).toBe(true)
    expect(check.winner).not.toBeNull()
  })

  it('endPlayerTurn detects team win when only one team remains', () => {
    const engine = new GameEngine()
    const state = base()
    // Remove p3's last territory and mark elimination via update cycle in end turn
    state.board = state.board.map((t) =>
      t.ownerId === 'p3' ? { ...t, ownerId: 'p2', armies: 1 } : t,
    )
    // Move to fortify to trigger end-of-turn flow ending the turn into finished
    state.phase = 'fortify'
    const after = engine.advancePhase(state)
    expect(after.phase).toBe('finished')
  })
})
