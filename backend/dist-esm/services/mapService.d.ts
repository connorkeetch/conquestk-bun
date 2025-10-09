import type { ContinentBonus } from '../types/game.js';
import type { CreateAdjacencyRequest, CreateMapRequest, CreateTerritoryRequest, CustomMap, GameMode, MapMetadataPayload, MapRating, MapSearchFilters, MapSearchResult, MapSector, MapTerritory, TerritoryAbilityType, TerritoryAdjacency, UpdateMapRequest } from '../types/maps.js';
export declare class MapService {
    private coerceNumber;
    private coerceBoolean;
    private normalizePublicImageUrl;
    createMap(userId: string, mapData: CreateMapRequest & {
        metadata?: MapMetadataPayload;
    }): Promise<CustomMap>;
    private synchronizeMapStructure;
    updateMapContentFromMetadata(mapId: string, metadata: MapMetadataPayload): Promise<void>;
    private extractCapitalAssignments;
    private buildAdjacencyPairs;
    private persistTerritoryModifier;
    getMap(mapId: string): Promise<CustomMap | null>;
    getMapWithFullData(mapId: string): Promise<{
        map: CustomMap;
        sectors: MapSector[];
        territories: MapTerritory[];
        adjacencies: TerritoryAdjacency[];
        gameMode?: GameMode;
    } | null>;
    updateCapitalTerritories(mapId: string, userId: string, capitalTerritories: Record<string, number[]>, options?: {
        isAdmin?: boolean;
    }): Promise<boolean>;
    validateCapitalTerritories(mapId: string, capitalTerritories: Record<string, number[]>): Promise<{
        valid: boolean;
        error?: string;
    }>;
    updateMap(mapId: string, userId: string, updates: UpdateMapRequest, options?: {
        isAdmin?: boolean;
        allowCollaborator?: boolean;
    }): Promise<CustomMap | null>;
    deleteMap(mapId: string, userId: string, options?: {
        isAdmin?: boolean;
    }): Promise<void>;
    searchMaps(filters: MapSearchFilters): Promise<MapSearchResult>;
    createTerritory(territoryData: CreateTerritoryRequest): Promise<MapTerritory>;
    getMapTerritories(mapId: string): Promise<MapTerritory[]>;
    updateTerritory(territoryId: string, updates: Partial<CreateTerritoryRequest>): Promise<MapTerritory | null>;
    createSector(mapId: string, name: string, bonusArmies: number, color?: string): Promise<MapSector>;
    getMapSectors(mapId: string): Promise<MapSector[]>;
    getMapSectorBonuses(mapId: string): Promise<ContinentBonus[]>;
    createAdjacency(adjacencyData: CreateAdjacencyRequest): Promise<TerritoryAdjacency>;
    getMapAdjacencies(mapId: string): Promise<TerritoryAdjacency[]>;
    validateMapPlayable(mapId: string): Promise<{
        isValid: boolean;
        errors: string[];
    }>;
    getGameModes(): Promise<GameMode[]>;
    getTerritoryAbilityTypes(): Promise<TerritoryAbilityType[]>;
    rateMap(mapId: string, userId: string, rating: number, review?: string): Promise<MapRating>;
    private parseTags;
    private safeJsonParse;
    private parseOptionalJson;
    private normalizeMapStatus;
    private normalizeCoordinate;
    private normalizeConnectionType;
    private formatMapFromDb;
    private formatTerritoryFromDb;
    private formatSectorFromDb;
    private formatAdjacencyFromDb;
    private buildOrderByClause;
    private updateMapRatingStats;
}
export declare const mapService: MapService;
//# sourceMappingURL=mapService.d.ts.map