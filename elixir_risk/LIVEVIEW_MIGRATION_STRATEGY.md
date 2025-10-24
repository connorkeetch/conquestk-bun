# LiveView Migration Strategy

## Overview
Instead of building LiveView pages from scratch, we'll recreate the existing React page structure in LiveView to maintain consistency and leverage the existing design system.

## Current React Architecture

### Pages (frontend/src/pages/)
- **Home.tsx** - Landing page with hero, offerings grid, CTA sections
- **LobbyPage.tsx** - Game browser with 3 tabs (Browse/My Games/Private)
- **GameRoom.tsx** - Main game interface (complex, 36k+ tokens)
- **CreateGamePage.tsx** - Game creation form
- **Dashboard.tsx** - User dashboard
- **Settings.tsx** - User settings
- **Maps.tsx** - Map browser
- **MapEditor.tsx** - Map creation tool
- **Statistics.tsx** - Player stats
- **FriendsPage.tsx** - Friends list
- **Clan pages** - ClanDirectoryPage, ClanDetailPage
- **Auth pages** - Login, Register, ForgotPassword, etc.
- **Admin pages** - AdminDashboard, AdminGames, AdminUsers, etc.

### Shared Components (frontend/src/components/)
- **Header.tsx** - Nav bar with auth, active games dropdown
- **Footer.tsx** - Footer links
- **Panels** - PlayerStatsPanel, ChatLogPanel, GameLogPanelWrapper
- **Game components** - ConnectionBanner, DiceResultsBar, TurnTimer, etc.

### Theme System (frontend/src/app.css + themes/)
- CSS variables for theming (`--color-primary`, `--surface-1`, etc.)
- 12+ themes (default, red, violet, frontier, metal, halloween, etc.)
- Semantic variable names (by PURPOSE not color)
- Theme switching via `data-theme` attribute on `<html>`
- Stored in localStorage: `localStorage.getItem('phx:theme')`

## LiveView Recreation Plan

### Phase 3: Shared Layout & Components

#### 3.1: Create App Layout
**File**: `lib/risk_game_web/components/layouts/app.html.heex`

```heex
<!DOCTYPE html>
<html lang="en" data-theme={@theme || "default"}>
  <head>
    <!-- Same as root layout but with app-specific meta -->
  </head>
  <body>
    <.header current_user={@current_user} />
    <main class="min-h-screen">
      {@inner_content}
    </main>
    <.footer />
  </body>
</html>
```

#### 3.2: Header Component
**File**: `lib/risk_game_web/components/core_components.ex`

Recreate Header.tsx functionality:
- Logo with link to home
- Navigation links (Lobby, Maps, Learn, Community)
- Active Games dropdown (if authenticated)
- User menu dropdown (Settings, Profile, Logout)
- Theme switcher
- Mobile responsive hamburger menu

#### 3.3: Footer Component
Simple footer with links matching Footer.tsx:
- About, Privacy, Terms, Contact
- Social links
- Copyright notice

#### 3.4: Import Existing CSS
Copy or symlink the frontend CSS to use the same theme system:
- Copy `frontend/src/app.css` → `elixir_risk/assets/css/app_theme.css`
- Copy `frontend/src/themes/` → `elixir_risk/assets/css/themes/`
- Import in `elixir_risk/assets/css/app.css`

### Phase 4: Core Pages (Priority Order)

#### 4.1: Home Page (SIMPLE START)
**File**: `lib/risk_game_web/live/home_live.ex`

**Structure** (from Home.tsx):
1. Hero section with title, value prop, CTA buttons
2. Epic battle image section
3. "Systems & Modes" grid (10 offerings with icons/badges)
4. "How It Works" 3-step process
5. Final CTA section

**Notes**:
- Static content (no real-time updates needed)
- Conditional CTAs based on auth status
- Use `resolveAssetPath` equivalent for CDN assets
- Matches exact class names from React version

#### 4.2: Lobby Page (MEDIUM COMPLEXITY)
**File**: `lib/risk_game_web/live/lobby_live.ex`

