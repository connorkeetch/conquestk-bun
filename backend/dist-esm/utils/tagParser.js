"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTags = parseTags;
exports.parseJsonField = parseJsonField;
function parseTags(tags) {
    if (Array.isArray(tags)) {
        return tags.filter((tag) => typeof tag === 'string').map((tag) => tag.trim());
    }
    if (typeof tags === 'string') {
        try {
            const parsed = JSON.parse(tags);
            if (Array.isArray(parsed)) {
                return parsed.filter((tag) => typeof tag === 'string').map((tag) => tag.trim());
            }
        }
        catch (_error) {
        }
        if (tags.includes(',')) {
            return tags
                .split(',')
                .map((tag) => tag.trim())
                .filter((tag) => tag.length > 0);
        }
        const trimmed = tags.trim();
        return trimmed.length > 0 ? [trimmed] : [];
    }
    return [];
}
function parseJsonField(field, defaultValue) {
    if (!field)
        return defaultValue;
    if (typeof field === 'object' && field !== null) {
        return field;
    }
    if (typeof field === 'string') {
        try {
            return JSON.parse(field);
        }
        catch (_error) {
            return defaultValue;
        }
    }
    return defaultValue;
}
//# sourceMappingURL=tagParser.js.map