import type { ThemeId } from '../shared/types/themes';
export declare const PREMIUM_THEME_IDS: ReadonlySet<ThemeId>;
export declare const PREMIUM_COLOR_KEYS: ReadonlySet<string>;
export declare const PREMIUM_GAME_LIMIT = 5;
export declare const PREMIUM_GAME_LIMIT_MESSAGE = "Free players can only participate in up to 5 active or pending games. Upgrade to Premium to unlock more slots.";
export declare const PREMIUM_THEME_MESSAGE = "Premium themes are reserved for Premium members. Upgrade to unlock this theme.";
export declare const PREMIUM_COLOR_MESSAGE = "Premium player colors are reserved for Premium members. Upgrade to unlock these colors.";
export declare const PREMIUM_GENERAL_MESSAGE = "This feature is reserved for Premium members. Upgrade to unlock it.";
export declare const PREMIUM_UPSELL_ERROR_CODE = "PREMIUM_REQUIRED";
export declare const PREMIUM_ACTIVE_STATUS_VALUES: readonly ["lobby", "waiting", "starting", "initializing", "active", "in_progress", "pending"];
export declare function isPremiumThemeId(themeId: unknown): themeId is ThemeId;
export declare function isPremiumColorChoice(value: unknown): boolean;
export declare function normalizePremiumAwareColor(value: unknown): string | null;
//# sourceMappingURL=premium.d.ts.map