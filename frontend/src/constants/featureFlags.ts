/**
 * Feature Flag Constants
 *
 * IMPORTANT: All new features MUST use feature flags!
 * See docs/reference/architecture.md#feature-flag-system for details
 */

export const FEATURE_FLAGS = {
  // Gameplay Features
  SPOILS_OF_WAR: 'gameplay_spoils_of_war',
  TERRITORY_MODIFIERS: 'gameplay_territory_modifiers',

  // UI Features
  HOLIDAY_THEMES: 'ui_holiday_themes',
  MAP_POLYGON_EDITOR: 'ui_map_polygon_editor',
  TOURNAMENT_SURFACES: 'ui_tournaments',
  PROFILE_EXTRAS: 'ui_profile_extras',
  COMING_SOON_PLACEHOLDERS: 'ui_coming_soon_placeholders',

  // Experimental Features
  AI_PLAYERS: 'experimental_ai_players',
  AI_LOBBY_OPTIONS: 'experimental_ai_lobby_options',
  AI_RECRUIT: 'experimental_ai_recruit',
  AI_COMMANDER: 'experimental_ai_commander',
  AI_GRANDMASTER: 'experimental_ai_grandmaster',

  // VIP Features
  VIP_EXCLUSIVE_MAPS: 'vip_exclusive_maps',

  // Premium Features
  PREMIUM_ADVANCED_STATS: 'premium_advanced_stats',
} as const

export type FeatureFlagName = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS]

/**
 * Feature flag categories for organization
 */
export const FEATURE_CATEGORIES = {
  GAMEPLAY: 'gameplay',
  UI: 'ui',
  EXPERIMENTAL: 'experimental',
  PREMIUM: 'premium',
  VIP: 'vip',
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
