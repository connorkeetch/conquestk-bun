// Conquest K Color System Constants
// 🎯 SINGLE SOURCE OF TRUTH FOR ALL COLORS IN THE APP
// Restructured for Multi-Theme Support (Red Theme, Blue Theme, Cowboy Theme, etc.)

// ===== SEMANTIC COLOR CATEGORIES =====
// 🎨 Organized by PURPOSE not HUE - enables theme switching
// Each category serves different themes while maintaining consistency

// ===== THEME ROLE COLORS =====
// These will be dynamically overridden per theme
export const THEME_COLORS = {
  // Current default theme uses these values
  primary: '#7C3AED',         // Main brand color (violet in default theme)
  primarySoft: '#8B5CF6',     // Softer version for hover states
  secondary: '#FFD700',       // Supporting color (gold in default theme)
  accent: '#B22222',          // Attention color (crimson in default theme)
  
  // Surface colors that adapt to theme
  backgroundDeep: '#0B0B12',  // Deepest background
  backgroundAlt: '#170B1D',   // Alternative deep background
  surface1: '#0F172A',        // Card backgrounds
  surface2: '#111827',        // Elevated surfaces
} as const;

// ===== SEMANTIC STATE COLORS =====
// These stay consistent across themes for UX clarity
export const SEMANTIC_COLORS = {
  success: '#10B981',         // Success states (always green spectrum)
  warning: '#F59E0B',         // Warning states (always yellow/orange spectrum)
  danger: '#B22222',          // Error states (always red spectrum)
  info: '#06B6D4',            // Info states (always blue/cyan spectrum)
} as const;

// ===== NEUTRAL COLORS =====
// Foundation colors that work across all themes
export const NEUTRAL_COLORS = {
  black: '#000000',           // Pure black
  white: '#FFFFFF',           // Pure white
  text: '#F9FAFB',            // Primary text
  textMuted: '#94A3B8',       // Secondary text
  border: '#475569',          // Borders and dividers
  
  // Gray spectrum - fundamental across themes
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
} as const;

// ===== THEME PALETTE LIBRARY =====
// All colors available for different themes (organized by hue)
export const THEME_PALETTE = {
  // VIOLET FAMILY (current default)
  violets: {
    violet: '#7C3AED',
    violetSoft: '#8B5CF6',
    purple400: '#A78BFA',
    purple500: '#8B5CF6',
    purple600: '#7C3AED',
    purple700: '#6D28D9',
    purple800: '#5B21B6',
    purple900: '#9333EA',
  },
  
  // RED FAMILY (for red theme)
  reds: {
    crimson: '#B22222',
    red400: '#F87171',
    red500: '#EF4444',
    red600: '#DC2626',
    red700: '#B91C1C',
    red800: '#991B1B',
    maroon600: '#881337',
    maroon700: '#701A2F',
    ruby: '#9B111E',
  },
  
  // BLUE FAMILY (for blue theme)
  blues: {
    blue400: '#60A5FA',
    blue500: '#3B82F6',
    blue600: '#2563EB',
    blue700: '#1D4ED8',
    cyan400: '#22D3EE',
    cyan500: '#06B6D4',
    indigo400: '#818CF8',
    indigo500: '#6366F1',
    indigo600: '#4F46E5',
  },
  
  // GREEN FAMILY (for green theme)
  greens: {
    green400: '#4ADE80',
    green500: '#22C55E',
    green600: '#059669',
    green700: '#047857',
    teal500: '#14B8A6',
    teal600: '#0D9488',
    neonGreen: '#39FF14',
    neonGreenOutline: '#2FB510',
  },
  
  // WARM FAMILY (for orange/amber themes)
  warms: {
    gold: '#FFD700',
    goldOutline: '#B8860B',
    yellow400: '#FBBF24',
    amber500: '#F59E0B',
    amber600: '#D97706',
    orange400: '#FB923C',
    orange500: '#F97316',
    orange600: '#EA580C',
    orange700: '#C2410C',
  },
  
  // COOL FAMILY (for pink/purple themes)
  cools: {
    pink400: '#F472B6',
    pink500: '#EC4899',
    pink600: '#DB2777',
  },
  
  // METALLIC FAMILY (for premium/metallic themes)
  metallics: {
    bronze: '#CD7F32',
    silver: '#C0C0C0',
    silverOutline: '#808080',
  },
  
  // BACKGROUND VARIATIONS (for different theme depths)
  backgrounds: {
    ink: '#0B0B12',
    imperial: '#170B1D',
    abyss: '#080A14',
    gradientDark1: '#050508',
    gradientDark2: '#030308',
    gradientDark3: '#060612',
    gradientDark4: '#040509',
  },
} as const;

