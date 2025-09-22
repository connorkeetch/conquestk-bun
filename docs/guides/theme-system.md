# Theme System Documentation

## Overview

ConquestK uses a **pure CSS-based theme system** that provides instant theme switching with zero JavaScript overhead. All theme styling is handled through CSS custom properties and data attributes, ensuring no flash of unstyled content and optimal performance.

## Architecture

### CSS-First Approach
All theme definitions are maintained as CSS rules in `/frontend/src/app.css` using `[data-theme="name"]` selectors. JavaScript only changes the data-theme attribute - CSS handles all the styling automatically.

### 📁 File Locations & Responsibilities

1. **`/frontend/src/app.css`** 
   - Theme definitions using `[data-theme="themename"]` selectors
   - CSS variables for each theme (colors, gradients, effects)
   - Source of truth for all theme styling

2. **`/frontend/src/config/themes.config.ts`**
   - Theme metadata (names, descriptions, display colors)
   - `applyTheme()` function - Sets data-theme attribute
   - `getStoredTheme()` - Retrieves saved theme preference
   - No longer applies inline styles (pure CSS now)

3. **`/frontend/src/utils/themeLoader.ts`**
   - Script injected into index.html before React loads
   - Sets initial theme from localStorage
   - Prevents flash of unstyled content (FOUC)

4. **`/frontend/src/constants/colors.ts`**
   - Game-specific color constants (NOT themes)
   - `PLAYER_COLORS` - 13 player colors for game pieces
   - `PREMIUM_PLAYER_COLORS` - VIP/premium player colors
   - `RANK_COLORS` - ELO rank display colors
   - **Note**: Theme objects here are DEPRECATED and unused

5. **`/backend/migrations/009_user_preferences.sql`**
   - Database persistence for theme preferences
   - Syncs across devices/sessions

### Theme Structure
Each theme defines:
- **Primary Colors**: Primary, primary-soft, secondary, accent
- **Background Colors**: bgDeep (deepest), bgAlt (alternative deep)
- **Surface Colors**: surface-1 (cards/panels), surface-2 (nested elements)
- **Text Colors**: text (primary), textMuted (secondary)
- **Border Color**: For dividers and outlines
- **Gradient**: Complex background gradients with multiple stops

### CSS Variable System
Themes are defined in CSS and automatically apply when data-theme changes:
```css
[data-theme="default"] {
  --color-primary: #2563EB;      /* Blue buttons */
  --color-bg-deep: #000000;      /* Pure black */
  --color-surface-1: #0f172a;    /* Dark cards */
  --ck-bg-gradient: linear-gradient(135deg, 
    #111827 0%,                   /* gray-900 */
    rgba(88, 28, 135, 0.2) 50%,  /* purple-900/20 */
    #000000 100%);                /* black */
}
```

## Available Themes

