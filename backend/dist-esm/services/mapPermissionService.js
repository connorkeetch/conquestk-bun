import { query } from '../config/database.js';
export class MapPermissionError extends Error {
    status = 403;
    code = 'MAP_PERMISSION_DENIED';
    constructor(message = 'You do not have permission to edit this map') {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
export class MapNotFoundError extends Error {
    status = 404;
    code = 'MAP_NOT_FOUND';
    constructor(message = 'Map not found') {
        super(message);
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
class MapPermissionService {
    editableRoles = new Set(['editor', 'owner']);
    async getMapEditorContext(mapId, actor) {
        const result = await query('SELECT creator_id FROM maps WHERE id = $1', [mapId]);
        if (!result.rows[0]) {
            return {
                mapId,
                exists: false,
                isAdmin: Boolean(actor.isAdmin),
                isCreator: false,
                canEdit: false,
            };
        }
        const creatorId = result.rows[0].creator_id;
        const isAdmin = Boolean(actor.isAdmin);
        const userId = actor.userId ?? undefined;
        const isCreator = Boolean(userId && creatorId === userId);
        let collaboratorRole;
        if (!isAdmin && !isCreator && userId) {
            const collaborator = await query(`SELECT role FROM map_collaborators WHERE map_id = $1 AND user_id = $2`, [mapId, userId]);
            if (collaborator.rows[0]?.role) {
                collaboratorRole = collaborator.rows[0].role;
            }
        }
        const canEdit = isAdmin ||
            isCreator ||
            (collaboratorRole !== undefined && this.editableRoles.has(collaboratorRole));
        return {
            mapId,
            creatorId,
            exists: true,
            isAdmin,
            isCreator,
            collaboratorRole,
            canEdit,
        };
    }
    async assertCanEditMap(mapId, actor, options = {}) {
        const context = await this.getMapEditorContext(mapId, actor);
        if (!context.exists) {
            throw new MapNotFoundError();
        }
        if (context.isAdmin || context.isCreator) {
            return context;
        }
        if (context.collaboratorRole) {
            if (!this.editableRoles.has(context.collaboratorRole)) {
                throw new MapPermissionError('Collaboration role does not allow editing this map');
            }
            if (options.allowCollaborator === false) {
                throw new MapPermissionError('Only the map owner or an admin may perform this action');
            }
            return context;
        }
        throw new MapPermissionError();
    }
    async assertCanEditTerritories(territoryIds, actor, options = {}) {
        if (territoryIds.length === 0) {
            throw new MapNotFoundError('No territories provided');
        }
        const territoryResult = await query(`SELECT map_id FROM map_territories WHERE id = ANY($1::uuid[])`, [territoryIds]);
        if (territoryResult.rows.length === 0) {
            throw new MapNotFoundError('Territories not found');
        }
        if (territoryResult.rows.length < territoryIds.length) {
            throw new MapNotFoundError('One or more territories were not found');
        }
        const distinctMapIds = new Set(territoryResult.rows.map((row) => row.map_id));
        if (distinctMapIds.size !== 1) {
            throw new MapPermissionError('Territories belong to different maps');
        }
        const mapId = [...distinctMapIds][0];
        const context = await this.assertCanEditMap(mapId, actor, options);
        return { mapId, context };
    }
}
export const mapPermissionService = new MapPermissionService();
//# sourceMappingURL=mapPermissionService.js.map