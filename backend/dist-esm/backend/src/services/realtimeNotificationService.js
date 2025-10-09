import { tryGetSocketServer } from './socketRegistry.js';
export const emitNotificationToUsers = (userIds, payload) => {
    const io = tryGetSocketServer();
    if (!io) {
        return;
    }
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    uniqueIds.forEach((userId) => {
        io.to(`user:${userId}`).emit('notification:new', payload);
    });
};
export const emitNotificationToAdmin = (userId, payload) => {
    if (!userId) {
        return;
    }
    emitNotificationToUsers([userId], payload);
};
//# sourceMappingURL=realtimeNotificationService.js.map