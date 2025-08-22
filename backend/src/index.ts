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
import adminRoutes from './routes/admin';
import { setupSocketHandlers } from './services/socketService';
import { initDatabase } from './config/database';
import { ensureTablesExist } from './utils/initTables';

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
app.use('/api/admin', adminRoutes);

app.get('/health', async (req, res) => {
  try {
    const { query } = await import('./config/database');
    await query('SELECT 1');
    res.json({ 
      status: 'OK', 
      database: 'connected',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString() 
    });
  }
});

app.get('/debug/env', (req, res) => {
  res.json({
    NODE_ENV: process.env.NODE_ENV,
    DB_TYPE: process.env.DB_TYPE,
    DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT_SET',
    DB_HOST: process.env.DB_HOST || 'NOT_SET',
    DB_NAME: process.env.DB_NAME || 'NOT_SET',
    DB_USER: process.env.DB_USER || 'NOT_SET',
    PORT: process.env.PORT,
    timestamp: new Date().toISOString()
  });
});

app.get('/debug/tables', async (req, res) => {
  try {
    const { query } = await import('./config/database');
    
    // Check if tables exist
    const tableCheck = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    let userCount = null;
    try {
      const userCountResult = await query('SELECT COUNT(*) as count FROM users');
      userCount = userCountResult.rows[0]?.count || 0;
    } catch (e) {
      userCount = 'Table does not exist';
    }
    
    res.json({
      status: 'OK',
      tables: tableCheck.rows.map(row => row.table_name),
      userCount,
      databaseType: process.env.DB_TYPE || 'postgresql',
      databaseUrl: process.env.DATABASE_URL ? 'set' : 'not set',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
      databaseType: process.env.DB_TYPE || 'postgresql',
      databaseUrl: process.env.DATABASE_URL ? 'set' : 'not set',
      timestamp: new Date().toISOString()
    });
  }
});

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../public');
  
  // IMPORTANT: Serve static files with explicit options
  app.use(express.static(frontendPath, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
      // Set proper content types for assets
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      }
    }
  }));
  
  // Handle React Router - serve index.html for all non-API routes
  // The static middleware above will handle asset files
  app.get('*', (req, res) => {
    return res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

setupSocketHandlers(io);

async function startServer() {
  try {
    // Initialize database connection
    await initDatabase();
    
    // Ensure all required tables exist (this will create them if missing)
    await ensureTablesExist();
    
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`📋 Database: ${process.env.DB_TYPE || 'postgresql'} tables ready`);
      logger.info(`📅 Deployed: ${new Date().toISOString()}`);
      logger.info(`🎨 Tailwind v4 with glass morphism header deployed`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    
    // In production, try to start the server anyway for better error visibility
    if (process.env.NODE_ENV === 'production') {
      logger.warn('⚠️  Starting server in degraded mode...');
      logger.error('💡 Database issue - some features may not work');
      logger.error(`💡 Error details: ${error}`);
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