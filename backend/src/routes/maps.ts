import type { NextFunction, Request, Response } from 'express'
import { Router } from 'express'
import { body, param, validationResult } from 'express-validator'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import multer from 'multer'
import { getPool } from '../config/database'
import { authenticateToken } from '../middleware/auth'
import { CapitalGeneratorService } from '../services/capitalGeneratorService'
import {
  MapNotFoundError,
  MapPermissionError,
  mapPermissionService,
} from '../services/mapPermissionService'
import { mapService } from '../services/mapService'
import type { CreateMapRequest, MapMetadataPayload, UpdateMapRequest } from '../types/maps'
import { storeBase64Image, storeImageBuffer } from '../utils/imageStorage'
import { logger } from '../utils/logger'
import { handleRouteError } from '../utils/routeErrorHandler'
import { parseJsonField, parseTags } from '../utils/tagParser'
import { resolveAssetUrl } from '../utils/url'

const router = Router()

type QueryParam = string | number | boolean | string[] | null

// Configure multer for image uploads (memory storage to support direct CDN uploads)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10), // 5MB default, configurable
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
    .custom((value) => {
      // Handle both boolean and string values from multipart form data
      return value === true || value === false || value === 'true' || value === 'false'
    })
    .withMessage('isPublic must be boolean or "true"/"false" string'),
  body('tags')
    .optional()
    .custom((value) => {
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
    .custom((value) => {
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
const checkValidation = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() })
  }
  return next()
}

// Multer error handling middleware
const handleMulterError = (error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'Image file is too large. Maximum size is 10MB.' })
      return
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({ error: 'Unexpected field in file upload. Use "image" field name.' })
      return
    }
    res.status(400).json({ error: `Upload error: ${error.message}` })
    return
  }
  if (error instanceof Error && error.message === 'Only image files are allowed') {
    res.status(400).json({ error: 'Only image files (PNG, JPG, GIF, WEBP) are allowed.' })
    return
  }
  next(error)
}

// ============= PUBLIC ROUTES =============

// Get maps specifically for game creation (approved maps, plus VIP maps for eligible creators)
router.get('/available-for-game', async (req: Request, res: Response) => {
  try {
    const pool = await getPool()

    // Determine whether the requester should have access to VIP-only maps
    let includeVipMaps = false
    const authHeader = req.headers.authorization

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1]

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as JwtPayload
        const userId =
          typeof decoded === 'object' ? (decoded.userId as string | undefined) : undefined

        if (userId) {
          const userResult = await pool.query(
            'SELECT is_admin, is_vip FROM users WHERE id = $1 LIMIT 1',
            [userId],
          )

          if (userResult.rows[0]) {
            includeVipMaps =
              Boolean(userResult.rows[0].is_admin) || Boolean(userResult.rows[0].is_vip)
          }
        }
      } catch (_error) {
        // Ignore token errors – the route should still work for unauthenticated users
      }
    }

    // Fetch approved maps for game creation
    const query = `
      SELECT 
        m.id,
        m.name,
        m.description,
        m.image_url,
        m.creator_id,
        u.username as creator_name,
        m.min_players,
        m.max_players,
        m.is_featured,
        m.is_vip_only,
        m.rating_average,
        m.rating_count,
        m.play_count,
        (
          SELECT COUNT(*)
          FROM game_rooms gr
          WHERE gr.map_id = m.id
            AND gr.started_at >= (NOW() - INTERVAL '30 days')
        ) as play_count_30d,
        m.tags,
        m.created_at,
        (SELECT COUNT(*) FROM map_territories WHERE map_id = m.id) as territory_count,
        (SELECT COUNT(DISTINCT continent) FROM map_territories WHERE map_id = m.id AND continent IS NOT NULL) as continent_count
      FROM maps m
      LEFT JOIN users u ON m.creator_id = u.id
      WHERE m.status = 'approved'
      ORDER BY 
        CASE WHEN m.is_featured THEN 0 ELSE 1 END,
        m.play_count DESC,
        m.rating_average DESC,
        m.created_at DESC
      LIMIT 100
    `

    const result = await pool.query(query)

    // Only use approved maps from the database - no hardcoded maps
    const maps = result.rows.map((row) => {
      const imageUrl = resolveAssetUrl(req, row.image_url)

      return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        territory_count: parseInt(row.territory_count, 10) || 0,
        continent_count: parseInt(row.continent_count, 10) || 0,
        min_players: row.min_players || 2,
        max_players: row.max_players || 6,
        is_featured: row.is_featured || false,
        creator_name: row.creator_name || 'Unknown',
        play_count: parseInt(row.play_count, 10) || 0,
        play_count_30d: parseInt(row.play_count_30d, 10) || 0,
        rating_average: parseFloat(row.rating_average) || 0,
        rating_count: parseInt(row.rating_count, 10) || 0,
        tags: row.tags || [],
        image_url: imageUrl,
        imageUrl,
        is_vip_only: row.is_vip_only || false,
        createdAt: row.created_at,
      }
    })

    const visibleMaps = includeVipMaps ? maps : maps.filter((map) => !map.is_vip_only)

    return res.json({
      maps: visibleMaps,
      total: visibleMaps.length,
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to fetch available maps')
    return res.status(500).json({ error: 'Failed to fetch available maps' })
  }
})

