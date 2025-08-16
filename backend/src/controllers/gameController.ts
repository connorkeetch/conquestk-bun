import { Request, Response } from 'express';
import { GameRoomService } from '../services/gameRoomService';
import { logger } from '../utils/logger';

export class GameController {
  private gameRoomService = new GameRoomService();

  getRooms = async (req: Request, res: Response) => {
    try {
      const rooms = await this.gameRoomService.getActiveRooms();
      return res.json({ rooms });
    } catch (error) {
      logger.error('Get rooms error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  createRoom = async (req: Request, res: Response) => {
    try {
      const { name, maxPlayers, isPrivate } = req.body;
      const hostId = (req as any).userId;
      
      const room = await this.gameRoomService.createRoom({
        name,
        hostId,
        maxPlayers: maxPlayers || 6,
        isPrivate: isPrivate || false,
        status: 'waiting'
      });

      return res.status(201).json({ room });
    } catch (error) {
      logger.error('Create room error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  joinRoom = async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const userId = (req as any).userId;
      
      const result = await this.gameRoomService.joinRoom(roomId, userId);
      return res.json(result);
    } catch (error) {
      logger.error('Join room error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  leaveRoom = async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const userId = (req as any).userId;
      
      await this.gameRoomService.leaveRoom(roomId, userId);
      return res.json({ message: 'Left room successfully' });
    } catch (error) {
      logger.error('Leave room error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };

  getRoomDetails = async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const room = await this.gameRoomService.getRoomById(roomId);
      
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }

      return res.json({ room });
    } catch (error) {
      logger.error('Get room details error:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  };
}