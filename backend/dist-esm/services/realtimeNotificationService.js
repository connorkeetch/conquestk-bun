"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitNotificationToAdmin = exports.emitNotificationToUsers = void 0;
const socketRegistry_js_1 = require("./socketRegistry.js");
const emitNotificationToUsers = (userIds, payload) => {
    const io = (0, socketRegistry_js_1.tryGetSocketServer)();
    if (!io) {
        return;
    }
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    uniqueIds.forEach((userId) => {
        io.to(`user:${userId}`).emit('notification:new', payload);
    });
};
exports.emitNotificationToUsers = emitNotificationToUsers;
const emitNotificationToAdmin = (userId, payload) => {
    if (!userId) {
        return;
    }
    (0, exports.emitNotificationToUsers)([userId], payload);
};
exports.emitNotificationToAdmin = emitNotificationToAdmin;
//# sourceMappingURL=realtimeNotificationService.js.map