| Theme | Primary Color | Description |
|-------|--------------|-------------|
| default | Blue (#2563EB) | Blue buttons with dark purple gradient background |
| dark | Blue (#2563EB) | Alias for default (backwards compatibility) |
| violet | Purple (#7C3AED) | Purple theme with violet accents |
| red | Red (#DC2626) | Crimson theme with red accents |
| blue | Blue (#2563EB) | Ocean blue theme |
| retrospace | Royal Blue (#0F4CDA) | Premium retro social profile blues with neon highlights |
| green | Emerald (#059669) | Emerald green theme |
| black | Gray (#1f2937) | Pure black with gray accents |
| highcontrast | Bright Blue (#00B4FF) | Accessibility-focused high contrast (WCAG AAA) |
| halloween | Orange (#FF6B35) | 🎃 Spooky seasonal theme with animated effects |

## How Theme Switching Works

1. **User selects theme** → Settings page calls `applyTheme(themeId)`
2. **Apply theme** → Sets `document.documentElement.setAttribute('data-theme', themeId)`
3. **CSS takes over** → Browser applies matching `[data-theme="themename"]` styles
4. **Save preference** → Stored in localStorage and database
5. **Next visit** → themeLoader.ts applies saved theme before React loads

## Migration Status

- ✅ Moved from JavaScript objects to pure CSS
- ✅ Removed inline style application
- ✅ Database persistence implemented
- ✅ Zero-flash loading implemented
- ⚠️ Some components still use CORE_COLORS (gradual migration)
- 🔄 Theme objects in colors.ts marked deprecated

## Usage

### Switching Themes (Frontend)
```typescript
import { useDispatch } from 'react-redux';
import { setTheme } from '@/store/settingsSlice';

// In a React component
const dispatch = useDispatch();
dispatch(setTheme('violet')); // Switch to violet theme
```

### Using Theme Colors in Components
Always use semantic Tailwind classes that adapt to themes:
```tsx
// ✅ CORRECT - Uses semantic classes
<div className="bg-surface-1 text-white border-border">
  <button className="bg-primary hover:brightness-110 text-white">
    Click Me
  </button>
</div>

// ❌ WRONG - Hardcoded colors
<div className="bg-gray-800 text-gray-100 border-gray-600">
  <button className="bg-blue-600 hover:bg-blue-700 text-white">
    Click Me
  </button>
</div>
```

### Semantic Color Classes

#### Backgrounds
- `bg-deep` - Deepest background (page background)
- `bg-alt` - Alternative deep background
- `bg-surface-1` - Primary surface (cards, panels)
- `bg-surface-2` - Secondary surface (nested elements)

#### Text
- `text-white` - Primary text (adapts in light theme)
- `text-muted` - Secondary/muted text
- `text-primary` - Primary theme color text
- `text-primary-soft` - Softer primary color text

#### Buttons & Interactive
- `bg-primary` - Primary action buttons
- `bg-secondary` - Secondary elements
- `bg-accent` - Accent/danger actions
- `hover:brightness-110` - Universal hover effect

#### State Colors
- `bg-success-soft` - Success states
- `bg-warning-soft` - Warning states
- `bg-error-soft` - Error states
- `bg-info-soft` - Info states

## Theme Loading Performance

The theme system uses a specialized loader to prevent flash of unstyled content:

1. **Pre-React Loading**: Theme is applied before React hydrates
2. **LocalStorage Persistence**: Theme choice persists across sessions
3. **Instant Switching**: No page reload required
4. **Zero Flash**: Theme is set before first paint

## Adding a New Theme

### 1. Define CSS Theme in app.css
Add your theme definition after existing themes:
```css
[data-theme="mytheme"] {
  --color-primary: #yourcolor;
  --color-primary-soft: #yourhovercolor;
  --color-secondary: #FFD700;
  --color-accent: #accentcolor;
  --color-bg-deep: #000000;
  --color-bg-alt: #050505;
  --color-surface-1: #0f172a;
  --color-surface-2: #1e293b;
  --color-text: #F9FAFB;
  --color-text-muted: #94A3B8;
  --color-border: #334155;
  --ck-bg-gradient: linear-gradient(135deg, ...);
}
```

### 2. Add Theme Metadata to themes.config.ts
For UI display purposes only:
```typescript
{
  id: 'mytheme',
  name: 'My Theme',
  displayColor: '#yourcolor',  // Color shown in UI picker
  description: 'Description of your theme',
  colors: {
    // These should match your CSS values
    primary: '#yourcolor',
    // ... other colors
  }
}
```

### 3. Update Valid Themes in themeLoader.ts
Add to the validThemes array:
```javascript
const validThemes = ['default', 'dark', 'red', 'violet', 'blue', 'retrospace', 'green', 'black', 'highcontrast', 'halloween', 'mytheme'];
```

## Best Practices

### ✅ DO:
- Use semantic color classes (`bg-primary`, `text-muted`)
- Test all themes when adding new components
- Use `hover:brightness-110` for consistent hover effects
- Keep backgrounds very dark for dark themes (#0a0a0f or darker)
- Define themes in app.css using data-theme selectors
- Ensure adequate contrast ratios (WCAG AA minimum)

### ❌ DON'T:
- Don't add theme colors to `colors.ts` (use CSS)
- Don't apply inline styles for theming (use CSS variables)
- Don't import theme objects from colors.ts (they're deprecated)
- Don't modify theme colors in JavaScript (CSS-only)

## Performance Benefits

- **Instant switching** - No JavaScript processing
- **Zero flash** - Theme applied before React
- **Smaller bundle** - No theme objects in JS
- **Browser optimized** - Native CSS handling
- **Cache friendly** - CSS can be cached separately

## Component Examples

### Card Component
```tsx
<div className="bg-surface-1 border border-border rounded-lg p-4">
  <h3 className="text-white font-bold mb-2">Card Title</h3>
  <p className="text-muted">Card content goes here</p>
</div>
```

### Button Component
```tsx
<button className="bg-primary hover:brightness-110 text-white px-4 py-2 rounded">
  Primary Button
</button>

<button className="bg-surface-2 hover:bg-surface-1 text-white px-4 py-2 rounded">
  Secondary Button
</button>
```

### Form Input
```tsx
<input 
  className="bg-surface-2 border border-border text-white placeholder-muted 
             focus:border-primary rounded px-3 py-2"
  placeholder="Enter text..."
/>
```

## Troubleshooting

### Theme not persisting
- Check localStorage is enabled
- Verify `colorTheme` key exists in localStorage
- Ensure Redux store is properly initialized

### Colors not updating
- Verify using semantic classes, not hardcoded
- Check component isn't using inline styles
- Ensure theme definition has all required colors

### Flash on page load
- Verify themeLoader script is in index.html
- Check theme is applied before React hydrates
- Ensure no conflicting CSS

## Future Enhancements

Planned improvements (tracked in [planning/roadmap.md](planning/roadmap.md)):
- Style themes (modern, retro, minimal)
- Auto theme based on time of day
- Custom theme creator
- Theme animations and transitions
- High contrast accessibility mode