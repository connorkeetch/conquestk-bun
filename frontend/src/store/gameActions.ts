import { createAsyncThunk } from '@reduxjs/toolkit'
import { toast } from 'react-hot-toast'
import { API_URL } from '@/config'
import { socketService } from '@/services/socketService'
import { computeBoardReinforcements } from '@/utils/reinforcements'
import type { GameState, TradeCardsAction } from '../types/game'
import { isFriendlyTerritoryOwner } from '../utils/teamHelpers'
import {
  addTerritoryAction,
  selectTargetTerritory,
  selectTerritory,
  setError,
  setPendingAction,
} from './gameSlice'
import type { AppDispatch, RootState } from './index'
import { addClientLog, recordPlacement, removeLastPlacement } from './uiRoomSlice'

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
        await typedDispatch(
          handleReinforcementClick({
            territoryId,
            ...(territory ? { territory } : {}),
            selectedTerritory,
          }),
        )
        return

      case 'attack':
        await typedDispatch(
          handleAttackClick({
            territoryId,
            ...(territory ? { territory } : {}),
            selectedTerritory,
            validTargets,
          }),
        )
        return

      case 'fortify':
        await typedDispatch(
          handleFortifyClick({
            territoryId,
            ...(territory ? { territory } : {}),
            selectedTerritory,
            validTargets,
          }),
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
      // Execute fortification with default max (all but 1) when using this path
      const game = getState().game.currentGame
      const src = game?.board.find((t) => t.id === selectedTerritory)
      const maxMovable = Math.max(1, Math.max(0, (src?.armies ?? 1) - 1))
      await typedDispatch(
        executeFortify({
          fromTerritoryId: selectedTerritory,
          toTerritoryId: territoryId,
          armies: maxMovable,
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

// Deploy armies action - wait for server confirmation
export const deployArmies = createAsyncThunk(
  'game/deployArmies',
  async (
    { territoryId, armies }: { territoryId: string; armies: number },
    { getState, dispatch },
  ) => {
    const state = getState() as RootState
    const { currentGame } = state.game
    const { connectionStatus } = state.uiRoom

    if (!currentGame) throw new Error('No active game')

    try {
      const shouldFallback =
        typeof navigator !== 'undefined' && (!navigator.onLine || connectionStatus !== 'connected')

      if (shouldFallback) {
        const action = {
          type: 'deploy',
          roomId: currentGame.roomId,
          playerId: state.auth.user?.id || currentGame.currentPlayer,
          payload: { territoryId, armies },
        }
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token && token !== 'null' && token !== 'undefined')
          headers.Authorization = `Bearer ${token}`
        await fetch(`${API_URL}/game/rooms/${currentGame.roomId}/actions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action }),
        }).catch(() => {
          /* offline fallback handled by service worker */
        })
      } else {
        // Send to server via socket - UI updates via socket deltas
        socketService.deployArmies(currentGame.roomId, territoryId, armies)
      }

      dispatch(
        addTerritoryAction({
          territoryId,
          action: `Deploy ${armies} armies`,
        }),
      )

      // Track client-side placement history for undo during reinforcement phase
      if (currentGame.phase === 'reinforcement' && armies > 0) {
        dispatch(recordPlacement({ territoryId, armies }))
      }

      // Clear selection after sending deployment
      dispatch(selectTerritory(null))
      dispatch(setPendingAction(null))
    } catch (_error) {
      dispatch(setError('Failed to deploy armies'))
      toast.error('Deploy failed')
      dispatch(addClientLog({ text: `Deployment to ${territoryId} failed` }))
    }
  },
)

// Undo the most recent reinforcement placement (client-tracked)
export const undoLastPlacement = createAsyncThunk(
  'game/undoLastPlacement',
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState
    const { currentGame } = state.game
    const history = state.uiRoom.placementHistory ?? []
    const userId = state.auth.user?.id

    if (!currentGame || !userId || currentGame.currentPlayer !== userId) {
      dispatch(setError('Not your turn'))
      return
    }
    if (currentGame.phase !== 'reinforcement') {
      dispatch(setError('Undo is only available during reinforcement'))
      return
    }
    if (history.length === 0) {
      dispatch(setError('Nothing to undo'))
      return
    }

    const last = history[history.length - 1]
    try {
      const shouldFallback =
        typeof navigator !== 'undefined' &&
        (!navigator.onLine || state.uiRoom.connectionStatus !== 'connected')
      if (shouldFallback) {
        const action = {
          type: 'deploy',
          roomId: currentGame.roomId,
          playerId: userId,
          payload: { territoryId: last.territoryId, armies: -last.armies },
        }
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token && token !== 'null' && token !== 'undefined')
          headers.Authorization = `Bearer ${token}`
        await fetch(`${API_URL}/game/rooms/${currentGame.roomId}/actions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action }),
        }).catch(() => {
          /* offline fallback handled by service worker */
        })
      } else {
        socketService.deployArmies(currentGame.roomId, last.territoryId, -last.armies)
      }
      dispatch(removeLastPlacement())
      dispatch(
        addClientLog({
          text: `Undid placement of ${last.armies} on ${last.territoryId}`,
          roomId: currentGame.roomId,
        }),
      )
    } catch (_e) {
      dispatch(setError('Failed to undo placement'))
      toast.error('Undo placement failed')
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
      const shouldFallback =
        typeof navigator !== 'undefined' &&
        (!navigator.onLine || state.uiRoom.connectionStatus !== 'connected')
      if (shouldFallback) {
        const action = {
          type: 'attack',
          roomId: currentGame.roomId,
          playerId: state.auth.user?.id || currentGame.currentPlayer,
          payload: { fromTerritoryId, toTerritoryId },
        }
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token && token !== 'null' && token !== 'undefined')
          headers.Authorization = `Bearer ${token}`
        await fetch(`${API_URL}/game/rooms/${currentGame.roomId}/actions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action }),
        }).catch(() => {
          /* offline fallback handled by service worker */
        })
      } else {
        // Do not send a fixed armies value; backend determines dice from available armies
        socketService.attack(currentGame.roomId, fromTerritoryId, toTerritoryId)
      }

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

// Transfer armies after conquest
export const transferConquestArmies = createAsyncThunk(
  'game/transferConquestArmies',
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
      const shouldFallback =
        typeof navigator !== 'undefined' &&
        (!navigator.onLine || state.uiRoom.connectionStatus !== 'connected')

      if (shouldFallback) {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token && token !== 'null' && token !== 'undefined')
          headers.Authorization = `Bearer ${token}`

        await fetch(`${API_URL}/game/rooms/${currentGame.roomId}/transfer-conquest`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ fromTerritoryId, toTerritoryId, armies }),
        }).catch(() => {
          /* offline fallback handled by service worker */
        })
      } else {
        // Use the socket event when connected
        socketService.transferConquestArmies(
          currentGame.roomId,
          fromTerritoryId,
          toTerritoryId,
          armies,
        )
      }

      dispatch(
        addTerritoryAction({
          territoryId: fromTerritoryId,
          action: `Transfer ${armies} to ${toTerritoryId}`,
        }),
      )
    } catch (_error) {
      dispatch(setError('Failed to transfer armies'))
      toast.error('Failed to transfer armies')
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
      const shouldFallback =
        typeof navigator !== 'undefined' &&
        (!navigator.onLine || (getState() as RootState).uiRoom.connectionStatus !== 'connected')

      if (shouldFallback) {
        const action = {
          type: 'fortify',
          roomId: currentGame.roomId,
          playerId: (getState() as RootState).auth.user?.id || currentGame.currentPlayer,
          payload: { fromTerritoryId, toTerritoryId, armies },
        }
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token && token !== 'null' && token !== 'undefined')
          headers.Authorization = `Bearer ${token}`
        await fetch(`${API_URL}/game/rooms/${currentGame.roomId}/actions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action }),
        }).catch(() => {
          /* offline fallback handled by service worker */
        })
      } else {
        socketService.fortify(currentGame.roomId, fromTerritoryId, toTerritoryId, armies)
      }

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

