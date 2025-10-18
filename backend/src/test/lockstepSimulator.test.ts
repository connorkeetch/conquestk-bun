import { simulateFrame } from '@conquestk/shared/lockstep'
import type { InputFrame } from '@conquestk/shared/types/lockstep'
import { deriveStateFromSeed } from '@conquestk/shared/utils/deterministicRng'
import { GameEngine } from '../game/gameEngine.js'
import type { GameAction, GameState } from '../types/game.js'

const cloneState = <T>(value: T): T =>
  typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T)

const applyEngineFrame = async (state: GameState, frame: InputFrame): Promise<GameState> => {
  const engine = new GameEngine()
  let working = cloneState(state)
  for (const command of frame.commands) {
    const action = {
      type: command.kind,
      roomId: frame.matchId,
      playerId: frame.playerId,
      payload: command.payload ?? {},
    } as GameAction
    const { gameState } = await engine.processAction(working, action)
    working = cloneState(gameState)
  }
  return working
}

const applySimulatorFrame = (state: GameState, frame: InputFrame): GameState => {
  const { state: next, unsupported } = simulateFrame(cloneState(state), frame)
  if (unsupported.length > 0) {
    throw new Error(`Simulator does not support commands: ${unsupported.join(', ')}`)
  }
  return cloneState(next as GameState)
}

const expectStateParity = (simState: GameState, engineState: GameState): void => {
  const normalizedSim = cloneState(simState) as GameState & { version?: number }
  if (engineState.version !== undefined && normalizedSim.version === undefined) {
    normalizedSim.version = engineState.version
  }
  expect(normalizedSim).toEqual(engineState)
}

