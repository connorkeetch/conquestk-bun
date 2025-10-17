import { logger } from '@/utils/logger'

type OptimisticHandlers = {
  apply?: () => void
  rollback?: () => void
}

const optimisticRegistry = new Map<string, { rollback?: () => void }>()

export function registerOptimisticAction(
  idempotencyKey: string,
  handlers: OptimisticHandlers,
): void {
  const { apply, rollback } = handlers
  if (!apply && !rollback) {
    return
  }

  if (apply) {
    try {
      apply()
    } catch (error) {
      logger.error('Optimistic update failed to apply', { idempotencyKey, error })
    }
  }

  if (rollback) {
    optimisticRegistry.set(idempotencyKey, { rollback })
  } else {
    optimisticRegistry.delete(idempotencyKey)
  }
}

export function resolveOptimisticAction(idempotencyKey: string): void {
  optimisticRegistry.delete(idempotencyKey)
}

export function rollbackOptimisticAction(idempotencyKey: string): void {
  const entry = optimisticRegistry.get(idempotencyKey)
  optimisticRegistry.delete(idempotencyKey)

  if (entry?.rollback) {
    try {
      entry.rollback()
    } catch (error) {
      logger.error('Optimistic update rollback failed', { idempotencyKey, error })
    }
  }
}

export function rollbackAllOptimisticActions(
  predicate?: (idempotencyKey: string) => boolean,
): void {
  for (const [key, entry] of optimisticRegistry.entries()) {
    if (predicate && !predicate(key)) {
      continue
    }
    optimisticRegistry.delete(key)
    if (entry?.rollback) {
      try {
        entry.rollback()
      } catch (error) {
        logger.error('Optimistic update rollback failed', { idempotencyKey: key, error })
      }
    }
  }
}
