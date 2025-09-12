import fs, { promises as fsPromises } from 'node:fs'
import path from 'node:path'
import { type Request, type Response, Router } from 'express'
import { body, param, validationResult } from 'express-validator'
import sizeOf from 'image-size'
import multer from 'multer'
import { getPool } from '../config/database'
import { authenticateToken } from '../middleware/auth'
import { CapitalGeneratorService } from '../services/capitalGeneratorService'
import { mapService } from '../services/mapService'
import type { CreateMapRequest, UpdateMapRequest } from '../types/maps'
import { logger } from '../utils/logger'
import { parseJsonField, parseTags } from '../utils/tagParser'

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads', 'maps')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
  logger.info('Created uploads directory:', uploadsDir)
}

const router = Router()

// File resource management using Node.js 24's explicit resource management pattern
class FileResource {
  private fileHandle: fs.promises.FileHandle | null = null

  constructor(private path: string) {}

  async open() {
    this.fileHandle = await fsPromises.open(this.path, 'r')
    return this
  }

  async readBuffer(): Promise<Buffer> {
    if (!this.fileHandle) throw new Error('File not opened')
    const stats = await this.fileHandle.stat()
    const buffer = Buffer.allocUnsafe(stats.size)
    await this.fileHandle.read(buffer, 0, stats.size, 0)
    return buffer
  }

  // Explicit resource management - implement Symbol.dispose for 'using' keyword
  async [Symbol.dispose](): Promise<void> {
    if (this.fileHandle) {
      await this.fileHandle.close()
      this.fileHandle = null
    }
  }

  // For backwards compatibility
  async close(): Promise<void> {
    await this[Symbol.dispose]()
  }
}

// Safe file reading with automatic resource cleanup
async function readFileWithResourceManagement(filePath: string): Promise<Buffer> {
  // Use Node.js 24's explicit resource management when available
  if (typeof Symbol.dispose !== 'undefined') {
    try {
      const fileResource = await new FileResource(filePath).open()
      await using resource = fileResource as any // TypeScript needs to catch up with the spec
      return await fileResource.readBuffer()
    } catch (error) {
      // Fallback to manual resource management
      const fileResource = await new FileResource(filePath).open()
      try {
        return await fileResource.readBuffer()
      } finally {
        await fileResource.close()
      }
    }
  } else {
    // Fallback for older Node.js versions
    return await fsPromises.readFile(filePath)
  }
}

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, 'uploads/maps/')
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `map-${uniqueSuffix}${path.extname(file.originalname)}`)
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880'), // 5MB default, configurable
    files: 1, // Only allow 1 file per upload
    fields: 10, // Limit number of non-file fields
  },
  fileFilter: (_req, file, cb) => {
    // Strict MIME type checking
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

    const allowedExtensions = /\.(jpeg|jpg|png|gif|webp)$/i
    const hasValidExtension = allowedExtensions.test(file.originalname)
    const hasValidMimeType = allowedMimeTypes.includes(file.mimetype)

    if (hasValidExtension && hasValidMimeType) {
      return cb(null, true)
    }

    logger.warn(`File upload rejected: ${file.originalname} (${file.mimetype})`)
    cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'))
  },
})

// Validation middleware
const validateCreateMap = [
  body('name').isLength({ min: 1, max: 100 }).withMessage('Map name must be 1-100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be under 500 characters'),
  body('isPublic')
    .optional()
    .custom(value => {
      // Handle both boolean and string values from multipart form data
      return value === true || value === false || value === 'true' || value === 'false'
    })
    .withMessage('isPublic must be boolean or "true"/"false" string'),
  body('tags')
    .optional()
    .custom(value => {
      // Handle both array and JSON string from multipart form data
      if (Array.isArray(value)) return true
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value)
          return Array.isArray(parsed)
        } catch {
          return false
        }
      }
      return false
    })
    .withMessage('Tags must be an array or valid JSON array string'),
  body('metadata')
    .optional()
    .custom(value => {
      // Handle JSON string from multipart form data
      if (typeof value === 'object' && value !== null) return true
      if (typeof value === 'string') {
        try {
          JSON.parse(value)
          return true
        } catch {
          return false
        }
      }
      return false
    })
    .withMessage('Metadata must be a valid JSON object or string'),
]

