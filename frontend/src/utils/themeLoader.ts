// Theme loader - runs before React hydrates to prevent flash
// This is injected into index.html to run immediately

export const themeLoaderScript = `
(function() {
  // Default theme configuration
  const DEFAULT_THEME = 'default';
  
  // Theme definitions - must match themes.config.ts
  const themes = {
    default: {
      primary: '#4338CA',
      primarySoft: '#5B21B6',
      secondary: '#FFD700',
      accent: '#dc2626',
      bgDeep: '#0a0a0f',
      bgAlt: '#080812',
      surface1: '#0f172a',
      surface2: '#111827',
      text: '#F9FAFB',
      textMuted: '#94A3B8',
      border: '#1e293b',
      gradient: 'linear-gradient(135deg, #0a0814 0%, #050308 30%, #0d0615 60%, #0a0814 100%)'
    },
    light: {
      primary: '#3B82F6',
      primarySoft: '#60A5FA',
      secondary: '#F59E0B',
      accent: '#DC2626',
      bgDeep: '#F8F9FA',
      bgAlt: '#F1F5F9',
      surface1: '#FFFFFF',
      surface2: '#F1F5F9',
      text: '#1E293B',
      textMuted: '#64748B',
      border: '#E2E8F0',
      gradient: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 30%, #e2e8f0 60%, #f8fafc 100%)'
    },
    violet: {
      primary: '#7C3AED',
      primarySoft: '#8B5CF6',
      secondary: '#FFD700',
      accent: '#B22222',
      bgDeep: '#0b0812',
      bgAlt: '#090510',
      surface1: '#0f172a',
      surface2: '#111827',
      text: '#F9FAFB',
      textMuted: '#94A3B8',
      border: '#1e293b',
      gradient: 'linear-gradient(135deg, #0d0814 0%, #040207 30%, #0a0610 60%, #0d0814 100%)'
    },
    red: {
      primary: '#DC2626',
      primarySoft: '#EF4444',
      secondary: '#FFD700',
      accent: '#F59E0B',
      bgDeep: '#0d0505',
      bgAlt: '#0a0303',
      surface1: '#0f172a',
      surface2: '#111827',
      text: '#F9FAFB',
      textMuted: '#94A3B8',
      border: '#1e293b',
      gradient: 'linear-gradient(135deg, #110303 0%, #050101 30%, #0f0202 60%, #110303 100%)'
    },
    blue: {
      primary: '#2563EB',
      primarySoft: '#3B82F6',
      secondary: '#FFD700',
      accent: '#06B6D4',
      bgDeep: '#05080f',
      bgAlt: '#03050a',
      surface1: '#0f172a',
      surface2: '#111827',
      text: '#F9FAFB',
      textMuted: '#94A3B8',
      border: '#1e293b',
      gradient: 'linear-gradient(135deg, #06090f 0%, #020305 30%, #05070c 60%, #06090f 100%)'
    },
    green: {
      primary: '#059669',
      primarySoft: '#10B981',
      secondary: '#FFD700',
      accent: '#14B8A6',
      bgDeep: '#050a08',
      bgAlt: '#030605',
      surface1: '#0f172a',
      surface2: '#111827',
      text: '#F9FAFB',
      textMuted: '#94A3B8',
      border: '#1e293b',
      gradient: 'linear-gradient(135deg, #060c0a 0%, #020403 30%, #050907 60%, #060c0a 100%)'
    },
    black: {
      primary: '#1f2937',
      primarySoft: '#374151',
      secondary: '#9ca3af',
      accent: '#f3f4f6',
      bgDeep: '#000000',
      bgAlt: '#050505',
      surface1: '#0a0a0a',
      surface2: '#111111',
      text: '#F9FAFB',
      textMuted: '#94A3B8',
      border: '#1e293b',
      gradient: 'linear-gradient(135deg, #050505 0%, #000000 30%, #030303 60%, #050505 100%)'
    }
  };

  // Get stored theme or use default
  let storedTheme = DEFAULT_THEME;
  try {
    storedTheme = localStorage.getItem('colorTheme') || DEFAULT_THEME;
  } catch (e) {
    // LocalStorage not available
  }

  // Apply theme immediately
  const theme = themes[storedTheme] || themes[DEFAULT_THEME];
  const root = document.documentElement;
  
  // Set data-theme attribute
  root.setAttribute('data-theme', storedTheme);
  
  // Apply CSS variables
  root.style.setProperty('--color-primary', theme.primary);
  root.style.setProperty('--color-primary-soft', theme.primarySoft);
  root.style.setProperty('--color-secondary', theme.secondary);
  root.style.setProperty('--color-accent', theme.accent);
  root.style.setProperty('--color-bg-deep', theme.bgDeep);
  root.style.setProperty('--color-bg-alt', theme.bgAlt);
  root.style.setProperty('--color-surface-1', theme.surface1);
  root.style.setProperty('--color-surface-2', theme.surface2);
  root.style.setProperty('--color-text', theme.text);
  root.style.setProperty('--color-text-muted', theme.textMuted);
  root.style.setProperty('--color-border', theme.border);
  root.style.setProperty('--ck-bg-gradient', theme.gradient);
})();
`;