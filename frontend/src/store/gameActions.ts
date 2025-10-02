import { createAsyncThunk } from '@reduxjs/toolkit'
import { toast } from 'react-hot-toast'
import { socketService } from '../services/socketService'
import type { GameState, TradeCardsAction } from '../types/game'
import { isFriendlyTerritoryOwner } from '../utils/teamHelpers'
import {
  addTerritoryAction,
  selectTargetTerritory,
  selectTerritory,
  setError,
  setPendingAction,
  updateTerritory,
} from './gameSlice'
import type { AppDispatch, RootState } from './index'
import {
  addClientLog,
  clearOptimisticPlacement,
  popPlacement,
  pushPlacement,
  trackOptimisticPlacement,
} from './uiRoomSlice'

// Async thunk for handling territory clicks based on game phase
export const handleTerritoryClick = createAsyncThunk(
  'game/handleTerritoryClick',
  async (territoryId: string, { getState, dispatch }) => {
    const state = getState() as RootState
    const { currentGame, selectedTerritory, validTargets } = state.game

    if (!currentGame) {
      throw new Error('No active game')
    }

    const territory = currentGame.board.find((t) => t.id === territoryId)
    const isCurrentPlayerTurn = currentGame.currentPlayer === state.auth.user?.id

    if (!isCurrentPlayerTurn) {
      dispatch(setError('Not your turn'))
      return
    }

    // Handle based on current game phase
    const typedDispatch = dispatch as AppDispatch

    switch (currentGame.phase) {
      case 'reinforcement':
        await typedDispatch(handleReinforcementClick({ territoryId, territory, selectedTerritory }))
        return

      case 'attack':
        await typedDispatch(
          handleAttackClick({ territoryId, territory, selectedTerritory, validTargets }),
        )
        return

      case 'fortify':
        await typedDispatch(
          handleFortifyClick({ territoryId, territory, selectedTerritory, validTargets }),
        )
        return

      default:
        typedDispatch(selectTerritory(territoryId))
    }
  },
)

// Handle reinforcement phase clicks
export const handleReinforcementClick = createAsyncThunk<
  void,
  { territoryId: string; territory?: GameState['board'][number]; selectedTerritory: string | null },
  { state: RootState }
>(
  'game/handleReinforcementClick',
  async ({ territoryId, territory, selectedTerritory }, { dispatch, getState }) => {
    const typedDispatch = dispatch as AppDispatch
    const currentState = getState()
    const currentPlayerId = currentState.auth.user?.id
    const currentGame = currentState.game.currentGame

    if (!currentPlayerId || !currentGame) {
      dispatch(setError('No active game'))
      return
    }

    const friendly = territory?.ownerId
      ? isFriendlyTerritoryOwner(currentGame, territory.ownerId, currentPlayerId)
      : false

    if (!friendly) {
      const errorMessage = currentGame.gameConfig?.allowTeamPlay
        ? 'You can only deploy armies to territories owned by your team'
        : 'You can only deploy armies to your own territories'
      dispatch(setError(errorMessage))
      dispatch(selectTerritory(null))
      return
    }

    if (selectedTerritory === territoryId) {
      // Deploy a single army for quick-placement UX
      await typedDispatch(deployArmies({ territoryId, armies: 1 }))
      return
    }

    // Select territory for deployment
    typedDispatch(selectTerritory(territoryId))
    typedDispatch(setPendingAction('deploy'))
  },
)

// Handle attack phase clicks
export const handleAttackClick = createAsyncThunk<
  void,
  {
    territoryId: string
    territory?: GameState['board'][number]
    selectedTerritory: string | null
    validTargets: string[]
  },
  { state: RootState }
>(
  'game/handleAttackClick',
  async ({ territoryId, territory, selectedTerritory, validTargets }, { dispatch, getState }) => {
    const typedDispatch = dispatch as AppDispatch
    const currentPlayerId = getState().auth.user?.id

    if (!selectedTerritory) {
      // Select attacking territory
      if (territory && territory.ownerId === currentPlayerId && territory.armies > 1) {
        typedDispatch(selectTerritory(territoryId))
        typedDispatch(setPendingAction('attack'))
      } else if (territory && territory.ownerId === currentPlayerId) {
        typedDispatch(setError('Need at least 2 armies to attack'))
      } else {
        typedDispatch(setError('Select your own territory to attack from'))
      }
      return
    }

    if (validTargets.includes(territoryId)) {
      if (!selectedTerritory) {
        return
      }

      if (!territory || territory.ownerId !== currentPlayerId) {
        await typedDispatch(
          executeAttack({
            fromTerritoryId: selectedTerritory,
            toTerritoryId: territoryId,
          }),
        )
        return
      }
      return
    }

    // Invalid target, select new attacking territory if it's owned by player
    if (territory && territory.ownerId === currentPlayerId && territory.armies > 1) {
      typedDispatch(selectTerritory(territoryId))
    } else {
      typedDispatch(selectTerritory(null))
      typedDispatch(setPendingAction(null))
    }
  },
)

