export declare const THEME_IDS: readonly ["default", "dark", "light", "violet-dark", "violet-light", "blue-dark", "blue-light", "red-dark", "red-light", "green-dark", "green-light", "black", "highcontrast", "retrospace", "frontier", "metal", "halloween", "cutlers-cheese"];
export type ThemeId = (typeof THEME_IDS)[number];
export declare const DEFAULT_THEME_ID: ThemeId;
export declare function isThemeId(value: unknown): value is ThemeId;
export declare function normalizeThemeId(value: unknown): ThemeId;
//# sourceMappingURL=themes.d.ts.map