"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREMIUM_ACTIVE_STATUS_VALUES = exports.PREMIUM_UPSELL_ERROR_CODE = exports.PREMIUM_GENERAL_MESSAGE = exports.PREMIUM_COLOR_MESSAGE = exports.PREMIUM_THEME_MESSAGE = exports.PREMIUM_GAME_LIMIT_MESSAGE = exports.PREMIUM_GAME_LIMIT = exports.PREMIUM_COLOR_KEYS = exports.PREMIUM_THEME_IDS = void 0;
exports.isPremiumThemeId = isPremiumThemeId;
exports.isPremiumColorChoice = isPremiumColorChoice;
exports.normalizePremiumAwareColor = normalizePremiumAwareColor;
const PREMIUM_THEME_ID_LIST = [
    'retrospace',
    'frontier',
    'metal',
    'halloween',
    'cutlers-cheese',
];
exports.PREMIUM_THEME_IDS = new Set(PREMIUM_THEME_ID_LIST);
const PREMIUM_COLOR_KEY_LIST = [
    'MidnightBlack',
    'PureWhite',
    'MetallicGold',
    'NeonGreen',
    'Dragonfire',
];
exports.PREMIUM_COLOR_KEYS = new Set(PREMIUM_COLOR_KEY_LIST);
const PREMIUM_COLOR_KEY_NORMALIZED = new Set(PREMIUM_COLOR_KEY_LIST.map((key) => key.toLowerCase()));
const PREMIUM_COLOR_HEX_VALUES = new Set(['#000000', '#FFFFFF', '#DFAF37', '#39FF14', '#FB923C']);
const PREMIUM_COLOR_GRADIENTS = new Set(['linear-gradient(45deg,#dc2626,#fb923c,#fde047)']);
exports.PREMIUM_GAME_LIMIT = 5;
exports.PREMIUM_GAME_LIMIT_MESSAGE = 'Free players can only participate in up to 5 active or pending games. Upgrade to Premium to unlock more slots.';
exports.PREMIUM_THEME_MESSAGE = 'Premium themes are reserved for Premium members. Upgrade to unlock this theme.';
exports.PREMIUM_COLOR_MESSAGE = 'Premium player colors are reserved for Premium members. Upgrade to unlock these colors.';
exports.PREMIUM_GENERAL_MESSAGE = 'This feature is reserved for Premium members. Upgrade to unlock it.';
exports.PREMIUM_UPSELL_ERROR_CODE = 'PREMIUM_REQUIRED';
exports.PREMIUM_ACTIVE_STATUS_VALUES = [
    'lobby',
    'waiting',
    'starting',
    'initializing',
    'active',
    'in_progress',
    'pending',
];
function isPremiumThemeId(themeId) {
    if (typeof themeId !== 'string') {
        return false;
    }
    return exports.PREMIUM_THEME_IDS.has(themeId);
}
function isPremiumColorChoice(value) {
    if (typeof value !== 'string') {
        return false;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return false;
    }
    if (exports.PREMIUM_COLOR_KEYS.has(trimmed)) {
        return true;
    }
    const lower = trimmed.toLowerCase();
    if (PREMIUM_COLOR_KEY_NORMALIZED.has(lower)) {
        return true;
    }
    if (trimmed.startsWith('#')) {
        return PREMIUM_COLOR_HEX_VALUES.has(trimmed.toUpperCase());
    }
    const normalizedGradient = lower.replace(/\s+/g, '');
    if (PREMIUM_COLOR_GRADIENTS.has(normalizedGradient)) {
        return true;
    }
    return false;
}
function normalizePremiumAwareColor(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
//# sourceMappingURL=premium.js.map