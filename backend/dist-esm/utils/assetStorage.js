"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assetExists = exports.deleteAsset = exports.extractStorageKeyFromUrl = exports.uploadAsset = exports.getPublicAssetUrl = exports.isRemoteAssetStorageEnabled = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const client_s3_1 = require("@aws-sdk/client-s3");
const lib_storage_1 = require("@aws-sdk/lib-storage");
const logger_js_1 = require("./logger.js");
const bucket = process.env.ASSET_BUCKET?.trim();
const accessKeyId = process.env.ASSET_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.ASSET_SECRET_ACCESS_KEY?.trim();
const endpoint = process.env.ASSET_ENDPOINT?.trim();
const region = process.env.ASSET_REGION?.trim() || 'auto';
const publicBaseUrl = process.env.PUBLIC_ASSET_BASE_URL?.trim().replace(/\/$/, '');
const mapUploadsOverride = process.env.MAP_UPLOADS_DIR?.trim();
const LOCAL_ROOT = node_path_1.default.join(__dirname, '../../uploads');
const isRemoteEnabled = Boolean(bucket && accessKeyId && secretAccessKey && endpoint);
const remoteConfig = isRemoteEnabled
    ? {
        bucket: bucket,
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        endpoint: endpoint,
    }
    : null;
let s3Client = null;
const getS3Client = () => {
    if (!isRemoteEnabled) {
        throw new Error('S3 client requested but asset storage is not configured for remote uploads');
    }
    if (!remoteConfig) {
        throw new Error('Remote asset storage requested but configuration is missing');
    }
    if (!s3Client) {
        const config = remoteConfig;
        s3Client = new client_s3_1.S3Client({
            region,
            endpoint: config.endpoint,
            forcePathStyle: true,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        });
    }
    return s3Client;
};
const normalizeKey = (key) => key.replace(/^\/+/, '');
const buildLocalPath = (key) => {
    const normalizedKey = normalizeKey(key);
    if (mapUploadsOverride) {
        const stagingPrefix = 'maps/staging/';
        if (normalizedKey.startsWith(stagingPrefix)) {
            const relative = normalizedKey.slice(stagingPrefix.length);
            return node_path_1.default.join(mapUploadsOverride, relative);
        }
    }
    return node_path_1.default.join(LOCAL_ROOT, normalizedKey);
};
const isNotFoundError = (error) => {
    if (!error || typeof error !== 'object')
        return false;
    const candidate = error;
    if (candidate.$metadata?.httpStatusCode === 404)
        return true;
    const code = candidate.Code || candidate.code;
    if (code === 'NotFound' || code === 'NoSuchKey')
        return true;
    if (candidate.name === 'NotFound' || candidate.name === 'NoSuchKey')
        return true;
    return false;
};
const fallbackPublicUrl = (key) => {
    if (publicBaseUrl) {
        return `${publicBaseUrl}/${normalizeKey(key)}`;
    }
    if (remoteConfig) {
        const normalizedEndpoint = remoteConfig.endpoint.replace(/\/$/, '');
        return `${normalizedEndpoint}/${remoteConfig.bucket}/${normalizeKey(key)}`;
    }
    return `/uploads/${normalizeKey(key)}`;
};
const isRemoteAssetStorageEnabled = () => isRemoteEnabled;
exports.isRemoteAssetStorageEnabled = isRemoteAssetStorageEnabled;
const getPublicAssetUrl = (key) => fallbackPublicUrl(key);
exports.getPublicAssetUrl = getPublicAssetUrl;
const uploadAsset = async (options) => {
    const { key, body, contentType, cacheControl } = options;
    const normalizedKey = normalizeKey(key);
    if (isRemoteEnabled) {
        if (!remoteConfig) {
            throw new Error('Remote asset storage requested but configuration is missing');
        }
        try {
            const client = getS3Client();
            const uploader = new lib_storage_1.Upload({
                client,
                params: {
                    Bucket: remoteConfig.bucket,
                    Key: normalizedKey,
                    Body: body,
                    ContentType: contentType,
                    CacheControl: cacheControl,
                },
            });
            await uploader.done();
            return {
                key: normalizedKey,
                url: fallbackPublicUrl(normalizedKey),
                storage: 'remote',
            };
        }
        catch (error) {
            logger_js_1.logger.error('Failed to upload asset to remote storage', {
                key: normalizedKey,
                error,
            });
            throw error;
        }
    }
    try {
        const destination = buildLocalPath(normalizedKey);
        await node_fs_1.promises.mkdir(node_path_1.default.dirname(destination), { recursive: true });
        await node_fs_1.promises.writeFile(destination, body);
        return {
            key: normalizedKey,
            url: fallbackPublicUrl(normalizedKey),
            storage: 'local',
        };
    }
    catch (error) {
        logger_js_1.logger.error('Failed to store asset locally', {
            key: normalizedKey,
            error,
        });
        throw error;
    }
};
exports.uploadAsset = uploadAsset;
const extractStorageKeyFromUrl = (input) => {
    if (!input)
        return null;
    let url = input.trim();
    if (!url)
        return null;
    const hashIndex = url.indexOf('#');
    if (hashIndex >= 0)
        url = url.slice(0, hashIndex);
    const qIndex = url.indexOf('?');
    if (qIndex >= 0)
        url = url.slice(0, qIndex);
    if (!/^https?:\/\//i.test(url) && !url.startsWith('/uploads/')) {
        return normalizeKey(url);
    }
    if (url.startsWith('/uploads/')) {
        const relative = url.replace(/^\/uploads\//, '');
        return normalizeKey(relative);
    }
    if (publicBaseUrl && url.startsWith(publicBaseUrl)) {
        const suffix = url.slice(publicBaseUrl.length).replace(/^\//, '');
        return normalizeKey(suffix);
    }
    if (remoteConfig) {
        const base = `${remoteConfig.endpoint.replace(/\/$/, '')}/${remoteConfig.bucket}`;
        if (url.startsWith(base)) {
            const suffix = url.slice(base.length).replace(/^\//, '');
            return normalizeKey(suffix);
        }
    }
    try {
        const parsed = new URL(url);
        const idx = parsed.pathname.indexOf('/maps/');
        if (idx >= 0) {
            const key = parsed.pathname.slice(idx + 1);
            return normalizeKey(key);
        }
    }
    catch {
    }
    return null;
};
exports.extractStorageKeyFromUrl = extractStorageKeyFromUrl;
const deleteAsset = async (key) => {
    const normalizedKey = normalizeKey(key);
    if (isRemoteEnabled) {
        if (!remoteConfig) {
            throw new Error('Remote asset storage requested but configuration is missing');
        }
        try {
            const client = getS3Client();
            await client.send(new client_s3_1.DeleteObjectCommand({
                Bucket: remoteConfig.bucket,
                Key: normalizedKey,
            }));
            return;
        }
        catch (error) {
            logger_js_1.logger.warn('Unable to delete asset from remote storage', {
                key: normalizedKey,
                error,
            });
            throw error;
        }
    }
    try {
        const destination = buildLocalPath(normalizedKey);
        await node_fs_1.promises.unlink(destination);
    }
    catch (error) {
        if (error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT') {
            return;
        }
        logger_js_1.logger.warn('Unable to delete asset from local storage', {
            key: normalizedKey,
            error,
        });
        throw error;
    }
};
exports.deleteAsset = deleteAsset;
const assetExists = async (key) => {
    const normalizedKey = normalizeKey(key);
    if (isRemoteEnabled) {
        if (!remoteConfig) {
            throw new Error('Remote asset storage requested but configuration is missing');
        }
        try {
            const client = getS3Client();
            await client.send(new client_s3_1.HeadObjectCommand({
                Bucket: remoteConfig.bucket,
                Key: normalizedKey,
            }));
            return true;
        }
        catch (error) {
            if (isNotFoundError(error)) {
                return false;
            }
            logger_js_1.logger.warn('Failed to check remote asset existence', {
                key: normalizedKey,
                error,
            });
            throw error;
        }
    }
    try {
        const destination = buildLocalPath(normalizedKey);
        await node_fs_1.promises.access(destination);
        return true;
    }
    catch (error) {
        if (error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT') {
            return false;
        }
        logger_js_1.logger.warn('Failed to check local asset existence', {
            key: normalizedKey,
            error,
        });
        throw error;
    }
};
exports.assetExists = assetExists;
//# sourceMappingURL=assetStorage.js.map