// ===== LEGACY COMPATIBILITY =====
// Maintaining backward compatibility during transition
export const CORE_COLORS = {
  // ===== THEME ROLE COLORS ===== 
  // NOTE: These will be replaced with semantic CSS variables in next phase
  violet: THEME_COLORS.primary,           // Primary brand color
  violetSoft: THEME_COLORS.primarySoft,   // Primary hover states
  gold: THEME_COLORS.secondary,           // Secondary brand color
  crimson: THEME_COLORS.accent,           // Accent/danger color
  
  // ===== BACKGROUND COLORS =====
  ink: THEME_COLORS.backgroundDeep,       // Deepest background (theme-aware)
  imperial: THEME_COLORS.backgroundAlt,   // Alternative deep background
  abyss: THEME_PALETTE.backgrounds.abyss, // Void background
  surface1: THEME_COLORS.surface1,        // Card backgrounds (theme-aware)
  surface2: THEME_COLORS.surface2,        // Elevated surfaces (theme-aware)
  
  // Background gradient stops (from theme palette)
  gradientDark1: THEME_PALETTE.backgrounds.gradientDark1,
  gradientDark2: THEME_PALETTE.backgrounds.gradientDark2,
  gradientDark3: THEME_PALETTE.backgrounds.gradientDark3,
  gradientDark4: THEME_PALETTE.backgrounds.gradientDark4,
  
  // ===== TEXT COLORS =====
  text: NEUTRAL_COLORS.text,               // Primary text (theme-neutral)
  muted: NEUTRAL_COLORS.textMuted,         // Secondary text (theme-neutral)
  border: NEUTRAL_COLORS.border,           // Borders, dividers (theme-neutral)
  
  // ===== SEMANTIC COLORS =====
  success: SEMANTIC_COLORS.success,        // Success states (theme-consistent)
  warning: SEMANTIC_COLORS.warning,        // Warning states (theme-consistent)
  danger: SEMANTIC_COLORS.danger,          // Error states (theme-consistent)
  info: SEMANTIC_COLORS.info,              // Info states (theme-consistent)
  
  // ===== NEUTRAL COLORS ===== 
  black: NEUTRAL_COLORS.black,             // Pure black (theme-neutral)
  white: NEUTRAL_COLORS.white,             // Pure white (theme-neutral)
  gray100: NEUTRAL_COLORS.gray100,         // Lightest gray
  gray200: NEUTRAL_COLORS.gray200,         // Light gray
  gray300: NEUTRAL_COLORS.gray300,         // Medium-light gray
  gray400: NEUTRAL_COLORS.gray400,         // Medium gray (Chieftain rank)
  gray500: NEUTRAL_COLORS.gray500,         // Medium-dark gray
  gray600: NEUTRAL_COLORS.gray600,         // Dark gray
  gray700: NEUTRAL_COLORS.gray700,         // Darker gray
  gray800: NEUTRAL_COLORS.gray800,         // Very dark gray
  gray900: NEUTRAL_COLORS.gray900,         // Nearly black gray
  
  // ===== METALLIC COLORS =====
  bronze: THEME_PALETTE.metallics.bronze,           // Warlord rank
  silver: THEME_PALETTE.metallics.silver,           // Caesar rank
  goldOutline: THEME_PALETTE.warms.goldOutline,     // Gold outlines
  silverOutline: THEME_PALETTE.metallics.silverOutline, // Silver outlines
  
  // ===== SPECIAL ACCENT COLORS =====
  neonGreen: THEME_PALETTE.greens.neonGreen,        // Premium neon green
  neonGreenOutline: THEME_PALETTE.greens.neonGreenOutline, // Neon green borders
  ruby: THEME_PALETTE.reds.ruby,                    // Khan rank, deep red
  
  // ===== RED SPECTRUM =====
  red400: THEME_PALETTE.reds.red400,            // Light red
  red500: THEME_PALETTE.reds.red500,            // Medium red
  red600: THEME_PALETTE.reds.red600,            // Strong red (player color)
  red700: THEME_PALETTE.reds.red700,            // Dark red
  red800: THEME_PALETTE.reds.red800,            // Very dark red
  
  // ===== BLUE SPECTRUM =====
  blue400: THEME_PALETTE.blues.blue400,         // Light blue
  blue500: THEME_PALETTE.blues.blue500,         // Medium blue
  blue600: THEME_PALETTE.blues.blue600,         // Strong blue (player color, Emperor rank)
  blue700: THEME_PALETTE.blues.blue700,         // Dark blue
  
  // ===== GREEN SPECTRUM =====
  green400: THEME_PALETTE.greens.green400,      // Light green
  green500: THEME_PALETTE.greens.green500,      // Medium green
  green600: THEME_PALETTE.greens.green600,      // Forest green (player color)
  green700: THEME_PALETTE.greens.green700,      // Dark green
  
  // ===== YELLOW/AMBER SPECTRUM =====
  yellow400: THEME_PALETTE.warms.yellow400,     // Light yellow (used in gold gradients)
  amber500: THEME_PALETTE.warms.amber500,       // Amber (warning, player color)
  amber600: THEME_PALETTE.warms.amber600,       // Dark amber (player color, bronze tones)
  
  // ===== PURPLE SPECTRUM =====
  purple400: THEME_PALETTE.violets.purple400,   // Light purple
  purple500: THEME_PALETTE.violets.purple500,   // Medium purple (violetSoft)
  purple600: THEME_PALETTE.violets.purple600,   // Strong purple (main violet)
  purple700: THEME_PALETTE.violets.purple700,   // Dark purple
  purple800: THEME_PALETTE.violets.purple800,   // Very dark purple
  purple900: THEME_PALETTE.violets.purple900,   // Player color purple
  
  // ===== ORANGE SPECTRUM =====
  orange400: THEME_PALETTE.warms.orange400,     // Light orange (dragonfire)
  orange500: THEME_PALETTE.warms.orange500,     // Medium orange
  orange600: THEME_PALETTE.warms.orange600,     // Strong orange (player color)
  orange700: THEME_PALETTE.warms.orange700,     // Dark orange
  
  // ===== CYAN/TEAL SPECTRUM =====
  cyan400: THEME_PALETTE.blues.cyan400,         // Light cyan
  cyan500: THEME_PALETTE.blues.cyan500,         // Medium cyan (info, player color)
  teal500: THEME_PALETTE.greens.teal500,        // Teal (player color)
  teal600: THEME_PALETTE.greens.teal600,        // Dark teal
  
  // ===== PINK SPECTRUM =====
  pink400: THEME_PALETTE.cools.pink400,         // Light pink
  pink500: THEME_PALETTE.cools.pink500,         // Medium pink (player color)
  pink600: THEME_PALETTE.cools.pink600,         // Dark pink
  
  // ===== INDIGO SPECTRUM =====
  indigo400: THEME_PALETTE.blues.indigo400,     // Light indigo
  indigo500: THEME_PALETTE.blues.indigo500,     // Medium indigo (player color)
  indigo600: THEME_PALETTE.blues.indigo600,     // Dark indigo
  
  // ===== MAROON SPECTRUM =====
  maroon600: THEME_PALETTE.reds.maroon600,      // Maroon (player color)
  maroon700: THEME_PALETTE.reds.maroon700,      // Dark maroon
  
  // ===== UNUSED COLORS (marked for potential removal) =====
  // TODO: Audit usage of these colors before removing
  // Note: Keeping them for now as they may be useful for future themes
  // If confirmed unused after component audit, these can be removed
} as const;

