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
})