// Get all public maps with filtering and pagination
router.get('/', async (req: Request, res: Response) => {
  try {
    const pool = await getPool()

    // Build filters
    const isPublic = req.query.isPublic !== 'false'
    const status = (req.query.status as string) || 'approved'
    const sortBy = (req.query.sortBy as string) || 'popularity'
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0
    const tag = req.query.tag as string

    // Build query based on filters
    let query = `
      SELECT 
        m.id,
        m.name,
        m.description,
        m.image_url,
        m.creator_id,
        u.username as creator_name,
        m.min_players,
        m.max_players,
        m.is_featured,
        m.rating_average,
        m.rating_count,
        m.play_count,
        m.tags,
        m.created_at,
        m.status,
        (SELECT COUNT(*) FROM map_territories WHERE map_id = m.id) as territory_count,
        (SELECT COUNT(DISTINCT continent) FROM map_territories WHERE map_id = m.id AND continent IS NOT NULL) as continent_count
      FROM maps m
      LEFT JOIN users u ON m.creator_id = u.id
      WHERE 1=1
    `

    const params: QueryParam[] = []
    let paramCount = 0

    // Add filters
    if (isPublic) {
      query += ` AND m.is_public = true`
    }

    if (status) {
      query += ` AND m.status = $${++paramCount}`
      params.push(status)
    }

    if (tag) {
      query += ` AND $${++paramCount} = ANY(m.tags)`
      params.push(tag)
    }

    // Add sorting
    switch (sortBy) {
      case 'rating':
        query += ` ORDER BY m.rating_average DESC NULLS LAST, m.play_count DESC`
        break
      case 'newest':
        query += ` ORDER BY m.created_at DESC`
        break
      case 'name':
        query += ` ORDER BY m.name ASC`
        break
      default:
        query += ` ORDER BY m.is_featured DESC, m.play_count DESC, m.rating_average DESC NULLS LAST`
        break
    }

    // Add pagination
    query += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`
    params.push(limit, offset)

    const result = await pool.query(query, params)

    const maps = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      imageUrl: resolveAssetUrl(req, row.image_url),
      creatorId: row.creator_id,
      creatorName: row.creator_name || 'Unknown',
      minPlayers: row.min_players || 2,
      maxPlayers: row.max_players || 6,
      isFeatured: row.is_featured || false,
      ratingAverage: parseFloat(row.rating_average) || 0,
      ratingCount: parseInt(row.rating_count, 10) || 0,
      playCount: parseInt(row.play_count, 10) || 0,
      tags: row.tags || [],
      createdAt: row.created_at,
      status: row.status,
      territoryCount: parseInt(row.territory_count, 10) || 0,
      continentCount: parseInt(row.continent_count, 10) || 0,
    }))

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM maps m
      WHERE 1=1
      ${isPublic ? ' AND m.is_public = true' : ''}
      ${status ? ` AND m.status = '${status}'` : ''}
      ${tag ? ` AND '${tag}' = ANY(m.tags)` : ''}
    `
    const countResult = await pool.query(countQuery)
    const total = parseInt(countResult.rows[0]?.total || '0', 10)

    return res.json({
      maps,
      total,
      limit,
      offset,
    })
  } catch (error) {
    handleRouteError(error, req, 'Failed to fetch maps')
    return res.status(500).json({ error: 'Failed to fetch maps' })
  }
})

