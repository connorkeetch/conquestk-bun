import dotenv from 'dotenv';

// Load environment variables FIRST before any other imports
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { logger } from './utils/logger';
import { authRoutes } from './routes/auth';
import { gameRoutes } from './routes/game';
import mapRoutes from './routes/maps';
import profileRoutes from './routes/profile';
import { setupSocketHandlers } from './services/socketService';
import { initDatabase } from './config/database';

const app = express();
const server = createServer(app);
// Configure allowed origins based on environment
const getAllowedOrigins = (): string[] => {
  if (process.env.NODE_ENV === 'production') {
    return [
      'https://conquestk.com',
      'https://www.conquestk.com'
    ];
  }
  const origins = [
    'http://localhost:5173', 
    'http://localhost:3000'
  ];
  if (process.env.FRONTEND_URL) {
    origins.push(process.env.FRONTEND_URL);
  }
  return origins;
};

const corsOptions = {
  origin: getAllowedOrigins(),
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
};

const io = new Server(server, {
  cors: corsOptions
});

const PORT = process.env.PORT || 5001;

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/maps', mapRoutes);
app.use('/api/profile', profileRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../public');
  app.use(express.static(frontendPath));
  
  // Handle React Router - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

setupSocketHandlers(io);

async function startServer() {
  try {
    // Initialize database (will not throw in production)
    await initDatabase();
    
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    
    // In production, try to start the server anyway for better error visibility
    if (process.env.NODE_ENV === 'production') {
      logger.warn('⚠️  Starting server in degraded mode...');
      server.listen(PORT, () => {
        logger.info(`🚀 Server running on port ${PORT} (degraded mode - database issues)`);
        logger.error('💡 Check Railway logs and ensure PostgreSQL plugin is added');
      });
    } else {
      process.exit(1);
    }
  }
}

startServer();