// ===== THEME DEFINITIONS =====
// 🎨 Different themes that override THEME_COLORS
// This architecture enables both color themes and style themes

export const AVAILABLE_THEMES = {
  // Default theme - dark blue-purple to match screenshot
  'default': {
    ...THEME_COLORS,
    primary: '#4338CA',           // Dark blue-purple primary
    primarySoft: '#5B21B6',       // Purple accent
    secondary: '#ffd700',         // Gold accent
    accent: '#dc2626',            // Red accent
    backgroundDeep: '#1a1a1a',    // Dark background
    backgroundAlt: '#0f172a',     // Slightly different dark
  },
  
  // Light theme
  'light': {
    ...THEME_COLORS,
    primary: '#3b82f6',           // Blue for light theme
    primarySoft: '#60a5fa',       // Lighter blue
    secondary: '#f59e0b',         // Amber
    accent: '#dc2626',            // Red accent
    backgroundDeep: '#ffffff',    // White background
    backgroundAlt: '#f8fafc',     // Very light gray
    surface1: '#f1f5f9',          // Light surface
    surface2: '#e2e8f0',          // Elevated light surface
  },
  
  // Color-based themes
  'violet': {
    ...THEME_COLORS,
    primary: THEME_PALETTE.violets.violet,
    primarySoft: THEME_PALETTE.violets.violetSoft,
    secondary: THEME_PALETTE.warms.gold,
    accent: THEME_PALETTE.reds.crimson,
  },
  
  'red': {
    ...THEME_COLORS,
    primary: THEME_PALETTE.reds.red600,
    primarySoft: THEME_PALETTE.reds.red500,
    secondary: THEME_PALETTE.warms.gold,
    accent: THEME_PALETTE.warms.amber600,
  },
  
  'blue': {
    ...THEME_COLORS,
    primary: THEME_PALETTE.blues.blue600,
    primarySoft: THEME_PALETTE.blues.blue500,
    secondary: THEME_PALETTE.warms.gold,
    accent: THEME_PALETTE.blues.cyan500,
  },
  
  'green': {
    ...THEME_COLORS,
    primary: THEME_PALETTE.greens.green600,
    primarySoft: THEME_PALETTE.greens.green500,
    secondary: THEME_PALETTE.warms.gold,
    accent: THEME_PALETTE.greens.teal500,
  },
  
  'black': {
    ...THEME_COLORS,
    primary: '#1f2937',           // Dark gray as primary
    primarySoft: '#374151',       // Lighter dark gray
    secondary: '#9ca3af',         // Medium gray
    accent: '#f3f4f6',            // Light gray accent
    backgroundDeep: '#000000',    // Pure black
    backgroundAlt: '#111827',     // Very dark gray
  },
} as const;

