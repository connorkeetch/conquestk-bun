let ioInstance = null;
export function registerSocketServer(io) {
    ioInstance = io;
}
export function getSocketServer() {
    if (!ioInstance) {
        throw new Error('Socket server not initialized');
    }
    return ioInstance;
}
export function tryGetSocketServer() {
    return ioInstance;
}
//# sourceMappingURL=socketRegistry.js.map