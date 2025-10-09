export interface TerritoryModifierTemplate {
    id: string;
    name: string;
    icon: string;
    color: string;
    defense_bonus: number;
    attack_bonus: number;
    troop_generation_bonus: number;
    movement_restriction: boolean;
    supply_line_bonus: boolean;
    description?: string;
}
export interface GameTerritoryModifier {
    territory_id: string;
    defense_bonus: number;
    attack_bonus: number;
    troop_generation_bonus: number;
    movement_restriction: boolean;
    supply_line_bonus: boolean;
    icon: string;
    color: string;
    name: string;
}
export declare class TerritoryModifierService {
    getModifierTemplates(): Promise<TerritoryModifierTemplate[]>;
    getMapModifiers(mapId: string): Promise<GameTerritoryModifier[]>;
    initializeGameModifiers(gameId: string, mapId: string, _territories: string[]): Promise<void>;
    private applyMapModifiers;
    getGameModifiers(gameId: string): Promise<Map<string, GameTerritoryModifier>>;
    getTerritoryModifier(gameId: string, territoryId: string): Promise<GameTerritoryModifier | null>;
    cleanupFinishedGameModifiers(gameIds: string[]): Promise<void>;
}
declare const _default: TerritoryModifierService;
export default _default;
//# sourceMappingURL=territoryModifierService.d.ts.map