**Structure** (from LobbyPage.tsx):
1. Email verification banner (if unverified)
2. Page header with "Create Game" and "Filter" buttons
3. Filter panel (collapsible)
4. Tab navigation (Browse / My Games / Private)
5. **Browse Tab**:
   - Game cards grid
   - Filters (game type, map, mode, teams, players, checkboxes)
   - Empty states
6. **My Games Tab**:
   - Filter buttons (All/Active/Lobby/Completed)
   - Desktop: sortable table with column toggles
   - Mobile: card list
   - Queue position, timers, "your turn" indicators
7. **Private Tab**:
   - Code input form
   - Join private game

**Real-time updates**:
- Subscribe to `game_lobby_updated` PubSub topic
- Update game list when games are created/deleted/updated
- Update "My Games" counters and timers every second

**Notes**:
- Complex filtering/sorting logic (copy from React)
- Responsive desktop table / mobile cards
- ARIA live regions for screen readers
- URL query params for filters (`?filter=active`)

#### 4.3: Game Lobby Room Page (SIMPLE)
**File**: Delete the current `game_lobby_live.ex` and recreate based on GameRoom.tsx lobby phase

When user clicks a game in LobbyPage, show:
- Game name, status, host, settings
- Player list with colors, ready status
- "Join Game" / "Leave Game" / "Toggle Ready" buttons
- Host-only "Start Game" button
- Real-time updates via PubSub

**Route**: `/room/:room_code` or `/room/:game_id`

#### 4.4: Create Game Page
**File**: `lib/risk_game_web/live/create_game_live.ex`

Form matching CreateGamePage.tsx:
- Game name
- Map selector
- Player count (2-12)
- Game mode (Classic, Capitals, etc.)
- Team options
- Fog of war
- Turn timer
- Bonus type
- Hidden Treasures config
- Ranked checkbox
- Private checkbox

Submit → Create game → Redirect to lobby

### Phase 5: Game Room (COMPLEX - DO LAST)

GameRoom.tsx is 36k+ tokens and handles:
- Game board rendering
- Turn phases (Reinforcement, Attack, Fortify)
- Dice rolling
- Territory selection
- Player panels, chat, game log
- Modals (GameOver, TreasureTradeModal, YourTurnModal)
- Timers, connection banners
- Lockstep state management

**Strategy**: Break into smaller LiveView components
- `game_room_live.ex` - Main container
- `game_board_component.ex` - SVG map rendering
- `player_stats_component.ex` - Player panel
- `chat_component.ex` - Chat log
- `game_log_component.ex` - Game log
- `phase_controls_component.ex` - Turn action buttons

### Phase 6: Auth & Settings Pages

Simple forms matching React pages:
- Login, Register, ForgotPassword, ResetPassword
- Settings (theme, notifications, etc.)
- EmailVerificationPending, VerifyEmail

### Phase 7: Additional Features

As time permits:
- Dashboard, Statistics, Maps, MapEditor
- Friends, Clans
- Admin pages

## Routing Strategy

Match React Router paths exactly:

```elixir
# lib/risk_game_web/router.ex
scope "/", RiskGameWeb do
  pipe_through :browser

  live "/", HomeLive, :index
  live "/lobby/:section", LobbyLive, :index  # section = browse/my-games/private
  live "/room/:room_code", GameLobbyLive, :show
  live "/game/:room_code", GameRoomLive, :show  # Active game
  live "/create", CreateGameLive, :new
  live "/login", LoginLive, :index
  live "/register", RegisterLive, :index
  live "/settings", SettingsLive, :index
  live "/maps", MapsLive, :index
  # ... etc
end
```

## Theme System Integration

### Current Phoenix Theme Setup
```javascript
// root.html.heex already has theme loader
const setTheme = (theme) => {
  if (theme === "system") {
    localStorage.removeItem("phx:theme");
    document.documentElement.removeAttribute("data-theme");
  } else {
    localStorage.setItem("phx:theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
  }
};
```

### Action Plan
1. Copy all theme CSS files from React app
2. Import into Phoenix app.css
3. Ensure class names match exactly (`.panel`, `.btn-primary`, `.chip`, etc.)
4. Theme switcher in Settings page LiveView
5. Default theme stored in user preferences table

## CSS Class Naming Convention

Use EXACT class names from React app for consistency:

