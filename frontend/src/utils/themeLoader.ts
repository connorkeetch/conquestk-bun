// Theme loader - runs before React hydrates to prevent flash
// This is injected into index.html to run immediately

export const themeLoaderScript = `
(function() {
  // Pure CSS-based theme loader
  // Only sets data-theme attribute, all styling is handled by CSS
  
  // Default theme configuration
  const DEFAULT_THEME = 'default';
  
  // Get stored theme or use default
  let storedTheme = DEFAULT_THEME;
  try {
    storedTheme = localStorage.getItem('colorTheme') || DEFAULT_THEME;
    
    // Validate theme exists (available themes)
    const validThemes = ['default', 'red', 'violet', 'blue', 'green', 'black', 'highcontrast', 'halloween'];
    if (!validThemes.includes(storedTheme)) {
      storedTheme = DEFAULT_THEME;
    }
  } catch (e) {
    // LocalStorage not available
  }

  // Set data-theme attribute - CSS handles all the styling
  document.documentElement.setAttribute('data-theme', storedTheme);
  
  // Clean up any inline styles that might have been set by the old system
  const root = document.documentElement;
  const stylesToRemove = [
    '--color-primary', '--color-primary-soft', '--color-secondary', '--color-accent',
    '--color-bg-deep', '--color-bg-alt', '--color-surface-1', '--color-surface-2',
    '--color-text', '--color-text-muted', '--color-border', '--ck-bg-gradient'
  ];
  stylesToRemove.forEach(prop => root.style.removeProperty(prop));
})();
`;