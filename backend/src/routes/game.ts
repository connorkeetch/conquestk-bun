import { Router } from 'express';
import { GameController } from '../controllers/gameController';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const gameController = new GameController();

router.use(authenticateToken);

router.get('/rooms', gameController.getRooms);
router.post('/rooms', gameController.createRoom);
router.post('/rooms/:roomId/join', gameController.joinRoom);
router.delete('/rooms/:roomId/leave', gameController.leaveRoom);
router.get('/rooms/:roomId', gameController.getRoomDetails);

export { router as gameRoutes };