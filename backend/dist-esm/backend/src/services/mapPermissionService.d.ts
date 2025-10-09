export type MapCollaboratorRole = 'editor' | 'viewer' | 'owner' | 'reviewer';
export interface MapActor {
    userId?: string | null;
    isAdmin?: boolean;
}
export interface MapEditorContext {
    mapId: string;
    creatorId?: string;
    exists: boolean;
    isAdmin: boolean;
    isCreator: boolean;
    collaboratorRole?: MapCollaboratorRole;
    canEdit: boolean;
}
export declare class MapPermissionError extends Error {
    status: number;
    code: string;
    constructor(message?: string);
}
export declare class MapNotFoundError extends Error {
    status: number;
    code: string;
    constructor(message?: string);
}
interface AssertOptions {
    allowCollaborator?: boolean;
}
declare class MapPermissionService {
    private readonly editableRoles;
    getMapEditorContext(mapId: string, actor: MapActor): Promise<MapEditorContext>;
    assertCanEditMap(mapId: string, actor: MapActor, options?: AssertOptions): Promise<MapEditorContext>;
    assertCanEditTerritories(territoryIds: string[], actor: MapActor, options?: AssertOptions): Promise<{
        mapId: string;
        context: MapEditorContext;
    }>;
}
export declare const mapPermissionService: MapPermissionService;
export {};
//# sourceMappingURL=mapPermissionService.d.ts.map