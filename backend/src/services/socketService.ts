import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { GameService } from './gameService';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

export function setupSocketHandlers(io: Server) {
  const gameService = new GameService();

  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as any;
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info(`User ${socket.userId} connected`);

    socket.on('join-room', async (roomId: string) => {
      try {
        await socket.join(roomId);
        socket.to(roomId).emit('player-joined', { 
          userId: socket.userId,
          socketId: socket.id 
        });
        logger.info(`User ${socket.userId} joined room ${roomId}`);
      } catch (error) {
        logger.error('Join room error:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    socket.on('leave-room', async (roomId: string) => {
      try {
        await socket.leave(roomId);
        socket.to(roomId).emit('player-left', { 
          userId: socket.userId,
          socketId: socket.id 
        });
        logger.info(`User ${socket.userId} left room ${roomId}`);
      } catch (error) {
        logger.error('Leave room error:', error);
      }
    });

    socket.on('game-action', async (data) => {
      try {
        const result = await gameService.processGameAction(data, socket.userId!);
        socket.to(data.roomId).emit('game-update', result);
      } catch (error) {
        logger.error('Game action error:', error);
        socket.emit('error', { message: 'Invalid game action' });
      }
    });

    // Deployment phase
    socket.on('deployArmies', async (data) => {
      try {
        const result = await gameService.deployArmies(data.roomId, socket.userId!, data.territoryId, data.armies);
        io.to(data.roomId).emit('armiesDeployed', result);
        io.to(data.roomId).emit('game-update', result.gameState);
      } catch (error) {
        logger.error('Deploy armies error:', error);
        socket.emit('gameError', { message: 'Failed to deploy armies' });
      }
    });

    // Attack phase
    socket.on('attack', async (data) => {
      try {
        const result = await gameService.attack(data.roomId, socket.userId!, data.fromTerritoryId, data.toTerritoryId);
        io.to(data.roomId).emit('attackResult', result);
        io.to(data.roomId).emit('game-update', result.gameState);
      } catch (error) {
        logger.error('Attack error:', error);
        socket.emit('gameError', { message: 'Failed to execute attack' });
      }
    });

    // Fortification phase
    socket.on('fortify', async (data) => {
      try {
        const result = await gameService.fortify(data.roomId, socket.userId!, data.fromTerritoryId, data.toTerritoryId, data.armies);
        io.to(data.roomId).emit('territoriesFortified', result);
        io.to(data.roomId).emit('game-update', result.gameState);
      } catch (error) {
        logger.error('Fortify error:', error);
        socket.emit('gameError', { message: 'Failed to fortify' });
      }
    });

    // End turn
    socket.on('endTurn', async (data) => {
      try {
        const result = await gameService.endTurn(data.roomId, socket.userId!);
        io.to(data.roomId).emit('phaseChanged', {
          phase: result.gameState.phase,
          currentPlayer: result.gameState.currentPlayer,
          turn: result.gameState.turn,
          reinforcementArmies: result.reinforcementArmies
        });
        io.to(data.roomId).emit('game-update', result.gameState);
      } catch (error) {
        logger.error('End turn error:', error);
        socket.emit('gameError', { message: 'Failed to end turn' });
      }
    });

    socket.on('chat-message', (data) => {
      socket.to(data.roomId).emit('chat-message', {
        userId: socket.userId,
        message: data.message,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('disconnect', () => {
      logger.info(`User ${socket.userId} disconnected`);
    });
  });
}