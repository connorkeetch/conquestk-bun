import type { Mock } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import audioService from '../services/audioService'
import { notificationService } from '../services/notificationService'
import { socketService } from '../services/socketService'
import { store } from '../store'
import { setGameState } from '../store/gameSlice'

describe('socketService delta + events handling', () => {
  let handlers: Record<string, (payload: unknown) => void>

  beforeEach(() => {
    // Spy side effects
    vi.spyOn(audioService, 'playEffect').mockImplementation(() => {
      /* no-op for test */
    })
    vi.spyOn(notificationService, 'addNotification').mockImplementation(() => {
      /* no-op for test */
    })

    // Seed auth state with current user u2 (fulfill login thunk shape)
    store.dispatch({
      type: 'auth/login/fulfilled',
      payload: {
        user: {
          id: 'u2',
          username: 'Me',
          email: 'me@example.com',
          emailVerified: true,
        },
        token: 'test-token',
      },
    })

    // Seed baseline game state (it's u1's turn; will switch to u2)
    store.dispatch(
      setGameState({
        roomId: 'g1',
        phase: 'attack',
        currentPlayer: 'u1',
        turn: 1,
        players: [
          {
            id: 'u1',
            username: 'P1',
            color: '#F00',
            armies: 0,
            cards: [],
            treasures: [],
            isEliminated: false,
          },
          {
            id: 'u2',
            username: 'Me',
            color: '#0F0',
            armies: 0,
            cards: [],
            treasures: [],
            isEliminated: false,
          },
        ],
        board: [
          { id: 't1', name: 'T1', armies: 3, ownerId: 'u1', adjacentTerritories: [] },
          { id: 't2', name: 'T2', armies: 2, ownerId: 'u2', adjacentTerritories: [] },
        ],
      } as unknown as import('../types/game').GameState),
    )

    // Prepare fake socket and re-register listeners
    handlers = {}
    // biome-ignore lint/suspicious/noExplicitAny: test-only shimming of private surface
    ;(socketService as any).socket = {
      on: (event: string, cb: (payload: unknown) => void) => {
        handlers[event] = cb
      },
      off: () => {
        /* noop */
      },
    }
    // Clear per-room suppression timers between tests
    const turnStartMap = (socketService as unknown as { lastTurnStartByRoom?: Map<string, number> })
      .lastTurnStartByRoom
    turnStartMap?.clear?.()
    // biome-ignore lint/suspicious/noExplicitAny: test-only access to private method
    ;(socketService as any).setupEventListeners()
  })

  it('triggers turn reminder and audio on PHASE_CHANGE to current user and updates state', async () => {
    const handler = handlers['game-delta']
    expect(typeof handler).toBe('function')

    // Send a phase change that switches turn to u2 (current user)
    await handler({
      type: 'PHASE_CHANGE',
      roomId: 'g1',
      phase: 'reinforcement',
      currentPlayer: 'u2',
      turn: 2,
      reinforcementArmies: 5,
      timestamp: Date.now(),
      version: 1,
    })

    // Side effects
    expect(audioService.playEffect).toHaveBeenCalledWith('turn')
    expect(notificationService.addNotification).toHaveBeenCalled()
    const noteArg = (notificationService.addNotification as unknown as Mock).mock.calls[0][0]
    expect(noteArg.type).toBe('turn_reminder')

    // State changes via reducer
    const state = store.getState()
    expect(state.game.currentGame?.phase).toBe('reinforcement')
    expect(state.game.reinforcementArmies).toBe(5)
  })

  it('emits rank_update notification on ratingUpdate when rank changes (promotion)', async () => {
    const handler = handlers.ratingUpdate
    expect(typeof handler).toBe('function')

    const addSpy = vi.spyOn(notificationService, 'addNotification')

    await handler({
      changes: [
        { userId: 'u2', oldRating: 1199, newRating: 1200, change: 1 }, // Sultan -> Caesar
      ],
    })

    expect(addSpy).toHaveBeenCalled()
    const arg = (addSpy.mock.calls[0] ?? [])[0] as unknown as Record<string, unknown>
    expect(arg.type).toBe('rank_update')
    const meta = (arg.metadata ?? {}) as Record<string, unknown>
    expect(meta.oldRank).toBe('Sultan')
    expect(meta.newRank).toBe('Caesar')
  })

  it('does not emit rank_update when rating changes within same rank', async () => {
    const handler = handlers.ratingUpdate
    expect(typeof handler).toBe('function')

    const addSpy = vi.spyOn(notificationService, 'addNotification')
    addSpy.mockClear()

    await handler({
      changes: [
        { userId: 'u2', oldRating: 1210, newRating: 1215, change: 5 }, // Caesar -> Caesar
      ],
    })

    expect(addSpy).not.toHaveBeenCalled()
  })
})
