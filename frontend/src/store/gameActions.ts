import { createAsyncThunk } from '@reduxjs/toolkit'
import { RootState } from './index'
import { socketService } from '../services/socketService'
import { 
  selectTerritory, 
  selectTargetTerritory, 
  setPendingAction, 
  addTerritoryAction,
  setError 
} from './gameSlice'

// Async thunk for handling territory clicks based on game phase
export const handleTerritoryClick = createAsyncThunk(
  'game/handleTerritoryClick',
  async (territoryId: string, { getState, dispatch }) => {
    const state = getState() as RootState
    const { currentGame, selectedTerritory, validTargets } = state.game
    
    if (!currentGame) {
      throw new Error('No active game')
    }

    const territory = currentGame.board.find(t => t.id === territoryId)
    const isCurrentPlayerTurn = currentGame.currentPlayer === state.auth.user?.id
    
    if (!isCurrentPlayerTurn) {
      dispatch(setError('Not your turn'))
      return
    }

    // Handle based on current game phase
    switch (currentGame.phase) {
      case 'reinforcement':
        return dispatch(handleReinforcementClick({ territoryId, territory, selectedTerritory, state }))
      
      case 'attack':
        return dispatch(handleAttackClick({ territoryId, territory, selectedTerritory, validTargets, state }))
      
      case 'fortify':
        return dispatch(handleFortifyClick({ territoryId, territory, selectedTerritory, validTargets, state }))
      
      default:
        dispatch(selectTerritory(territoryId))
    }
  }
)

// Handle reinforcement phase clicks
export const handleReinforcementClick = createAsyncThunk(
  'game/handleReinforcementClick',
  async ({ territoryId, territory, selectedTerritory, state }: any, { dispatch }) => {
    const currentPlayerId = state.auth.user?.id
    
    if (territory?.ownerId === currentPlayerId) {
      if (selectedTerritory === territoryId) {
        // Deploy armies to selected territory
        return dispatch(deployArmies({ territoryId, armies: 1 }))
      } else {
        // Select territory for deployment
        dispatch(selectTerritory(territoryId))
        dispatch(setPendingAction('deploy'))
      }
    } else {
      dispatch(setError('You can only deploy armies to your own territories'))
    }
  }
)

// Handle attack phase clicks
export const handleAttackClick = createAsyncThunk(
  'game/handleAttackClick',
  async ({ territoryId, territory, selectedTerritory, validTargets, state }: any, { dispatch }) => {
    const currentPlayerId = state.auth.user?.id
    
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
          return dispatch(executeAttack({ 
            fromTerritoryId: selectedTerritory, 
            toTerritoryId: territoryId 
          }))
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
  }
)

// Handle fortify phase clicks
export const handleFortifyClick = createAsyncThunk(
  'game/handleFortifyClick',
  async ({ territoryId, territory, selectedTerritory, validTargets, state }: any, { dispatch }) => {
    const currentPlayerId = state.auth.user?.id
    
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
        return dispatch(executeFortify({ 
          fromTerritoryId: selectedTerritory, 
          toTerritoryId: territoryId,
          armies: 1 // Default to moving 1 army, can be made configurable
        }))
      } else {
        // Invalid target, select new source territory if it's owned by player
        if (territory?.ownerId === currentPlayerId && territory.armies > 1) {
          dispatch(selectTerritory(territoryId))
        } else {
          dispatch(selectTerritory(null))
          dispatch(setPendingAction(null))
        }
      }
    }
  }
)

// Deploy armies action
export const deployArmies = createAsyncThunk(
  'game/deployArmies',
  async ({ territoryId, armies }: { territoryId: string; armies: number }, { getState, dispatch }) => {
    const state = getState() as RootState
    const { currentGame } = state.game
    
    if (!currentGame) throw new Error('No active game')
    
    try {
      socketService.emit('deployArmies', {
        roomId: currentGame.roomId,
        territoryId,
        armies
      })
      
      dispatch(addTerritoryAction({ 
        territoryId, 
        action: `Deploy ${armies} armies` 
      }))
      
      // Clear selection after successful deployment
      dispatch(selectTerritory(null))
      dispatch(setPendingAction(null))
      
    } catch (error) {
      dispatch(setError('Failed to deploy armies'))
    }
  }
)

// Execute attack action
export const executeAttack = createAsyncThunk(
  'game/executeAttack',
  async ({ fromTerritoryId, toTerritoryId }: { fromTerritoryId: string; toTerritoryId: string }, { getState, dispatch }) => {
    const state = getState() as RootState
    const { currentGame } = state.game
    
    if (!currentGame) throw new Error('No active game')
    
    try {
      socketService.emit('attack', {
        roomId: currentGame.roomId,
        fromTerritoryId,
        toTerritoryId
      })
      
      dispatch(addTerritoryAction({ 
        territoryId: fromTerritoryId, 
        action: `Attack ${toTerritoryId}` 
      }))
      
      // Keep selection for potential follow-up attacks
      dispatch(selectTargetTerritory(toTerritoryId))
      
    } catch (error) {
      dispatch(setError('Failed to execute attack'))
    }
  }
)

// Execute fortify action
export const executeFortify = createAsyncThunk(
  'game/executeFortify',
  async ({ fromTerritoryId, toTerritoryId, armies }: { fromTerritoryId: string; toTerritoryId: string; armies: number }, { getState, dispatch }) => {
    const state = getState() as RootState
    const { currentGame } = state.game
    
    if (!currentGame) throw new Error('No active game')
    
    try {
      socketService.emit('fortify', {
        roomId: currentGame.roomId,
        fromTerritoryId,
        toTerritoryId,
        armies
      })
      
      dispatch(addTerritoryAction({ 
        territoryId: fromTerritoryId, 
        action: `Fortify ${toTerritoryId} with ${armies} armies` 
      }))
      
      // Clear selection after fortification
      dispatch(selectTerritory(null))
      dispatch(selectTargetTerritory(null))
      dispatch(setPendingAction(null))
      
    } catch (error) {
      dispatch(setError('Failed to execute fortification'))
    }
  }
)

// End turn action
export const endTurn = createAsyncThunk(
  'game/endTurn',
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState
    const { currentGame } = state.game
    
    if (!currentGame) throw new Error('No active game')
    
    try {
      socketService.endTurn(currentGame.roomId)
      
      // Clear all selections when ending turn
      dispatch(selectTerritory(null))
      dispatch(selectTargetTerritory(null))
      dispatch(setPendingAction(null))
      
    } catch (error) {
      dispatch(setError('Failed to end turn'))
    }
  }
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
      socketService.emit('goBackToReinforcement', {
        roomId: currentGame.roomId
      })
      
      // Clear all selections when going back
      dispatch(selectTerritory(null))
      dispatch(selectTargetTerritory(null))
      dispatch(setPendingAction(null))
      
    } catch (error) {
      dispatch(setError('Failed to go back to reinforcement phase'))
    }
  }
)

// Calculate reinforcement armies for a player
export const calculateReinforcementArmies = (playerId: string, gameState: any) => {
  const playerTerritories = gameState.board.filter((t: any) => t.ownerId === playerId);
  const territoryCount = playerTerritories.length;
  const baseArmies = Math.max(3, Math.floor(territoryCount / 3));
  
  // TODO: Add continent bonuses
  // const continentBonuses = calculateContinentBonuses(playerId, gameState);
  
  return baseArmies;
}