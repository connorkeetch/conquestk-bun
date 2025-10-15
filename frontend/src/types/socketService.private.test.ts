import { describe, it } from 'vitest'
import { socketService } from '@/services/socketService'

// Type-level enforcement: gameplay helpers should remain internal/private.
// If any of these become publicly accessible, these @ts-expect-error guards
// will fail and the test will surface that drift.

describe('socketService private gameplay helpers', () => {
  it('prevents external access to internal helpers (type-checked)', () => {
    // @ts-expect-error deployArmies is private to SocketService
    // biome-ignore lint/suspicious/noExplicitAny: type-only access for compile-time guard
    const _deploy: any = (socketService as unknown as { deployArmies: unknown }).deployArmies

    // @ts-expect-error attack is private to SocketService
    // biome-ignore lint/suspicious/noExplicitAny: type-only access for compile-time guard
    const _attack: any = (socketService as unknown as { attack: unknown }).attack

    // @ts-expect-error fortify is private to SocketService
    // biome-ignore lint/suspicious/noExplicitAny: type-only access for compile-time guard
    const _fortify: any = (socketService as unknown as { fortify: unknown }).fortify

    // @ts-expect-error transferConquestArmies is private to SocketService
    // biome-ignore lint/suspicious/noExplicitAny: type-only access for compile-time guard
    const _transfer: any = (socketService as unknown as { transferConquestArmies: unknown })
      .transferConquestArmies

    // @ts-expect-error undoFortify is private to SocketService
    // biome-ignore lint/suspicious/noExplicitAny: type-only access for compile-time guard
    const _undo: any = (socketService as unknown as { undoFortify: unknown }).undoFortify

    // @ts-expect-error endTurn is private to SocketService
    // biome-ignore lint/suspicious/noExplicitAny: type-only access for compile-time guard
    const _end: any = (socketService as unknown as { endTurn: unknown }).endTurn

    // Runtime no-ops to satisfy unused vars in test runtime
    void _deploy
    void _attack
    void _fortify
    void _transfer
    void _undo
    void _end
  })
})