// Handle fortify phase clicks
export const handleFortifyClick = createAsyncThunk<
  void,
  {
    territoryId: string
    territory?: GameState['board'][number]
    selectedTerritory: string | null
    validTargets: string[]
  },
  { state: RootState }
>(
  'game/handleFortifyClick',
  async ({ territoryId, territory, selectedTerritory, validTargets }, { dispatch, getState }) => {
    const typedDispatch = dispatch as AppDispatch
    const currentPlayerId = getState().auth.user?.id

    if (!selectedTerritory) {
      // Select source territory for fortification
      if (territory && territory.ownerId === currentPlayerId && territory.armies > 1) {
        typedDispatch(selectTerritory(territoryId))
        typedDispatch(setPendingAction('fortify'))
      } else if (territory && territory.ownerId === currentPlayerId) {
        typedDispatch(setError('Need at least 2 armies to fortify'))
      } else {
        typedDispatch(setError('Select your own territory to fortify from'))
      }
      return
    }
    // Select target territory or execute fortification
    if (validTargets.includes(territoryId)) {
      if (!selectedTerritory) {
        return
      }
      // Execute fortification
      await typedDispatch(
        executeFortify({
          fromTerritoryId: selectedTerritory,
          toTerritoryId: territoryId,
          armies: 1,
        }),
      )
      return
    }
    // Invalid target, select new source territory if it's owned by player
    if (territory && territory.ownerId === currentPlayerId && territory.armies > 1) {
      typedDispatch(selectTerritory(territoryId))
    } else {
      typedDispatch(selectTerritory(null))
      typedDispatch(setPendingAction(null))
    }
  },
)

// Deploy armies action
export const deployArmies = createAsyncThunk(
  'game/deployArmies',
  async (
    { territoryId, armies }: { territoryId: string; armies: number },
    { getState, dispatch },
  ) => {
    const state = getState() as RootState
    const { currentGame } = state.game

    if (!currentGame) throw new Error('No active game')

    try {
      // Optimistic update: bump local armies immediately
      const prev = currentGame.board.find((t) => t.id === territoryId)?.armies ?? 0
      const expected = Math.max(0, prev + Math.max(1, Math.trunc(armies)))
      dispatch(
        updateTerritory({
          territoryId,
          armies: expected,
        }),
      )
      dispatch(trackOptimisticPlacement({ territoryId, expectedArmies: expected }))
      // Track client-side placement history for Undo (reinforcement phase only)
      try {
        const phase = (getState() as RootState).game.currentGame?.phase
        if (phase === 'reinforcement') {
          dispatch(pushPlacement({ territoryId, armies: Math.max(1, Math.trunc(armies)) }))
        }
      } catch {
        // ignore placement history tracking errors
      }

      socketService.deployArmies(currentGame.roomId, territoryId, armies)

      dispatch(
        addTerritoryAction({
          territoryId,
          action: `Deploy ${armies} armies`,
        }),
      )

      // Clear selection after successful deployment
      dispatch(selectTerritory(null))
      dispatch(setPendingAction(null))
    } catch (_error) {
      dispatch(setError('Failed to deploy armies'))
      dispatch(clearOptimisticPlacement({ territoryId }))
      toast.error('Deploy failed')
      dispatch(addClientLog({ text: `Deployment to ${territoryId} failed` }))
    }
  },
)

// Undo last placement in reinforcement phase (client convenience)
export const undoLastPlacement = createAsyncThunk(
  'game/undoLastPlacement',
  async (_: undefined, { getState, dispatch }) => {
    const state = getState() as RootState
    const game = state.game.currentGame
    if (!game) return
    if (game.phase !== 'reinforcement') return
    const history = state.uiRoom.placementHistory ?? []
    if (history.length === 0) return
    const last = history[history.length - 1]
    const territory = game.board.find((t) => t.id === last.territoryId)
    const currentArmies = territory?.armies ?? 0
    const newExpected = Math.max(0, currentArmies - last.armies)
    // Optimistic revert
    dispatch(
      updateTerritory({
        territoryId: last.territoryId,
        armies: newExpected,
      }),
    )
    dispatch(
      trackOptimisticPlacement({ territoryId: last.territoryId, expectedArmies: newExpected }),
    )
    dispatch(popPlacement())
    // Send negative placement to server (engine clamps to baseline)
    socketService.deployArmies(game.roomId, last.territoryId, -last.armies)
    dispatch(
      addTerritoryAction({ territoryId: last.territoryId, action: `Undo ${last.armies} armies` }),
    )
  },
)

