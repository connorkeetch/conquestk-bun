import { createAsyncThunk } from '@reduxjs/toolkit'
import { toast } from 'react-hot-toast'
import { API_URL } from '@/config'
import { colyseusService } from '@/services/colyseusService'
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

// Extend shared GameAction with client-only actions
type SharedGameAction = import('@conquestk/shared').GameAction
type TransferConquestAction = {
  type: 'transfer_conquest'
  roomId: string
  playerId: string
  payload: { fromTerritoryId: string; toTerritoryId: string; armies: number }
}
type UndoFortifyAction = {
  type: 'undo_fortify'
  roomId: string
  playerId: string
  payload?: undefined
}
export type GameAction = SharedGameAction | TransferConquestAction | UndoFortifyAction
// end imports

// During the Colyseus migration, gameplay actions stay on the proven REST/cache
// engine (gameService + gameStateCache). The Colyseus room is currently a
// live-update notification channel: the server broadcasts a 'state:changed' nudge
// when the cache advances and clients refetch via fetchGameState — it is NOT yet
// the authoritative engine (its in-room engineState is not initialized for games
// started via REST). Flip this to true only once the room owns and processes game
// state end-to-end (full cutover). Routing actions to the room before then makes
// them fail with "Game not initialized" / "no rooms found".
const COLYSEUS_AUTHORITATIVE = false

// Send a gameplay action. POST failures are surfaced (not silently swallowed) so a
// rejected move is visible; genuine offline is left to the service worker queue.
async function postAction(url: string, body: unknown, headers: Record<string, string>) {
  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    if (!res.ok) {
      let message = `Action failed (${res.status})`
      try {
        const data = (await res.json()) as { message?: string; error?: string }
        message = data.message || data.error || message
      } catch {
        /* non-JSON error body */
      }
      toast.error(message)
    }
  } catch {
    // Network-level failure: if we're offline the service worker will queue it;
    // otherwise surface it so the move isn't silently lost.
    if (isOnline) {
      toast.error('Could not reach the game server')
    }
  }
}

