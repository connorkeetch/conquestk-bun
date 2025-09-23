import { createAsyncThunk } from '@reduxjs/toolkit'
import { socketService } from '../services/socketService'
import type { GameState } from '../types/game'
import { isFriendlyTerritoryOwner } from '../utils/teamHelpers'
import {
  addTerritoryAction,
  selectTargetTerritory,
  selectTerritory,
  setError,
  setPendingAction,
} from './gameSlice'
import type { RootState } from './index'

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
    switch (currentGame.phase) {
      case 'reinforcement':
        return dispatch(handleReinforcementClick({ territoryId, territory, selectedTerritory }))

      case 'attack':
        return dispatch(
          handleAttackClick({ territoryId, territory, selectedTerritory, validTargets }),
        )

      case 'fortify':
        return dispatch(
          handleFortifyClick({ territoryId, territory, selectedTerritory, validTargets }),
        )

      default:
        dispatch(selectTerritory(territoryId))
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
    const currentState = getState()
    const currentPlayerId = currentState.auth.user?.id
    const currentGame = currentState.game.currentGame

    if (!currentPlayerId || !currentGame) {
      dispatch(setError('No active game'))
      return
    }

    const friendly = territory
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
      return dispatch(deployArmies({ territoryId, armies: 1 }))
    }

    // Select territory for deployment
    dispatch(selectTerritory(territoryId))
    dispatch(setPendingAction('deploy'))
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
    const currentPlayerId = getState().auth.user?.id

    if (!selectedTerritory) {
      // Select attacking territory
      if (territory?.ownerId === currentPlayerId && territory.armies > 1) {
        dispatch(selectTerritory(territoryId))
        dispatch(setPendingAction('attack'))
      } else if (territory?.ownerId === currentPlayerId) {
        dispatch(setError('Need at least 2 armies to attack'))
      } else {
        dispatch(setError('Select your own territory to attack from'))
      }
    } else {
      // Select target territory or execute attack
      if (validTargets.includes(territoryId)) {
        if (territory?.ownerId !== currentPlayerId) {
          // Execute attack
          return dispatch(
            executeAttack({
              fromTerritoryId: selectedTerritory,
              toTerritoryId: territoryId,
            }),
          )
        }
      } else {
        // Invalid target, select new attacking territory if it's owned by player
        if (territory?.ownerId === currentPlayerId && territory.armies > 1) {
          dispatch(selectTerritory(territoryId))
        } else {
          dispatch(selectTerritory(null))
          dispatch(setPendingAction(null))
        }
      }
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
    const currentPlayerId = getState().auth.user?.id

    if (!selectedTerritory) {
      // Select source territory for fortification
      if (territory?.ownerId === currentPlayerId && territory.armies > 1) {
        dispatch(selectTerritory(territoryId))
        dispatch(setPendingAction('fortify'))
      } else if (territory?.ownerId === currentPlayerId) {
        dispatch(setError('Need at least 2 armies to fortify'))
      } else {
        dispatch(setError('Select your own territory to fortify from'))
      }
    } else {
      // Select target territory or execute fortification
      if (validTargets.includes(territoryId)) {
        // Execute fortification
        return dispatch(
          executeFortify({
            fromTerritoryId: selectedTerritory,
            toTerritoryId: territoryId,
            armies: 1, // Default to moving 1 army, can be made configurable
          }),
        )
      }
      // Invalid target, select new source territory if it's owned by player
      if (territory?.ownerId === currentPlayerId && territory.armies > 1) {
        dispatch(selectTerritory(territoryId))
      } else {
        dispatch(selectTerritory(null))
        dispatch(setPendingAction(null))
      }
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
      socketService.emit('deployArmies', {
        roomId: currentGame.roomId,
        territoryId,
        armies,
      })

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
    }
  },
)

// Execute attack action
export const executeAttack = createAsyncThunk(
  'game/executeAttack',
  async (
    { fromTerritoryId, toTerritoryId }: { fromTerritoryId: string; toTerritoryId: string },
    { getState, dispatch },
  ) => {
    const state = getState() as RootState
    const { currentGame } = state.game

    if (!currentGame) throw new Error('No active game')

    try {
      socketService.emit('attack', {
        roomId: currentGame.roomId,
        fromTerritoryId,
        toTerritoryId,
      })

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
      socketService.emit('fortify', {
        roomId: currentGame.roomId,
        fromTerritoryId,
        toTerritoryId,
        armies,
      })

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
      socketService.emit('goBackToReinforcement', {
        roomId: currentGame.roomId,
      })

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

  // TODO: Add continent bonuses
  // const continentBonuses = calculateContinentBonuses(playerId, gameState);

  return baseArmies
}
