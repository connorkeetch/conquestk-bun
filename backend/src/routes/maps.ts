import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { mapService } from '../services/mapService';
import { authenticateToken } from '../middleware/auth';
import { logger } from '../utils/logger';
import { CreateMapRequest, UpdateMapRequest } from '../types/maps';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads', 'maps');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  logger.info('Created uploads directory:', uploadsDir);
}

const router = Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/maps/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'map-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extName = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeType = allowedTypes.test(file.mimetype);
    
    if (extName && mimeType) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Validation middleware
const validateCreateMap = [
  body('name').isLength({ min: 1, max: 100 }).withMessage('Map name must be 1-100 characters'),
  body('description').optional().isLength({ max: 500 }).withMessage('Description must be under 500 characters'),
  body('isPublic').optional().isBoolean().withMessage('isPublic must be boolean'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
  body('tags.*').optional().isString().isLength({ min: 1, max: 30 }).withMessage('Each tag must be 1-30 characters')
];

const validateUpdateMap = [
  param('mapId').isUUID().withMessage('Invalid map ID'),
  body('name').optional().isLength({ min: 1, max: 100 }).withMessage('Map name must be 1-100 characters'),
  body('description').optional().isLength({ max: 500 }).withMessage('Description must be under 500 characters'),
  body('isPublic').optional().isBoolean().withMessage('isPublic must be boolean'),
  body('tags').optional().isArray().withMessage('Tags must be an array')
];

const validateCreateTerritory = [
  param('mapId').isUUID().withMessage('Invalid map ID'),
  body('territoryId').isLength({ min: 1, max: 50 }).withMessage('Territory ID must be 1-50 characters'),
  body('name').isLength({ min: 1, max: 100 }).withMessage('Territory name must be 1-100 characters'),
  body('boundaryCoords').isArray({ min: 3 }).withMessage('Must have at least 3 boundary coordinates'),
  body('armyPosition').isObject().withMessage('Army position must be an object'),
  body('armyPosition.x').isInt({ min: 0 }).withMessage('Army position X must be a positive integer'),
  body('armyPosition.y').isInt({ min: 0 }).withMessage('Army position Y must be a positive integer')
];

const validateCreateContinent = [
  param('mapId').isUUID().withMessage('Invalid map ID'),
  body('name').isLength({ min: 1, max: 100 }).withMessage('Continent name must be 1-100 characters'),
  body('bonusArmies').isInt({ min: 0, max: 20 }).withMessage('Bonus armies must be 0-20'),
  body('color').optional().isHexColor().withMessage('Color must be a valid hex color')
];

const validateCreateAdjacency = [
  body('fromTerritoryId').isUUID().withMessage('Invalid from territory ID'),
  body('toTerritoryId').isUUID().withMessage('Invalid to territory ID'),
  body('connectionType').optional().isIn(['land', 'sea', 'air', 'tunnel', 'special']).withMessage('Invalid connection type'),
  body('isBidirectional').optional().isBoolean().withMessage('isBidirectional must be boolean')
];

const validateRating = [
  param('mapId').isUUID().withMessage('Invalid map ID'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
  body('review').optional().isLength({ max: 1000 }).withMessage('Review must be under 1000 characters')
];

// Middleware to check validation results
const checkValidation = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  return next();
};

// Multer error handling middleware
const handleMulterError = (error: any, req: Request, res: Response, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Image file is too large. Maximum size is 10MB.' });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Unexpected field in file upload. Use "image" field name.' });
    }
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  }
  if (error && error.message === 'Only image files are allowed') {
    return res.status(400).json({ error: 'Only image files (PNG, JPG, GIF, WEBP) are allowed.' });
  }
  return next(error);
};

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
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      isPublic: true // Force public maps only for this endpoint
    };

    const result = await mapService.searchMaps(filters);
    return res.json(result);
  } catch (error) {
    logger.error('Error searching maps:', error);
    return res.status(500).json({ error: 'Failed to search maps' });
  }
});

// Get specific map details
router.get('/:mapId', 
  param('mapId').isUUID().withMessage('Invalid map ID'),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const mapData = await mapService.getMapWithFullData(req.params.mapId);
      
      if (!mapData) {
        return res.status(404).json({ error: 'Map not found' });
      }

      // Check if map is public or user owns it
      if (!mapData.map.isPublic && (!(req as any).userId || (req as any).userId !== mapData.map.creatorId)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      return res.json(mapData);
    } catch (error) {
      logger.error('Error fetching map:', error);
      return res.status(500).json({ error: 'Failed to fetch map' });
    }
  }
);

