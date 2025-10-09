"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeImageBuffer = exports.storeBase64Image = void 0;
const node_path_1 = __importDefault(require("node:path"));
const image_size_1 = __importDefault(require("image-size"));
const assetStorage_js_1 = require("./assetStorage.js");
const logger_js_1 = require("./logger.js");
const mimeToExtension = (mimeType) => {
    switch (mimeType) {
        case 'image/jpeg':
        case 'image/jpg':
            return '.jpg';
        case 'image/webp':
            return '.webp';
        case 'image/gif':
            return '.gif';
        default:
            return '.png';
    }
};
const storeBase64Image = async (base64Data, options = {}) => {
    const buffer = Buffer.from(base64Data, 'base64');
    return (0, exports.storeImageBuffer)(buffer, options);
};
exports.storeBase64Image = storeBase64Image;
const buildStorageKey = (filename, subdirectory) => {
    const segments = ['maps'];
    if (subdirectory)
        segments.push(subdirectory);
    segments.push(filename);
    return segments.join('/');
};
const storeImageBuffer = async (buffer, options = {}) => {
    const extension = options.preferredFilename
        ? node_path_1.default.extname(options.preferredFilename) || mimeToExtension(options.mimeType)
        : mimeToExtension(options.mimeType);
    const uniqueFilename = options.preferredFilename
        ? `${Date.now()}-${Math.random().toString(36).substring(7)}-${options.preferredFilename.replace(/\s+/g, '-')}`
        : `map-${Date.now()}-${Math.random().toString(36).substring(7)}${extension}`;
    const storageKey = buildStorageKey(uniqueFilename, options.subdirectory);
    await (0, assetStorage_js_1.uploadAsset)({
        key: storageKey,
        body: buffer,
        contentType: options.mimeType,
        cacheControl: 'public, max-age=31536000, immutable',
    });
    let width = 800;
    let height = 600;
    try {
        const dimensions = (0, image_size_1.default)(buffer);
        width = dimensions.width ?? width;
        height = dimensions.height ?? height;
    }
    catch (dimensionError) {
        logger_js_1.logger.warn('Failed to read image dimensions', dimensionError);
    }
    const relativeUrl = (0, assetStorage_js_1.getPublicAssetUrl)(storageKey);
    return {
        filename: uniqueFilename,
        relativeUrl,
        width,
        height,
        storageKey,
    };
};
exports.storeImageBuffer = storeImageBuffer;
//# sourceMappingURL=imageStorage.js.map