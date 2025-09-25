import type { AIDifficulty, GameAction, GamePlayer, GameState } from '../types/game'

type FallbackReason = 'stubbed' | 'timeout' | 'aborted'

export interface DecisionBudget {
  maxThinkTimeMs: number
  maxPlannedActions?: number
  signal?: AbortSignal
}

export interface DecisionRequest {
  gameState: GameState
  player: GamePlayer
  difficulty: AIDifficulty
  budget: DecisionBudget
}

export interface AIDecisionPlan {
  actions: GameAction[]
  usedFallback: boolean
  reason?: FallbackReason
  diagnostics: {
    generatedAt: string
    durationMs: number
    requestedDifficulty: AIDifficulty
    plannedActionCount: number
    budget: {
      maxThinkTimeMs: number
      maxPlannedActions?: number
    }
  }
}

class AIDecisionService {
  async chooseAction(request: DecisionRequest): Promise<AIDecisionPlan> {
    const start = Date.now()

    if (request.budget.signal?.aborted) {
      return this.createFallbackPlan('aborted', request, start)
    }

    if (request.budget.maxThinkTimeMs <= 0) {
      return this.createFallbackPlan('timeout', request, start)
    }

    return this.createFallbackPlan('stubbed', request, start)
  }

  buildFallbackPlan(gameState: GameState, playerId: string): GameAction[] {
    const actions: GameAction[] = []
    const roomId = gameState.roomId
    let phase = gameState.phase

    if (phase === 'setup') {
      actions.push({ type: 'begin_turn', roomId, playerId })
      phase = 'reinforcement'
    }

    const addEndTurn = () => {
      actions.push({ type: 'end_turn', roomId, playerId })
    }

    switch (phase) {
      case 'reinforcement':
        addEndTurn()
        addEndTurn()
        addEndTurn()
        break
      case 'attack':
        addEndTurn()
        addEndTurn()
        break
      case 'fortify':
        addEndTurn()
        break
      default:
        break
    }

    if (actions.length === 0) {
      actions.push({ type: 'end_turn', roomId, playerId })
    }

    return actions
  }

  private createFallbackPlan(
    reason: FallbackReason,
    request: DecisionRequest,
    startedAt: number,
  ): AIDecisionPlan {
    const fallbackActions = this.buildFallbackPlan(request.gameState, request.player.id)
    const maxAllowed = request.budget.maxPlannedActions ?? fallbackActions.length
    const boundedActions = fallbackActions.slice(0, Math.max(1, maxAllowed))

    return {
      actions: boundedActions,
      usedFallback: true,
      reason,
      diagnostics: {
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        requestedDifficulty: request.difficulty,
        plannedActionCount: boundedActions.length,
        budget: {
          maxThinkTimeMs: request.budget.maxThinkTimeMs,
          maxPlannedActions: request.budget.maxPlannedActions,
        },
      },
    }
  }
}

export const aiDecisionService = new AIDecisionService()