const validateUpdateMap = [
  param('mapId').isUUID().withMessage('Invalid map ID'),
  body('name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Map name must be 1-100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be under 500 characters'),
  body('isPublic').optional().isBoolean().withMessage('isPublic must be boolean'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
]

const validateCreateTerritory = [
  param('mapId').isUUID().withMessage('Invalid map ID'),
  body('territoryId')
    .isLength({ min: 1, max: 50 })
    .withMessage('Territory ID must be 1-50 characters'),
  body('name')
    .isLength({ min: 1, max: 100 })
    .withMessage('Territory name must be 1-100 characters'),
  body('boundaryCoords')
    .isArray({ min: 3 })
    .withMessage('Must have at least 3 boundary coordinates'),
  body('armyPosition').isObject().withMessage('Army position must be an object'),
  body('armyPosition.x')
    .isInt({ min: 0 })
    .withMessage('Army position X must be a positive integer'),
  body('armyPosition.y')
    .isInt({ min: 0 })
    .withMessage('Army position Y must be a positive integer'),
]

const validateCreateContinent = [
  param('mapId').isUUID().withMessage('Invalid map ID'),
  body('name')
    .isLength({ min: 1, max: 100 })
    .withMessage('Continent name must be 1-100 characters'),
  body('bonusArmies').isInt({ min: 0, max: 20 }).withMessage('Bonus armies must be 0-20'),
  body('color').optional().isHexColor().withMessage('Color must be a valid hex color'),
]

const validateCreateAdjacency = [
  body('fromTerritoryId').isUUID().withMessage('Invalid from territory ID'),
  body('toTerritoryId').isUUID().withMessage('Invalid to territory ID'),
  body('connectionType')
    .optional()
    .isIn(['land', 'sea', 'air', 'tunnel', 'special'])
    .withMessage('Invalid connection type'),
  body('isBidirectional').optional().isBoolean().withMessage('isBidirectional must be boolean'),
]

const validateRating = [
  param('mapId').isUUID().withMessage('Invalid map ID'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
  body('review')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Review must be under 1000 characters'),
]

// Middleware to check validation results
const checkValidation = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() })
  }
  return next()
}

// Multer error handling middleware
const handleMulterError = (error: any, _req: Request, res: Response, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Image file is too large. Maximum size is 10MB.' })
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res
        .status(400)
        .json({ error: 'Unexpected field in file upload. Use "image" field name.' })
    }
    return res.status(400).json({ error: `Upload error: ${error.message}` })
  }
  if (error && error.message === 'Only image files are allowed') {
    return res.status(400).json({ error: 'Only image files (PNG, JPG, GIF, WEBP) are allowed.' })
  }
  return next(error)
}

// ============= PUBLIC ROUTES =============

// Get all public maps with filtering and pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters = {
      search: req.query.search as string,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      creator: req.query.creator as string,
      isFeatured: req.query.featured === 'true',
      minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined,
      sortBy: req.query.sortBy as string,
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      isPublic: true, // Force public maps only for this endpoint
    }

    const result = await mapService.searchMaps(filters)
    return res.json(result)
  } catch (error) {
    logger.error('Error searching maps:', error)
    return res.status(500).json({ error: 'Failed to search maps' })
  }
})

// Get specific map details
router.get(
  '/:mapId',
  param('mapId').isUUID().withMessage('Invalid map ID'),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const mapData = await mapService.getMapWithFullData(req.params.mapId)

      if (!mapData) {
        return res.status(404).json({ error: 'Map not found' })
      }

      // Check if map is public or user owns it
      if (
        !mapData.map.isPublic &&
        (!(req as any).userId || (req as any).userId !== mapData.map.creatorId)
      ) {
        return res.status(403).json({ error: 'Access denied' })
      }

      return res.json(mapData)
    } catch (error) {
      logger.error('Error fetching map:', error)
      return res.status(500).json({ error: 'Failed to fetch map' })
    }
  },
)

// Get game modes
router.get('/game-modes/list', async (_req: Request, res: Response) => {
  try {
    const gameModes = await mapService.getGameModes()
    return res.json(gameModes)
  } catch (error) {
    logger.error('Error fetching game modes:', error)
    return res.status(500).json({ error: 'Failed to fetch game modes' })
  }
})

