import type { BattleResultDelta, GameDelta } from '@conquestk/shared/types/delta'
import type { Server } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents } from '../../types/shared.js'
import { logger } from '../../utils/logger.js'

/**
 * Responsible for transforming and emitting battle results as deltas
 * Extracted from GameActionProcessor for better separation of concerns
 */
export class BattleResultEmitter {
  constructor(
    private io: Server<
      ClientToServerEvents,
      ServerToClientEvents,
      Record<string, unknown>,
      { userId?: string }
    >,
  ) {}

  /**
   * Emit a battle result delta with fog filtering
   */
  async emitBattleResult(gameId: string, battleResult: unknown, version: number): Promise<void> {
    const payload = this.transformBattleResult(battleResult)
    if (!payload) {
      logger.warn('Invalid battle result structure, skipping emission', {
        gameId,
        resultType: typeof battleResult,
      })
      return
    }

    try {
      const { DeltaBuilder } = await import('../../types/deltaUpdates.js')
      const battleDelta = DeltaBuilder.battleResult(gameId, payload, version)

      // Include territory updates as nested changes
      const withChanges: BattleResultDelta & {
        changes?: GameDelta[]
      } = {
        ...battleDelta,
        changes: [
          DeltaBuilder.territoryUpdate(
            gameId,
            payload.fromTerritory.id,
            { armies: payload.fromTerritory.armies },
            version,
          ),
          DeltaBuilder.territoryUpdate(
            gameId,
            payload.toTerritory.id,
            {
              armies: payload.toTerritory.armies,
              ownerId: payload.toTerritory.ownerId ?? undefined,
            },
            version,
          ),
        ],
      }

      const { emitFogFilteredDelta } = await import('../fogService.js')
      await emitFogFilteredDelta(this.io, gameId, withChanges)
    } catch (error) {
      logger.error('Failed to emit battle result delta', {
        gameId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Transform raw battle result to typed payload
   * Uses TypeScript type guards instead of manual validation
   */
  private transformBattleResult(val: unknown): BattleResultDelta['battleResult'] | null {
    // Type guard: must be an object
    if (!val || typeof val !== 'object') {
      return null
    }

    const obj = val as Record<string, unknown>

    // Extract properties
    const f = obj.fromTerritory
    const t = obj.toTerritory
    const aL = obj.attackerLosses
    const dL = obj.defenderLosses
    const aD = obj.attackerDice
    const dD = obj.defenderDice
    const c = obj.conquered

    // Validate structure
    const isValid =
      typeof f === 'object' &&
      f !== null &&
      typeof (f as Record<string, unknown>).id === 'string' &&
      typeof (f as Record<string, unknown>).armies === 'number' &&
      typeof t === 'object' &&
      t !== null &&
      typeof (t as Record<string, unknown>).id === 'string' &&
      typeof (t as Record<string, unknown>).armies === 'number' &&
      Array.isArray(aD) &&
      aD.every((n) => typeof n === 'number') &&
      Array.isArray(dD) &&
      dD.every((n) => typeof n === 'number') &&
      typeof aL === 'number' &&
      typeof dL === 'number' &&
      typeof c === 'boolean'

    if (!isValid) {
      return null
    }

    const fromRec = f as Record<string, unknown>
    const toRec = t as Record<string, unknown>

    return {
      fromTerritory: {
        id: String(fromRec.id),
        armies: Number(fromRec.armies),
      },
      toTerritory: {
        id: String(toRec.id),
        armies: Number(toRec.armies),
        ...(typeof toRec.ownerId === 'string' || toRec.ownerId === null
          ? { ownerId: toRec.ownerId as string | null }
          : {}),
      },
      attackerLosses: Number(aL),
      defenderLosses: Number(dL),
      attackerDice: aD as number[],
      defenderDice: dD as number[],
      conquered: Boolean(c),
    }
  }
}