// Execute attack action
export const executeAttack = createAsyncThunk(
  'game/executeAttack',
  async (
    {
      fromTerritoryId,
      toTerritoryId,
      commitArmies,
    }: { fromTerritoryId: string; toTerritoryId: string; commitArmies?: number },
    { getState, dispatch },
  ) => {
    const state = getState() as RootState
    const { currentGame } = state.game

    if (!currentGame) throw new Error('No active game')

    try {
      const commit =
        typeof commitArmies === 'number' && commitArmies > 0
          ? commitArmies
          : (state.uiRoom?.attackCommit ?? 1)
      socketService.attack(currentGame.roomId, fromTerritoryId, toTerritoryId, commit)

      dispatch(
        addTerritoryAction({
          territoryId: fromTerritoryId,
          action: `Attack ${toTerritoryId}`,
        }),
      )

      // Keep selection for potential follow-up attacks
      dispatch(selectTargetTerritory(toTerritoryId))
    } catch (_error) {
      dispatch(setError('Failed to execute attack'))
    }
  },
)

// Execute fortify action
export const executeFortify = createAsyncThunk(
  'game/executeFortify',
  async (
    {
      fromTerritoryId,
      toTerritoryId,
      armies,
    }: { fromTerritoryId: string; toTerritoryId: string; armies: number },
    { getState, dispatch },
  ) => {
    const state = getState() as RootState
    const { currentGame } = state.game

    if (!currentGame) throw new Error('No active game')

    try {
      socketService.fortify(currentGame.roomId, fromTerritoryId, toTerritoryId, armies)

      dispatch(
        addTerritoryAction({
          territoryId: fromTerritoryId,
          action: `Fortify ${toTerritoryId} with ${armies} armies`,
        }),
      )

      // Clear selection after fortification
      dispatch(selectTerritory(null))
      dispatch(selectTargetTerritory(null))
      dispatch(setPendingAction(null))
    } catch (_error) {
      dispatch(setError('Failed to execute fortification'))
    }
  },
)

// End turn action
export const endTurn = createAsyncThunk('game/endTurn', async (_, { getState, dispatch }) => {
  const state = getState() as RootState
  const { currentGame } = state.game

  if (!currentGame) throw new Error('No active game')

  try {
    socketService.endTurn(currentGame.roomId)

    // Clear all selections when ending turn
    dispatch(selectTerritory(null))
    dispatch(selectTargetTerritory(null))
    dispatch(setPendingAction(null))
  } catch (_error) {
    dispatch(setError('Failed to end turn'))
  }
})

// Trade a treasure set (three indices from the current player's hand)
export const tradeTreasureSet = createAsyncThunk(
  'game/tradeTreasureSet',
  async (indices: [number, number, number], { getState, dispatch }) => {
    const state = getState() as RootState
    const { currentGame } = state.game

    if (!currentGame) throw new Error('No active game')

    try {
      const action: TradeCardsAction = {
        type: 'trade_cards',
        roomId: currentGame.roomId,
        playerId: state.auth.user?.id || '',
        payload: { treasureSet: indices },
      }
      socketService.sendGameAction({ roomId: currentGame.roomId, action })
    } catch (_error) {
      dispatch(setError('Failed to trade treasures'))
    }
  },
)

// Go back to reinforcement phase action
export const goBackToReinforcement = createAsyncThunk(
  'game/goBackToReinforcement',
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState
    const { currentGame } = state.game

    if (!currentGame) throw new Error('No active game')
    if (currentGame.phase !== 'attack') throw new Error('Can only go back from attack phase')
    if (currentGame.hasAttackedThisTurn) throw new Error('Cannot go back after attacking')

    try {
      socketService.emit('goBackToReinforcement', { roomId: currentGame.roomId })

      // Clear all selections when going back
      dispatch(selectTerritory(null))
      dispatch(selectTargetTerritory(null))
      dispatch(setPendingAction(null))
    } catch (_error) {
      dispatch(setError('Failed to go back to reinforcement phase'))
    }
  },
)

// Calculate reinforcement armies for a player
export const calculateReinforcementArmies = (playerId: string, gameState: GameState) => {
  const playerTerritories = gameState.board.filter((t) => t.ownerId === playerId)
  const territoryCount = playerTerritories.length
  const baseArmies = Math.max(3, Math.floor(territoryCount / 3))

  // TODO: Add sector bonuses
  // const continentBonuses = calculateContinentBonuses(playerId, gameState);

  return baseArmies
}