// Get territory ability types
router.get('/abilities/list', async (_req: Request, res: Response) => {
  try {
    const abilities = await mapService.getTerritoryAbilityTypes()
    return res.json(abilities)
  } catch (error) {
    logger.error('Error fetching territory abilities:', error)
    return res.status(500).json({ error: 'Failed to fetch territory abilities' })
  }
})

// ============= AUTHENTICATED ROUTES =============

// Create new map (JSON with base64 image)
router.post(
  '/json',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      logger.info('Creating map with JSON data:', {
        name: req.body.name,
        hasImage: !!req.body.image,
        hasMetadata: !!req.body.metadata,
        userId: (req as any).userId,
        bodyType: typeof req.body,
        headers: req.headers['content-type'],
      })

      // Emergency fix: Handle tags in multiple formats
      let tags: string[] = []
      logger.info('Tags received:', { 
        tags: req.body.tags, 
        type: typeof req.body.tags,
        isArray: Array.isArray(req.body.tags),
        stringified: JSON.stringify(req.body.tags)
      })
      
      if (Array.isArray(req.body.tags)) {
        tags = req.body.tags
      } else if (typeof req.body.tags === 'string') {
        // Try to parse as JSON first
        try {
          const parsed = JSON.parse(req.body.tags)
          if (Array.isArray(parsed)) {
            tags = parsed
          } else {
            // Handle comma-separated string
            tags = req.body.tags.split(',').map((t: string) => t.trim())
          }
        } catch {
          // Handle comma-separated string
          tags = req.body.tags.split(',').map((t: string) => t.trim())
        }
      } else if (typeof req.body.tags === 'object' && req.body.tags !== null) {
        // Handle weird object format (might be from proxy/middleware)
        // Try to extract values if it's an object
        if (req.body.tags[0] !== undefined) {
          // Looks like an array-like object
          tags = Object.values(req.body.tags)
        } else {
          // Fallback to default tags
          tags = ['custom', 'user-created']
        }
      } else {
        // Default tags if nothing else works
        tags = ['custom', 'user-created']
      }

      const mapData: CreateMapRequest = {
        name: req.body.name,
        description: req.body.description,
        isPublic: req.body.isPublic === true || req.body.isPublic === 'true',
        tags: tags,
        minPlayers: req.body.minPlayers || 2,
        maxPlayers: req.body.maxPlayers || 6,
      }

      // Handle base64 image if provided
      if (req.body.image && req.body.image.data) {
        try {
          const imageData = req.body.image.data
          const mimeType = req.body.image.mimeType || 'image/png'
          const filename = req.body.image.filename || `map-${Date.now()}.png`
          
          // Decode base64 to buffer
          const buffer = Buffer.from(imageData, 'base64')
          
          // Generate unique filename
          const ext = path.extname(filename) || '.png'
          const uniqueFilename = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`
          const filepath = path.join(process.cwd(), 'uploads', 'maps', uniqueFilename)
          
          // Ensure directory exists
          const dir = path.dirname(filepath)
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
          }
          
          // Write file
          await fsPromises.writeFile(filepath, buffer)
          
          mapData.imageUrl = `/uploads/maps/${uniqueFilename}`
          
          // Get image dimensions
          try {
            const dimensions = sizeOf(buffer)
            mapData.imageWidth = dimensions.width || 800
            mapData.imageHeight = dimensions.height || 600
          } catch (dimensionError) {
            logger.warn('Failed to get image dimensions:', dimensionError)
            mapData.imageWidth = 800
            mapData.imageHeight = 600
          }
        } catch (imageError) {
          logger.error('Failed to process base64 image:', imageError)
          return res.status(400).json({
            error: 'Failed to process image',
            message: 'The image data could not be processed',
          })
        }
      }

      // Store metadata if provided
      if (req.body.metadata) {
        ;(mapData as any).metadata = req.body.metadata
      }

      const map = await mapService.createMap((req as any).userId, mapData)

      logger.info('Map created successfully:', {
        mapId: map.id,
        name: map.name,
      })

      return res.status(201).json(map)
    } catch (error) {
      logger.error('Error creating map via JSON endpoint:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      
      // More detailed error for debugging
      if (errorMessage.includes('duplicate key')) {
        return res.status(400).json({
          error: 'Map name already exists',
          message: 'Please choose a different name for your map',
          suggestion: `${req.body.name} (${new Date().getTime()})`,
        })
      }
      
      return res.status(500).json({
        error: 'Failed to create map',
        message: errorMessage,
        endpoint: '/api/maps/json',
        receivedData: {
          hasName: !!req.body.name,
          hasTags: !!req.body.tags,
          tagsType: typeof req.body.tags,
          hasImage: !!req.body.image,
        },
        details: process.env.NODE_ENV === 'development' ? error : undefined,
      })
    }
  },
)

// Create new map (FormData - backward compatibility)
router.post(
  '/',
  authenticateToken,
  upload.single('image') as any,
  handleMulterError,
  validateCreateMap,
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      logger.info('Creating map with data:', {
        name: req.body.name,
        hasImage: !!req.file,
        hasMetadata: !!req.body.metadata,
        userId: (req as any).userId,
      })

      const mapData: CreateMapRequest = {
        name: req.body.name,
        description: req.body.description,
        isPublic: req.body.isPublic === 'true' || req.body.isPublic === true,
        tags: parseTags(req.body.tags),
      }

      // Parse metadata if provided
      let metadata: any = null
      if (req.body.metadata) {
        metadata = parseJsonField(req.body.metadata, null)
        if (metadata) {
          logger.info('Parsed metadata:', {
            territories: metadata.territories?.length || 0,
            continents: metadata.continents?.length || 0,
          })
        } else if (req.body.metadata) {
          logger.error('Failed to parse metadata')
          return res.status(400).json({
            error: 'Invalid metadata format',
            details: 'The map data (territories and continents) could not be parsed',
          })
        }
      }

      if (req.file) {
        mapData.imageUrl = `/uploads/maps/${req.file.filename}`

        try {
          // Get image dimensions using resource management
          const fileBuffer = await readFileWithResourceManagement(req.file.path)
          const dimensions = sizeOf(fileBuffer)
          mapData.imageWidth = dimensions.width || 800
          mapData.imageHeight = dimensions.height || 600
        } catch (dimensionError) {
          logger.warn('Failed to get image dimensions:', dimensionError)
          // Use default dimensions if we can't read the image
          mapData.imageWidth = 800
          mapData.imageHeight = 600
        }
      }

      // Store metadata in the map data (will be saved as JSONB)
      if (metadata) {
        ;(mapData as any).metadata = metadata
      }

      const map = await mapService.createMap((req as any).userId, mapData)

      logger.info('Map created successfully:', {
        mapId: map.id,
        name: map.name,
      })

      return res.status(201).json(map)
    } catch (error) {
      logger.error('Error creating map:', error)

      // Provide more detailed error response
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      return res.status(500).json({
        error: 'Failed to create map',
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error : undefined,
      })
    }
  },
)

// Update map
router.put(
  '/:mapId',
  authenticateToken,
  upload.single('image') as any,
  validateUpdateMap,
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const updates: UpdateMapRequest = {
        name: req.body.name,
        description: req.body.description,
        isPublic: req.body.isPublic,
        tags: parseTags(req.body.tags),
      }

      if (req.file) {
        updates.imageUrl = `/uploads/maps/${req.file.filename}`

        try {
          // Get image dimensions using resource management
          const fileBuffer = await readFileWithResourceManagement(req.file.path)
          const dimensions = sizeOf(fileBuffer)
          updates.imageWidth = dimensions.width || 800
          updates.imageHeight = dimensions.height || 600
        } catch (dimensionError) {
          logger.warn('Failed to get image dimensions:', dimensionError)
          // Use default dimensions if we can't read the image
          updates.imageWidth = 800
          updates.imageHeight = 600
        }
      }

      const map = await mapService.updateMap(req.params.mapId, (req as any).userId, updates)

      if (!map) {
        return res.status(404).json({ error: 'Map not found or access denied' })
      }

      return res.json(map)
    } catch (error) {
      logger.error('Error updating map:', error)
      return res.status(500).json({ error: 'Failed to update map' })
    }
  },
)

// Delete map
router.delete(
  '/:mapId',
  authenticateToken,
  param('mapId').isUUID().withMessage('Invalid map ID'),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const success = await mapService.deleteMap(req.params.mapId, (req as any).userId)

      if (!success) {
        return res.status(404).json({ error: 'Map not found or access denied' })
      }

      return res.json({ message: 'Map deleted successfully' })
    } catch (error) {
      logger.error('Error deleting map:', error)
      return res.status(500).json({ error: 'Failed to delete map' })
    }
  },
)

// Get all public approved maps
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters = {
      isPublic: req.query.isPublic !== 'false', // Default to public maps
      status: req.query.status as string || 'approved', // Default to approved maps
      search: req.query.search as string,
      tags: req.query.tag ? [req.query.tag as string] : undefined,
      sortBy: req.query.sortBy as string || 'popularity',
      sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc',
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    }

    const result = await mapService.searchMaps(filters)
    
    // Add creator names to the maps
    const pool = await getPool()
    const mapIds = result.maps.map(m => m.id)
    if (mapIds.length > 0) {
      const creatorQuery = `
        SELECT m.id, u.username as creator_name 
        FROM maps m 
        JOIN users u ON m.creator_id = u.id 
        WHERE m.id = ANY($1)
      `
      const creatorResult = await pool.query(creatorQuery, [mapIds])
      const creatorMap = new Map(creatorResult.rows.map(r => [r.id, r.creator_name]))
      
      result.maps = result.maps.map(map => ({
        ...map,
        creatorName: creatorMap.get(map.id) || 'Unknown'
      }))
    }
    
    return res.json(result)
  } catch (error) {
    logger.error('Error fetching maps:', error)
    return res.status(500).json({ error: 'Failed to fetch maps' })
  }
})

// Get user's maps
router.get('/my/maps', authenticateToken, async (req: Request, res: Response) => {
  try {
    const filters = {
      creator: (req as any).userId,
      isPublic: undefined, // Show both public and private
      sortBy: req.query.sortBy as string,
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    }

    const result = await mapService.searchMaps(filters)
    return res.json(result)
  } catch (error) {
    logger.error('Error fetching user maps:', error)
    return res.status(500).json({ error: 'Failed to fetch user maps' })
  }
})

// ============= TERRITORY MANAGEMENT =============

// Create continent
router.post(
  '/:mapId/continents',
  authenticateToken,
  validateCreateContinent,
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      // TODO: Verify user owns the map
      const continent = await mapService.createContinent(
        req.params.mapId,
        req.body.name,
        req.body.bonusArmies,
        req.body.color,
      )

      res.status(201).json(continent)
    } catch (error) {
      logger.error('Error creating continent:', error)
      res.status(500).json({ error: 'Failed to create continent' })
    }
  },
)

// Create territory
router.post(
  '/:mapId/territories',
  authenticateToken,
  validateCreateTerritory,
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      // TODO: Verify user owns the map
      const territory = await mapService.createTerritory({
        mapId: req.params.mapId,
        territoryId: req.body.territoryId,
        name: req.body.name,
        continentId: req.body.continentId,
        boundaryCoords: req.body.boundaryCoords,
        armyPosition: req.body.armyPosition,
        abilityTypeId: req.body.abilityTypeId,
        startingOwnerSlot: req.body.startingOwnerSlot,
        startingArmies: req.body.startingArmies,
      })

      res.status(201).json(territory)
    } catch (error) {
      logger.error('Error creating territory:', error)
      res.status(500).json({ error: 'Failed to create territory' })
    }
  },
)

// Create adjacency
router.post(
  '/adjacencies',
  authenticateToken,
  validateCreateAdjacency,
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      // TODO: Verify user owns the territories
      const adjacency = await mapService.createAdjacency({
        fromTerritoryId: req.body.fromTerritoryId,
        toTerritoryId: req.body.toTerritoryId,
        connectionType: req.body.connectionType,
        isBidirectional: req.body.isBidirectional,
        specialRequirements: req.body.specialRequirements,
      })

      res.status(201).json(adjacency)
    } catch (error) {
      logger.error('Error creating adjacency:', error)
      res.status(500).json({ error: 'Failed to create adjacency' })
    }
  },
)

// ============= RATING SYSTEM =============

// Rate a map
router.post(
  '/:mapId/rate',
  authenticateToken,
  validateRating,
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const rating = await mapService.rateMap(
        req.params.mapId,
        (req as any).userId,
        req.body.rating,
        req.body.review,
      )

      res.status(201).json(rating)
    } catch (error) {
      logger.error('Error rating map:', error)
      res.status(500).json({ error: 'Failed to rate map' })
    }
  },
)

// ============= CAPITAL ASSIGNMENTS =============

// Generate capitals for all player counts
router.post(
  '/:mapId/generate-capitals',
  authenticateToken,
  param('mapId').isUUID().withMessage('Invalid map ID'),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const mapId = req.params.mapId
      const userId = (req as any).userId

      // Verify user owns the map
      const mapData = await mapService.getMapWithFullData(mapId)
      if (!mapData) {
        return res.status(404).json({ error: 'Map not found' })
      }

      if (mapData.map.creatorId !== userId) {
        return res.status(403).json({ error: 'You do not have permission to edit this map' })
      }

      // Generate capitals using the service
      const capitalService = new CapitalGeneratorService(getPool())
      const capitals = await capitalService.generateCapitalsForMap(mapId)

      // Save to database
      const metadata = {
        generatedAt: new Date().toISOString(),
        algorithm: 'maximin-distance-v1',
        manuallyAdjusted: {},
      }

      await getPool().query(
        'UPDATE maps SET capital_assignments = $1, capital_metadata = $2 WHERE id = $3',
        [JSON.stringify(capitals), JSON.stringify(metadata), mapId],
      )

      logger.info(`Generated capitals for map ${mapId}`)

      return res.json({
        success: true,
        capitals,
        metadata,
      })
    } catch (error) {
      logger.error('Error generating capitals:', error)
      return res.status(500).json({ error: 'Failed to generate capitals' })
    }
  },
)

// Update capitals for a specific player count
router.patch(
  '/:mapId/capitals/:playerCount',
  authenticateToken,
  param('mapId').isUUID().withMessage('Invalid map ID'),
  param('playerCount').isInt({ min: 2, max: 12 }).withMessage('Player count must be 2-12'),
  body('territoryIds').isArray({ min: 2, max: 12 }).withMessage('Must provide territory IDs'),
  body('territoryIds.*').isString().withMessage('Each territory ID must be a string'),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const { mapId, playerCount } = req.params
      const { territoryIds } = req.body
      const userId = (req as any).userId
      const playerCountNum = parseInt(playerCount, 10)

      // Verify user owns the map
      const mapData = await mapService.getMapWithFullData(mapId)
      if (!mapData) {
        return res.status(404).json({ error: 'Map not found' })
      }

      if (mapData.map.creatorId !== userId) {
        return res.status(403).json({ error: 'You do not have permission to edit this map' })
      }

      // Validate territory count matches player count
      if (territoryIds.length !== playerCountNum) {
        return res.status(400).json({
          error: `Must provide exactly ${playerCountNum} territories for ${playerCountNum} players`,
        })
      }

      // Update capitals for this player count
      const capitalService = new CapitalGeneratorService(getPool())
      await capitalService.updateCapitalsForPlayerCount(mapId, playerCountNum, territoryIds)

      logger.info(`Updated capitals for map ${mapId}, ${playerCountNum} players`)

      return res.json({
        success: true,
        playerCount: playerCountNum,
        capitals: territoryIds,
      })
    } catch (error) {
      logger.error('Error updating capitals:', error)
      return res.status(500).json({ error: 'Failed to update capitals' })
    }
  },
)

// Get current capital assignments
router.get(
  '/:mapId/capitals',
  param('mapId').isUUID().withMessage('Invalid map ID'),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const mapId = req.params.mapId

      // Get map to check if it's public or user owns it
      const mapData = await mapService.getMapWithFullData(mapId)
      if (!mapData) {
        return res.status(404).json({ error: 'Map not found' })
      }

      // Check access permissions
      const userId = (req as any).userId
      if (!mapData.map.isPublic && (!userId || userId !== mapData.map.creatorId)) {
        return res.status(403).json({ error: 'Access denied' })
      }

      // Get capital assignments from database
      const result = await getPool().query(
        'SELECT capital_assignments, capital_metadata FROM maps WHERE id = $1',
        [mapId],
      )

      if (!result.rows[0]) {
        return res.status(404).json({ error: 'Map not found' })
      }

      const { capital_assignments, capital_metadata } = result.rows[0]

      return res.json({
        capitals: capital_assignments || {},
        metadata: capital_metadata || {},
        mapId,
      })
    } catch (error) {
      logger.error('Error fetching capitals:', error)
      return res.status(500).json({ error: 'Failed to fetch capitals' })
    }
  },
)

export default router
