"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CapitalGeneratorService = void 0;
const logger_js_1 = require("../utils/logger.js");
class CapitalGeneratorService {
    constructor(db) {
        this.db = db;
    }
    async generateCapitalsForMap(mapId) {
        try {
            const territories = await this.getTerritories(mapId);
            const adjacencies = await this.getAdjacencies(mapId);
            if (territories.length < 2) {
                throw new Error('Map must have at least 2 territories to generate capitals');
            }
            const graph = this.buildAdjacencyGraph(territories, adjacencies);
            const connectedComponents = this.findConnectedComponents(territories, graph);
            if (connectedComponents.length > 1) {
                logger_js_1.logger.warn('Map has disconnected components; using largest component', {
                    mapId,
                    componentCount: connectedComponents.length,
                });
                const largestComponent = connectedComponents.reduce((a, b) => (a.length > b.length ? a : b));
                territories.length = 0;
                territories.push(...largestComponent);
            }
            const capitalAssignments = {};
            for (let playerCount = 2; playerCount <= 12; playerCount++) {
                if (territories.length < playerCount) {
                    logger_js_1.logger.info('Skipping capital generation due to insufficient territories', {
                        mapId,
                        playerCount,
                        territoryCount: territories.length,
                    });
                    continue;
                }
                logger_js_1.logger.info('Generating capitals for player count', {
                    mapId,
                    playerCount,
                });
                capitalAssignments[playerCount] = this.selectOptimalCapitals(territories, graph, playerCount);
            }
            return capitalAssignments;
        }
        catch (error) {
            logger_js_1.logger.error('❌ Error generating capitals for map', { mapId, error });
            throw error;
        }
    }
    selectOptimalCapitals(territories, graph, count) {
        const capitals = [];
        const territoryIds = territories.map((t) => t.id);
        const centerTerr = this.findMostCentralTerritory(territories, graph);
        capitals.push(centerTerr);
        logger_js_1.logger.debug('Selected first capital (most central territory)', {
            centerTerritoryId: centerTerr,
            centerTerritoryName: territories.find((t) => t.id === centerTerr)?.name,
        });
        while (capitals.length < count) {
            let bestCandidate = null;
            let bestMinDistance = -1;
            for (const candidateId of territoryIds) {
                if (capitals.includes(candidateId))
                    continue;
                const minDistance = this.getMinDistanceToCapitals(candidateId, capitals, graph);
                if (minDistance > bestMinDistance) {
                    bestMinDistance = minDistance;
                    bestCandidate = candidateId;
                }
            }
            if (bestCandidate) {
                capitals.push(bestCandidate);
                const territory = territories.find((t) => t.id === bestCandidate);
                logger_js_1.logger.debug('Selected additional capital candidate', {
                    position: capitals.length,
                    territoryId: territory?.id,
                    territoryName: territory?.name,
                    minDistance: bestMinDistance,
                });
            }
            else {
                logger_js_1.logger.warn('Could not find additional capital; using fallback selection', {
                    desiredCount: count,
                });
                const remaining = territoryIds.filter((id) => !capitals.includes(id));
                if (remaining.length > 0) {
                    capitals.push(remaining[Math.floor(Math.random() * remaining.length)]);
                }
            }
        }
        return capitals;
    }
    findMostCentralTerritory(territories, graph) {
        let bestTerritory = territories[0].id;
        let bestScore = Infinity;
        for (const territory of territories) {
            const totalDistance = this.getTotalDistanceToAll(territory.id, territories.map((t) => t.id), graph);
            const connectionCount = graph.get(territory.id)?.size || 0;
            const connectionBonus = connectionCount * 2;
            const score = totalDistance - connectionBonus;
            if (score < bestScore) {
                bestScore = score;
                bestTerritory = territory.id;
            }
        }
        logger_js_1.logger.debug('Identified most central territory', {
            territoryId: bestTerritory,
            territoryName: territories.find((t) => t.id === bestTerritory)?.name,
        });
        return bestTerritory;
    }
    getDistance(from, to, graph) {
        if (from === to)
            return 0;
        const visited = new Set();
        const queue = [[from, 0]];
        visited.add(from);
        while (queue.length > 0) {
            const next = queue.shift();
            if (!next) {
                break;
            }
            const [current, distance] = next;
            const neighbors = graph.get(current) || new Set();
            for (const neighbor of neighbors) {
                if (neighbor === to) {
                    return distance + 1;
                }
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push([neighbor, distance + 1]);
                }
            }
        }
        return Infinity;
    }
    getMinDistanceToCapitals(candidateId, capitals, graph) {
        let minDistance = Infinity;
        for (const capital of capitals) {
            const distance = this.getDistance(candidateId, capital, graph);
            minDistance = Math.min(minDistance, distance);
        }
        return minDistance;
    }
    getTotalDistanceToAll(from, allTerritories, graph) {
        let total = 0;
        for (const territory of allTerritories) {
            if (territory !== from) {
                const distance = this.getDistance(from, territory, graph);
                total += Math.min(distance, 1000);
            }
        }
        return total;
    }
    findConnectedComponents(territories, graph) {
        const visited = new Set();
        const components = [];
        for (const territory of territories) {
            if (!visited.has(territory.id)) {
                const component = [];
                const queue = [territory.id];
                while (queue.length > 0) {
                    const nextNode = queue.shift();
                    if (!nextNode) {
                        break;
                    }
                    const current = nextNode;
                    if (visited.has(current))
                        continue;
                    visited.add(current);
                    const currentTerritory = territories.find((t) => t.id === current);
                    if (currentTerritory) {
                        component.push(currentTerritory);
                    }
                    const neighbors = graph.get(current) || new Set();
                    for (const neighbor of neighbors) {
                        if (!visited.has(neighbor)) {
                            queue.push(neighbor);
                        }
                    }
                }
                if (component.length > 0) {
                    components.push(component);
                }
            }
        }
        return components;
    }
    buildAdjacencyGraph(territories, adjacencies) {
        const graph = new Map();
        for (const territory of territories) {
            graph.set(territory.id, new Set());
        }
        for (const adj of adjacencies) {
            if (graph.has(adj.from_territory_id) && graph.has(adj.to_territory_id)) {
                graph.get(adj.from_territory_id)?.add(adj.to_territory_id);
                graph.get(adj.to_territory_id)?.add(adj.from_territory_id);
            }
        }
        return graph;
    }
    async getTerritories(mapId) {
        const result = await this.db.query(`SELECT id, name, map_id, boundary_coords, army_position 
       FROM map_territories 
       WHERE map_id = $1
       ORDER BY name`, [mapId]);
        return result.rows;
    }
    async getAdjacencies(mapId) {
        const result = await this.db.query(`
      SELECT DISTINCT
        mt1.id AS from_territory_id,
        mt2.id AS to_territory_id
      FROM territory_adjacencies a
      JOIN map_territories mt1
        ON mt1.map_id = a.map_id
       AND mt1.name = a.territory_from
      JOIN map_territories mt2
        ON mt2.map_id = a.map_id
       AND mt2.name = a.territory_to
      WHERE a.map_id = $1
    `, [mapId]);
        return result.rows;
    }
    async updateCapitalsForPlayerCount(mapId, playerCount, territoryIds) {
        const territories = await this.getTerritories(mapId);
        const validIds = new Set(territories.map((t) => t.id));
        for (const id of territoryIds) {
            if (!validIds.has(id)) {
                throw new Error(`Territory ${id} does not belong to map ${mapId}`);
            }
        }
        if (territoryIds.length !== playerCount) {
            throw new Error(`Must provide exactly ${playerCount} territories for ${playerCount} players`);
        }
        const result = await this.db.query('SELECT capital_assignments, capital_metadata FROM maps WHERE id = $1', [mapId]);
        const capitals = result.rows[0]?.capital_assignments || {};
        const metadata = result.rows[0]?.capital_metadata || {};
        capitals[playerCount] = territoryIds;
        if (!metadata.manuallyAdjusted) {
            metadata.manuallyAdjusted = {};
        }
        metadata.manuallyAdjusted[playerCount] = true;
        metadata.lastModified = new Date().toISOString();
        await this.db.query('UPDATE maps SET capital_assignments = $1, capital_metadata = $2 WHERE id = $3', [JSON.stringify(capitals), JSON.stringify(metadata), mapId]);
    }
}
exports.CapitalGeneratorService = CapitalGeneratorService;
//# sourceMappingURL=capitalGeneratorService.js.map