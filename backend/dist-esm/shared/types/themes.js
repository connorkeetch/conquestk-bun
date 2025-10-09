"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_THEME_ID = exports.THEME_IDS = void 0;
exports.isThemeId = isThemeId;
exports.normalizeThemeId = normalizeThemeId;
exports.THEME_IDS = [
    'default',
    'dark',
    'light',
    'violet-dark',
    'violet-light',
    'blue-dark',
    'blue-light',
    'red-dark',
    'red-light',
    'green-dark',
    'green-light',
    'black',
    'highcontrast',
    'retrospace',
    'frontier',
    'metal',
    'halloween',
    'cutlers-cheese',
];
exports.DEFAULT_THEME_ID = 'default';
const THEME_ID_SET = new Set(exports.THEME_IDS);
function isThemeId(value) {
    if (typeof value !== 'string') {
        return false;
    }
    const trimmed = value.trim();
    return THEME_ID_SET.has(trimmed);
}
function normalizeThemeId(value) {
    if (typeof value !== 'string') {
        return exports.DEFAULT_THEME_ID;
    }
    const normalizedInput = value.trim().toLowerCase();
    if (THEME_ID_SET.has(normalizedInput)) {
        return normalizedInput;
    }
    return exports.DEFAULT_THEME_ID;
}
//# sourceMappingURL=themes.js.map