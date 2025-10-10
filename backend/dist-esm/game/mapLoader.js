import { mapService } from '../services/mapService.js';
export async function loadMapForEngine(mapId) {
    const full = await mapService.getMapWithFullData(mapId);
    if (!full) {
        throw new Error(`Map not found: ${mapId}`);
    }
    const { territories: dbTerritories, adjacencies, sectors } = full;
    const adjacencyMap = new Map();
    for (const t of dbTerritories) {
        adjacencyMap.set(t.id, new Set());
    }
    for (const adj of adjacencies) {
        if (!adjacencyMap.has(adj.fromTerritoryId)) {
            adjacencyMap.set(adj.fromTerritoryId, new Set());
        }
        const fromSet = adjacencyMap.get(adj.fromTerritoryId);
        fromSet?.add(adj.toTerritoryId);
        if (adj.isBidirectional) {
            if (!adjacencyMap.has(adj.toTerritoryId)) {
                adjacencyMap.set(adj.toTerritoryId, new Set());
            }
            const toSet = adjacencyMap.get(adj.toTerritoryId);
            toSet?.add(adj.fromTerritoryId);
        }
    }
    const territories = dbTerritories.map((t) => ({
        id: t.id,
        name: t.name,
        sector: t.sectorId ?? t.continentId ?? 'unknown',
        ownerId: null,
        armies: 0,
        adjacentTerritories: Array.from(adjacencyMap.get(t.id) ?? new Set()),
        coordinates: t.armyPosition ? { x: t.armyPosition.x, y: t.armyPosition.y } : undefined,
        isCapital: false,
    }));
    const continentBonuses = sectors.map((c) => ({
        id: c.id,
        name: c.name,
        bonusArmies: c.bonusArmies,
        territories: dbTerritories
            .filter((t) => {
            const sid = t.sectorId ?? t.continentId ?? '';
            return sid === c.id || sid === c.name;
        })
            .map((t) => t.id),
    }));
    return { territories, continentBonuses };
}
//# sourceMappingURL=mapLoader.js.map