/* STYLE THEME EXAMPLES (for future implementation):
  
  'cowboy-theme': {
    ...THEME_COLORS,
    primary: THEME_PALETTE.warms.amber600,      // Leather brown
    primarySoft: THEME_PALETTE.warms.amber500,
    secondary: THEME_PALETTE.warms.gold,        // Gold belt buckle
    accent: THEME_PALETTE.reds.red700,          // Western red
    // Would also include: custom fonts, textures, component styles
  },
  
  'myspace-theme': {
    ...THEME_COLORS,
    primary: THEME_PALETTE.blues.blue500,       // MySpace blue
    primarySoft: THEME_PALETTE.blues.blue400,
    secondary: THEME_PALETTE.warms.orange500,   // Friend request orange
    accent: THEME_PALETTE.cools.pink500,        // Profile accent pink
    // Would also include: custom fonts, gradients, sparkle effects
  }

*/

// ===== GRADIENTS =====
// All gradients now reference CORE_COLORS for consistency
export const GRADIENTS = {
  // Main background gradient - used for body background
  background: `linear-gradient(135deg, ${CORE_COLORS.gradientDark1} 0%, ${CORE_COLORS.gradientDark2} 30%, ${CORE_COLORS.gradientDark3} 60%, ${CORE_COLORS.gradientDark4} 100%)`,
  
  // Text gradients for headings and special effects
  redToGold: `linear-gradient(to right, ${CORE_COLORS.red600}, ${CORE_COLORS.amber500}, ${CORE_COLORS.gold})`,
  conquest: `linear-gradient(to right, #56CCF2, ${CORE_COLORS.blue600})`,
  dragonfire: `linear-gradient(45deg, ${CORE_COLORS.red600}, ${CORE_COLORS.orange400}, #FDE047)`,
  worldbreaker: `linear-gradient(90deg, ${CORE_COLORS.red500}, ${CORE_COLORS.amber500})`,
  
  // Gold gradient for the "K" in logo - matches exactly what's used in Header
  goldK: `linear-gradient(135deg, ${CORE_COLORS.yellow400}, ${CORE_COLORS.amber500}, ${CORE_COLORS.amber600})`,
} as const;

