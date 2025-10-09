/**
 * Feature Flag Constants
 *
 * IMPORTANT: All new features MUST use feature flags!
 * See docs/reference/architecture.md#feature-flag-system for details
 */

export const FEATURE_FLAGS = {
  // Gameplay Features
  TERRITORY_MODIFIERS: 'gameplay_territory_modifiers',

  // UI Features
  MAP_POLYGON_EDITOR: 'ui_map_polygon_editor',

  // Theme/UX hardening
  UI_THEME_COOKIE_FALLBACK: 'ui_theme_cookie_fallback',
  UI_THEME_DEBUG_LOGS: 'ui_theme_debug_logs',

  // Experimental Features
  // (AI features are now generally available; flags removed)
} as const

export type FeatureFlagName = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS]

/**
 * Feature flag categories for organization
 */
export const FEATURE_CATEGORIES = {
  GAMEPLAY: 'gameplay',
  UI: 'ui',
  EXPERIMENTAL: 'experimental',
} as const

export type FeatureCategory = (typeof FEATURE_CATEGORIES)[keyof typeof FEATURE_CATEGORIES]

/**
 * Access levels for feature flags
 */
export const ACCESS_LEVELS = {
  DISABLED: 'disabled',
  INTERNAL: 'internal',
  BETA: 'beta',
  PUBLIC: 'public',
} as const

export type AccessLevel = (typeof ACCESS_LEVELS)[keyof typeof ACCESS_LEVELS]
