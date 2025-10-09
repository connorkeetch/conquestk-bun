"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBullBoardRouter = void 0;
const api_1 = require("@bull-board/api");
const bullMQAdapter_1 = require("@bull-board/api/bullMQAdapter");
const express_1 = require("@bull-board/express");
const express_2 = require("express");
const adminAuth_js_1 = require("../middleware/adminAuth.js");
const auth_js_1 = require("../middleware/auth.js");
const queueService_js_1 = require("../services/queueService.js");
const createBullBoardRouter = () => {
    const router = (0, express_2.Router)();
    const serverAdapter = new express_1.ExpressAdapter();
    const basePath = '/api/admin/queues/ui';
    serverAdapter.setBasePath(basePath);
    const queues = [
        new bullMQAdapter_1.BullMQAdapter(queueService_js_1.queueService.getGameActionQueue()),
        new bullMQAdapter_1.BullMQAdapter(queueService_js_1.queueService.getCleanupQueue()),
        new bullMQAdapter_1.BullMQAdapter(queueService_js_1.queueService.getAnalyticsQueue()),
        new bullMQAdapter_1.BullMQAdapter(queueService_js_1.queueService.getMaintenanceQueue()),
        new bullMQAdapter_1.BullMQAdapter(queueService_js_1.queueService.getMapAssetQueue()),
    ];
    (0, api_1.createBullBoard)({ queues: queues, serverAdapter });
    router.use(basePath, auth_js_1.authenticateToken, adminAuth_js_1.requireAdmin, serverAdapter.getRouter());
    return router;
};
exports.createBullBoardRouter = createBullBoardRouter;
exports.default = exports.createBullBoardRouter;
//# sourceMappingURL=bullBoard.js.map