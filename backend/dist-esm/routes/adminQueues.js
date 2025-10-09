"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminAuth_js_1 = require("../middleware/adminAuth.js");
const auth_js_1 = require("../middleware/auth.js");
const queueService_js_1 = require("../services/queueService.js");
const routeErrorHandler_js_1 = require("../utils/routeErrorHandler.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticateToken);
router.use(adminAuth_js_1.requireAdmin);
router.get('/dlq', async (req, res) => {
    try {
        const _q = String(req.query.queue || '');
        const key = req.query.queue || 'gameActions';
        const offset = Number(req.query.offset ?? 0);
        const limit = Number(req.query.limit ?? 50);
        const rows = await queueService_js_1.queueService.listDeadLetters(key, { offset, limit });
        res.json({ success: true, items: rows });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to list DLQ jobs');
        res.status(500).json({ success: false, error: 'Failed to list DLQ jobs' });
    }
});
router.post('/dlq/requeue', async (req, res) => {
    try {
        const key = req.body?.queue || 'gameActions';
        const jobId = req.body?.jobId;
        if (!jobId) {
            res.status(400).json({ success: false, error: 'jobId is required' });
            return;
        }
        const result = await queueService_js_1.queueService.requeueDeadLetter(key, jobId);
        res.json({ success: result.requeued, newJobId: result.newJobId });
    }
    catch (error) {
        (0, routeErrorHandler_js_1.handleRouteError)(error, req, 'Failed to requeue DLQ job');
        res.status(500).json({ success: false, error: 'Failed to requeue DLQ job' });
    }
});
exports.default = router;
//# sourceMappingURL=adminQueues.js.map