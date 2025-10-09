"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapService = exports.MapService = void 0;
const database_js_1 = require("../config/database.js");
const assetStorage_js_1 = require("../utils/assetStorage.js");
const logger_js_1 = require("../utils/logger.js");
const mapPermissionService_js_1 = require("./mapPermissionService.js");
class MapService {
    coerceNumber(value, fallback = 0) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return fallback;
    }
    coerceBoolean(value) {
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (['true', '1', 'yes', 'y'].includes(normalized))
                return true;
            if (['false', '0', 'no', 'n'].includes(normalized))
                return false;
        }
        if (typeof value === 'number') {
            return value !== 0;
        }
        return false;
    }
    normalizePublicImageUrl(url) {
        if (typeof url !== 'string' || !url.trim())
            return undefined;
        const input = url.trim();
        const endpoint = (process.env.ASSET_ENDPOINT || '').trim().replace(/\/$/, '');
        const bucket = (process.env.ASSET_BUCKET || '').trim().replace(/\/$/, '');
        const publicBase = (process.env.PUBLIC_ASSET_BASE_URL || '').trim().replace(/\/$/, '');
        if (publicBase && endpoint && bucket) {
            const oldPrefix = `${endpoint}/${bucket}`;
            if (input.startsWith(oldPrefix)) {
                return input.replace(oldPrefix, publicBase);
            }
        }
        return input;
    }
    async createMap(userId, mapData) {
        const client = await (0, database_js_1.getClient)();
        try {
            const hasMetadataColumn = true;
            const mapQuery = hasMetadataColumn
                ? `
          INSERT INTO maps (name, description, creator_id, image_url, image_width, image_height, is_public, tags, capital_territories, metadata, status, min_players, max_players)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING *
        `
                : `
          INSERT INTO maps (name, description, creator_id, image_url, image_width, image_height, is_public, tags, capital_territories, status, min_players, max_players)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *
        `;
            const normalizedImageUrl = this.normalizePublicImageUrl(mapData.imageUrl);
            const mapValues = hasMetadataColumn
                ? [
                    mapData.name,
                    mapData.description || null,
                    userId,
                    normalizedImageUrl || null,
                    mapData.imageWidth || 800,
                    mapData.imageHeight || 600,
                    mapData.isPublic || false,
                    mapData.tags || [],
                    mapData.capitalTerritories ? JSON.stringify(mapData.capitalTerritories) : null,
                    mapData.metadata ? JSON.stringify(mapData.metadata) : null,
                    'pending_review',
                    mapData.minPlayers || 2,
                    mapData.maxPlayers || 6,
                ]
                : [
                    mapData.name,
                    mapData.description || null,
                    userId,
                    normalizedImageUrl || null,
                    mapData.imageWidth || 800,
                    mapData.imageHeight || 600,
                    mapData.isPublic || false,
                    mapData.tags || [],
                    mapData.capitalTerritories ? JSON.stringify(mapData.capitalTerritories) : null,
                    'pending_review',
                    mapData.minPlayers || 2,
                    mapData.maxPlayers || 6,
                ];
            const mapResult = await client.query(mapQuery, mapValues);
            const map = mapResult.rows[0];
            if (mapData.metadata) {
                await this.synchronizeMapStructure(client, map.id, mapData.metadata);
            }
            logger_js_1.logger.info(`Created new map: ${map.name} (${map.id}) with metadata:`, {
                hasMetadata: !!mapData.metadata,
                territories: mapData.metadata?.territories?.length || 0,
                sectors: mapData.metadata?.sectors?.length || 0,
            });
            return this.formatMapFromDb(map);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('metadata')) {
                logger_js_1.logger.warn('Metadata column not found, creating map without metadata');
                const mapResult = await client.query(`
          INSERT INTO maps (name, description, creator_id, image_url, image_width, image_height, is_public, tags, capital_territories, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *
        `, [
                    mapData.name,
                    mapData.description || null,
                    userId,
                    this.normalizePublicImageUrl(mapData.imageUrl) || null,
                    mapData.imageWidth || 800,
                    mapData.imageHeight || 600,
                    mapData.isPublic || false,
                    mapData.tags || [],
                    mapData.capitalTerritories ? JSON.stringify(mapData.capitalTerritories) : null,
                    'pending_review',
                ]);
                const map = mapResult.rows[0];
                logger_js_1.logger.info(`Created new map without metadata: ${map.name} (${map.id})`);
                return this.formatMapFromDb(map);
            }
            throw error;
        }
        finally {
            if (client.release)
                client.release();
        }
    }
    async synchronizeMapStructure(client, mapId, metadata) {
        if (!metadata)
            return;
        try {
            const parseNumber = (value) => {
                if (typeof value === 'number' && Number.isFinite(value)) {
                    return value;
                }
                if (typeof value === 'string') {
                    const parsed = Number(value);
                    if (Number.isFinite(parsed)) {
                        return parsed;
                    }
                }
                return null;
            };
            const clamp01 = (value) => {
                if (!Number.isFinite(value))
                    return 0;
                if (value < 0)
                    return 0;
                if (value > 1)
                    return 1;
                return value;
            };
            const rawTerritories = Array.isArray(metadata.territories)
                ? metadata.territories
                : [];
            const sectors = Array.isArray(metadata.sectors)
                ? metadata.sectors
                : [];
            const width = typeof metadata.width === 'number' && metadata.width > 0 ? metadata.width : 1;
            const height = typeof metadata.height === 'number' && metadata.height > 0 ? metadata.height : 1;
            const territories = rawTerritories.map((territory) => {
                const legacyRecord = territory;
                const normalizedXCandidate = typeof territory.normalizedX === 'number'
                    ? territory.normalizedX
                    : typeof territory.armyPositionNormalized?.x === 'number'
                        ? territory.armyPositionNormalized.x
                        : parseNumber(legacyRecord.normalized_x ?? legacyRecord.army_position_normalized?.x);
                const normalizedYCandidate = typeof territory.normalizedY === 'number'
                    ? territory.normalizedY
                    : typeof territory.armyPositionNormalized?.y === 'number'
                        ? territory.armyPositionNormalized.y
                        : parseNumber(legacyRecord.normalized_y ?? legacyRecord.army_position_normalized?.y);
                const pixelXCandidate = typeof territory.x === 'number'
                    ? territory.x
                    : typeof territory.armyPosition?.x === 'number'
                        ? territory.armyPosition.x
                        : parseNumber(legacyRecord.center_x ?? legacyRecord.army_position?.x);
                const pixelYCandidate = typeof territory.y === 'number'
                    ? territory.y
                    : typeof territory.armyPosition?.y === 'number'
                        ? territory.armyPosition.y
                        : parseNumber(legacyRecord.center_y ?? legacyRecord.army_position?.y);
                const normalizedX = normalizedXCandidate !== undefined && normalizedXCandidate !== null
                    ? clamp01(normalizedXCandidate)
                    : pixelXCandidate !== null && width > 0
                        ? clamp01(pixelXCandidate / width)
                        : 0;
                const normalizedY = normalizedYCandidate !== undefined && normalizedYCandidate !== null
                    ? clamp01(normalizedYCandidate)
                    : pixelYCandidate !== null && height > 0
                        ? clamp01(pixelYCandidate / height)
                        : 0;
                const pixelX = pixelXCandidate !== null ? pixelXCandidate : clamp01(normalizedX) * width;
                const pixelY = pixelYCandidate !== null ? pixelYCandidate : clamp01(normalizedY) * height;
                const boundaryCoords = Array.isArray(territory.boundaryCoords)
                    ? territory.boundaryCoords.map((coord) => {
                        if (!coord)
                            return coord;
                        if (typeof coord.x === 'number' && typeof coord.y === 'number') {
                            const isNormalized = coord.x >= 0 && coord.x <= 1 && coord.y >= 0 && coord.y <= 1;
                            if (isNormalized) {
                                return {
                                    x: clamp01(coord.x) * width,
                                    y: clamp01(coord.y) * height,
                                };
                            }
                            return coord;
                        }
                        return coord;
                    })
                    : undefined;
                return {
                    ...territory,
                    x: pixelX,
                    y: pixelY,
                    normalizedX,
                    normalizedY,
                    armyPosition: { x: pixelX, y: pixelY },
                    armyPositionNormalized: { x: normalizedX, y: normalizedY },
                    boundaryCoords,
                };
            });
            await client.query('DELETE FROM territory_adjacencies WHERE map_id = $1', [mapId]);
            await client.query('DELETE FROM map_territories WHERE map_id = $1', [mapId]);
            await client.query('DELETE FROM map_sectors WHERE map_id = $1', [mapId]);
            await client.query('DELETE FROM map_territory_modifiers WHERE map_id = $1', [mapId]);
            for (const sector of sectors) {
                await client.query(`
          INSERT INTO map_sectors (map_id, name, bonus_troops, color)
          VALUES ($1, $2, $3, $4)
        `, [
                    mapId,
                    sector.name || sector.id || 'Sector',
                    typeof sector.bonus === 'number' ? sector.bonus : 0,
                    sector.color || null,
                ]);
            }
            const capitalAssignments = metadata?.capitalAssignments;
            for (const territory of territories) {
                const territoryName = territory.name || territory.id || 'Territory';
                const storedPolygon = Array.isArray(territory.boundaryCoords) && territory.boundaryCoords.length > 0
                    ? {
                        type: 'polygon',
                        points: territory.boundaryCoords,
                    }
                    : {
                        type: 'token',
                        x: territory.x ?? 0,
                        y: territory.y ?? 0,
                    };
                const assignedPlayers = this.extractCapitalAssignments(territory.id || territoryName, capitalAssignments);
                await client.query(`
          INSERT INTO map_territories (
            map_id, name, polygon_data, sector, is_capital, capital_for_players
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (map_id, name) DO UPDATE SET
            polygon_data = EXCLUDED.polygon_data,
            sector = EXCLUDED.sector,
            is_capital = EXCLUDED.is_capital,
            capital_for_players = EXCLUDED.capital_for_players
        `, [
                    mapId,
                    territoryName,
                    JSON.stringify({
                        ...storedPolygon,
                        originalId: territory.id || territoryName,
                        normalizedX: territory.normalizedX,
                        normalizedY: territory.normalizedY,
                        armyPosition: territory.armyPosition || {
                            x: territory.x ?? 0,
                            y: territory.y ?? 0,
                        },
                        armyPositionNormalized: territory.armyPositionNormalized || {
                            x: territory.normalizedX ?? 0,
                            y: territory.normalizedY ?? 0,
                        },
                    }),
                    territory.sectorId ||
                        territory.continentId ||
                        null,
                    territory.isCapital === true,
                    JSON.stringify(assignedPlayers),
                ]);
            }
            const adjacencyPairs = this.buildAdjacencyPairs(territories, metadata?.adjacencies);
            for (const { from, to } of adjacencyPairs) {
                await client.query(`
          INSERT INTO territory_adjacencies (map_id, territory_from, territory_to)
          VALUES ($1, $2, $3)
          ON CONFLICT (map_id, territory_from, territory_to) DO NOTHING
        `, [mapId, from, to]);
            }
            if (metadata.territoryModifiers && Object.keys(metadata.territoryModifiers).length > 0) {
                for (const [territoryKey, modifier] of Object.entries(metadata.territoryModifiers)) {
                    if (!modifier)
                        continue;
                    await this.persistTerritoryModifier(client, mapId, territoryKey, modifier);
                }
            }
        }
        catch (error) {
            logger_js_1.logger.warn('Failed to synchronize map structure from metadata', {
                mapId,
                error,
            });
        }
    }
    async updateMapContentFromMetadata(mapId, metadata) {
        const client = await (0, database_js_1.getClient)();
        try {
            await this.synchronizeMapStructure(client, mapId, metadata);
        }
        finally {
            if (client.release)
                client.release();
        }
    }
    extractCapitalAssignments(territoryId, assignments) {
        if (!assignments || typeof assignments !== 'object')
            return [];
        const result = [];
        for (const [playerCount, territoryList] of Object.entries(assignments)) {
            if (!Array.isArray(territoryList))
                continue;
            if (territoryList.includes(territoryId)) {
                const parsed = Number(playerCount);
                if (!Number.isNaN(parsed)) {
                    result.push(parsed);
                }
            }
        }
        return result;
    }
    buildAdjacencyPairs(territories, explicitAdjacencies) {
        const pairs = [];
        const seen = new Set();
        const idToName = new Map();
        for (const t of territories) {
            const id = (t.id || '').trim();
            const name = (t.name || '').trim();
            if (id && name) {
                idToName.set(id, name);
                idToName.set(name, name);
            }
            else if (name) {
                idToName.set(name, name);
            }
            else if (id) {
                idToName.set(id, id);
            }
        }
        const normalize = (key) => {
            if (!key)
                return undefined;
            const trimmed = key.trim();
            return idToName.get(trimmed) || trimmed;
        };
        const addPair = (from, to) => {
            const nf = normalize(from);
            const nt = normalize(to);
            if (!nf || !nt || nf === nt)
                return;
            const key = nf < nt ? `${nf}|${nt}` : `${nt}|${nf}`;
            if (seen.has(key))
                return;
            seen.add(key);
            pairs.push({ from: nf, to: nt });
            pairs.push({ from: nt, to: nf });
        };
        if (Array.isArray(explicitAdjacencies) && explicitAdjacencies.length > 0) {
            for (const adjacency of explicitAdjacencies) {
                const from = adjacency.from ||
                    adjacency.fromTerritoryId ||
                    adjacency.territory_from ||
                    adjacency.source;
                const to = adjacency.to || adjacency.toTerritoryId || adjacency.territory_to || adjacency.target;
                addPair(from, to);
            }
            return pairs;
        }
        for (const territory of territories) {
            const from = territory.id || territory.name;
            if (!from || !Array.isArray(territory.connections))
                continue;
            for (const connection of territory.connections) {
                const to = typeof connection === 'string' ? connection : '';
                if (!to)
                    continue;
                addPair(from, to);
            }
        }
        return pairs;
    }
    async persistTerritoryModifier(client, mapId, territoryKey, modifier) {
        const sanitized = {
            templateId: modifier.templateId,
            name: modifier.name?.trim() || `Special Territory (${territoryKey})`,
            icon: modifier.icon?.trim() || '✨',
            color: modifier.color?.trim() || '#a855f7',
            defenseBonus: this.coerceNumber(modifier.defenseBonus, 0),
            attackBonus: this.coerceNumber(modifier.attackBonus, 0),
            troopBonus: this.coerceNumber(modifier.troopBonus, 0),
            movementRestriction: this.coerceBoolean(modifier.movementRestriction),
            supplyLineBonus: this.coerceBoolean(modifier.supplyLineBonus),
        };
        try {
            await client.query('DELETE FROM map_territory_modifiers WHERE map_id = $1 AND territory_id = $2', [mapId, territoryKey]);
        }
        catch (error) {
            logger_js_1.logger.warn('Failed to clear existing territory modifier mapping', {
                mapId,
                territoryKey,
                error,
            });
        }
        const values = [
            mapId,
            territoryKey,
            sanitized.templateId ?? null,
            sanitized.name,
            sanitized.icon,
            sanitized.color,
            sanitized.defenseBonus,
            sanitized.attackBonus,
            sanitized.troopBonus,
            sanitized.movementRestriction,
            sanitized.supplyLineBonus,
        ];
        const insertWithTerritoryId = `
      INSERT INTO map_territory_modifiers (
        map_id,
        territory_id,
        modifier_template_id,
        name,
        icon,
        color,
        defense_bonus,
        attack_bonus,
        troop_generation_bonus,
        movement_restriction,
        supply_line_bonus
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `;
        try {
            await client.query(insertWithTerritoryId, values);
            return;
        }
        catch (error) {
            logger_js_1.logger.warn('Failed to persist territory modifier for map', {
                mapId,
                territoryKey,
                error,
            });
        }
    }
    async getMap(mapId) {
        const result = await (0, database_js_1.query)('SELECT * FROM maps WHERE id = $1', [mapId]);
        return result.rows.length > 0 ? this.formatMapFromDb(result.rows[0]) : null;
    }
    async getMapWithFullData(mapId) {
        const map = await this.getMap(mapId);
        if (!map)
            return null;
        const [sectors, territories, adjacencies] = await Promise.all([
            this.getMapSectors(mapId),
            this.getMapTerritories(mapId),
            this.getMapAdjacencies(mapId),
        ]);
        return { map, sectors, territories, adjacencies };
    }
    async updateCapitalTerritories(mapId, userId, capitalTerritories, options = {}) {
        try {
            await mapPermissionService_js_1.mapPermissionService.assertCanEditMap(mapId, { userId, isAdmin: options.isAdmin }, { allowCollaborator: true });
            const validationResult = await this.validateCapitalTerritories(mapId, capitalTerritories);
            if (!validationResult.valid) {
                throw new Error(`Invalid capital configuration: ${validationResult.error}`);
            }
            const result = await (0, database_js_1.query)(`
        UPDATE maps 
        SET capital_territories = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [JSON.stringify(capitalTerritories), mapId]);
            return (result.rowCount ?? 0) > 0;
        }
        catch (error) {
            logger_js_1.logger.error('Error updating capital territories:', error);
            throw error;
        }
    }
    async validateCapitalTerritories(mapId, capitalTerritories) {
        try {
            const territoriesResult = await (0, database_js_1.query)(`
        SELECT id, adjacencies FROM map_territories 
        WHERE map_id = $1
      `, [mapId]);
            const territories = territoriesResult.rows;
            const territoryIds = new Set(territories.map((t) => t.id));
            for (const [playerCount, capitals] of Object.entries(capitalTerritories)) {
                const count = parseInt(playerCount, 10);
                if (count < 2 || count > 12) {
                    return { valid: false, error: `Invalid player count: ${count}` };
                }
                if (capitals.length !== count) {
                    return {
                        valid: false,
                        error: `Player count ${count} requires exactly ${count} capitals, got ${capitals.length}`,
                    };
                }
                for (const capitalId of capitals) {
                    if (!territoryIds.has(capitalId)) {
                        return { valid: false, error: `Territory ${capitalId} does not exist in this map` };
                    }
                }
                for (let i = 0; i < capitals.length; i++) {
                    for (let j = i + 1; j < capitals.length; j++) {
                        const territory1 = territories.find((t) => t.id === capitals[i]);
                        const territory2 = territories.find((t) => t.id === capitals[j]);
                        if (territory1 && territory2) {
                            const adjacencies1 = this.safeJsonParse(territory1.adjacencies, []);
                            if (adjacencies1.includes(capitals[j])) {
                                return {
                                    valid: false,
                                    error: `Capitals ${capitals[i]} and ${capitals[j]} are adjacent (too close)`,
                                };
                            }
                        }
                    }
                }
            }
            return { valid: true };
        }
        catch (error) {
            logger_js_1.logger.error('Error validating capital territories:', error);
            return { valid: false, error: 'Validation failed' };
        }
    }
    async updateMap(mapId, userId, updates, options = {}) {
        const client = await (0, database_js_1.getClient)();
        try {
            await mapPermissionService_js_1.mapPermissionService.assertCanEditMap(mapId, { userId, isAdmin: options.isAdmin }, { allowCollaborator: options.allowCollaborator ?? true });
            const updateFields = [];
            const updateValues = [];
            let paramCount = 0;
            if (updates.name !== undefined) {
                updateFields.push(`name = $${++paramCount}`);
                updateValues.push(updates.name);
            }
            if (updates.description !== undefined) {
                updateFields.push(`description = $${++paramCount}`);
                updateValues.push(updates.description);
            }
            if (updates.isPublic !== undefined) {
                updateFields.push(`is_public = $${++paramCount}`);
                updateValues.push(updates.isPublic);
            }
            if (updates.tags !== undefined) {
                updateFields.push(`tags = $${++paramCount}`);
                updateValues.push(updates.tags);
            }
            if (updates.imageUrl !== undefined) {
                updateFields.push(`image_url = $${++paramCount}`);
                updateValues.push(this.normalizePublicImageUrl(updates.imageUrl) || null);
            }
            if (updates.imageWidth !== undefined) {
                updateFields.push(`image_width = $${++paramCount}`);
                updateValues.push(updates.imageWidth);
            }
            if (updates.imageHeight !== undefined) {
                updateFields.push(`image_height = $${++paramCount}`);
                updateValues.push(updates.imageHeight);
            }
            if (updateFields.length === 0) {
                return await this.getMap(mapId);
            }
            updateFields.push('updated_at = CURRENT_TIMESTAMP');
            updateValues.push(mapId);
            const result = await client.query(`
        UPDATE maps SET ${updateFields.join(', ')}
        WHERE id = $${++paramCount}
        RETURNING *
      `, updateValues);
            return result.rows.length > 0 ? this.formatMapFromDb(result.rows[0]) : null;
        }
        finally {
            if (client.release)
                client.release();
        }
    }
    async deleteMap(mapId, userId, options = {}) {
        const client = await (0, database_js_1.getClient)();
        try {
            await mapPermissionService_js_1.mapPermissionService.assertCanEditMap(mapId, { userId, isAdmin: options.isAdmin }, { allowCollaborator: false });
            const preResult = await client.query('SELECT image_url FROM maps WHERE id = $1', [mapId]);
            const imageUrl = preResult.rows[0]?.image_url ?? null;
            const result = await client.query('DELETE FROM maps WHERE id = $1', [mapId]);
            logger_js_1.logger.info(`Deleted map ${mapId} by user ${userId}`);
            if ((result.rowCount || 0) === 0) {
                throw new mapPermissionService_js_1.MapNotFoundError();
            }
            if (imageUrl) {
                const storageKey = (0, assetStorage_js_1.extractStorageKeyFromUrl)(imageUrl);
                if (storageKey) {
                    const canonicalUrl = (0, assetStorage_js_1.getPublicAssetUrl)(storageKey);
                    const suffix = `/${storageKey}`;
                    const mapsRef = await client.query(`SELECT 1 FROM maps WHERE id <> $1 AND (image_url = $2 OR image_url LIKE $3) LIMIT 1`, [mapId, canonicalUrl, `%${suffix}`]);
                    let referencedElsewhere = mapsRef.rows.length > 0;
                    if (!referencedElsewhere) {
                        try {
                            const draftsRef = await client.query(`SELECT 1 FROM map_drafts WHERE (image_url = $1 OR image_url LIKE $2) LIMIT 1`, [canonicalUrl, `%${suffix}`]);
                            referencedElsewhere = draftsRef.rows.length > 0;
                        }
                        catch (e) {
                            logger_js_1.logger?.warn?.('Skipping draft reference check during asset cleanup', { error: e });
                        }
                    }
                    if (!referencedElsewhere) {
                        try {
                            await (0, assetStorage_js_1.deleteAsset)(storageKey);
                            logger_js_1.logger.info('Deleted map image asset from storage', {
                                mapId,
                                storageKey,
                            });
                        }
                        catch (err) {
                            logger_js_1.logger.warn('Failed to delete map image asset (non-fatal)', {
                                mapId,
                                storageKey,
                                error: err,
                            });
                        }
                    }
                    else {
                        logger_js_1.logger.info('Retained map image asset; still referenced elsewhere', {
                            mapId,
                            storageKey,
                        });
                    }
                }
            }
        }
        finally {
            if (client.release)
                client.release();
        }
    }
    async searchMaps(filters) {
        const whereConditions = [];
        const queryParams = [];
        const addParam = (value) => {
            queryParams.push(value);
            return `$${queryParams.length}`;
        };
        if (typeof filters.isPublic === 'boolean') {
            const placeholder = addParam(filters.isPublic);
            whereConditions.push(`is_public = ${placeholder}`);
        }
        if (filters.search) {
            const escapedSearch = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const searchTerm = `%${escapedSearch}%`;
            const namePlaceholder = addParam(searchTerm);
            const descriptionPlaceholder = addParam(searchTerm);
            whereConditions.push(`(name ILIKE ${namePlaceholder} OR description ILIKE ${descriptionPlaceholder})`);
        }
        if (filters.creator) {
            const placeholder = addParam(filters.creator);
            whereConditions.push(`creator_id = ${placeholder}`);
        }
        if (filters.isFeatured) {
            whereConditions.push('is_featured = TRUE');
        }
        if (filters.status) {
            const placeholder = addParam(filters.status);
            whereConditions.push(`status = ${placeholder}`);
        }
        if (filters.minRating) {
            const placeholder = addParam(filters.minRating);
            whereConditions.push(`rating_average >= ${placeholder}`);
        }
        if (filters.tags && filters.tags.length > 0) {
            const tagConditions = filters.tags
                .map((tag) => {
                const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const placeholder = addParam(`%"${escapedTag}"%`);
                return `tags::text ILIKE ${placeholder}`;
            })
                .join(' AND ');
            whereConditions.push(`(${tagConditions})`);
        }
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        const orderBy = this.buildOrderByClause(filters.sortBy, filters.sortOrder);
        const limit = filters.limit || 20;
        const offset = filters.offset || 0;
        const countResult = await (0, database_js_1.query)(`SELECT COUNT(*) as total FROM maps ${whereClause}`, [
            ...queryParams,
        ]);
        const total = countResult.rows[0].total;
        const baseParamCount = queryParams.length;
        const limitPlaceholder = `$${baseParamCount + 1}`;
        const offsetPlaceholder = `$${baseParamCount + 2}`;
        const mapsResult = await (0, database_js_1.query)(`
      SELECT * FROM maps ${whereClause} ${orderBy} LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `, [...queryParams, limit, offset]);
        const maps = mapsResult.rows.map((row) => this.formatMapFromDb(row));
        const hasMore = offset + limit < total;
        return { maps, total, hasMore };
    }
    async createTerritory(territoryData) {
        const client = await (0, database_js_1.getClient)();
        try {
            const result = await client.query(`
        INSERT INTO map_territories (
          map_id, name, polygon_data, sector, is_capital
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
                territoryData.mapId,
                territoryData.name,
                JSON.stringify(territoryData.boundaryCoords || []),
                territoryData.sectorId ||
                    territoryData.continentId ||
                    null,
                false,
            ]);
            return this.formatTerritoryFromDb(result.rows[0]);
        }
        finally {
            if (client.release)
                client.release();
        }
    }
    async getMapTerritories(mapId) {
        const result = await (0, database_js_1.query)(`
      SELECT * FROM map_territories WHERE map_id = $1 ORDER BY name
    `, [mapId]);
        return result.rows.map((row) => this.formatTerritoryFromDb(row));
    }
    async updateTerritory(territoryId, updates) {
        const client = await (0, database_js_1.getClient)();
        try {
            const updateFields = [];
            const updateValues = [];
            let paramCount = 0;
            if (updates.name) {
                updateFields.push(`name = $${++paramCount}`);
                updateValues.push(updates.name);
            }
            const updSector = updates;
            if (updSector.sectorId !== undefined || updSector.continentId !== undefined) {
                updateFields.push(`sector = $${++paramCount}`);
                updateValues.push(updSector.sectorId ?? updSector.continentId ?? null);
            }
            if (updates.boundaryCoords) {
                updateFields.push(`polygon_data = $${++paramCount}`);
                updateValues.push(JSON.stringify(updates.boundaryCoords));
            }
            if (updateFields.length === 0) {
                const result = await client.query('SELECT * FROM map_territories WHERE id = $1', [
                    territoryId,
                ]);
                return result.rows.length > 0
                    ? this.formatTerritoryFromDb(result.rows[0])
                    : null;
            }
            updateValues.push(territoryId);
            const result = await client.query(`
        UPDATE map_territories SET ${updateFields.join(', ')}
        WHERE id = $${++paramCount} RETURNING *
      `, updateValues);
            return result.rows.length > 0
                ? this.formatTerritoryFromDb(result.rows[0])
                : null;
        }
        finally {
            if (client.release)
                client.release();
        }
    }
    async createSector(mapId, name, bonusArmies, color) {
        const client = await (0, database_js_1.getClient)();
        try {
            const result = await client.query(`
        INSERT INTO map_sectors (map_id, name, bonus_troops, color)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [mapId, name, bonusArmies, color || '#cccccc']);
            return this.formatSectorFromDb(result.rows[0]);
        }
        finally {
            if (client.release)
                client.release();
        }
    }
    async getMapSectors(mapId) {
        const result = await (0, database_js_1.query)('SELECT * FROM map_sectors WHERE map_id = $1 ORDER BY name', [mapId]);
        return result.rows.map((row) => this.formatSectorFromDb(row));
    }
    async getMapSectorBonuses(mapId) {
        const result = await (0, database_js_1.query)(`
      SELECT 
        ms.id,
        ms.name,
        ms.bonus_troops AS bonus_armies,
        STRING_AGG(mt.id::text, ',' ORDER BY mt.name) AS territories
      FROM map_sectors ms
      LEFT JOIN map_territories mt ON ms.name = mt.sector
      WHERE ms.map_id = $1
      GROUP BY ms.id, ms.name, ms.bonus_troops
      ORDER BY ms.name
    `, [mapId]);
        return result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            bonusArmies: row.bonus_armies,
            territories: row.territories ? row.territories.split(',') : [],
        }));
    }
    async createAdjacency(adjacencyData) {
        const client = await (0, database_js_1.getClient)();
        try {
            const lookup = await client.query(`SELECT id, name, map_id FROM map_territories WHERE id = ANY($1::uuid[])`, [
                [adjacencyData.fromTerritoryId, adjacencyData.toTerritoryId],
            ]);
            if (lookup.rowCount !== 2) {
                throw new Error('One or both territories not found');
            }
            const t1 = lookup.rows.find((r) => r.id === adjacencyData.fromTerritoryId);
            const t2 = lookup.rows.find((r) => r.id === adjacencyData.toTerritoryId);
            if (!t1 || !t2) {
                throw new Error('One or both territories not found');
            }
            if (t1.map_id !== t2.map_id) {
                throw new Error('Territories belong to different maps');
            }
            await client.query(`
        INSERT INTO territory_adjacencies (map_id, territory_from, territory_to)
        VALUES ($1, $2, $3)
        ON CONFLICT (map_id, territory_from, territory_to) DO NOTHING
      `, [t1.map_id, t1.name, t2.name]);
            const isBidirectional = adjacencyData.isBidirectional !== false;
            if (isBidirectional) {
                await client.query(`
          INSERT INTO territory_adjacencies (map_id, territory_from, territory_to)
          VALUES ($1, $2, $3)
          ON CONFLICT (map_id, territory_from, territory_to) DO NOTHING
        `, [t1.map_id, t2.name, t1.name]);
            }
            return {
                id: `${t1.id}->${t2.id}`,
                fromTerritoryId: t1.id,
                toTerritoryId: t2.id,
                connectionType: adjacencyData.connectionType || 'land',
                isBidirectional,
            };
        }
        finally {
            if (client.release)
                client.release();
        }
    }
    async getMapAdjacencies(mapId) {
        const result = await (0, database_js_1.query)(`
      SELECT 
        ta.id,
        ta.map_id,
        mt1.id AS from_territory_id,
        mt2.id AS to_territory_id,
        NULL::text AS connection_type,
        NULL::boolean AS is_bidirectional,
        NULL::text AS special_requirements
      FROM territory_adjacencies ta
      JOIN map_territories mt1 
        ON mt1.map_id = ta.map_id 
       AND (
         mt1.name = ta.territory_from OR (mt1.polygon_data::jsonb ->> 'originalId') = ta.territory_from
       )
      JOIN map_territories mt2 
        ON mt2.map_id = ta.map_id 
       AND (
         mt2.name = ta.territory_to OR (mt2.polygon_data::jsonb ->> 'originalId') = ta.territory_to
       )
      WHERE ta.map_id = $1
    `, [mapId]);
        return result.rows.map((row) => this.formatAdjacencyFromDb(row));
    }
    async validateMapPlayable(mapId) {
        const errors = [];
        const territories = await this.getMapTerritories(mapId);
        const adjacencies = await this.getMapAdjacencies(mapId);
        if (territories.length < 2) {
            errors.push('Map must have at least 2 territories');
            return { isValid: false, errors };
        }
        const idSet = new Set(territories.map((t) => t.id));
        const neighbors = new Map();
        for (const t of territories)
            neighbors.set(t.id, new Set());
        for (const adj of adjacencies) {
            if (!idSet.has(adj.fromTerritoryId)) {
                errors.push(`Adjacency from unknown territory: ${adj.fromTerritoryId}`);
                continue;
            }
            if (!idSet.has(adj.toTerritoryId)) {
                errors.push(`Adjacency to unknown territory: ${adj.toTerritoryId}`);
                continue;
            }
            neighbors.get(adj.fromTerritoryId)?.add(adj.toTerritoryId);
            neighbors.get(adj.toTerritoryId)?.add(adj.fromTerritoryId);
        }
        for (const [tid, set] of neighbors.entries()) {
            if (set.size === 0) {
                const name = territories.find((t) => t.id === tid)?.name || tid;
                errors.push(`Territory has no connections: ${name}`);
            }
        }
        const start = territories[0]?.id;
        if (start) {
            const visited = new Set();
            const queue = [start];
            while (queue.length) {
                const cur = queue.shift();
                if (!cur)
                    continue;
                if (visited.has(cur))
                    continue;
                visited.add(cur);
                for (const nxt of neighbors.get(cur) ?? []) {
                    if (!visited.has(nxt))
                        queue.push(nxt);
                }
            }
            if (visited.size !== territories.length) {
                errors.push('Map is not fully connected; some territories are unreachable');
            }
        }
        return { isValid: errors.length === 0, errors };
    }
    async getGameModes() {
        const result = await (0, database_js_1.query)('SELECT * FROM game_modes ORDER BY is_default DESC, name');
        return result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            config: this.safeJsonParse(row.config, { type: 'classic' }),
            isDefault: row.is_default,
            createdAt: new Date(row.created_at),
        }));
    }
    async getTerritoryAbilityTypes() {
        const result = await (0, database_js_1.query)('SELECT * FROM territory_ability_types ORDER BY name');
        return result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            icon: row.icon,
            effectConfig: this.safeJsonParse(row.effect_config, { type: 'defense' }),
            createdAt: new Date(row.created_at),
        }));
    }
    async rateMap(mapId, userId, rating, review) {
        const client = await (0, database_js_1.getClient)();
        try {
            await client.query('BEGIN');
            const result = await client.query(`
        INSERT INTO map_ratings (map_id, user_id, rating, review)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (map_id, user_id) DO UPDATE SET
          rating = EXCLUDED.rating,
          review = EXCLUDED.review,
          created_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [mapId, userId, rating, review || null]);
            await this.updateMapRatingStats(client, mapId);
            await client.query('COMMIT');
            return {
                id: result.rows[0].id,
                mapId: result.rows[0].map_id,
                userId: result.rows[0].user_id,
                rating: result.rows[0].rating,
                review: result.rows[0].review,
                createdAt: new Date(result.rows[0].created_at),
            };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            if (client.release)
                client.release();
        }
    }
    parseTags(tags) {
        if (!tags)
            return [];
        if (Array.isArray(tags))
            return tags.map((tag) => String(tag));
        if (typeof tags === 'string') {
            if (tags.startsWith('{') && tags.endsWith('}')) {
                const content = tags.slice(1, -1);
                const result = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < content.length; i++) {
                    const char = content[i];
                    if (char === '"' && (i === 0 || content[i - 1] !== '\\')) {
                        inQuotes = !inQuotes;
                    }
                    else if (char === ',' && !inQuotes) {
                        if (current)
                            result.push(current);
                        current = '';
                    }
                    else {
                        current += char;
                    }
                }
                if (current)
                    result.push(current);
                return result;
            }
            try {
                const parsed = JSON.parse(tags);
                return Array.isArray(parsed) ? parsed : [];
            }
            catch {
                return tags
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean);
            }
        }
        return [];
    }
    safeJsonParse(json, defaultValue) {
        if (json === null || json === undefined)
            return defaultValue;
        if (typeof json === 'string') {
            try {
                return JSON.parse(json);
            }
            catch (error) {
                logger_js_1.logger.warn('Failed to parse JSON:', { json, error });
                return defaultValue;
            }
        }
        if (typeof json === 'object') {
            return json;
        }
        return defaultValue;
    }
    parseOptionalJson(value) {
        if (value === null || value === undefined)
            return undefined;
        return this.safeJsonParse(value, undefined);
    }
    normalizeMapStatus(status) {
        const validStatuses = [
            'draft',
            'pending_review',
            'approved',
            'rejected',
            'archived',
        ];
        if (status && validStatuses.includes(status)) {
            return status;
        }
        return 'pending_review';
    }
    normalizeCoordinate(value) {
        if (!value || typeof value !== 'object')
            return undefined;
        if (Array.isArray(value) && value.length >= 2) {
            const [rawX, rawY] = value;
            const x = typeof rawX === 'number' ? rawX : Number(rawX);
            const y = typeof rawY === 'number' ? rawY : Number(rawY);
            if (Number.isFinite(x) && Number.isFinite(y)) {
                return { x, y };
            }
            return undefined;
        }
        const maybe = value;
        const x = typeof maybe.x === 'number' ? maybe.x : Number(maybe.x);
        const y = typeof maybe.y === 'number' ? maybe.y : Number(maybe.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            return { x, y };
        }
        return undefined;
    }
    normalizeConnectionType(value) {
        switch (value) {
            case 'land':
            case 'sea':
            case 'air':
            case 'tunnel':
            case 'special':
                return value;
            default:
                return 'land';
        }
    }
    formatMapFromDb(row) {
        const mapRow = row;
        const capitalTerritories = this.parseOptionalJson(mapRow.capital_territories);
        return {
            id: mapRow.id,
            name: mapRow.name,
            description: mapRow.description ?? undefined,
            creatorId: mapRow.creator_id,
            imageUrl: mapRow.image_url ?? undefined,
            imageWidth: mapRow.image_width ?? 600,
            imageHeight: mapRow.image_height ?? 450,
            isPublic: Boolean(mapRow.is_public),
            isFeatured: Boolean(mapRow.is_featured),
            status: this.normalizeMapStatus(mapRow.status),
            version: mapRow.version ?? 1,
            parentMapId: mapRow.parent_map_id ?? undefined,
            downloadCount: mapRow.download_count ?? 0,
            playCount: mapRow.play_count ?? 0,
            ratingAverage: parseFloat(String(mapRow.rating_average ?? 0)) || 0,
            ratingCount: parseInt(String(mapRow.rating_count ?? 0), 10) || 0,
            tags: this.parseTags(mapRow.tags),
            capitalTerritories: capitalTerritories && Object.keys(capitalTerritories).length > 0
                ? capitalTerritories
                : undefined,
            submittedAt: mapRow.submitted_at ? new Date(mapRow.submitted_at) : undefined,
            reviewedAt: mapRow.reviewed_at ? new Date(mapRow.reviewed_at) : undefined,
            reviewedBy: mapRow.reviewed_by ?? undefined,
            reviewNotes: mapRow.review_notes ?? undefined,
            rejectionReason: mapRow.rejection_reason ?? undefined,
            createdAt: new Date(mapRow.created_at),
            updatedAt: new Date(mapRow.updated_at),
        };
    }
    formatTerritoryFromDb(row) {
        const territoryRow = row;
        const polygonData = this.safeJsonParse(territoryRow.polygon_data, {});
        const armyPosition = this.normalizeCoordinate(polygonData?.armyPosition) ?? { x: 0, y: 0 };
        const boundaryCoords = Array.isArray(polygonData?.points)
            ? polygonData.points
                .map((point) => this.normalizeCoordinate(point))
                .filter((coord) => Boolean(coord))
            : [];
        return {
            id: territoryRow.id,
            mapId: territoryRow.map_id,
            territoryId: territoryRow.id,
            name: territoryRow.name,
            sectorId: territoryRow.sector ?? undefined,
            boundaryCoords,
            armyPosition,
            abilityTypeId: undefined,
            customAbilityConfig: undefined,
            startingOwnerSlot: undefined,
            startingArmies: 1,
            createdAt: new Date(territoryRow.created_at),
        };
    }
    formatSectorFromDb(row) {
        const sectorRow = row;
        const specialRules = this.parseOptionalJson(sectorRow.special_rules);
        return {
            id: sectorRow.id,
            mapId: sectorRow.map_id,
            name: sectorRow.name,
            bonusArmies: sectorRow.bonus_troops,
            color: sectorRow.color ?? '#cccccc',
            specialRules,
            createdAt: new Date(sectorRow.created_at),
        };
    }
    formatAdjacencyFromDb(row) {
        const adjacencyRow = row;
        const specialRequirements = this.parseOptionalJson(adjacencyRow.special_requirements);
        return {
            id: adjacencyRow.id,
            fromTerritoryId: adjacencyRow.from_territory_id,
            toTerritoryId: adjacencyRow.to_territory_id,
            connectionType: this.normalizeConnectionType(adjacencyRow.connection_type ?? 'land'),
            isBidirectional: adjacencyRow.is_bidirectional ?? true,
            specialRequirements,
        };
    }
    buildOrderByClause(sortBy, sortOrder) {
        const order = sortOrder === 'desc' ? 'DESC' : 'ASC';
        switch (sortBy) {
            case 'name':
                return `ORDER BY name ${order}`;
            case 'rating':
                return `ORDER BY rating_average ${order}`;
            case 'downloads':
                return `ORDER BY download_count ${order}`;
            default:
                return `ORDER BY created_at ${order}`;
        }
    }
    async updateMapRatingStats(client, mapId) {
        await client.query(`
      UPDATE maps SET
        rating_average = (SELECT AVG(rating) FROM map_ratings WHERE map_id = $1),
        rating_count = (SELECT COUNT(*) FROM map_ratings WHERE map_id = $2)
      WHERE id = $3
    `, [mapId, mapId, mapId]);
    }
}
exports.MapService = MapService;
exports.mapService = new MapService();
//# sourceMappingURL=mapService.js.map