# Theme System Documentation

## Overview

ConquestK uses a comprehensive theme system that provides instant theme switching with no flash of unstyled content. The system supports multiple color themes with semantic variables, ensuring consistent styling across the entire application.

## Architecture

### Single Source of Truth
All theme definitions are maintained in `/frontend/src/config/themes.config.ts`. This follows the DRY (Don't Repeat Yourself) principle and ensures consistency.

### Theme Structure
Each theme defines:
- **Primary Colors**: Primary, primary-soft, secondary, accent
- **Background Colors**: bgDeep (deepest), bgAlt (alternative deep)
- **Surface Colors**: surface-1 (cards/panels), surface-2 (nested elements)
- **Text Colors**: text (primary), textMuted (secondary)
- **Border Color**: For dividers and outlines
- **Gradient**: Complex background gradients with multiple stops

### CSS Variable System
Themes are applied using CSS custom properties (variables):
```css
--color-primary: #4338CA;
--color-bg-deep: #0a0a0f;
--color-surface-1: #0f172a;
/* etc... */
```

## Available Themes

| Theme | Primary Color | Description |
|-------|--------------|-------------|
| default | Indigo (#4338CA) | Deep space theme with indigo accents |
| violet | Purple (#7C3AED) | Rich purple with dark backgrounds |
| red | Red (#DC2626) | Intense red with warm dark tones |
| blue | Blue (#2563EB) | Classic blue with navy depths |
| green | Emerald (#059669) | Natural green with forest darkness |
| black | Neutral (#1f2937) | Pure black minimalist theme |
| light | Blue (#3B82F6) | Light mode with white backgrounds |

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

1. Add theme definition to `/frontend/src/config/themes.config.ts`:
```typescript
{
  id: 'mytheme',
  name: 'My Theme',
  category: 'dark',
  colors: {
    primary: '#yourcolor',
    primarySoft: '#softerversion',
    // ... all required colors
  },
  gradient: {
    stops: [
      { position: '0%', color: '#color1' },
      { position: '30%', color: '#color2' },
      // ... gradient stops
    ]
  }
}
```

2. The theme will automatically appear in Settings and work throughout the app.

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