// ===== PLAYER COLORS =====
// All player colors now reference CORE_COLORS - change any color by updating CORE_COLORS above
export const PLAYER_COLORS = [
  CORE_COLORS.red600,      // Red - Classic aggressive
  CORE_COLORS.blue600,     // Blue - Traditional defensive  
  CORE_COLORS.green600,    // Forest Green - Distinct from premium neon
  CORE_COLORS.amber500,    // Amber - Better than pure yellow
  CORE_COLORS.purple900,   // Purple - Clear and distinct
  CORE_COLORS.orange600,   // Orange - Vibrant energy
  CORE_COLORS.cyan500,     // Cyan - Cool and calculating
  CORE_COLORS.pink500,     // Pink - Surprisingly visible
  CORE_COLORS.amber600,    // Tan/Bronze - Earthy warfare
  CORE_COLORS.maroon600,   // Maroon - Deep and rich
  CORE_COLORS.teal500,     // Teal - Ocean depths
  CORE_COLORS.indigo500,   // Indigo - Bridge between blue and purple
] as const;

// ===== PREMIUM PLAYER COLORS =====
// All premium colors now reference CORE_COLORS
export const PREMIUM_PLAYER_COLORS = {
  MidnightBlack: {
    solid: CORE_COLORS.black,
    outline: CORE_COLORS.white,
    effect: 'subtle-starfield',
    description: 'The void between stars'
  },
  PureWhite: {
    solid: CORE_COLORS.white,
    outline: CORE_COLORS.black,
    effect: 'pearl-shimmer',
    description: 'Pristine and untouchable'
  },
  MetallicGold: {
    solid: CORE_COLORS.gold,
    effect: 'metallic-gradient',
    outline: CORE_COLORS.goldOutline,
    description: 'The color of victory'
  },
  MetallicSilver: {
    solid: CORE_COLORS.silver,
    effect: 'chrome-reflection',
    outline: CORE_COLORS.silverOutline,
    description: 'Polished steel'
  },
  NeonGreen: {
    solid: CORE_COLORS.neonGreen,
    effect: 'electric-glow',
    outline: CORE_COLORS.neonGreenOutline,
    description: 'Radioactive power'
  },
  Dragonfire: {
    gradient: GRADIENTS.dragonfire,
    solid: CORE_COLORS.orange400,
    effect: 'flame-particles',
    description: 'Burning conquest'
  }
} as const;

// ===== RANK COLORS =====
// All rank colors now reference CORE_COLORS - change rank colors by updating CORE_COLORS above
export const RANK_COLORS = {
  CHIEFTAIN: { 
    base: CORE_COLORS.gray400,      // Iron gray
    glow: 'glow-rank-low', 
    name: 'Iron',
    minElo: 0,
    maxElo: 599
  },
  WARLORD: { 
    base: CORE_COLORS.bronze,       // Bronze metal
    glow: 'glow-rank-low', 
    name: 'Bronze',
    minElo: 600,
    maxElo: 799
  },
  RAIDER_KING: { 
    base: CORE_COLORS.crimson,      // Crimson red
    glow: 'glow-rank-medium', 
    name: 'Crimson',
    minElo: 800,
    maxElo: 999
  },
  SULTAN: { 
    base: CORE_COLORS.success,      // Emerald green
    glow: 'glow-rank-medium', 
    name: 'Emerald',
    minElo: 1000,
    maxElo: 1199
  },
  CAESAR: { 
    base: CORE_COLORS.silver,       // Silver metal
    glow: 'glow-rank-medium', 
    name: 'Silver',
    minElo: 1200,
    maxElo: 1399
  },
  KHAN: { 
    base: CORE_COLORS.ruby,         // Deep ruby red
    glow: 'glow-rank-medium', 
    name: 'Ruby',
    minElo: 1400,
    maxElo: 1599
  },
  EMPEROR: { 
    base: CORE_COLORS.blue600,      // Sapphire blue
    glow: 'glow-rank-high', 
    name: 'Sapphire',
    minElo: 1600,
    maxElo: 1799
  },
  GREAT_KING: { 
    base: CORE_COLORS.gold,         // Gold metal
    glow: 'glow-rank-high', 
    name: 'Gold',
    minElo: 1800,
    maxElo: 1999
  },
  OVERLORD: { 
    base: CORE_COLORS.black,        // Obsidian black
    glow: 'glow-rank-divine', 
    name: 'Obsidian',
    minElo: 2000,
    maxElo: 2499
  },
  APOCALYPSE: { 
    base: GRADIENTS.worldbreaker,   // Fire gradient
    glow: 'glow-rank-divine', 
    name: 'Inferno',
    minElo: 2500,
    maxElo: Infinity
  }
} as const;

