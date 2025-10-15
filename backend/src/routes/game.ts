import { Router } from 'express'
import { GameController } from '../controllers/gameController.js'
import { authenticateToken } from '../middleware/auth.js'

const router = Router()
const gameController = new GameController()

router.use(authenticateToken)

router.get('/rooms', gameController.getRooms)
router.post('/rooms', gameController.createRoom)
router.post('/rooms/:roomId/team-assignments', gameController.updateTeamAssignment)
router.put('/rooms/:roomId/ai-opponents', gameController.updateAiOpponents)
router.post('/rooms/:roomId/join', gameController.joinRoom)
router.delete('/rooms/:roomId/leave', gameController.leaveRoom)
// Host-only: close a lobby before it starts
router.post('/rooms/:roomId/close', gameController.closeRoom)
router.post('/rooms/:roomId/ready-state', gameController.setReadyState)
// Submit a game action via HTTP (fallback for offline/queued submissions)
router.post('/rooms/:roomId/actions', gameController.submitAction)
// Conquest transfer (fallback for offline/queued submissions)
router.post('/rooms/:roomId/transfer-conquest', gameController.transferConquest)
router.get('/rooms/:roomId', gameController.getRoomDetails)
router.get('/rooms/:roomId/state', gameController.getRoomState)
router.get('/rooms/:roomId/log', gameController.getRoomLog)
router.get('/rooms/:roomId/log-text', gameController.getRoomLogText)
router.get('/my-games', gameController.getMyGames)
router.get('/my-games/meta', gameController.getMyGamesMeta)

export { router as gameRoutes }
