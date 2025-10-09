import { Router } from 'express';
import multer from 'multer';
import { requireAdmin } from '../middleware/adminAuth.js';
import { authenticateToken } from '../middleware/auth.js';
import { mapStagingService } from '../services/mapStagingService.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
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
router.get('/quota', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const quotaSummary = await mapStagingService.getUserQuotaSummary(userId);
        res.json(quotaSummary);
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to check quota');
        res.status(500).json({ error: 'Failed to check quota' });
    }
});
router.post('/upload', authenticateToken, upload.single('image'), async (req, res) => {
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
        const stagingImage = await mapStagingService.uploadImage(userId, req.file);
        res.json({
            success: true,
            image: stagingImage,
        });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to upload image';
        handleRouteError(error, req, errorMessage, 400);
        res.status(400).json({ error: errorMessage });
    }
});
router.get('/my-images', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const images = await mapStagingService.getUserStagingImages(userId);
        res.json(images);
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to fetch images');
        res.status(500).json({ error: 'Failed to fetch images' });
    }
});
router.delete('/images/:imageId', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId || req.user?.id;
        const { imageId } = req.params;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const isAdmin = req.user?.isAdmin || false;
        await mapStagingService.deleteStagingImage(userId, imageId, isAdmin);
        res.json({ success: true });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete image';
        handleRouteError(error, req, errorMessage, 400);
        res.status(400).json({ error: errorMessage });
    }
});
router.get('/admin/all-images', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const images = await mapStagingService.getAllStagingImages();
        res.json(images);
    }
    catch (error) {
        handleRouteError(error, req, 'Failed to fetch images');
        res.status(500).json({ error: 'Failed to fetch images' });
    }
});
router.delete('/admin/images/:imageId', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { imageId } = req.params;
        const adminId = req.userId || req.user?.id;
        if (!adminId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        await mapStagingService.deleteStagingImage(adminId, imageId, true);
        res.json({ success: true });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete image';
        handleRouteError(error, req, errorMessage, 400);
        res.status(400).json({ error: errorMessage });
    }
});
router.post('/admin/images/:imageId/reclaim', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const adminId = req.userId || req.user?.id;
        const { imageId } = req.params;
        if (!adminId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const image = await mapStagingService.reclaimStagingImage(adminId, imageId);
        res.json({ success: true, image });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to reclaim image';
        handleRouteError(error, req, errorMessage, 400);
        res.status(400).json({ error: errorMessage });
    }
});
router.get('/admin/purge-runs', authenticateToken, requireAdmin, async (_req, res) => {
    try {
        const runs = await mapStagingService.getRecentPurgeRuns();
        res.json(runs);
    }
    catch (error) {
        handleRouteError(error, _req, 'Failed to fetch purge metrics');
        res.status(500).json({ error: 'Failed to fetch purge metrics' });
    }
});
router.post('/admin/purge', authenticateToken, requireAdmin, async (req, res) => {
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
        const summary = await mapStagingService.purgeDeletedImages({
            batchSize,
            minAgeMinutes,
        });
        res.json({ success: true, summary });
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to run purge';
        handleRouteError(error, req, errorMessage, 400);
        res.status(400).json({ error: errorMessage });
    }
});
export default router;
//# sourceMappingURL=mapStaging.js.map