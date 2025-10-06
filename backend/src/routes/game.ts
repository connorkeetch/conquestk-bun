import { Router } from 'express'
import { GameController } from '../controllers/gameController'
import { authenticateToken } from '../middleware/auth'

const router = Router()
const gameController = new GameController()

router.use(authenticateToken)

router.get('/rooms', gameController.getRooms)
router.post('/rooms', gameController.createRoom)
router.post('/rooms/:roomId/team-assignments', gameController.updateTeamAssignment)
router.put('/rooms/:roomId/ai-opponents', gameController.updateAiOpponents)
router.post('/rooms/:roomId/join', gameController.joinRoom)
router.delete('/rooms/:roomId/leave', gameController.leaveRoom)
router.post('/rooms/:roomId/ready-state', gameController.setReadyState)
router.get('/rooms/:roomId', gameController.getRoomDetails)
router.get('/rooms/:roomId/state', gameController.getRoomState)
router.get('/rooms/:roomId/log', gameController.getRoomLog)
router.get('/my-games', gameController.getMyGames)
router.get('/my-games/meta', gameController.getMyGamesMeta)

export { router as gameRoutes }
