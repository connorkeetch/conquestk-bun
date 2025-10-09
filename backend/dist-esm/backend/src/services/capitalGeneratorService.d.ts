import type { Pool } from 'pg';
interface CapitalAssignments {
    [playerCount: number]: string[];
}
export declare class CapitalGeneratorService {
    private db;
    constructor(db: Pool);
    generateCapitalsForMap(mapId: string): Promise<CapitalAssignments>;
    private selectOptimalCapitals;
    private findMostCentralTerritory;
    private getDistance;
    private getMinDistanceToCapitals;
    private getTotalDistanceToAll;
    private findConnectedComponents;
    private buildAdjacencyGraph;
    private getTerritories;
    private getAdjacencies;
    updateCapitalsForPlayerCount(mapId: string, playerCount: number, territoryIds: string[]): Promise<void>;
}
export {};
//# sourceMappingURL=capitalGeneratorService.d.ts.map