// Undo fortify action
export const undoFortify = createAsyncThunk(
  'game/undoFortify',
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState
    const { currentGame } = state.game

    if (!currentGame) throw new Error('No active game')

    try {
      const shouldFallback =
        typeof navigator !== 'undefined' &&
        (!navigator.onLine || (getState() as RootState).uiRoom.connectionStatus !== 'connected')
      if (shouldFallback) {
        const action = {
          type: 'undo_fortify',
          roomId: currentGame.roomId,
          playerId: (getState() as RootState).auth.user?.id || currentGame.currentPlayer,
        }
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token && token !== 'null' && token !== 'undefined')
          headers.Authorization = `Bearer ${token}`
        await fetch(`${API_URL}/game/rooms/${currentGame.roomId}/actions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action }),
        }).catch(() => {
          /* offline fallback handled by service worker */
        })
      } else {
        socketService.undoFortify(currentGame.roomId)
      }

      // Clear selections after undo
      dispatch(selectTerritory(null))
      dispatch(selectTargetTerritory(null))
      dispatch(setPendingAction(null))
    } catch (_error) {
      dispatch(setError('Failed to undo fortify'))
      toast.error('Failed to undo fortify')
    }
  },
)

// End turn action
export const endTurn = createAsyncThunk('game/endTurn', async (_, { getState, dispatch }) => {
  const state = getState() as RootState
  const { currentGame, reinforcementArmies } = state.game
  const { connectionStatus } = state.uiRoom

  if (!currentGame) throw new Error('No active game')

  // Prevent accidental progression during reinforcement
  if (currentGame.phase === 'reinforcement' && reinforcementArmies > 0) {
    const remaining = reinforcementArmies
    try {
      toast.error(`You still have ${remaining} reinforcements to place`)
    } catch {
      // ignore toast errors
    }
    return
  }

  try {
    // If offline or socket disconnected, fall back to HTTP + Background Sync
    const shouldFallback =
      typeof navigator !== 'undefined' && (!navigator.onLine || connectionStatus !== 'connected')

    if (shouldFallback) {
      const action = {
        type: 'end_turn',
        roomId: currentGame.roomId,
        playerId: state.auth.user?.id || currentGame.currentPlayer,
      }
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token && token !== 'null' && token !== 'undefined')
        headers.Authorization = `Bearer ${token}`

      // Use fetch so the service worker can intercept and queue via Background Sync
      await fetch(`${API_URL}/game/rooms/${currentGame.roomId}/actions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action }),
      })
        .then(() => {
          try {
            toast.success('Turn queued — will submit when online')
          } catch (_e) {
            /* ignore toast errors */
          }
        })
        .catch(() => {
          // If fetch throws (likely offline), Background Sync should enqueue the request
          try {
            toast('Turn queued for background sync')
          } catch (_e) {
            /* ignore toast errors */
          }
        })
    } else {
      socketService.endTurn(currentGame.roomId)
    }

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
      const shouldFallback =
        typeof navigator !== 'undefined' &&
        (!navigator.onLine || state.uiRoom.connectionStatus !== 'connected')
      if (shouldFallback) {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token && token !== 'null' && token !== 'undefined')
          headers.Authorization = `Bearer ${token}`
        await fetch(`${API_URL}/game/rooms/${currentGame.roomId}/actions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action }),
        }).catch(() => {
          /* offline fallback handled by service worker */
        })
      } else {
        socketService.sendGameAction({ roomId: currentGame.roomId, action })
      }
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
      const action = {
        type: 'go_back_to_reinforcement',
        roomId: currentGame.roomId,
        playerId: state.auth.user?.id || currentGame.currentPlayer,
      } as const

      const shouldFallback =
        typeof navigator !== 'undefined' &&
        (!navigator.onLine || state.uiRoom.connectionStatus !== 'connected')
      if (shouldFallback) {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token && token !== 'null' && token !== 'undefined')
          headers.Authorization = `Bearer ${token}`
        await fetch(`${API_URL}/game/rooms/${currentGame.roomId}/actions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action }),
        }).catch(() => {
          /* offline fallback handled by service worker */
        })
      } else {
        socketService.sendGameAction({ roomId: currentGame.roomId, action })
      }

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
  return computeBoardReinforcements(gameState, playerId)
}
