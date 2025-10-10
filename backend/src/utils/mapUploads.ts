import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from './logger.js'

let cachedMapUploadsDir: string | null = null
let cachedStagingDir: string | null = null

const ensureDirectory = (dirPath: string): string => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
    logger.info('Created uploads directory:', dirPath)
  }
  return dirPath
}

export const getMapUploadsDir = (): string => {
  if (cachedMapUploadsDir) return cachedMapUploadsDir

  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const uploadsRoot = path.join(__dirname, '../../uploads')
  const mapsDir = path.join(uploadsRoot, 'maps')
  cachedMapUploadsDir = ensureDirectory(mapsDir)
  return cachedMapUploadsDir
}

export const getMapStagingDir = (): string => {
  if (cachedStagingDir) return cachedStagingDir

  const stagingDir = path.join(getMapUploadsDir(), 'staging')
  cachedStagingDir = ensureDirectory(stagingDir)
  return cachedStagingDir
}
