"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = __importDefault(require("node:http"));
const options = {
    hostname: 'localhost',
    port: process.env.PORT || 5000,
    path: '/health',
    method: 'GET',
    timeout: 2000,
};
const healthCheck = node_http_1.default.request(options, (res) => {
    if (res.statusCode === 200) {
        process.exit(0);
    }
    else {
        process.exit(1);
    }
});
healthCheck.on('error', () => {
    process.exit(1);
});
healthCheck.on('timeout', () => {
    process.exit(1);
});
healthCheck.end();
//# sourceMappingURL=health-check.js.map