// Unified action emitter. See COLYSEUS_AUTHORITATIVE above for the transitional
// routing: today everything goes over HTTP to the authoritative cache engine.
async function sendOrQueueAction(state: RootState, action: GameAction): Promise<void> {
  const roomId = action.roomId

  if (
    COLYSEUS_AUTHORITATIVE &&
    (typeof navigator === 'undefined' ? true : navigator.onLine) &&
    state.uiRoom.connectionStatus === 'connected' &&
    colyseusService.isConnected()
  ) {
    // Send the canonical action verbatim — the authoritative GameRoom forwards it to
    // gameService.processGameAction and normalizes identity server-side. No lossy
    // flat-shape translation (that old converter dropped/garbled attack dice,
    // trade_cards, transfer_conquest, and resign).
    colyseusService.sendGameAction(action)
    return
  }

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token && token !== 'null' && token !== 'undefined') headers.Authorization = `Bearer ${token}`

  if (action.type === 'transfer_conquest') {
    const { fromTerritoryId, toTerritoryId, armies } = action.payload as {
      fromTerritoryId: string
      toTerritoryId: string
      armies: number
    }
    await postAction(
      `${API_URL}/game/rooms/${roomId}/transfer-conquest`,
      { fromTerritoryId, toTerritoryId, armies },
      headers,
    )
    return
  }

  await postAction(`${API_URL}/game/rooms/${roomId}/actions`, { action }, headers)
}

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

    if (!currentGame) throw new Error('No active game')

    try {
      await sendOrQueueAction(getState() as RootState, {
        type: 'deploy',
        roomId: currentGame.roomId,
        playerId: state.auth.user?.id || currentGame.currentPlayer,
        payload: { territoryId, armies },
      })

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
      await sendOrQueueAction(getState() as RootState, {
        type: 'deploy',
        roomId: currentGame.roomId,
        playerId: userId,
        payload: { territoryId: last.territoryId, armies: -last.armies },
      })
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
      await sendOrQueueAction(state as RootState, {
        type: 'attack',
        roomId: currentGame.roomId,
        playerId: state.auth.user?.id || currentGame.currentPlayer,
        payload: { fromTerritoryId, toTerritoryId },
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
      await sendOrQueueAction(state as RootState, {
        type: 'transfer_conquest',
        roomId: currentGame.roomId,
        playerId: state.auth.user?.id || currentGame.currentPlayer,
        payload: { fromTerritoryId, toTerritoryId, armies },
      })

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
      await sendOrQueueAction(getState() as RootState, {
        type: 'fortify',
        roomId: currentGame.roomId,
        playerId: (getState() as RootState).auth.user?.id || currentGame.currentPlayer,
        payload: { fromTerritoryId, toTerritoryId, armies },
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

// Undo fortify action
export const undoFortify = createAsyncThunk(
  'game/undoFortify',
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState
    const { currentGame } = state.game

    if (!currentGame) throw new Error('No active game')

    try {
      await sendOrQueueAction(getState() as RootState, {
        type: 'undo_fortify',
        roomId: currentGame.roomId,
        playerId: (getState() as RootState).auth.user?.id || currentGame.currentPlayer,
      })

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
    const action = {
      type: 'end_turn',
      roomId: currentGame.roomId,
      playerId: state.auth.user?.id || currentGame.currentPlayer,
    } as const
    await sendOrQueueAction(state, action as unknown as GameAction)

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
      await sendOrQueueAction(state, action as unknown as GameAction)
    } catch (_error) {
      dispatch(setError('Failed to trade treasures'))
    }
  },
)

// Resign from the current game (socket-only; no HTTP fallback available)
export const resignFromGame = createAsyncThunk(
  'game/resign',
  async (roomId: string, { getState, dispatch }) => {
    const state = getState() as RootState
    const currentGame = state.game.currentGame
    if (!currentGame || currentGame.roomId !== roomId) {
      dispatch(setError('Unable to resign: game not found'))
      return
    }
    const isConnected = state.uiRoom.connectionStatus === 'connected'
    if (!isConnected) {
      dispatch(setError('Cannot resign while offline or disconnected'))
      return
    }
    try {
      await sendOrQueueAction(state, {
        type: 'resign',
        roomId,
        playerId: state.auth.user?.id || currentGame.currentPlayer,
      } as GameAction)
    } catch (_e) {
      dispatch(setError('Failed to resign'))
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

      await sendOrQueueAction(state, action as unknown as GameAction)

      // Clear all selections when going back
      dispatch(selectTerritory(null))
      dispatch(selectTargetTerritory(null))
      dispatch(setPendingAction(null))
    } catch (_error) {
      dispatch(setError('Failed to go back to reinforcement phase'))
    }
  },
)

export const goBackToAttack = createAsyncThunk(
  'game/goBackToAttack',
  async (_, { getState, dispatch }) => {
    const state = getState() as RootState
    const { currentGame } = state.game

    if (!currentGame) throw new Error('No active game')
    if (currentGame.phase !== 'fortify') throw new Error('Can only go back from fortify phase')
    if (Object.keys(currentGame.movementTracking ?? {}).length > 0) {
      throw new Error('Cannot go back after fortifying')
    }

    try {
      const action = {
        type: 'go_back_to_attack',
        roomId: currentGame.roomId,
        playerId: state.auth.user?.id || currentGame.currentPlayer,
      } as const

      await sendOrQueueAction(state, action as unknown as GameAction)

      dispatch(selectTerritory(null))
      dispatch(selectTargetTerritory(null))
      dispatch(setPendingAction(null))
    } catch (_error) {
      dispatch(setError('Failed to go back to attack phase'))
    }
  },
)

// Calculate reinforcement armies for a player
export const calculateReinforcementArmies = (playerId: string, gameState: GameState) => {
  return computeBoardReinforcements(gameState, playerId)
}