### Layout
- `container mx-auto px-6` - Constrained width container
- `section-spacing` - Vertical section spacing
- `min-h-screen` - Full viewport height

### Components
- `panel` - Card/panel background with border
- `chip` - Small badge/tag
- `badge` - Colored badge
- `btn`, `btn-primary`, `btn-secondary`, `btn-tertiary` - Buttons
- `btn-sm`, `btn-lg`, `btn-xs` - Button sizes
- `form-input`, `form-select`, `form-checkbox` - Form controls
- `tabs`, `tab`, `tab-active` - Tab navigation
- `segmented-control`, `segmented-active` - Segmented buttons

### Colors (via CSS variables)
- `text-[color:var(--heading)]` - Heading color
- `text-muted` - Muted text
- `text-[color:var(--color-primary-soft)]` - Primary accent
- `bg-surface-1` - Surface background

## Data Flow Architecture

### React (current)
```
Redux Store (gameSlice, roomSlice, authSlice)
  ↓
Components subscribe via useAppSelector
  ↓
Actions dispatch via useAppDispatch
  ↓
Socket.io for real-time updates
```

### LiveView (new)
```
Ecto Database + GenServer state
  ↓
LiveView assigns (@game, @players, @current_user)
  ↓
handle_event for user actions
  ↓
PubSub for real-time broadcasts
```

**Benefits**:
- Simpler mental model (no client-side state management)
- Built-in real-time via Phoenix Channels
- Server-authoritative game state (no client cheating)

## Testing Strategy

1. **Unit tests** - Test GenServer game logic
2. **Integration tests** - Test LiveView mount/events
3. **E2E tests** - Use Wallaby for browser automation
4. **Visual regression** - Compare screenshots to React app

## Migration Checklist

### Phase 3: Layout ✅ (Start Here)
- [ ] Copy theme CSS files from React app
- [ ] Create app.html.heex layout
- [ ] Create Header component in core_components.ex
- [ ] Create Footer component
- [ ] Test theme switching works

### Phase 4: Core Pages
- [ ] Home page (static content)
- [ ] Lobby page (game browser)
- [ ] Game lobby room (join/ready)
- [ ] Create game page

### Phase 5: Game Room
- [ ] Break down GameRoom.tsx into components
- [ ] Implement game board rendering
- [ ] Implement turn phases
- [ ] Implement chat/logs

### Phase 6: Auth & Settings
- [ ] Login/Register
- [ ] Settings page
- [ ] Email verification

### Phase 7: Additional
- [ ] Dashboard, Stats, Maps
- [ ] Friends, Clans
- [ ] Admin pages

## Next Steps

1. **Copy CSS** - Copy `frontend/src/app.css` and `frontend/src/themes/` to `elixir_risk/assets/css/`
2. **Create Layout** - Build `app.html.heex` with Header/Footer
3. **Home Page** - Recreate Home.tsx as first LiveView page
4. **Lobby Page** - Recreate LobbyPage.tsx with all 3 tabs
5. **Game Flow** - Connect lobby → game room → gameplay

## Questions for Connor

Before proceeding with Phase 3, confirm:

1. **CSS Strategy**: Should we copy the entire React CSS or build Tailwind classes from scratch?
   - **Recommendation**: Copy CSS to maintain exact visual parity
2. **Authentication**: Do we need to implement Phoenix auth now or mock it?
   - **Recommendation**: Use `mix phx.gen.auth` for Users context
3. **Asset CDN**: Do we need to configure R2 for Elixir or can we reference React assets?
   - **Recommendation**: Share CDN, configure `VITE_ASSET_BASE_URL` equivalent
4. **Deployment**: Should Elixir app live on a subdomain (e.g., `elixir.conquestk.com`)?
   - **Recommendation**: Yes, keep Node.js prod running during migration

## Success Criteria

LiveView pages should:
- ✅ Look identical to React pages (pixel-perfect match)
- ✅ Use exact same CSS classes and theme system
- ✅ Support all 12+ themes
- ✅ Be fully responsive (mobile/tablet/desktop)
- ✅ Have real-time updates via PubSub
- ✅ Match React Router URLs exactly
- ✅ Pass accessibility checks (ARIA, keyboard nav)
- ✅ Load faster than React (no JS bundle)
