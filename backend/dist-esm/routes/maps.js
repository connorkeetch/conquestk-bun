"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const multer_1 = __importDefault(require("multer"));
const database_js_1 = require("../config/database.js");
const auth_js_1 = require("../middleware/auth.js");
const capitalGeneratorService_js_1 = require("../services/capitalGeneratorService.js");
const mapPermissionService_js_1 = require("../services/mapPermissionService.js");
const mapService_js_1 = require("../services/mapService.js");
const imageStorage_js_1 = require("../utils/imageStorage.js");
const logger_js_1 = require("../utils/logger.js");
const routeErrorHandler_js_1 = require("../utils/routeErrorHandler.js");
const tagParser_js_1 = require("../utils/tagParser.js");
const url_js_1 = require("../utils/url.js");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10),
        files: 1,
        fields: 10,
    },
    fileFilter: (_req, file, cb) => {
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        const allowedExtensions = /\.(jpeg|jpg|png|gif|webp)$/i;
        const hasValidExtension = allowedExtensions.test(file.originalname);
        const hasValidMimeType = allowedMimeTypes.includes(file.mimetype);
        if (hasValidExtension && hasValidMimeType) {
            return cb(null, true);
        }
        logger_js_1.logger.warn(`File upload rejected: ${file.originalname} (${file.mimetype})`);
        cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'));
    },
});
const validateCreateMap = [
    (0, express_validator_1.body)('name').isLength({ min: 1, max: 100 }).withMessage('Map name must be 1-100 characters'),
    (0, express_validator_1.body)('description')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Description must be under 500 characters'),
    (0, express_validator_1.body)('isPublic')
        .optional()
        .custom((value) => {
        return value === true || value === false || value === 'true' || value === 'false';
    })
        .withMessage('isPublic must be boolean or "true"/"false" string'),
    (0, express_validator_1.body)('tags')
        .optional()
        .custom((value) => {
        if (Array.isArray(value))
            return true;
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed);
            }
            catch {
                return false;
            }
        }
        return false;
    })
        .withMessage('Tags must be an array or valid JSON array string'),
    (0, express_validator_1.body)('metadata')
        .optional()
        .custom((value) => {
        if (typeof value === 'object' && value !== null)
            return true;
        if (typeof value === 'string') {
            try {
                JSON.parse(value);
                return true;
            }
            catch {
                return false;
            }
        }
        return false;
    })
        .withMessage('Metadata must be a valid JSON object or string'),
];
const validateUpdateMap = [
    (0, express_validator_1.param)('mapId').isUUID().withMessage('Invalid map ID'),
    (0, express_validator_1.body)('name')
        .optional()
        .isLength({ min: 1, max: 100 })
        .withMessage('Map name must be 1-100 characters'),
    (0, express_validator_1.body)('description')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Description must be under 500 characters'),
    (0, express_validator_1.body)('isPublic').optional().isBoolean().withMessage('isPublic must be boolean'),
    (0, express_validator_1.body)('tags').optional().isArray().withMessage('Tags must be an array'),
];
const validateCreateTerritory = [
    (0, express_validator_1.param)('mapId').isUUID().withMessage('Invalid map ID'),
    (0, express_validator_1.body)('territoryId')
        .isLength({ min: 1, max: 50 })
        .withMessage('Territory ID must be 1-50 characters'),
    (0, express_validator_1.body)('name')
        .isLength({ min: 1, max: 100 })
        .withMessage('Territory name must be 1-100 characters'),
    (0, express_validator_1.body)('boundaryCoords')
        .isArray({ min: 3 })
        .withMessage('Must have at least 3 boundary coordinates'),
    (0, express_validator_1.body)('armyPosition').isObject().withMessage('Army position must be an object'),
    (0, express_validator_1.body)('armyPosition.x')
        .isInt({ min: 0 })
        .withMessage('Army position X must be a positive integer'),
    (0, express_validator_1.body)('armyPosition.y')
        .isInt({ min: 0 })
        .withMessage('Army position Y must be a positive integer'),
];
const validateCreateSector = [
    (0, express_validator_1.param)('mapId').isUUID().withMessage('Invalid map ID'),
    (0, express_validator_1.body)('name').isLength({ min: 1, max: 100 }).withMessage('Sector name must be 1-100 characters'),
    (0, express_validator_1.body)('bonusArmies').isInt({ min: 0, max: 20 }).withMessage('Bonus armies must be 0-20'),
    (0, express_validator_1.body)('color').optional().isHexColor().withMessage('Color must be a valid hex color'),
];
const validateCreateAdjacency = [
    (0, express_validator_1.body)('fromTerritoryId').isUUID().withMessage('Invalid from territory ID'),
    (0, express_validator_1.body)('toTerritoryId').isUUID().withMessage('Invalid to territory ID'),
    (0, express_validator_1.body)('connectionType')
        .optional()
        .isIn(['land', 'sea', 'air', 'tunnel', 'special'])
        .withMessage('Invalid connection type'),
    (0, express_validator_1.body)('isBidirectional').optional().isBoolean().withMessage('isBidirectional must be boolean'),
];
const validateRating = [
    (0, express_validator_1.param)('mapId').isUUID().withMessage('Invalid map ID'),
    (0, express_validator_1.body)('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
    (0, express_validator_1.body)('review')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Review must be under 1000 characters'),
];
const checkValidation = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }
    return next();
};
const handleMulterError = (error, _req, res, next) => {
    if (error instanceof multer_1.default.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            res.status(400).json({ error: 'Image file is too large. Maximum size is 10MB.' });
            return;
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            res.status(400).json({ error: 'Unexpected field in file upload. Use "image" field name.' });
            return;
        }
        res.status(400).json({ error: `Upload error: ${error.message}` });
        return;
    }
    if (error instanceof Error && error.message === 'Only image files are allowed') {
        res.status(400).json({ error: 'Only image files (PNG, JPG, GIF, WEBP) are allowed.' });
        return;
    }
    next(error);
};
router.get('/available-for-game', async (req, res) => {
    try {
        const pool = await (0, database_js_1.getPool)();
        let includeVipMaps = false;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const jwtSecret = process.env.JWT_SECRET;
            if (jwtSecret) {
                try {
                    const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
                    const userId = typeof decoded === 'object' ? decoded.userId : undefined;
                    if (userId) {
                        const userResult = await pool.query('SELECT is_admin, is_vip FROM users WHERE id = $1 LIMIT 1', [userId]);
                        if (userResult.rows[0]) {
                            includeVipMaps =
                                Boolean(userResult.rows[0].is_admin) || Boolean(userResult.rows[0].is_vip);
                        }
                    }
                }
                catch (_error) {
                }
            }
        }
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
        (SELECT COUNT(DISTINCT sector) FROM map_territories WHERE map_id = m.id AND sector IS NOT NULL) as sector_count
      FROM maps m
      LEFT JOIN users u ON m.creator_id = u.id
      WHERE m.status = 'approved'
      ORDER BY 
        CASE WHEN m.is_featured THEN 0 ELSE 1 END,
        m.play_count DESC,
        m.rating_average DESC,
        m.created_at DESC
      LIMIT 100
    `;
        const result = await pool.query(query);
        const maps = result.rows.map((row) => {
            const imageUrl = (0, url_js_1.resolveAssetUrl)(req, row.image_url);
            return {
                id: row.id,
                name: row.name,
                description: row.description || '',
                territory_count: parseInt(row.territory_count, 10) || 0,
                sector_count: parseInt(row.sector_count, 10) || 0,
                continent_count: parseInt(row.sector_count, 10) || 0,
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
            };
        });
        const visibleMaps = includeVipMaps ? maps : maps.filter((map) => !map.is_vip_only);
        return res.json({
            maps: visibleMaps,
            total: visibleMaps.length,
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch available maps');
        return res.status(500).json({ error: 'Failed to fetch available maps' });
    }
});
router.get('/', async (req, res) => {
    try {
        const pool = await (0, database_js_1.getPool)();
        const isPublic = req.query.isPublic !== 'false';
        const status = req.query.status || 'approved';
        const sortBy = req.query.sortBy || 'popularity';
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
        const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;
        const tag = req.query.tag;
        const filters = [];
        const filterParams = [];
        let placeholderIndex = 0;
        if (isPublic) {
            filters.push('m.is_public = true');
        }
        if (status) {
            filters.push(`m.status = $${++placeholderIndex}`);
            filterParams.push(status);
        }
        if (tag) {
            filters.push(`$${++placeholderIndex} = ANY(m.tags)`);
            filterParams.push(tag);
        }
        const whereSql = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
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
        (SELECT COUNT(DISTINCT sector) FROM map_territories WHERE map_id = m.id AND sector IS NOT NULL) as sector_count
      FROM maps m
      LEFT JOIN users u ON m.creator_id = u.id
      ${whereSql}
    `;
        switch (sortBy) {
            case 'rating':
                query += ` ORDER BY m.rating_average DESC NULLS LAST, m.play_count DESC`;
                break;
            case 'newest':
                query += ` ORDER BY m.created_at DESC`;
                break;
            case 'name':
                query += ` ORDER BY m.name ASC`;
                break;
            default:
                query += ` ORDER BY m.is_featured DESC, m.play_count DESC, m.rating_average DESC NULLS LAST`;
                break;
        }
        const limitPlaceholder = `$${++placeholderIndex}`;
        const offsetPlaceholder = `$${++placeholderIndex}`;
        query += ` LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`;
        const result = await pool.query(query, [...filterParams, limit, offset]);
        const maps = result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description || '',
            imageUrl: (0, url_js_1.resolveAssetUrl)(req, row.image_url),
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
            sectorCount: parseInt(row.sector_count, 10) || 0,
            continentCount: parseInt(row.sector_count, 10) || 0,
        }));
        const countQuery = `
      SELECT COUNT(*) as total
      FROM maps m
      ${whereSql}
    `;
        const countResult = await pool.query(countQuery, filterParams);
        const total = parseInt(countResult.rows[0]?.total || '0', 10);
        return res.json({
            maps,
            total,
            limit,
            offset,
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch maps');
        return res.status(500).json({ error: 'Failed to fetch maps' });
    }
});
router.get('/my-maps', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const filters = {
            creator: req.userId,
            isPublic: undefined,
            sortBy: req.query.sortBy,
            sortOrder: req.query.sortOrder,
            limit: req.query.limit ? parseInt(req.query.limit, 10) : 50,
            offset: req.query.offset ? parseInt(req.query.offset, 10) : 0,
        };
        const result = await mapService_js_1.mapService.searchMaps(filters);
        const pool = await (0, database_js_1.getPool)();
        const mapIds = result.maps.map((m) => m.id);
        let statusMap = null;
        if (mapIds.length > 0) {
            const statusQuery = `
        SELECT id, status 
        FROM maps 
        WHERE id = ANY($1)
      `;
            const statusResult = await pool.query(statusQuery, [mapIds]);
            statusMap = new Map(statusResult.rows.map((r) => [r.id, r.status]));
        }
        const maps = result.maps.map((map) => {
            const resolvedImageUrl = (0, url_js_1.resolveAssetUrl)(req, map.imageUrl);
            return {
                ...map,
                imageUrl: resolvedImageUrl || map.imageUrl,
                status: statusMap?.get(map.id) || map.status || 'draft',
            };
        });
        return res.json(maps);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch user maps');
        return res.status(500).json({ error: 'Failed to fetch user maps' });
    }
});
router.get('/my/maps', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const filters = {
            creator: req.userId,
            isPublic: undefined,
            sortBy: req.query.sortBy,
            sortOrder: req.query.sortOrder,
            limit: req.query.limit ? parseInt(req.query.limit, 10) : 20,
            offset: req.query.offset ? parseInt(req.query.offset, 10) : 0,
        };
        const result = await mapService_js_1.mapService.searchMaps(filters);
        return res.json(result);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch user maps');
        return res.status(500).json({ error: 'Failed to fetch user maps' });
    }
});
router.get('/:mapId', (0, express_validator_1.param)('mapId').isUUID().withMessage('Invalid map ID'), checkValidation, async (req, res) => {
    try {
        const mapData = await mapService_js_1.mapService.getMapWithFullData(req.params.mapId);
        if (!mapData) {
            return res.status(404).json({ error: 'Map not found' });
        }
        if (!mapData.map.isPublic && (!req.userId || req.userId !== mapData.map.creatorId)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        return res.json(mapData);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch map', 500, { mapId: req.params.mapId });
        return res.status(500).json({ error: 'Failed to fetch map' });
    }
});
router.get('/:mapId/validate', auth_js_1.authenticateToken, (0, express_validator_1.param)('mapId').isUUID().withMessage('Invalid map ID'), checkValidation, async (req, res) => {
    try {
        const mapId = req.params.mapId;
        const map = await mapService_js_1.mapService.getMap(mapId);
        if (!map) {
            return res.status(404).json({ error: 'Map not found' });
        }
        if (!map.isPublic) {
            try {
                await mapPermissionService_js_1.mapPermissionService.assertCanEditMap(mapId, { userId: req.userId }, {
                    allowCollaborator: true,
                });
            }
            catch (_err) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }
        const result = await mapService_js_1.mapService.validateMapPlayable(mapId);
        return res.json(result);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to validate map', 500, { mapId: req.params.mapId });
        return res.status(500).json({ error: 'Failed to validate map' });
    }
});
router.get('/game-modes/list', async (_req, res) => {
    try {
        const gameModes = await mapService_js_1.mapService.getGameModes();
        return res.json(gameModes);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, _req, 'Failed to fetch game modes');
        return res.status(500).json({ error: 'Failed to fetch game modes' });
    }
});
router.get('/abilities/list', async (_req, res) => {
    try {
        const abilities = await mapService_js_1.mapService.getTerritoryAbilityTypes();
        return res.json(abilities);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, _req, 'Failed to fetch territory abilities');
        return res.status(500).json({ error: 'Failed to fetch territory abilities' });
    }
});
router.post('/json', auth_js_1.authenticateToken, async (req, res) => {
    try {
        logger_js_1.logger.info('Creating map with JSON data:', {
            name: req.body.name,
            hasImage: !!req.body.image,
            hasMetadata: !!req.body.metadata,
            userId: req.userId,
            bodyType: typeof req.body,
            headers: req.headers['content-type'],
        });
        let tags = [];
        logger_js_1.logger.info('Tags received:', {
            tags: req.body.tags,
            type: typeof req.body.tags,
            isArray: Array.isArray(req.body.tags),
            stringified: JSON.stringify(req.body.tags),
        });
        if (Array.isArray(req.body.tags)) {
            tags = req.body.tags;
        }
        else if (typeof req.body.tags === 'string') {
            try {
                const parsed = JSON.parse(req.body.tags);
                if (Array.isArray(parsed)) {
                    tags = parsed;
                }
                else {
                    tags = req.body.tags.split(',').map((t) => t.trim());
                }
            }
            catch {
                tags = req.body.tags.split(',').map((t) => t.trim());
            }
        }
        else if (typeof req.body.tags === 'object' && req.body.tags !== null) {
            if (req.body.tags[0] !== undefined) {
                tags = Object.values(req.body.tags);
            }
            else {
                tags = [];
            }
        }
        else {
            tags = [];
        }
        const mapData = {
            name: req.body.name,
            description: req.body.description,
            isPublic: req.body.isPublic === true || req.body.isPublic === 'true',
            tags: tags,
            minPlayers: req.body.minPlayers || 2,
            maxPlayers: req.body.maxPlayers || 6,
        };
        if (req.body.image?.data) {
            try {
                const imageData = req.body.image.data;
                const mimeType = req.body.image.mimeType || 'image/png';
                const filename = req.body.image.filename || `map-${Date.now()}.png`;
                const storedImage = await (0, imageStorage_js_1.storeBase64Image)(imageData, {
                    mimeType,
                    preferredFilename: filename,
                });
                mapData.imageUrl = storedImage.relativeUrl;
                mapData.imageWidth = storedImage.width;
                mapData.imageHeight = storedImage.height;
            }
            catch (imageError) {
                logger_js_1.logger.error('Failed to process base64 image:', imageError);
                return res.status(400).json({
                    error: 'Failed to process image',
                    message: 'The image data could not be processed',
                });
            }
        }
        if (req.body.metadata) {
            mapData.metadata = req.body.metadata;
        }
        const map = await mapService_js_1.mapService.createMap(req.userId, mapData);
        logger_js_1.logger.info('Map created successfully:', {
            mapId: map.id,
            name: map.name,
        });
        return res.status(201).json(map);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to create map', 500, { endpoint: '/api/maps/json' });
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        if (errorMessage.includes('duplicate key')) {
            return res.status(400).json({
                error: 'Map name already exists',
                message: 'Please choose a different name for your map',
                suggestion: `${req.body.name} (${Date.now()})`,
            });
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
        });
    }
});
router.post('/', auth_js_1.authenticateToken, upload.single('image'), handleMulterError, validateCreateMap, checkValidation, async (req, res) => {
    try {
        logger_js_1.logger.info('Creating map with data:', {
            name: req.body.name,
            hasImage: !!req.file,
            hasMetadata: !!req.body.metadata,
            userId: req.userId,
        });
        const mapData = {
            name: req.body.name,
            description: req.body.description,
            isPublic: req.body.isPublic === 'true' || req.body.isPublic === true,
            tags: (0, tagParser_js_1.parseTags)(req.body.tags),
        };
        let metadata = null;
        if (req.body.metadata) {
            metadata = (0, tagParser_js_1.parseJsonField)(req.body.metadata, null);
            if (metadata) {
                const sectorsLen = Array.isArray(metadata.sectors)
                    ? metadata.sectors.length
                    : 0;
                logger_js_1.logger.info('Parsed metadata:', {
                    territories: metadata.territories?.length || 0,
                    sectors: sectorsLen,
                });
            }
            else if (req.body.metadata) {
                logger_js_1.logger.error('Failed to parse metadata');
                return res.status(400).json({
                    error: 'Invalid metadata format',
                    details: 'The map data (territories and sectors) could not be parsed',
                });
            }
        }
        if (req.file) {
            try {
                const stored = await (0, imageStorage_js_1.storeImageBuffer)(req.file.buffer, {
                    mimeType: req.file.mimetype,
                    preferredFilename: req.file.originalname,
                });
                mapData.imageUrl = stored.relativeUrl;
                mapData.imageWidth = stored.width;
                mapData.imageHeight = stored.height;
            }
            catch (uploadError) {
                logger_js_1.logger.error('Failed to process uploaded image:', uploadError);
                return res.status(400).json({
                    error: 'Failed to process image',
                    message: 'The uploaded image could not be processed',
                });
            }
        }
        if (metadata) {
            mapData.metadata = metadata;
        }
        const map = await mapService_js_1.mapService.createMap(req.userId, mapData);
        logger_js_1.logger.info('Map created successfully:', {
            mapId: map.id,
            name: map.name,
        });
        return res.status(201).json(map);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to create map');
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return res.status(500).json({
            error: 'Failed to create map',
            message: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error : undefined,
        });
    }
});
router.put('/:mapId', auth_js_1.authenticateToken, upload.single('image'), validateUpdateMap, checkValidation, async (req, res) => {
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const updates = {
            name: req.body.name,
            description: req.body.description,
            isPublic: req.body.isPublic,
            tags: (0, tagParser_js_1.parseTags)(req.body.tags),
        };
        if (req.file) {
            try {
                const stored = await (0, imageStorage_js_1.storeImageBuffer)(req.file.buffer, {
                    mimeType: req.file.mimetype,
                    preferredFilename: req.file.originalname,
                });
                updates.imageUrl = stored.relativeUrl;
                updates.imageWidth = stored.width;
                updates.imageHeight = stored.height;
            }
            catch (uploadError) {
                logger_js_1.logger.error('Failed to process uploaded image for update:', uploadError);
                return res.status(400).json({
                    error: 'Failed to process image',
                    message: 'The uploaded image could not be processed',
                });
            }
        }
        const map = await mapService_js_1.mapService.updateMap(req.params.mapId, userId, updates, {
            isAdmin: req.user?.isAdmin,
            allowCollaborator: true,
        });
        return res.json(map);
    }
    catch (error) {
        if (error instanceof mapPermissionService_js_1.MapPermissionError) {
            return res.status(403).json({ error: error.message });
        }
        if (error instanceof mapPermissionService_js_1.MapNotFoundError) {
            return res.status(404).json({ error: 'Map not found' });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to update map', 500, { mapId: req.params.mapId });
        return res.status(500).json({ error: 'Failed to update map' });
    }
});
router.delete('/:mapId', auth_js_1.authenticateToken, (0, express_validator_1.param)('mapId').isUUID().withMessage('Invalid map ID'), checkValidation, async (req, res) => {
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        await mapService_js_1.mapService.deleteMap(req.params.mapId, userId, { isAdmin: req.user?.isAdmin });
        return res.json({ message: 'Map deleted successfully' });
    }
    catch (error) {
        if (error instanceof mapPermissionService_js_1.MapPermissionError) {
            return res.status(403).json({ error: error.message });
        }
        if (error instanceof mapPermissionService_js_1.MapNotFoundError) {
            return res.status(404).json({ error: 'Map not found' });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to delete map', 500, { mapId: req.params.mapId });
        return res.status(500).json({ error: 'Failed to delete map' });
    }
});
router.post('/:mapId/sectors', auth_js_1.authenticateToken, validateCreateSector, checkValidation, async (req, res) => {
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        await mapPermissionService_js_1.mapPermissionService.assertCanEditMap(req.params.mapId, {
            userId,
            isAdmin: req.user?.isAdmin,
        });
        const sector = await mapService_js_1.mapService.createSector(req.params.mapId, req.body.name, req.body.bonusArmies, req.body.color);
        return res.status(201).json(sector);
    }
    catch (error) {
        if (error instanceof mapPermissionService_js_1.MapPermissionError) {
            return res.status(403).json({ error: error.message });
        }
        if (error instanceof mapPermissionService_js_1.MapNotFoundError) {
            return res.status(404).json({ error: 'Map not found' });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to create sector', 500, { mapId: req.params.mapId });
        return res.status(500).json({ error: 'Failed to create sector' });
    }
});
router.post('/:mapId/continents', auth_js_1.authenticateToken, validateCreateSector, checkValidation, async (req, res) => {
    try {
        req.url = `/${req.params.mapId}/sectors`;
        const sector = await mapService_js_1.mapService.createSector(req.params.mapId, req.body.name, req.body.bonusArmies, req.body.color);
        return res.status(201).json(sector);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to create sector (compat)', 500, {
            mapId: req.params.mapId,
        });
        return res.status(500).json({ error: 'Failed to create sector' });
    }
});
router.post('/:mapId/territories', auth_js_1.authenticateToken, validateCreateTerritory, checkValidation, async (req, res) => {
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        await mapPermissionService_js_1.mapPermissionService.assertCanEditMap(req.params.mapId, {
            userId,
            isAdmin: req.user?.isAdmin,
        });
        const bodyWithSectors = req.body;
        const territory = await mapService_js_1.mapService.createTerritory({
            mapId: req.params.mapId,
            territoryId: req.body.territoryId,
            name: req.body.name,
            sectorId: bodyWithSectors.sectorId ?? bodyWithSectors.continentId,
            boundaryCoords: req.body.boundaryCoords,
            armyPosition: req.body.armyPosition,
            abilityTypeId: req.body.abilityTypeId,
            startingOwnerSlot: req.body.startingOwnerSlot,
            startingArmies: req.body.startingArmies,
        });
        return res.status(201).json(territory);
    }
    catch (error) {
        if (error instanceof mapPermissionService_js_1.MapPermissionError) {
            return res.status(403).json({ error: error.message });
        }
        if (error instanceof mapPermissionService_js_1.MapNotFoundError) {
            return res.status(404).json({ error: 'Map not found' });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to create territory', 500, { mapId: req.params.mapId });
        return res.status(500).json({ error: 'Failed to create territory' });
    }
});
router.post('/adjacencies', auth_js_1.authenticateToken, validateCreateAdjacency, checkValidation, async (req, res) => {
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        await mapPermissionService_js_1.mapPermissionService.assertCanEditTerritories([req.body.fromTerritoryId, req.body.toTerritoryId], { userId, isAdmin: req.user?.isAdmin });
        const adjacency = await mapService_js_1.mapService.createAdjacency({
            fromTerritoryId: req.body.fromTerritoryId,
            toTerritoryId: req.body.toTerritoryId,
            connectionType: req.body.connectionType,
            isBidirectional: req.body.isBidirectional,
            specialRequirements: req.body.specialRequirements,
        });
        return res.status(201).json(adjacency);
    }
    catch (error) {
        if (error instanceof mapPermissionService_js_1.MapPermissionError) {
            return res.status(403).json({ error: error.message });
        }
        if (error instanceof mapPermissionService_js_1.MapNotFoundError) {
            return res.status(404).json({ error: error.message });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to create adjacency', 500, { mapId: req.params.mapId });
        return res.status(500).json({ error: 'Failed to create adjacency' });
    }
});
router.post('/:mapId/rate', auth_js_1.authenticateToken, validateRating, checkValidation, async (req, res) => {
    try {
        const rating = await mapService_js_1.mapService.rateMap(req.params.mapId, req.userId, req.body.rating, req.body.review);
        return res.status(201).json(rating);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to rate map', 500, { mapId: req.params.mapId });
        return res.status(500).json({ error: 'Failed to rate map' });
    }
});
router.post('/:mapId/generate-capitals', auth_js_1.authenticateToken, (0, express_validator_1.param)('mapId').isUUID().withMessage('Invalid map ID'), checkValidation, async (req, res) => {
    try {
        const mapId = req.params.mapId;
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        await mapPermissionService_js_1.mapPermissionService.assertCanEditMap(mapId, {
            userId,
            isAdmin: req.user?.isAdmin,
        });
        const capitalService = new capitalGeneratorService_js_1.CapitalGeneratorService((0, database_js_1.getPool)());
        const capitals = await capitalService.generateCapitalsForMap(mapId);
        const metadata = {
            generatedAt: new Date().toISOString(),
            algorithm: 'maximin-distance-v1',
            manuallyAdjusted: {},
        };
        await (0, database_js_1.getPool)().query('UPDATE maps SET capital_assignments = $1, capital_metadata = $2 WHERE id = $3', [JSON.stringify(capitals), JSON.stringify(metadata), mapId]);
        logger_js_1.logger.info(`Generated capitals for map ${mapId}`);
        return res.json({
            success: true,
            capitals,
            metadata,
        });
    }
    catch (error) {
        if (error instanceof mapPermissionService_js_1.MapPermissionError) {
            return res.status(403).json({ error: error.message });
        }
        if (error instanceof mapPermissionService_js_1.MapNotFoundError) {
            return res.status(404).json({ error: 'Map not found' });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to generate capitals', 500, { mapId: req.params.mapId });
        return res.status(500).json({ error: 'Failed to generate capitals' });
    }
});
router.patch('/:mapId/capitals/:playerCount', auth_js_1.authenticateToken, (0, express_validator_1.param)('mapId').isUUID().withMessage('Invalid map ID'), (0, express_validator_1.param)('playerCount').isInt({ min: 2, max: 12 }).withMessage('Player count must be 2-12'), (0, express_validator_1.body)('territoryIds').isArray({ min: 2, max: 12 }).withMessage('Must provide territory IDs'), (0, express_validator_1.body)('territoryIds.*').isString().withMessage('Each territory ID must be a string'), checkValidation, async (req, res) => {
    try {
        const { mapId, playerCount } = req.params;
        const { territoryIds } = req.body;
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const playerCountNum = parseInt(playerCount, 10);
        await mapPermissionService_js_1.mapPermissionService.assertCanEditMap(mapId, {
            userId,
            isAdmin: req.user?.isAdmin,
        });
        if (territoryIds.length !== playerCountNum) {
            return res.status(400).json({
                error: `Must provide exactly ${playerCountNum} territories for ${playerCountNum} players`,
            });
        }
        const capitalService = new capitalGeneratorService_js_1.CapitalGeneratorService((0, database_js_1.getPool)());
        await capitalService.updateCapitalsForPlayerCount(mapId, playerCountNum, territoryIds);
        logger_js_1.logger.info(`Updated capitals for map ${mapId}, ${playerCountNum} players`);
        return res.json({
            success: true,
            playerCount: playerCountNum,
            capitals: territoryIds,
        });
    }
    catch (error) {
        if (error instanceof mapPermissionService_js_1.MapPermissionError) {
            return res.status(403).json({ error: error.message });
        }
        if (error instanceof mapPermissionService_js_1.MapNotFoundError) {
            return res.status(404).json({ error: 'Map not found' });
        }
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to update capitals', 500, { mapId: req.params.mapId });
        return res.status(500).json({ error: 'Failed to update capitals' });
    }
});
router.get('/:mapId/capitals', (0, express_validator_1.param)('mapId').isUUID().withMessage('Invalid map ID'), checkValidation, async (req, res) => {
    try {
        const mapId = req.params.mapId;
        const mapData = await mapService_js_1.mapService.getMapWithFullData(mapId);
        if (!mapData) {
            return res.status(404).json({ error: 'Map not found' });
        }
        const userId = req.userId;
        if (!mapData.map.isPublic) {
            if (!userId) {
                return res.status(403).json({ error: 'Access denied' });
            }
            const context = await mapPermissionService_js_1.mapPermissionService.getMapEditorContext(mapId, {
                userId,
                isAdmin: req.user?.isAdmin,
            });
            const canView = context.canEdit || context.collaboratorRole !== undefined;
            if (!canView) {
                return res.status(403).json({ error: 'Access denied' });
            }
        }
        const result = await (0, database_js_1.getPool)().query('SELECT capital_assignments, capital_metadata FROM maps WHERE id = $1', [mapId]);
        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Map not found' });
        }
        const { capital_assignments, capital_metadata } = result.rows[0];
        return res.json({
            capitals: capital_assignments || {},
            metadata: capital_metadata || {},
            mapId,
        });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch capitals', 500, { mapId: req.params.mapId });
        return res.status(500).json({ error: 'Failed to fetch capitals' });
    }
});
exports.default = router;
//# sourceMappingURL=maps.js.map