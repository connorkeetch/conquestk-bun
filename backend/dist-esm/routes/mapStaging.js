"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const adminAuth_js_1 = require("../middleware/adminAuth.js");
const auth_js_1 = require("../middleware/auth.js");
const mapStagingService_js_1 = require("../services/mapStagingService.js");
const routeErrorHandler_js_1 = require("../utils/routeErrorHandler.js");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (_req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'));
        }
    },
});
router.get('/quota', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const quotaSummary = await mapStagingService_js_1.mapStagingService.getUserQuotaSummary(userId);
        res.json(quotaSummary);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to check quota');
        res.status(500).json({ error: 'Failed to check quota' });
    }
});
router.post('/upload', auth_js_1.authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const userId = req.userId || req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        if (!req.file) {
            res.status(400).json({ error: 'No image file provided' });
            return;
        }
        const stagingImage = await mapStagingService_js_1.mapStagingService.uploadImage(userId, req.file);
        res.json({
            success: true,
            image: stagingImage,
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to upload image';
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, errorMessage, 400);
        res.status(400).json({ error: errorMessage });
    }
});
router.get('/my-images', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const images = await mapStagingService_js_1.mapStagingService.getUserStagingImages(userId);
        res.json(images);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch images');
        res.status(500).json({ error: 'Failed to fetch images' });
    }
});
router.delete('/images/:imageId', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user?.id;
        const { imageId } = req.params;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const isAdmin = req.user?.isAdmin || false;
        await mapStagingService_js_1.mapStagingService.deleteStagingImage(userId, imageId, isAdmin);
        res.json({ success: true });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete image';
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, errorMessage, 400);
        res.status(400).json({ error: errorMessage });
    }
});
router.get('/admin/all-images', auth_js_1.authenticateToken, adminAuth_js_1.requireAdmin, async (req, res) => {
    try {
        const images = await mapStagingService_js_1.mapStagingService.getAllStagingImages();
        res.json(images);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to fetch images');
        res.status(500).json({ error: 'Failed to fetch images' });
    }
});
router.delete('/admin/images/:imageId', auth_js_1.authenticateToken, adminAuth_js_1.requireAdmin, async (req, res) => {
    try {
        const { imageId } = req.params;
        const adminId = req.userId || req.user?.id;
        if (!adminId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        await mapStagingService_js_1.mapStagingService.deleteStagingImage(adminId, imageId, true);
        res.json({ success: true });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete image';
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, errorMessage, 400);
        res.status(400).json({ error: errorMessage });
    }
});
router.post('/admin/images/:imageId/reclaim', auth_js_1.authenticateToken, adminAuth_js_1.requireAdmin, async (req, res) => {
    try {
        const adminId = req.userId || req.user?.id;
        const { imageId } = req.params;
        if (!adminId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const image = await mapStagingService_js_1.mapStagingService.reclaimStagingImage(adminId, imageId);
        res.json({ success: true, image });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to reclaim image';
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, errorMessage, 400);
        res.status(400).json({ error: errorMessage });
    }
});
router.get('/admin/purge-runs', auth_js_1.authenticateToken, adminAuth_js_1.requireAdmin, async (_req, res) => {
    try {
        const runs = await mapStagingService_js_1.mapStagingService.getRecentPurgeRuns();
        res.json(runs);
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, _req, 'Failed to fetch purge metrics');
        res.status(500).json({ error: 'Failed to fetch purge metrics' });
    }
});
router.post('/admin/purge', auth_js_1.authenticateToken, adminAuth_js_1.requireAdmin, async (req, res) => {
    try {
        const batchSizeRaw = req.body?.batchSize;
        const minAgeMinutesRaw = req.body?.minAgeMinutes;
        const batchSize = batchSizeRaw === undefined ? undefined : Number.parseInt(String(batchSizeRaw), 10);
        const minAgeMinutes = minAgeMinutesRaw === undefined ? undefined : Number.parseInt(String(minAgeMinutesRaw), 10);
        if (batchSize !== undefined && (!Number.isFinite(batchSize) || batchSize <= 0)) {
            res.status(400).json({ error: 'batchSize must be a positive number' });
            return;
        }
        if (minAgeMinutes !== undefined && (!Number.isFinite(minAgeMinutes) || minAgeMinutes < 0)) {
            res.status(400).json({ error: 'minAgeMinutes must be zero or greater' });
            return;
        }
        const summary = await mapStagingService_js_1.mapStagingService.purgeDeletedImages({
            batchSize,
            minAgeMinutes,
        });
        res.json({ success: true, summary });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to run purge';
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, errorMessage, 400);
        res.status(400).json({ error: errorMessage });
    }
});
exports.default = router;
//# sourceMappingURL=mapStaging.js.map