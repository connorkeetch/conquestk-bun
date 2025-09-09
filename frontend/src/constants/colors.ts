// Conquest K Color System Constants
// 🎯 SINGLE SOURCE OF TRUTH FOR ALL COLORS IN THE APP
// Change any color here and it affects everything throughout the application

// ===== EVERY COLOR IN THE APP =====
// 🎯 THE COMPLETE COLOR SYSTEM - Your single source of truth for ALL colors
// Change any color here and it will affect everywhere it's used throughout the app
export const CORE_COLORS = {
  // ===== BRAND COLORS =====
  violet: '#7C3AED',           // Primary brand, all main CTAs, focus states
  violetSoft: '#8B5CF6',       // Atmospheric glow and hover states
  gold: '#FFD700',             // Victory, rewards, "K" in logo, premium highlights
  crimson: '#B22222',          // Attack states, danger, errors
  
  // ===== BACKGROUND COLORS =====
  ink: '#0B0B12',              // Near-black indigo for deepest backgrounds
  imperial: '#170B1D',         // Even deeper royal purple, minimal brightness
  abyss: '#080A14',            // Darker void, consistent with gradient flow
  surface1: '#0F172A',         // Card backgrounds, elevated surfaces
  surface2: '#111827',         // Higher elevation cards, dropdowns
  
  // Background gradient stops
  gradientDark1: '#050508',    // Background gradient start (darkest)
  gradientDark2: '#030308',    // Background gradient 30%
  gradientDark3: '#060612',    // Background gradient 60%  
  gradientDark4: '#040509',    // Background gradient end
  
  // ===== TEXT COLORS =====
  text: '#F9FAFB',             // Primary text, near white
  muted: '#94A3B8',            // Secondary text, subdued descriptions
  border: '#475569',           // Borders, dividers, input borders
  
  // ===== SEMANTIC COLORS =====
  success: '#10B981',          // Success messages, positive actions, green states
  warning: '#F59E0B',          // Warning messages, caution states, amber
  danger: '#B22222',           // Error messages, danger states (same as crimson)
  info: '#06B6D4',             // Info messages, cyan highlights
  
  // ===== NEUTRAL COLORS =====
  black: '#000000',            // Pure black (premium colors, overlord rank)
  white: '#FFFFFF',            // Pure white (premium colors, text highlights)
  gray100: '#F3F4F6',         // Lightest gray
  gray200: '#E5E7EB',         // Light gray  
  gray300: '#D1D5DB',         // Medium-light gray
  gray400: '#9CA3AF',         // Medium gray (Chieftain rank)
  gray500: '#6B7280',         // Medium-dark gray
  gray600: '#4B5563',         // Dark gray
  gray700: '#374151',         // Darker gray
  gray800: '#1F2937',         // Very dark gray
  gray900: '#111827',         // Nearly black gray
  
  // ===== METALLIC COLORS =====
  bronze: '#CD7F32',           // Warlord rank, bronze metals
  silver: '#C0C0C0',           // Caesar rank, silver metals
  goldOutline: '#B8860B',      // Gold outlines and borders
  silverOutline: '#808080',    // Silver outlines and borders
  
  // ===== SPECIAL ACCENT COLORS =====
  neonGreen: '#39FF14',        // Premium neon green player color
  neonGreenOutline: '#2FB510', // Neon green borders
  ruby: '#9B111E',             // Khan rank, deep red
  
  // ===== RED SPECTRUM =====
  red400: '#F87171',           // Light red
  red500: '#EF4444',           // Medium red
  red600: '#DC2626',           // Strong red (player color)
  red700: '#B91C1C',           // Dark red
  red800: '#991B1B',           // Very dark red
  
  // ===== BLUE SPECTRUM =====
  blue400: '#60A5FA',          // Light blue
  blue500: '#3B82F6',          // Medium blue  
  blue600: '#2563EB',          // Strong blue (player color, Emperor rank)
  blue700: '#1D4ED8',          // Dark blue
  
  // ===== GREEN SPECTRUM =====
  green400: '#4ADE80',         // Light green
  green500: '#22C55E',         // Medium green
  green600: '#059669',         // Forest green (player color)
  green700: '#047857',         // Dark green
  
  // ===== YELLOW/AMBER SPECTRUM =====
  yellow400: '#FBBF24',        // Light yellow (used in gold gradients)
  amber500: '#F59E0B',         // Amber (warning, player color)
  amber600: '#D97706',         // Dark amber (player color, bronze tones)
  
  // ===== PURPLE SPECTRUM =====
  purple400: '#A78BFA',        // Light purple
  purple500: '#8B5CF6',        // Medium purple (violetSoft)
  purple600: '#7C3AED',        // Strong purple (main violet)
  purple700: '#6D28D9',        // Dark purple
  purple800: '#5B21B6',        // Very dark purple
  purple900: '#9333EA',        // Player color purple
  
  // ===== ORANGE SPECTRUM =====
  orange400: '#FB923C',        // Light orange (dragonfire)
  orange500: '#F97316',        // Medium orange
  orange600: '#EA580C',        // Strong orange (player color)
  orange700: '#C2410C',        // Dark orange
  
  // ===== CYAN/TEAL SPECTRUM =====
  cyan400: '#22D3EE',          // Light cyan
  cyan500: '#06B6D4',          // Medium cyan (info, player color)
  teal500: '#14B8A6',          // Teal (player color)
  teal600: '#0D9488',          // Dark teal
  
  // ===== PINK SPECTRUM =====
  pink400: '#F472B6',          // Light pink
  pink500: '#EC4899',          // Medium pink (player color)
  pink600: '#DB2777',          // Dark pink
  
  // ===== INDIGO SPECTRUM =====
  indigo400: '#818CF8',        // Light indigo
  indigo500: '#6366F1',        // Medium indigo (player color)
  indigo600: '#4F46E5',        // Dark indigo
  
  // ===== MAROON SPECTRUM =====
  maroon600: '#881337',        // Maroon (player color)
  maroon700: '#701A2F',        // Dark maroon
} as const;

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