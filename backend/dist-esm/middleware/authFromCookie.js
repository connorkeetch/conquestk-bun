import { authenticateToken } from './auth.js';
const parseCookie = (cookieHeader) => {
    const out = {};
    if (!cookieHeader)
        return out;
    const parts = cookieHeader.split(';');
    for (const part of parts) {
        const [rawKey, ...rest] = part.split('=');
        if (!rawKey || rest.length === 0)
            continue;
        const key = rawKey.trim();
        const value = rest.join('=').trim();
        try {
            out[key] = decodeURIComponent(value);
        }
        catch {
            out[key] = value;
        }
    }
    return out;
};
export const authenticateTokenFromCookie = (req, res, next) => {
    const existing = req.headers.authorization;
    if (existing && existing.startsWith('Bearer ')) {
        return authenticateToken(req, res, next);
    }
    const cookies = parseCookie(req.headers.cookie);
    const token = cookies['auth_token'] || cookies['token'];
    if (!token) {
        res.status(401).json({ message: 'Access token required' });
        return;
    }
    req.headers.authorization = `Bearer ${token}`;
    return authenticateToken(req, res, next);
};
export default authenticateTokenFromCookie;
//# sourceMappingURL=authFromCookie.js.map