// UI Color mappings for easy access
export const UI_COLORS = {
  // Brand
  primary: 'violet',
  primarySoft: 'violet-soft',
  accent: 'gold',
  danger: 'crimson',
  
  // Surfaces
  background: 'ink',
  surface: 'surface-1',
  surfaceElevated: 'surface-2',
  
  // Text
  text: 'text',
  textMuted: 'muted',
  
  // Semantic
  success: 'success',
  warning: 'warning',
  error: 'danger',
  info: 'info'
} as const;

// Legacy compatibility - keeping some old exports for backward compatibility
export type PlayerColor = string;

// Helper functions
export const getPlayerColor = (index: number): string => {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
};

export const getPremiumPlayerColor = (key: keyof typeof PREMIUM_PLAYER_COLORS) => {
  return PREMIUM_PLAYER_COLORS[key];
};

export const getRankColor = (elo: number) => {
  const ranks = Object.values(RANK_COLORS);
  return ranks.find(rank => elo >= rank.minElo && elo <= rank.maxElo) || RANK_COLORS.CHIEFTAIN;
};

// Legacy compatibility functions for components that haven't been fully migrated
export const getColorValue = (color: PlayerColor): string => {
  // Check if it's a regular player color (hex value)
  if ((PLAYER_COLORS as readonly string[]).includes(color)) {
    return color;
  }
  
  // Check if it's a premium color
  const premiumColor = PREMIUM_PLAYER_COLORS[color as keyof typeof PREMIUM_PLAYER_COLORS];
  if (premiumColor) {
    return 'gradient' in premiumColor ? premiumColor.gradient || premiumColor.solid : premiumColor.solid;
  }
  
  // Fallback to first player color
  return PLAYER_COLORS[0];
};

export const getColorDisplayName = (color: PlayerColor): string => {
  // If it's a hex color, find its index in PLAYER_COLORS
  const colorIndex = (PLAYER_COLORS as readonly string[]).indexOf(color);
  if (colorIndex !== -1) {
    const colorNames = ['Red', 'Blue', 'Green', 'Amber', 'Purple', 'Orange', 'Cyan', 'Pink', 'Bronze', 'Maroon', 'Teal', 'Indigo'];
    return colorNames[colorIndex] || `Color ${colorIndex + 1}`;
  }
  
  // If it's a premium color, use its key
  if (color in PREMIUM_PLAYER_COLORS) {
    return `${color.replace(/([A-Z])/g, ' $1').trim()} ⭐`;
  }
  
  return color;
};

export const isPremiumColor = (color: PlayerColor): boolean => {
  return color in PREMIUM_PLAYER_COLORS;
};

export const isGradientColor = (color: PlayerColor): boolean => {
  const premiumColor = PREMIUM_PLAYER_COLORS[color as keyof typeof PREMIUM_PLAYER_COLORS];
  return premiumColor && 'gradient' in premiumColor;
};