// Get user's maps (both routes for compatibility)
router.get('/my-maps', authenticateToken, async (req: Request, res: Response) => {
  try {
    const filters = {
      creator: req.userId,
      isPublic: undefined, // Show both public and private
      sortBy: req.query.sortBy as string,
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    }

    const result = await mapService.searchMaps(filters)

    // Add status information to user's own maps
    const pool = await getPool()
    const mapIds = result.maps.map((m) => m.id)
    let statusMap: Map<string, string> | null = null

    if (mapIds.length > 0) {
      const statusQuery = `
        SELECT id, status 
        FROM maps 
        WHERE id = ANY($1)
      `
      const statusResult = await pool.query(statusQuery, [mapIds])
      statusMap = new Map(statusResult.rows.map((r) => [r.id, r.status]))
    }

    const maps = result.maps.map((map) => {
      const resolvedImageUrl = resolveAssetUrl(req, map.imageUrl)
      return {
        ...map,
        imageUrl: resolvedImageUrl || map.imageUrl,
        status: statusMap?.get(map.id) || map.status || 'draft',
      }
    })

    return res.json(maps)
  } catch (error) {
    handleRouteError(error, req, 'Failed to fetch user maps')
    return res.status(500).json({ error: 'Failed to fetch user maps' })
  }
})

// Legacy route for compatibility
router.get('/my/maps', authenticateToken, async (req: Request, res: Response) => {
  try {
    const filters = {
      creator: req.userId,
      isPublic: undefined, // Show both public and private
      sortBy: req.query.sortBy as string,
      sortOrder: req.query.sortOrder as 'asc' | 'desc',
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    }

    const result = await mapService.searchMaps(filters)
    return res.json(result)
  } catch (error) {
    handleRouteError(error, req, 'Failed to fetch user maps')
    return res.status(500).json({ error: 'Failed to fetch user maps' })
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
      if (!mapData.map.isPublic && (!req.userId || req.userId !== mapData.map.creatorId)) {
        return res.status(403).json({ error: 'Access denied' })
      }

      return res.json(mapData)
    } catch (error) {
      handleRouteError(error, req, 'Failed to fetch map', 500, { mapId: req.params.mapId })
      return res.status(500).json({ error: 'Failed to fetch map' })
    }
  },
)

// Validate a map's playability (owner or public maps)
router.get(
  '/:mapId/validate',
  authenticateToken,
  param('mapId').isUUID().withMessage('Invalid map ID'),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const mapId = req.params.mapId
      const map = await mapService.getMap(mapId)
      if (!map) {
        return res.status(404).json({ error: 'Map not found' })
      }

      if (!map.isPublic) {
        try {
          await mapPermissionService.assertCanEditMap(
            mapId,
            { userId: req.userId },
            {
              allowCollaborator: true,
            },
          )
        } catch (_err) {
          return res.status(403).json({ error: 'Access denied' })
        }
      }

      const result = await mapService.validateMapPlayable(mapId)
      return res.json(result)
    } catch (error) {
      handleRouteError(error, req, 'Failed to validate map', 500, { mapId: req.params.mapId })
      return res.status(500).json({ error: 'Failed to validate map' })
    }
  },
)

