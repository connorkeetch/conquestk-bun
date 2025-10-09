"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSocketServer = registerSocketServer;
exports.getSocketServer = getSocketServer;
exports.tryGetSocketServer = tryGetSocketServer;
let ioInstance = null;
function registerSocketServer(io) {
    ioInstance = io;
}
function getSocketServer() {
    if (!ioInstance) {
        throw new Error('Socket server not initialized');
    }
    return ioInstance;
}
function tryGetSocketServer() {
    return ioInstance;
}
//# sourceMappingURL=socketRegistry.js.map