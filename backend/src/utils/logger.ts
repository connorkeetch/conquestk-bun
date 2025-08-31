import winston from 'winston'
import fs from 'fs'
import path from 'path'

// Create transports array based on environment
const transports: winston.transport[] = []

// In production, only use console output (Railway handles log aggregation)
if (process.env.NODE_ENV === 'production') {
  transports.push(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
    })
  )
} else {
  // In development, try to use file logging if possible
  try {
    const logsDir = path.join(process.cwd(), 'logs')
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }
    
    transports.push(
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' }),
      new winston.transports.Console({
        format: winston.format.simple(),
      })
    )
  } catch (error) {
    // If file system is not writable, fall back to console only
    console.warn('Warning: Could not create logs directory, using console output only')
    transports.push(
      new winston.transports.Console({
        format: winston.format.simple(),
      })
    )
  }
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'risk-game-backend' },
  transports,
})
