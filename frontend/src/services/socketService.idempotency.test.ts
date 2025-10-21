import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { socketService } from '@/services/socketService'
import { rollbackAllOptimisticActions } from '@/utils/optimisticActions'

type SocketServiceInternal = {
  sendActionWithAck: (
    roomId: string,
    action: { type: string; playerId?: string; payload?: unknown },
    options?: { idempotencyKey?: string; timeoutMs?: number },
  ) => Promise<{ ok: boolean; queued?: boolean; error?: string }>
  _sendActionInternal: (
    roomId: string,
    action: { type: string; playerId?: string; payload?: unknown },
    idempotencyKey: string,
    timeoutMs: number,
  ) => Promise<{ ok: boolean; queued?: boolean; error?: string }>
  pendingActions: Map<string, Promise<{ ok: boolean; queued?: boolean; error?: string }>>
  inFlightActionKeys: Map<string, string>
  socket: unknown
}

const internalService = socketService as unknown as SocketServiceInternal

describe('socketService idempotency key handling', () => {
  let originalInternalSend: SocketServiceInternal['_sendActionInternal'] | undefined

  beforeEach(() => {
    originalInternalSend = internalService._sendActionInternal
    internalService.pendingActions.clear()
    internalService.inFlightActionKeys.clear()
  })

  afterEach(() => {
    if (originalInternalSend) {
      internalService._sendActionInternal = originalInternalSend
    }
    internalService.pendingActions.clear()
    internalService.inFlightActionKeys.clear()
    rollbackAllOptimisticActions()
    vi.useRealTimers()
  })

  it('reuses the same promise when an identical action is already in flight', async () => {
    let resolveAck: ((value: { ok: boolean; queued?: boolean }) => void) | undefined
    const stub = vi.fn().mockImplementation(
      (_roomId: string, _action: { type: string; payload?: unknown }, _key: string) =>
        new Promise<{ ok: boolean; queued?: boolean }>((resolve) => {
          resolveAck = resolve
        }),
    )

    internalService._sendActionInternal = stub

    const action = {
      type: 'deploy',
      playerId: 'tester',
      payload: { territoryId: 'alpha', armies: 2 },
    }
    const first = internalService.sendActionWithAck('room-1', action)
    const second = internalService.sendActionWithAck('room-1', action)

    expect(stub).toHaveBeenCalledTimes(1)

    resolveAck?.({ ok: true })
    const [resultA, resultB] = await Promise.all([first, second])
    expect(resultA).toEqual(resultB)
    expect(internalService.pendingActions.size).toBe(0)
  })

  it('retains the same idempotency key across timeout retries', async () => {
    vi.useFakeTimers()

    const responses = [
      { ok: false, error: 'Timeout - server did not acknowledge action' },
      { ok: true },
    ] as Array<{ ok: boolean; error?: string }>
    const observedKeys: string[] = []

    const stub = vi
      .fn()
      .mockImplementation(
        (_roomId: string, _action: { type: string; payload?: unknown }, key: string) => {
          observedKeys.push(key)
          const next = responses.shift() ?? { ok: true }
          return Promise.resolve(next)
        },
      )

    internalService._sendActionInternal = stub

    const action = {
      type: 'deploy',
      playerId: 'tester',
      payload: { territoryId: 'beta', armies: 3 },
    }
    const resultPromise = internalService.sendActionWithAck('room-2', action, { timeoutMs: 5 })

    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(result.ok).toBe(true)
    expect(stub).toHaveBeenCalledTimes(2)
    expect(observedKeys.length).toBe(2)
    expect(observedKeys[0]).toBe(observedKeys[1])
  })
})