// Get game modes
router.get('/game-modes/list', async (req: Request, res: Response) => {
  try {
    const gameModes = await mapService.getGameModes();
    return res.json(gameModes);
  } catch (error) {
    logger.error('Error fetching game modes:', error);
    return res.status(500).json({ error: 'Failed to fetch game modes' });
  }
});

// Get territory ability types
router.get('/abilities/list', async (req: Request, res: Response) => {
  try {
    const abilities = await mapService.getTerritoryAbilityTypes();
    return res.json(abilities);
  } catch (error) {
    logger.error('Error fetching territory abilities:', error);
    return res.status(500).json({ error: 'Failed to fetch territory abilities' });
  }
});

// ============= AUTHENTICATED ROUTES =============

// Create new map
router.post('/',
  authenticateToken,
  upload.single('image'),
  handleMulterError,
  validateCreateMap,
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const mapData: CreateMapRequest = {
        name: req.body.name,
        description: req.body.description,
        isPublic: req.body.isPublic || false,
        tags: req.body.tags || []
      };

      if (req.file) {
        mapData.imageUrl = `/uploads/maps/${req.file.filename}`;
      }

      const map = await mapService.createMap((req as any).userId, mapData);
      return res.status(201).json(map);
    } catch (error) {
      logger.error('Error creating map:', error);
      return res.status(500).json({ error: 'Failed to create map' });
    }
  }
);

// Update map
router.put('/:mapId',
  authenticateToken,
  upload.single('image'),
  validateUpdateMap,
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const updates: UpdateMapRequest = {
        name: req.body.name,
        description: req.body.description,
        isPublic: req.body.isPublic,
        tags: req.body.tags
      };

      if (req.file) {
        updates.imageUrl = `/uploads/maps/${req.file.filename}`;
      }

      const map = await mapService.updateMap(req.params.mapId, (req as any).userId, updates);
      
      if (!map) {
        return res.status(404).json({ error: 'Map not found or access denied' });
      }

      return res.json(map);
    } catch (error) {
      logger.error('Error updating map:', error);
      return res.status(500).json({ error: 'Failed to update map' });
    }
  }
);

// Delete map
router.delete('/:mapId',
  authenticateToken,
  param('mapId').isUUID().withMessage('Invalid map ID'),
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const success = await mapService.deleteMap(req.params.mapId, (req as any).userId);
      
      if (!success) {
        return res.status(404).json({ error: 'Map not found or access denied' });
      }

      return res.json({ message: 'Map deleted successfully' });
    } catch (error) {
      logger.error('Error deleting map:', error);
      return res.status(500).json({ error: 'Failed to delete map' });
    }
  }
);

// Get user's maps
router.get('/my/maps',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const filters = {
        creator: (req as any).userId,
        isPublic: undefined, // Show both public and private
        sortBy: req.query.sortBy as string,
        sortOrder: req.query.sortOrder as 'asc' | 'desc',
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0
      };

      const result = await mapService.searchMaps(filters);
      return res.json(result);
    } catch (error) {
      logger.error('Error fetching user maps:', error);
      return res.status(500).json({ error: 'Failed to fetch user maps' });
    }
  }
);

// ============= TERRITORY MANAGEMENT =============

// Create continent
router.post('/:mapId/continents',
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
        req.body.color
      );
      
      res.status(201).json(continent);
    } catch (error) {
      logger.error('Error creating continent:', error);
      res.status(500).json({ error: 'Failed to create continent' });
    }
  }
);

// Create territory
router.post('/:mapId/territories',
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
        startingArmies: req.body.startingArmies
      });
      
      res.status(201).json(territory);
    } catch (error) {
      logger.error('Error creating territory:', error);
      res.status(500).json({ error: 'Failed to create territory' });
    }
  }
);

// Create adjacency
router.post('/adjacencies',
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
        specialRequirements: req.body.specialRequirements
      });
      
      res.status(201).json(adjacency);
    } catch (error) {
      logger.error('Error creating adjacency:', error);
      res.status(500).json({ error: 'Failed to create adjacency' });
    }
  }
);

// ============= RATING SYSTEM =============

// Rate a map
router.post('/:mapId/rate',
  authenticateToken,
  validateRating,
  checkValidation,
  async (req: Request, res: Response) => {
    try {
      const rating = await mapService.rateMap(
        req.params.mapId,
        (req as any).userId,
        req.body.rating,
        req.body.review
      );
      
      res.status(201).json(rating);
    } catch (error) {
      logger.error('Error rating map:', error);
      res.status(500).json({ error: 'Failed to rate map' });
    }
  }
);

export default router;