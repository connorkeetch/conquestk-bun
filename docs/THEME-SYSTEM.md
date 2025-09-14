# Theme System Documentation

## Overview

ConquestK uses a **pure CSS-based theme system** that provides instant theme switching with zero JavaScript overhead. All theme styling is handled through CSS custom properties and data attributes, ensuring no flash of unstyled content and optimal performance.

## Architecture

### CSS-First Approach
All theme definitions are maintained as CSS rules in `/frontend/src/app.css` using `[data-theme="name"]` selectors. JavaScript only changes the data-theme attribute - CSS handles all the styling automatically.

### Theme Files
- **`app.css`**: Contains all CSS theme definitions (source of truth for styling)
- **`themes.config.ts`**: Theme metadata for UI display (names, descriptions, colors)
- **`themeLoader.ts`**: Minimal script to prevent flash on page load

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
| green | Emerald (#059669) | Emerald green theme |
| black | Gray (#1f2937) | Pure black with gray accents |
| highcontrast | Bright Blue (#00B4FF) | Accessibility-focused high contrast (WCAG AAA) |
| halloween | Orange (#FF6B35) | 🎃 Spooky seasonal theme with animated effects |

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
const validThemes = ['default', 'dark', 'red', 'violet', 'blue', 'green', 'black', 'highcontrast', 'halloween', 'mytheme'];
```

## Best Practices

### DO:
- Use semantic color classes (`bg-primary`, `text-muted`)
- Test all themes when adding new components
- Use `hover:brightness-110` for consistent hover effects
- Keep backgrounds very dark for dark themes (#0a0a0f or darker)

### DON'T:
- Hardcode colors (`bg-blue-600`, `text-gray-400`)
- Use inline styles for colors
- Create theme-specific components
- Mix semantic and hardcoded colors

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

Planned improvements (see TODO.md):
- Style themes (modern, retro, minimal)
- Auto theme based on time of day
- Custom theme creator
- Theme animations and transitions
- High contrast accessibility mode