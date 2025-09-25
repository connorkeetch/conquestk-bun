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
  CLANS_CORE: 'clans_enabled',
  COMING_SOON_UI: 'ui_coming_soon_placeholders',

  // Experimental Features
  AI_PLAYERS: 'experimental_ai_players',
  AI_LOBBY_OPTIONS: 'experimental_ai_lobby_options',
  AI_RECRUIT: 'experimental_ai_recruit',
  AI_COMMANDER: 'experimental_ai_commander',
  AI_GRANDMASTER: 'experimental_ai_grandmaster',
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