// Get game modes
router.get('/game-modes/list', async (_req: Request, res: Response) => {
  try {
    const gameModes = await mapService.getGameModes()
    return res.json(gameModes)
  } catch (error) {
    handleRouteError(error, _req, 'Failed to fetch game modes')
    return res.status(500).json({ error: 'Failed to fetch game modes' })
  }
})

// Get territory ability types
router.get('/abilities/list', async (_req: Request, res: Response) => {
  try {
    const abilities = await mapService.getTerritoryAbilityTypes()
    return res.json(abilities)
  } catch (error) {
    handleRouteError(error, _req, 'Failed to fetch territory abilities')
    return res.status(500).json({ error: 'Failed to fetch territory abilities' })
  }
})

// ============= AUTHENTICATED ROUTES =============

// Create new map (JSON with base64 image)
router.post('/json', authenticateToken, async (req: Request, res: Response) => {
  try {
    logger.info('Creating map with JSON data:', {
      name: req.body.name,
      hasImage: !!req.body.image,
      hasMetadata: !!req.body.metadata,
      userId: req.userId,
      bodyType: typeof req.body,
      headers: req.headers['content-type'],
    })

    // Emergency fix: Handle tags in multiple formats
    let tags: string[] = []
    logger.info('Tags received:', {
      tags: req.body.tags,
      type: typeof req.body.tags,
      isArray: Array.isArray(req.body.tags),
      stringified: JSON.stringify(req.body.tags),
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
        tags = []
      }
    } else {
      // Default to no tags if nothing else works
      tags = []
    }

    const mapData: CreateMapRequest & { metadata?: MapMetadataPayload } = {
      name: req.body.name,
      description: req.body.description,
      isPublic: req.body.isPublic === true || req.body.isPublic === 'true',
      tags: tags,
      minPlayers: req.body.minPlayers || 2,
      maxPlayers: req.body.maxPlayers || 6,
    }

    // Handle base64 image if provided
    if (req.body.image?.data) {
      try {
        const imageData = req.body.image.data
        const mimeType = req.body.image.mimeType || 'image/png'
        const filename = req.body.image.filename || `map-${Date.now()}.png`

        const storedImage = await storeBase64Image(imageData, {
          mimeType,
          preferredFilename: filename,
        })

        mapData.imageUrl = storedImage.relativeUrl
        mapData.imageWidth = storedImage.width
        mapData.imageHeight = storedImage.height
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
      mapData.metadata = req.body.metadata as MapMetadataPayload
    }

    const map = await mapService.createMap(req.userId, mapData)

    logger.info('Map created successfully:', {
      mapId: map.id,
      name: map.name,
    })

    return res.status(201).json(map)
  } catch (error) {
    handleRouteError(error, req, 'Failed to create map', 500, { endpoint: '/api/maps/json' })
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    // More detailed error for debugging
    if (errorMessage.includes('duplicate key')) {
      return res.status(400).json({
        error: 'Map name already exists',
        message: 'Please choose a different name for your map',
        suggestion: `${req.body.name} (${Date.now()})`,
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
})

// Create new map (FormData - backward compatibility)
router.post(
  '/',
  authenticateToken,
  upload.single('image'),
  handleMulterError,
  validateCreateMap,
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      logger.info('Creating map with data:', {
        name: req.body.name,
        hasImage: !!req.file,
        hasMetadata: !!req.body.metadata,
        userId: req.userId,
      })

      const mapData: CreateMapRequest & { metadata?: MapMetadataPayload } = {
        name: req.body.name,
        description: req.body.description,
        isPublic: req.body.isPublic === 'true' || req.body.isPublic === true,
        tags: parseTags(req.body.tags),
      }

      // Parse metadata if provided
      let metadata: MapMetadataPayload | null = null
      if (req.body.metadata) {
        metadata = parseJsonField<MapMetadataPayload | null>(req.body.metadata, null)
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
        try {
          const stored = await storeImageBuffer(req.file.buffer, {
            mimeType: req.file.mimetype,
            preferredFilename: req.file.originalname,
          })

          mapData.imageUrl = stored.relativeUrl
          mapData.imageWidth = stored.width
          mapData.imageHeight = stored.height
        } catch (uploadError) {
          logger.error('Failed to process uploaded image:', uploadError)
          return res.status(400).json({
            error: 'Failed to process image',
            message: 'The uploaded image could not be processed',
          })
        }
      }

      // Store metadata in the map data (will be saved as JSONB)
      if (metadata) {
        mapData.metadata = metadata
      }

      const map = await mapService.createMap(req.userId, mapData)

      logger.info('Map created successfully:', {
        mapId: map.id,
        name: map.name,
      })

      return res.status(201).json(map)
    } catch (error) {
      handleRouteError(error, req, 'Failed to create map')

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
  upload.single('image'),
  validateUpdateMap,
  checkValidation,
  async (req: Request, res: Response) => {
    const userId = req.userId
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    try {
      const updates: UpdateMapRequest = {
        name: req.body.name,
        description: req.body.description,
        isPublic: req.body.isPublic,
        tags: parseTags(req.body.tags),
      }

      if (req.file) {
        try {
          const stored = await storeImageBuffer(req.file.buffer, {
            mimeType: req.file.mimetype,
            preferredFilename: req.file.originalname,
          })

          updates.imageUrl = stored.relativeUrl
          updates.imageWidth = stored.width
          updates.imageHeight = stored.height
        } catch (uploadError) {
          logger.error('Failed to process uploaded image for update:', uploadError)
          return res.status(400).json({
            error: 'Failed to process image',
            message: 'The uploaded image could not be processed',
          })
        }
      }

      const map = await mapService.updateMap(req.params.mapId, userId, updates, {
        isAdmin: req.user?.isAdmin,
        allowCollaborator: true,
      })

      return res.json(map)
    } catch (error) {
      if (error instanceof MapPermissionError) {
        return res.status(403).json({ error: error.message })
      }
      if (error instanceof MapNotFoundError) {
        return res.status(404).json({ error: 'Map not found' })
      }
      handleRouteError(error, req, 'Failed to update map', 500, { mapId: req.params.mapId })
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
    const userId = req.userId
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    try {
      await mapService.deleteMap(req.params.mapId, userId, { isAdmin: req.user?.isAdmin })

      return res.json({ message: 'Map deleted successfully' })
    } catch (error) {
      const pgCode = (error as any)?.code as string | undefined
      if (pgCode === '23503') {
        return res.status(409).json({
          error: 'Cannot delete map with historical game results',
          code: 'MAP_DELETE_CONFLICT',
          detail:
            'This map is referenced by completed games. Archive the map instead to preserve history.',
        })
      }
      if (error instanceof MapPermissionError) {
        return res.status(403).json({ error: error.message })
      }
      if (error instanceof MapNotFoundError) {
        return res.status(404).json({ error: 'Map not found' })
      }
      handleRouteError(error, req, 'Failed to delete map', 500, { mapId: req.params.mapId })
      return res.status(500).json({ error: 'Failed to delete map' })
    }
  },
)

// ============= TERRITORY MANAGEMENT =============

// Create continent
router.post(
  '/:mapId/continents',
  authenticateToken,
  validateCreateContinent,
  checkValidation,
  async (req: Request, res: Response) => {
    const userId = req.userId
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    try {
      await mapPermissionService.assertCanEditMap(req.params.mapId, {
        userId,
        isAdmin: req.user?.isAdmin,
      })
      const continent = await mapService.createContinent(
        req.params.mapId,
        req.body.name,
        req.body.bonusArmies,
        req.body.color,
      )

      return res.status(201).json(continent)
    } catch (error) {
      if (error instanceof MapPermissionError) {
        return res.status(403).json({ error: error.message })
      }
      if (error instanceof MapNotFoundError) {
        return res.status(404).json({ error: 'Map not found' })
      }
      handleRouteError(error, req, 'Failed to create continent', 500, { mapId: req.params.mapId })
      return res.status(500).json({ error: 'Failed to create continent' })
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
    const userId = req.userId
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    try {
      await mapPermissionService.assertCanEditMap(req.params.mapId, {
        userId,
        isAdmin: req.user?.isAdmin,
      })
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

      return res.status(201).json(territory)
    } catch (error) {
      if (error instanceof MapPermissionError) {
        return res.status(403).json({ error: error.message })
      }
      if (error instanceof MapNotFoundError) {
        return res.status(404).json({ error: 'Map not found' })
      }
      handleRouteError(error, req, 'Failed to create territory', 500, { mapId: req.params.mapId })
      return res.status(500).json({ error: 'Failed to create territory' })
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
    const userId = req.userId
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    try {
      await mapPermissionService.assertCanEditTerritories(
        [req.body.fromTerritoryId, req.body.toTerritoryId],
        { userId, isAdmin: req.user?.isAdmin },
      )
      const adjacency = await mapService.createAdjacency({
        fromTerritoryId: req.body.fromTerritoryId,
        toTerritoryId: req.body.toTerritoryId,
        connectionType: req.body.connectionType,
        isBidirectional: req.body.isBidirectional,
        specialRequirements: req.body.specialRequirements,
      })

      return res.status(201).json(adjacency)
    } catch (error) {
      if (error instanceof MapPermissionError) {
        return res.status(403).json({ error: error.message })
      }
      if (error instanceof MapNotFoundError) {
        return res.status(404).json({ error: error.message })
      }
      handleRouteError(error, req, 'Failed to create adjacency', 500, { mapId: req.params.mapId })
      return res.status(500).json({ error: 'Failed to create adjacency' })
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
        req.userId,
        req.body.rating,
        req.body.review,
      )

      return res.status(201).json(rating)
    } catch (error) {
      handleRouteError(error, req, 'Failed to rate map', 500, { mapId: req.params.mapId })
      return res.status(500).json({ error: 'Failed to rate map' })
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
      const userId = req.userId
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' })
      }

      await mapPermissionService.assertCanEditMap(mapId, {
        userId,
        isAdmin: req.user?.isAdmin,
      })

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
      if (error instanceof MapPermissionError) {
        return res.status(403).json({ error: error.message })
      }
      if (error instanceof MapNotFoundError) {
        return res.status(404).json({ error: 'Map not found' })
      }
      handleRouteError(error, req, 'Failed to generate capitals', 500, { mapId: req.params.mapId })
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
      const userId = req.userId
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' })
      }
      const playerCountNum = parseInt(playerCount, 10)

      await mapPermissionService.assertCanEditMap(mapId, {
        userId,
        isAdmin: req.user?.isAdmin,
      })

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
      if (error instanceof MapPermissionError) {
        return res.status(403).json({ error: error.message })
      }
      if (error instanceof MapNotFoundError) {
        return res.status(404).json({ error: 'Map not found' })
      }
      handleRouteError(error, req, 'Failed to update capitals', 500, { mapId: req.params.mapId })
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
      const userId = req.userId
      if (!mapData.map.isPublic) {
        if (!userId) {
          return res.status(403).json({ error: 'Access denied' })
        }

        const context = await mapPermissionService.getMapEditorContext(mapId, {
          userId,
          isAdmin: req.user?.isAdmin,
        })

        const canView = context.canEdit || context.collaboratorRole !== undefined
        if (!canView) {
          return res.status(403).json({ error: 'Access denied' })
        }
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
      handleRouteError(error, req, 'Failed to fetch capitals', 500, { mapId: req.params.mapId })
      return res.status(500).json({ error: 'Failed to fetch capitals' })
    }
  },
)

export default router
