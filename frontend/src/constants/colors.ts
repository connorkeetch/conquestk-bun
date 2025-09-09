// Conquest K Color System Constants

// Player colors - Optimized for gameplay visibility against dark backgrounds
export const PLAYER_COLORS = [
  '#DC2626', // Red - Classic aggressive
  '#2563EB', // Blue - Traditional defensive
  '#059669', // Forest Green - Distinct from premium neon
  '#F59E0B', // Amber - Better than pure yellow
  '#9333EA', // Purple - Clear and distinct
  '#EA580C', // Orange - Vibrant energy
  '#06B6D4', // Cyan - Cool and calculating
  '#EC4899', // Pink - Surprisingly visible
  '#D97706', // Tan/Bronze - Earthy warfare
  '#881337', // Maroon - Deep and rich
  '#14B8A6', // Teal - Ocean depths
  '#6366F1', // Indigo - Bridge between blue and purple
] as const;

// Premium player colors with special effects
export const PREMIUM_PLAYER_COLORS = {
  MidnightBlack: {
    solid: '#000000',
    outline: '#FFFFFF',
    effect: 'subtle-starfield',
    description: 'The void between stars'
  },
  PureWhite: {
    solid: '#FFFFFF',
    outline: '#000000',
    effect: 'pearl-shimmer',
    description: 'Pristine and untouchable'
  },
  MetallicGold: {
    solid: '#FFD700',
    effect: 'metallic-gradient',
    outline: '#B8860B',
    description: 'The color of victory'
  },
  MetallicSilver: {
    solid: '#C0C0C0',
    effect: 'chrome-reflection',
    outline: '#808080',
    description: 'Polished steel'
  },
  NeonGreen: {
    solid: '#39FF14',
    effect: 'electric-glow',
    outline: '#2FB510',
    description: 'Radioactive power'
  },
  Dragonfire: {
    gradient: 'linear-gradient(45deg, #DC2626, #FB923C, #FDE047)',
    solid: '#FB923C',
    effect: 'flame-particles',
    description: 'Burning conquest'
  }
} as const;

// Rank colors - The progression of power
export const RANK_COLORS = {
  CHIEFTAIN: { 
    base: '#9CA3AF', 
    glow: 'glow-rank-low', 
    name: 'Iron',
    minElo: 0,
    maxElo: 599
  },
  WARLORD: { 
    base: '#CD7F32', 
    glow: 'glow-rank-low', 
    name: 'Bronze',
    minElo: 600,
    maxElo: 799
  },
  RAIDER_KING: { 
    base: '#B22222', 
    glow: 'glow-rank-medium', 
    name: 'Crimson',
    minElo: 800,
    maxElo: 999
  },
  SULTAN: { 
    base: '#10B981', 
    glow: 'glow-rank-medium', 
    name: 'Emerald',
    minElo: 1000,
    maxElo: 1199
  },
  CAESAR: { 
    base: '#C0C0C0', 
    glow: 'glow-rank-medium', 
    name: 'Silver',
    minElo: 1200,
    maxElo: 1399
  },
  KHAN: { 
    base: '#9B111E', 
    glow: 'glow-rank-medium', 
    name: 'Ruby',
    minElo: 1400,
    maxElo: 1599
  },
  EMPEROR: { 
    base: '#2563EB', 
    glow: 'glow-rank-high', 
    name: 'Sapphire',
    minElo: 1600,
    maxElo: 1799
  },
  GREAT_KING: { 
    base: '#FFD700', 
    glow: 'glow-rank-high', 
    name: 'Gold',
    minElo: 1800,
    maxElo: 1999
  },
  OVERLORD: { 
    base: '#0B0B0B', 
    glow: 'glow-rank-divine', 
    name: 'Obsidian',
    minElo: 2000,
    maxElo: 2499
  },
  APOCALYPSE: { 
    base: 'linear-gradient(90deg, #EF4444, #F59E0B)', 
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