"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
let mockQuery;
const mockCreateMap = globals_1.jest.fn();
const mockDeleteStagingImage = globals_1.jest.fn();
const mockCreateInAppNotification = globals_1.jest.fn();
const mockLogAdminAction = globals_1.jest.fn();
const mockNotificationDispatch = globals_1.jest.fn();
globals_1.jest.mock('../config/database', () => {
    mockQuery = globals_1.jest.fn();
    return {
        query: (...args) => mockQuery(...args),
    };
});
const mockValidateMapPlayable = globals_1.jest.fn().mockResolvedValue({ isValid: true, errors: [] });
globals_1.jest.mock('../services/mapService', () => ({
    mapService: {
        createMap: (...args) => mockCreateMap(...args),
        validateMapPlayable: (...args) => mockValidateMapPlayable(...args),
    },
}));
globals_1.jest.mock('../services/mapStagingService', () => ({
    mapStagingService: {
        deleteStagingImage: (...args) => mockDeleteStagingImage(...args),
    },
}));
globals_1.jest.mock('../services/notificationService', () => ({
    __esModule: true,
    default: {
        createInAppNotification: (...args) => mockCreateInAppNotification(...args),
    },
}));
globals_1.jest.mock('../services/adminService', () => ({
    adminService: {
        logAdminAction: (...args) => mockLogAdminAction(...args),
    },
}));
globals_1.jest.mock('../services/NotificationDispatcher', () => ({
    notificationDispatcher: {
        dispatch: (...args) => mockNotificationDispatch(...args),
    },
}));
(0, globals_1.describe)('mapWorkflowService.approveMap', () => {
    let mapWorkflowService;
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.resetModules();
        mockQuery = globals_1.jest.fn();
        mockCreateMap.mockReset();
        mockDeleteStagingImage.mockReset();
        mockCreateInAppNotification.mockReset();
        mockCreateInAppNotification.mockResolvedValue(undefined);
        mockLogAdminAction.mockReset();
        mockLogAdminAction.mockResolvedValue(undefined);
        mockNotificationDispatch.mockReset();
        mockNotificationDispatch.mockResolvedValue(undefined);
        ({ default: mapWorkflowService } = require('../services/mapWorkflowService'));
    });
    (0, globals_1.it)('marks approved maps as public and notifies the creator', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ status: 'pending_review', is_public: false }] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ status: 'approved', is_public: true }] })
            .mockResolvedValueOnce({ rows: [{ creator_id: 'creator-1', name: 'Galactic Fronts' }] });
        await mapWorkflowService.approveMap('map-1', 'admin-1', { notes: 'looks good' });
        (0, globals_1.expect)(mockQuery).toHaveBeenCalledTimes(6);
        const updateSql = mockQuery.mock.calls[1]?.[0];
        (0, globals_1.expect)(updateSql).toContain("SET status = 'approved'");
        (0, globals_1.expect)(updateSql).toContain('is_public = TRUE');
        (0, globals_1.expect)(mockLogAdminAction).toHaveBeenCalledWith('admin-1', 'map_approved', globals_1.expect.objectContaining({
            mapId: 'map-1',
            before: globals_1.expect.objectContaining({ is_public: false }),
            after: globals_1.expect.objectContaining({ is_public: true }),
        }), 'map', 'map-1', undefined, undefined);
        (0, globals_1.expect)(mockCreateInAppNotification).toHaveBeenCalledWith('creator-1', globals_1.expect.objectContaining({
            type: 'map_approved',
            data: { mapId: 'map-1' },
        }));
        (0, globals_1.expect)(mockNotificationDispatch).toHaveBeenCalledWith(globals_1.expect.objectContaining({
            context: globals_1.expect.objectContaining({
                status: 'approved',
                mapId: 'map-1',
            }),
        }));
    });
});
(0, globals_1.describe)('mapWorkflowService.publishDraft', () => {
    const nowIso = new Date().toISOString();
    let mapWorkflowService;
    (0, globals_1.beforeEach)(() => {
        globals_1.jest.resetModules();
        mockQuery = globals_1.jest.fn();
        mockCreateMap.mockReset();
        mockDeleteStagingImage.mockReset();
        mockCreateInAppNotification.mockReset();
        mockCreateInAppNotification.mockResolvedValue(undefined);
        mockLogAdminAction.mockReset();
        mockLogAdminAction.mockResolvedValue(undefined);
        mockNotificationDispatch.mockReset();
        mockNotificationDispatch.mockResolvedValue(undefined);
        ({ default: mapWorkflowService } = require('../services/mapWorkflowService'));
    });
    (0, globals_1.it)('marks staging image for purge when publishing a draft', async () => {
        const draftRow = {
            id: 'draft-1',
            user_id: 'user-1',
            staging_image_id: 'staging-1',
            parent_map_id: null,
            name: 'Draft Map',
            description: null,
            map_data: '{}',
            territories: '[]',
            continents: '[]',
            adjacencies: '[]',
            capital_assignments: '{}',
            thumbnail_url: null,
            image_url: '/uploads/maps/staging/original.png',
            image_width: 1200,
            image_height: 800,
            validation_errors: '[]',
            tags: '[]',
            draft_status: 'editing',
            validation_status: null,
            is_public: false,
            auto_saved_at: null,
            last_edited_at: null,
            created_at: nowIso,
            updated_at: nowIso,
        };
        mockQuery.mockResolvedValueOnce({ rows: [draftRow] }).mockResolvedValueOnce({ rows: [] });
        mockCreateMap.mockResolvedValue({
            id: 'map-123',
            name: 'Published Map',
        });
        const submitSpy = globals_1.jest.spyOn(mapWorkflowService, 'submitForReview').mockResolvedValue(undefined);
        await mapWorkflowService.publishDraft('draft-1', 'user-1');
        (0, globals_1.expect)(mockDeleteStagingImage).toHaveBeenCalledWith('user-1', 'staging-1', true);
        (0, globals_1.expect)(mockQuery).toHaveBeenCalledTimes(2);
        const updateSql = mockQuery.mock.calls[1]?.[0];
        (0, globals_1.expect)(typeof updateSql).toBe('string');
        (0, globals_1.expect)(updateSql).toContain('staging_image_id = NULL');
        (0, globals_1.expect)(mockQuery.mock.calls[1]?.[1]).toEqual([
            'map-123',
            '/uploads/maps/staging/original.png',
            1200,
            800,
            'draft-1',
        ]);
        (0, globals_1.expect)(submitSpy).toHaveBeenCalledWith('map-123', 'user-1');
        submitSpy.mockRestore();
    });
    (0, globals_1.it)('skips staging purge when no staging image is linked', async () => {
        const draftRow = {
            id: 'draft-2',
            user_id: 'user-1',
            staging_image_id: null,
            parent_map_id: null,
            name: 'Draft Map',
            description: null,
            map_data: '{}',
            territories: '[]',
            continents: '[]',
            adjacencies: '[]',
            capital_assignments: '{}',
            thumbnail_url: null,
            image_url: '/uploads/maps/staging/original.png',
            image_width: 1024,
            image_height: 768,
            validation_errors: '[]',
            tags: '[]',
            draft_status: 'editing',
            validation_status: null,
            is_public: false,
            auto_saved_at: null,
            last_edited_at: null,
            created_at: nowIso,
            updated_at: nowIso,
        };
        mockQuery.mockResolvedValueOnce({ rows: [draftRow] }).mockResolvedValueOnce({ rows: [] });
        mockCreateMap.mockResolvedValue({
            id: 'map-456',
            name: 'Published Map',
        });
        const submitSpy = globals_1.jest.spyOn(mapWorkflowService, 'submitForReview').mockResolvedValue(undefined);
        await mapWorkflowService.publishDraft('draft-2', 'user-1');
        (0, globals_1.expect)(mockDeleteStagingImage).not.toHaveBeenCalled();
        (0, globals_1.expect)(mockQuery).toHaveBeenCalledTimes(2);
        (0, globals_1.expect)(mockQuery.mock.calls[1]?.[1]).toEqual([
            'map-456',
            '/uploads/maps/staging/original.png',
            1024,
            768,
            'draft-2',
        ]);
        (0, globals_1.expect)(submitSpy).toHaveBeenCalledWith('map-456', 'user-1');
        submitSpy.mockRestore();
    });
});
//# sourceMappingURL=mapWorkflowService.test.js.map