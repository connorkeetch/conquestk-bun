import { getPublicAssetUrl } from './assetStorage.js';
export function buildFrontendUrl(req, path) {
    const configured = process.env.FRONTEND_URL?.trim();
    if (configured) {
        return joinUrl(configured, path);
    }
    const protocol = req.protocol || 'https';
    const host = req.get('host');
    if (host) {
        return joinUrl(`${protocol}://${host}`, path);
    }
    if (process.env.NODE_ENV === 'production') {
        return joinUrl('https://conquestk.com', path);
    }
    if (process.env.NODE_ENV === 'staging') {
        return joinUrl('https://risk-game-production-9935.up.railway.app', path);
    }
    return joinUrl('http://localhost:5173', path);
}
function joinUrl(base, path) {
    const cleanedBase = base.replace(/\/$/, '');
    const cleanedPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanedBase}${cleanedPath}`;
}
export function resolveAssetUrl(req, value) {
    if (!value)
        return null;
    const url = value.trim();
    if (!url)
        return null;
    if (/^https?:\/\//i.test(url)) {
        return url;
    }
    if (url.startsWith('/uploads/')) {
        const protocol = req.protocol || 'https';
        const host = req.get('host') || '';
        if (host)
            return `${protocol}://${host}${url}`;
        return url;
    }
    try {
        return getPublicAssetUrl(url);
    }
    catch {
        return url;
    }
}
//# sourceMappingURL=url.js.map