describe('Shared lockstep simulator parity', () => {
  it('replays treasure trades deterministically', async () => {
    const baseState: GameState = {
      roomId: 'match-treasure',
      players: [
        {
          id: 'p1',
          userId: 'u1',
          username: 'Alice',
          color: 'red',
          territories: ['t1'],
          armies: 3,
          cards: [],
          isEliminated: false,
          treasures: ['bronze', 'silver', 'gold'],
          mustCashInTreasures: false,
        },
        {
          id: 'p2',
          userId: 'u2',
          username: 'Bob',
          color: 'blue',
          territories: ['t2'],
          armies: 3,
          cards: [],
          isEliminated: false,
          treasures: [],
          mustCashInTreasures: false,
        },
      ],
      currentPlayer: 'p1',
      phase: 'attack',
      turn: 1,
      board: [
        {
          id: 't1',
          name: 'Alpha',
          ownerId: 'p1',
          armies: 5,
          adjacentTerritories: ['t2'],
        },
        {
          id: 't2',
          name: 'Beta',
          ownerId: 'p2',
          armies: 1,
          adjacentTerritories: ['t1'],
        },
      ],
      cards: [],
      hasAttackedThisTurn: false,
      gameConfig: {
        movementType: 'classic_adjacent',
        maxPlayers: 2,
        treasureConfig: {
          enabled: true,
          diamondsPercent: 0.08,
          payoutMode: 'classic',
          fixedValue: 8,
          handCap: 5,
          diamondSetBonus: 3,
        },
      },
      treasureState: {
        totalSetsCashed: 0,
        nextPayoutIndex: 0,
      },
      mustCashInTreasures: false,
      conqueredDuringTurn: false,
    }

    const frame: InputFrame = {
      matchId: 'match-treasure',
      seq: 1,
      playerId: 'p1',
      committedAt: new Date().toISOString(),
      commands: [
        {
          kind: 'trade_cards',
          payload: { treasureSet: [0, 1, 2] },
        },
      ],
    }

    const simState = applySimulatorFrame(baseState, frame)
    const engineState = await applyEngineFrame(baseState, frame)

    expectStateParity(simState, engineState)
    expect(simState.phase).toBe('reinforcement')
    expect(simState.players[0]?.armies).toBeGreaterThan(baseState.players[0]?.armies ?? 0)
    expect(simState.players[0]?.treasures).toEqual([])
    expect(simState.treasureState?.nextPayoutIndex).toBe(1)
    expect(simState.resumePhaseAfterReinforcement).toBe('attack')
  })

  it('applies KOTH scoring and rotation on end_turn', async () => {
    const rngKoth = deriveStateFromSeed('match-koth')

    const baseState: GameState = {
      roomId: 'match-koth',
      players: [
        {
          id: 'p1',
          userId: 'u1',
          username: 'Alice',
          color: 'red',
          territories: ['hill-1'],
          armies: 0,
          cards: [],
          isEliminated: false,
          treasures: [],
          mustCashInTreasures: false,
        },
        {
          id: 'p2',
          userId: 'u2',
          username: 'Bob',
          color: 'blue',
          territories: ['hill-3'],
          armies: 0,
          cards: [],
          isEliminated: false,
          treasures: [],
          mustCashInTreasures: false,
        },
      ],
      currentPlayer: 'p2',
      phase: 'fortify',
      turn: 1,
      board: [
        {
          id: 'hill-1',
          name: 'Hill Alpha',
          ownerId: 'p1',
          armies: 5,
          adjacentTerritories: ['hill-2', 'hill-3'],
        },
        {
          id: 'hill-2',
          name: 'Hill Beta',
          ownerId: 'neutral',
          armies: 4,
          adjacentTerritories: ['hill-1', 'hill-3'],
        },
        {
          id: 'hill-3',
          name: 'Hill Gamma',
          ownerId: 'p2',
          armies: 3,
          adjacentTerritories: ['hill-1', 'hill-2'],
        },
      ],
      cards: [],
      hasAttackedThisTurn: false,
      gameConfig: {
        movementType: 'classic_adjacent',
        maxPlayers: 2,
        treasureConfig: {
          enabled: false,
          diamondsPercent: 0.08,
          payoutMode: 'classic',
          fixedValue: 8,
          handCap: 5,
          diamondSetBonus: 3,
        },
        kingOfTheHill: {
          targetPoints: 5,
          rotationInterval: 1,
          neutralArmies: 4,
          eligibleTerritoryIds: ['hill-1', 'hill-2', 'hill-3'],
        },
      },
      kingOfTheHillState: {
        currentHillTerritoryId: 'hill-1',
        points: { p1: 0, p2: 0 },
        targetPoints: 5,
        rotationInterval: 1,
        turnsUntilRotation: 1,
        upcomingHillTerritoryId: 'hill-2',
        previewTurns: 0,
        neutralArmies: 4,
        rotationQueue: ['hill-2'],
        eligibleTerritoryIds: ['hill-1', 'hill-2', 'hill-3'],
      },
      rngSeed: rngKoth.seed,
      rngState: rngKoth.state,
    }

    const frame: InputFrame = {
      matchId: 'match-koth',
      seq: 10,
      playerId: 'p2',
      committedAt: new Date().toISOString(),
      commands: [{ kind: 'end_turn', payload: undefined }],
    }

    const simState = applySimulatorFrame(baseState, frame)
    const engineState = await applyEngineFrame(baseState, frame)

    expectStateParity(simState, engineState)
    expect(simState.currentPlayer).toBe('p1')
    expect(simState.phase).toBe('reinforcement')
    expect(simState.turn).toBe(2)
    expect(simState.kingOfTheHillState?.currentHillTerritoryId).toBe('hill-2')
    expect(simState.kingOfTheHillState?.points['p1']).toBe(1)
  })

  it('rewinds fortify phase back to attack when no movements occurred', async () => {
    const baseState: GameState = {
      roomId: 'match-fortify-rewind',
      players: [
        {
          id: 'p1',
          userId: 'u1',
          username: 'Commander',
          color: 'red',
          territories: ['alpha', 'beta'],
          armies: 0,
          cards: [],
          isEliminated: false,
          treasures: [],
          mustCashInTreasures: false,
        },
        {
          id: 'p2',
          userId: 'u2',
          username: 'Guardian',
          color: 'blue',
          territories: ['gamma'],
          armies: 0,
          cards: [],
          isEliminated: false,
          treasures: [],
          mustCashInTreasures: false,
        },
      ],
      currentPlayer: 'p1',
      phase: 'fortify',
      turn: 3,
      board: [
        {
          id: 'alpha',
          name: 'Alpha',
          ownerId: 'p1',
          armies: 3,
          adjacentTerritories: ['beta', 'gamma'],
        },
        {
          id: 'beta',
          name: 'Beta',
          ownerId: 'p1',
          armies: 2,
          adjacentTerritories: ['alpha', 'gamma'],
        },
        {
          id: 'gamma',
          name: 'Gamma',
          ownerId: 'p2',
          armies: 4,
          adjacentTerritories: ['alpha', 'beta'],
        },
      ],
      cards: [],
      hasAttackedThisTurn: true,
      gameConfig: {
        movementType: 'classic_adjacent',
        maxPlayers: 2,
      },
      movementTracking: {},
      treasureState: {
        totalSetsCashed: 0,
        nextPayoutIndex: 0,
      },
      mustCashInTreasures: false,
      conqueredDuringTurn: false,
    }

    const frame: InputFrame = {
      matchId: 'match-fortify-rewind',
      seq: 1,
      playerId: 'p1',
      committedAt: new Date().toISOString(),
      commands: [
        {
          kind: 'go_back_to_attack',
        },
      ],
    }

    const simState = applySimulatorFrame(baseState, frame)
    const engineState = await applyEngineFrame(baseState, frame)

    expectStateParity(simState, engineState)
    expect(simState.phase).toBe('attack')
    expect(simState.movementTracking).toEqual({})
  })

  it('eliminates capitals and transfers territories on capture', async () => {
    const baseState: GameState = {
      roomId: 'match-capital',
      players: [
        {
          id: 'p1',
          userId: 'u1',
          username: 'Attacker',
          color: 'red',
          territories: ['alpha'],
          armies: 0,
          cards: [],
          isEliminated: false,
          treasures: [],
          mustCashInTreasures: false,
          capitalTerritory: 'alpha',
        },
        {
          id: 'p2',
          userId: 'u2',
          username: 'Defender',
          color: 'blue',
          territories: ['cap', 'delta'],
          armies: 0,
          cards: [],
          isEliminated: false,
          treasures: [],
          mustCashInTreasures: false,
          capitalTerritory: 'cap',
        },
      ],
      currentPlayer: 'p1',
      phase: 'attack',
      turn: 1,
      board: [
        {
          id: 'alpha',
          name: 'Alpha',
          ownerId: 'p1',
          armies: 5,
          adjacentTerritories: ['cap'],
          isCapital: true,
          capitalOwnerId: 'p1',
        },
        {
          id: 'cap',
          name: 'Capital',
          ownerId: 'p2',
          armies: 1,
          adjacentTerritories: ['alpha'],
          isCapital: true,
          capitalOwnerId: 'p2',
        },
        {
          id: 'delta',
          name: 'Delta',
          ownerId: 'p2',
          armies: 2,
          adjacentTerritories: ['alpha'],
          isCapital: false,
        },
      ],
      cards: [],
      hasAttackedThisTurn: false,
      gameConfig: {
        movementType: 'classic_adjacent',
        maxPlayers: 2,
        gameMode: 'capitals',
      },
      treasureState: {
        totalSetsCashed: 0,
        nextPayoutIndex: 0,
      },
      conqueredDuringTurn: false,
      capitalAssignments: {
        p1: 'alpha',
        p2: 'cap',
      },
    }

    const frame: InputFrame = {
      matchId: 'match-capital',
      seq: 1,
      playerId: 'p1',
      committedAt: new Date().toISOString(),
      commands: [
        {
          kind: 'attack',
          payload: { fromTerritoryId: 'alpha', toTerritoryId: 'cap' },
        },
      ],
    }

    const simState = applySimulatorFrame(baseState, frame)
    const engineState = await applyEngineFrame(baseState, frame)

    expectStateParity(simState, engineState)
    const defender = engineState.players.find((player) => player.id === 'p2')
    expect(defender?.isEliminated).toBe(true)
    expect(engineState.board.every((territory) => territory.ownerId !== 'p2')).toBe(true)
    expect(engineState.board.find((territory) => territory.id === 'cap')?.capitalOwnerId).toBe('p1')
    expect(engineState.capitalAssignments?.p1).toBe('cap')
    expect(engineState.board.find((territory) => territory.id === 'alpha')?.isCapital).toBe(false)
    expect(engineState.capitalElimination).toEqual({
      conqueror: 'p1',
      eliminated: 'p2',
      capitalTerritory: 'cap',
      territoriesGained: 2,
      troopsGained: 3,
    })
    expect(simState.capitalElimination).toEqual(engineState.capitalElimination)
    expect(simState.lastBattleResult?.capitalElimination).toEqual(
      engineState.lastBattleResult?.capitalElimination,
    )
  })

  it('neutralizes territories when a player resigns', () => {
    const baseState: GameState = {
      roomId: 'match-resign',
      players: [
        {
          id: 'p1',
          userId: 'u1',
          username: 'Aggro',
          color: 'red',
          territories: ['alpha'],
          armies: 0,
          cards: [],
          isEliminated: false,
          treasures: [],
          mustCashInTreasures: false,
        },
        {
          id: 'p2',
          userId: 'u2',
          username: 'Quitter',
          color: 'blue',
          territories: ['beta'],
          armies: 0,
          cards: [],
          isEliminated: false,
          treasures: ['bronze'],
          mustCashInTreasures: false,
        },
      ],
      currentPlayer: 'p2',
      phase: 'attack',
      turn: 1,
      board: [
        {
          id: 'alpha',
          name: 'Alpha',
          ownerId: 'p1',
          armies: 4,
          adjacentTerritories: ['beta'],
        },
        {
          id: 'beta',
          name: 'Beta',
          ownerId: 'p2',
          armies: 3,
          adjacentTerritories: ['alpha'],
        },
      ],
      cards: [],
      hasAttackedThisTurn: false,
      gameConfig: {
        movementType: 'classic_adjacent',
        maxPlayers: 2,
      },
      treasureState: {
        totalSetsCashed: 0,
        nextPayoutIndex: 0,
      },
      conqueredDuringTurn: false,
    }

    const frame: InputFrame = {
      matchId: 'match-resign',
      seq: 1,
      playerId: 'p2',
      committedAt: new Date().toISOString(),
      commands: [{ kind: 'resign' }],
    }

    const { state: simState, unsupported } = simulateFrame(cloneState(baseState), frame)

    expect(unsupported).toHaveLength(0)
    expect(simState.board.find((territory) => territory.id === 'beta')?.ownerId).toBe('neutral')
    const resignedPlayer = simState.players.find((player) => player.id === 'p2')
    expect(resignedPlayer?.isEliminated).toBe(true)
    expect(resignedPlayer?.territories).toEqual([])
  })

  it('resolves assassination victories after conquest', async () => {
    const seed = 'alpha'
    const rngState = deriveStateFromSeed(seed)

    const baseState: GameState = {
      roomId: 'match-assassination',
      players: [
        {
          id: 'p1',
          userId: 'u1',
          username: 'Alice',
          color: 'red',
          territories: ['t1'],
          armies: 0,
          cards: [],
          isEliminated: false,
          treasures: [],
          mustCashInTreasures: false,
        },
        {
          id: 'p2',
          userId: 'u2',
          username: 'Bob',
          color: 'blue',
          territories: ['t2'],
          armies: 0,
          cards: [],
          isEliminated: false,
          treasures: [],
          mustCashInTreasures: false,
        },
      ],
      currentPlayer: 'p1',
      phase: 'attack',
      turn: 1,
      board: [
        {
          id: 't1',
          name: 'Alpha Ridge',
          ownerId: 'p1',
          armies: 5,
          adjacentTerritories: ['t2'],
        },
        {
          id: 't2',
          name: 'Bravo Pass',
          ownerId: 'p2',
          armies: 1,
          adjacentTerritories: ['t1'],
        },
      ],
      cards: [],
      hasAttackedThisTurn: false,
      gameConfig: {
        movementType: 'classic_adjacent',
        maxPlayers: 2,
        treasureConfig: {
          enabled: false,
          diamondsPercent: 0.08,
          payoutMode: 'classic',
          fixedValue: 8,
          handCap: 5,
          diamondSetBonus: 3,
        },
        gameMode: 'assassination',
      },
      assassinationTargets: {
        p1: 'p2',
      },
      rngSeed: rngState.seed,
      rngState: rngState.state,
    }

    const frame: InputFrame = {
      matchId: 'match-assassination',
      seq: 5,
      playerId: 'p1',
      committedAt: new Date().toISOString(),
      commands: [
        {
          kind: 'attack',
          payload: {
            fromTerritoryId: 't1',
            toTerritoryId: 't2',
          },
        },
      ],
    }

    const simState = applySimulatorFrame(baseState, frame)
    const engineState = await applyEngineFrame(baseState, frame)

    expectStateParity(simState, engineState)
    expect(simState.phase).toBe('finished')
    expect(simState.currentPlayer).toBe('p1')
    expect(simState.players.find((p) => p.id === 'p2')?.isEliminated).toBe(true)
    expect(simState.lastBattleResult?.gameEnded).toBe(true)
    expect((simState.lastBattleResult?.winner as { id?: string } | null)?.id).toBe('p1')
  })

  it('forces treasure cash-in after eliminating a target with a large hand', async () => {
    const rngState = deriveStateFromSeed('treasure-elimination')

    const baseState: GameState = {
      roomId: 'match-treasure-elim',
      players: [
        {
          id: 'p1',
          userId: 'u1',
          username: 'Alice',
          color: 'red',
          territories: ['t1'],
          armies: 0,
          cards: [],
          isEliminated: false,
          treasures: ['bronze', 'silver'],
          mustCashInTreasures: false,
        },
        {
          id: 'p2',
          userId: 'u2',
          username: 'Bob',
          color: 'blue',
          territories: ['t2'],
          armies: 0,
          cards: [],
          isEliminated: false,
          treasures: ['gold', 'diamond'],
          mustCashInTreasures: false,
        },
      ],
      currentPlayer: 'p1',
      phase: 'attack',
      turn: 1,
      board: [
        {
          id: 't1',
          name: 'Alpha Ridge',
          ownerId: 'p1',
          armies: 5,
          adjacentTerritories: ['t2'],
        },
        {
          id: 't2',
          name: 'Bravo Pass',
          ownerId: 'p2',
          armies: 1,
          adjacentTerritories: ['t1'],
        },
      ],
      cards: [],
      hasAttackedThisTurn: false,
      gameConfig: {
        movementType: 'classic_adjacent',
        maxPlayers: 2,
        treasureConfig: {
          enabled: true,
          diamondsPercent: 0.08,
          payoutMode: 'classic',
          fixedValue: 8,
          handCap: 3,
          diamondSetBonus: 3,
        },
      },
      treasureState: {
        totalSetsCashed: 0,
        nextPayoutIndex: 0,
      },
      rngSeed: rngState.seed,
      rngState: rngState.state,
      mustCashInTreasures: false,
      conqueredDuringTurn: false,
    }

    const frame: InputFrame = {
      matchId: 'match-treasure-elim',
      seq: 42,
      playerId: 'p1',
      committedAt: new Date().toISOString(),
      commands: [
        {
          kind: 'attack',
          payload: {
            fromTerritoryId: 't1',
            toTerritoryId: 't2',
          },
        },
      ],
    }

    const simState = applySimulatorFrame(baseState, frame)
    const engineState = await applyEngineFrame(baseState, frame)

    expectStateParity(simState, engineState)
    const attacker = simState.players.find((p) => p.id === 'p1')
    expect(attacker?.treasures?.length).toBeGreaterThanOrEqual(4)
    expect(attacker?.mustCashInTreasures).toBe(true)
    expect(simState.mustCashInTreasures).toBe(true)
  })
})
