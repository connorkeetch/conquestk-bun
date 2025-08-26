import dotenv from 'dotenv';

// Load environment variables FIRST before any other imports
dotenv.config();

// Debug MySQL environment variables immediately
console.log('🔍 MySQL Environment Variables Check:');
console.log('  NODE_ENV:', process.env.NODE_ENV);
console.log('  DATABASE_URL:', process.env.DATABASE_URL ? `SET (length: ${process.env.DATABASE_URL.length})` : 'NOT SET');
console.log('  MYSQL_URL:', process.env.MYSQL_URL ? `SET (length: ${process.env.MYSQL_URL.length})` : 'NOT SET');
console.log('  MYSQL_PUBLIC_URL:', process.env.MYSQL_PUBLIC_URL ? 'SET' : 'NOT SET');
console.log('  MYSQLHOST:', process.env.MYSQLHOST || 'NOT SET');
console.log('  MYSQLPORT:', process.env.MYSQLPORT || 'NOT SET');
console.log('  MYSQLDATABASE:', process.env.MYSQLDATABASE || 'NOT SET');
console.log('  MYSQLUSER:', process.env.MYSQLUSER || 'NOT SET');
console.log('  MYSQLPASSWORD:', process.env.MYSQLPASSWORD ? 'SET (hidden)' : 'NOT SET');

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
import notificationRoutes from './routes/notifications';
import userRoutes from './routes/users';
import { setupSocketHandlers } from './services/socketService';
import { initDatabase } from './config/database';
import { ensureTablesExist } from './utils/initTables';
import { 
  authLimiter,
  gameCreationLimiter,
  messageLimiter,
  generalApiLimiter,
  adminLimiter,
  mapUploadLimiter,
  suspiciousActivityTracker,
  loginSlowDown
} from './middleware/rateLimiter';

const app = express();
const server = createServer(app);

// Trust proxy for Railway deployment - required for rate limiting behind reverse proxy
// Set to 1 to trust first proxy (Railway's proxy)
app.set('trust proxy', 1);

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

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Apply suspicious activity tracker globally
app.use(suspiciousActivityTracker.middleware());

// Apply general rate limiting to all API routes
app.use('/api/', generalApiLimiter);

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/maps', mapRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workflow', require('./routes/mapWorkflow').default);

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
  
  // Log the frontend path for debugging
  console.log('Frontend static files path:', frontendPath);
  
  // IMPORTANT: Serve static files with explicit options
  // This MUST come before the catch-all route
  app.use(express.static(frontendPath, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
      // Set proper content types for assets
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=UTF-8');
      } else if (filePath.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json; charset=UTF-8');
      }
    },
    index: false // Don't automatically serve index.html
  }));
  
  // Explicitly handle asset requests to ensure they don't fall through
  app.get('/assets/*', (req, res) => {
    // If we reach here, the asset wasn't found
    res.status(404).send('Asset not found');
  });
  
  // Handle React Router - serve index.html for all non-API and non-asset routes
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes or assets
    if (req.path.startsWith('/api') || req.path.startsWith('/assets')) {
      return res.status(404).send('Not found');
    }
    
    const indexPath = path.join(frontendPath, 'index.html');
    console.log('Serving index.html from:', indexPath);
    return res.sendFile(indexPath);
  });
}

setupSocketHandlers(io);

// Test MySQL connection with detailed logging
async function testMySQLConnection() {
  if (process.env.NODE_ENV !== 'production') {
    console.log('📊 Skipping MySQL test in development (using SQLite)');
    return;
  }

  const mysql = require('mysql2/promise');
  
  console.log('🔄 Testing MySQL connections...');
  
  // Test different connection methods
  const connectionConfigs = [];
  
  // Method 1: MYSQL_URL if available
  if (process.env.MYSQL_URL) {
    connectionConfigs.push({
      name: 'MYSQL_URL',
      config: process.env.MYSQL_URL
    });
  }
  
  // Method 2: DATABASE_URL if available
  if (process.env.DATABASE_URL) {
    connectionConfigs.push({
      name: 'DATABASE_URL',
      config: process.env.DATABASE_URL
    });
  }
  
  // Method 3: Individual variables
  if (process.env.MYSQLHOST && process.env.MYSQLDATABASE) {
    connectionConfigs.push({
      name: 'Individual Variables',
      config: {
        host: process.env.MYSQLHOST,
        port: parseInt(process.env.MYSQLPORT || '3306'),
        database: process.env.MYSQLDATABASE,
        user: process.env.MYSQLUSER || 'root',
        password: process.env.MYSQLPASSWORD || ''
      }
    });
  }
  
  for (const { name, config } of connectionConfigs) {
    try {
      console.log(`\n🔌 Testing connection method: ${name}`);
      if (typeof config === 'string') {
        console.log(`  URL pattern: ${config.replace(/:[^@]+@/, ':****@')}`);
      } else {
        console.log(`  Host: ${config.host}`);
        console.log(`  Port: ${config.port}`);
        console.log(`  Database: ${config.database}`);
        console.log(`  User: ${config.user}`);
      }
      
      const connection = await mysql.createConnection(config);
      const [rows] = await connection.execute('SELECT 1 as test');
      
      console.log(`✅ ${name} connection SUCCESSFUL!`);
      console.log('  Test query result:', rows);
      
      await connection.end();
      break; // If one works, we're good
      
    } catch (error: any) {
      console.error(`❌ ${name} connection FAILED:`);
      console.error(`  Error code: ${error.code}`);
      console.error(`  Error message: ${error.message}`);
      if (error.code === 'ECONNREFUSED') {
        console.error('  → Connection refused. Check if host/port are correct');
      } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('  → Access denied. Check username/password');
      } else if (error.code === 'ENOTFOUND') {
        console.error('  → Host not found. Check MYSQLHOST value');
      }
    }
  }
  
  if (connectionConfigs.length === 0) {
    console.error('❌ No MySQL configuration found!');
    console.error('  Please set one of: MYSQL_URL, DATABASE_URL, or MYSQLHOST+MYSQLDATABASE');
  }
}

async function startServer() {
  try {
    // Test MySQL connection first
    await testMySQLConnection();
    
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