// Create arrays for compatibility
export const STANDARD_COLORS = PLAYER_COLORS;
export const PREMIUM_COLORS = Object.keys(PREMIUM_PLAYER_COLORS);
export const COLOR_HEX_VALUES: Record<string, string> = {
  ...Object.fromEntries(PLAYER_COLORS.map(color => [color, color])),
  ...Object.fromEntries(
    Object.entries(PREMIUM_PLAYER_COLORS).map(([key, value]) => [
      key, 
      'gradient' in value ? value.gradient || value.solid : value.solid
    ])
  )
};
export const COLOR_DISPLAY_NAMES: Record<string, string> = {
  ...Object.fromEntries(PLAYER_COLORS.map(color => [color, getColorDisplayName(color)])),
  ...Object.fromEntries(
    Object.keys(PREMIUM_PLAYER_COLORS).map(key => [key, getColorDisplayName(key)])
  )
};
export const COLOR_CLASSES: Record<string, string> = {
  ...Object.fromEntries(PLAYER_COLORS.map(color => [color, 'text-white'])),
  ...Object.fromEntries(Object.keys(PREMIUM_PLAYER_COLORS).map(key => [key, 'text-white']))
};

// ===== CONVENIENT HELPER FUNCTIONS =====
// Easy access to colors throughout the app

export const getColor = (colorName: keyof typeof CORE_COLORS): string => {
  return CORE_COLORS[colorName];
};

export const getGradient = (gradientName: keyof typeof GRADIENTS): string => {
  return GRADIENTS[gradientName];
};

// Inline style helpers for React components
export const colorStyle = (colorName: keyof typeof CORE_COLORS) => ({ color: CORE_COLORS[colorName] });
export const backgroundColorStyle = (colorName: keyof typeof CORE_COLORS) => ({ backgroundColor: CORE_COLORS[colorName] });
export const borderColorStyle = (colorName: keyof typeof CORE_COLORS) => ({ borderColor: CORE_COLORS[colorName] });
export const gradientStyle = (gradientName: keyof typeof GRADIENTS) => ({ background: GRADIENTS[gradientName] });

// Examples of usage:
// <div style={colorStyle('violet')}>Purple text</div>
// <div style={backgroundColorStyle('surface1')}>Card background</div>
// <div style={gradientStyle('redToGold')}>Gradient background</div>

// CSS variable helpers for dynamic styles
export const cssVar = (colorName: keyof typeof CORE_COLORS): string => `var(--color-${colorName})`;

// ===== EASY COMPONENT HELPERS =====
// Use these in your React components for consistent theming

// Quick access to common colors (no need to remember exact names)
export const theme = {
  // Brand
  brand: CORE_COLORS.violet,
  brandSoft: CORE_COLORS.violetSoft,
  accent: CORE_COLORS.gold,
  danger: CORE_COLORS.crimson,
  
  // Backgrounds  
  bg: CORE_COLORS.ink,
  card: CORE_COLORS.surface1,
  cardElevated: CORE_COLORS.surface2,
  
  // Text
  text: CORE_COLORS.text,
  textMuted: CORE_COLORS.muted,
  border: CORE_COLORS.border,
  
  // States
  success: CORE_COLORS.success,
  warning: CORE_COLORS.warning,
  error: CORE_COLORS.danger,
  info: CORE_COLORS.info,
} as const;

// Type-safe color object for passing around
export type CoreColorName = keyof typeof CORE_COLORS;
export type GradientName = keyof typeof GRADIENTS;

// ===== USAGE EXAMPLES =====
// Here's how to use this system in your components:
/*

// Option 1: Direct access
import { CORE_COLORS } from '../constants/colors'
<div style={{ color: CORE_COLORS.violet }}>Purple text</div>

// Option 2: Helper functions  
import { colorStyle, backgroundColorStyle, gradientStyle } from '../constants/colors'
<div style={colorStyle('violet')}>Purple text</div>
<div style={backgroundColorStyle('surface1')}>Card background</div>
<div style={gradientStyle('redToGold')}>Gradient background</div>

// Option 3: Theme shortcuts
import { theme } from '../constants/colors'
<div style={{ color: theme.brand }}>Brand color</div>
<div style={{ backgroundColor: theme.card }}>Card background</div>

// Option 4: Tailwind classes (still work, but harder to change globally)
<div className="text-violet bg-surface-1">Traditional Tailwind</div>

*/