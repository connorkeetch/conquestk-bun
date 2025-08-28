# 📋 Risk Game - Development TODO List

## 🔴 Priority 1 - Immediate Needs

### Audio System
- [ ] **Replace placeholder audio files with real sounds**
  - [ ] Dice roll sound effect
  - [ ] Victory/defeat battle sounds
  - [ ] Territory capture sound
  - [ ] Turn notification sound
  - [ ] Game start fanfare
  - [ ] 5 background music tracks (epic orchestral)
  - [ ] Player elimination sound
  - [ ] Chat message notification sound
  - [ ] Error/invalid move sound
  - **Resources**: Suno AI, Freesound.org, OpenGameArt

### Game Creation UI Improvements
- [ ] **Change randomize from checkbox to button**
  - [ ] Convert to action button "Randomize Settings"
  - [ ] One-click randomization of all unlocked settings
  
- [ ] **Add lock buttons for each setting**
  - [ ] Lock icon next to each setting
  - [ ] Prevents that setting from being randomized
  - [ ] Visual indicator when locked
  
- [ ] **Game name improvements**
  - [ ] Show placeholder "Game_[random_id]" during creation
  - [ ] Auto-generate descriptive name after creation
  - [ ] Format: "[PlayerCount]P [Mode] - [Map]"
  - [ ] Example: "6P FFA - Classic World"

### Fog of War Enhancements
- [ ] **Two fog modes**
  - [ ] "Persistent Vision" - Once seen, stays visible
  - [ ] "Adjacent Only" - Only see adjacent territories
  - [ ] Add toggle in game settings
  - [ ] Visual indicators for fog coverage

### Movement System Overhaul
- [ ] **Four movement types**
  1. [ ] "Adjacent Single" - Move to one adjacent territory
  2. [ ] "Adjacent Multiple" - Move to adjacent, but each troop can only move once
  3. [ ] "Chain Single" - Move through connected owned territories (one move)
  4. [ ] "Chain Unlimited" - Move through connected owned territories (unlimited)
  - [ ] Track which troops have moved (for type 2)
  - [ ] UI indicators for moved vs unmoved troops

### Player Colors
- [ ] **Add 6 additional distinct colors**
  - [ ] Current: Red, Blue, Green, Yellow, Purple, Orange
  - [ ] Add: Cyan, Pink, Brown, Lime, Teal, Indigo
  - [ますVisual color picker in game creation
  - [ ] High contrast requirements for accessibility

### Turn Time Limits
- [ ] **Add timer system**
  - [ ] Real-time games: 5, 10 minutes
  - [ ] Async games: 6, 12, 24 hours
  - [ ] Setting in game creation (at the top)
  - [ ] Visual countdown timer during turn
  - [ ] Auto-end turn when time expires
  - [ ] Warning notifications at 1 minute/1 hour remaining

## 🟡 Priority 2 - UI/UX Improvements

### Notification System
- [ ] **Notification dropdown (top right)**
  - [ ] Bell icon with unread count badge
  - [ ] Dropdown panel with notification list
  - [ ] Notification types:
    - [ ] Game invites
    - [ ] Your turn alerts
    - [ ] Turn timer warnings
    - [ ] Messages received
    - [ ] Game ended
    - [ ] Achievement unlocked
  - [ ] Mark as read functionality
  - [ ] Clear all button

### Navigation Updates
- [ ] **Profile button improvements**
  - [ ] Make username clickable → profile
  - [ ] Remove "Profile" from main nav
  - [ ] Remove from hamburger menu
  - [ ] Add dropdown on username click with:
    - [ ] View Profile
    - [ ] Settings
    - [ ] Logout

## 🟢 Priority 3 - Features & Enhancements

### Completed Features (Reference)
- [x] Command Points (ELO) system
- [x] Skill tiers and leaderboards
- [x] Audio system infrastructure
- [x] Ranked matchmaking
- [x] Settings persistence

### Future Enhancements
- [ ] Spectator mode
- [ ] Replay system
- [ ] Tournament brackets
- [ ] Custom map editor (visual)
- [ ] Alliance/diplomacy system
- [ ] Card trading system
- [ ] AI opponents
- [ ] Mobile app
- [ ] Discord integration

## 🔧 Technical Debt

- [ ] Add comprehensive error boundaries
- [ ] Implement proper WebSocket reconnection
- [ ] Add database indexes for performance
- [ ] Set up CI/CD pipeline
- [ ] Add E2E tests with Playwright
- [ ] Implement rate limiting on all endpoints
- [ ] Add request validation middleware
- [ ] Set up monitoring/alerting (Sentry)
- [ ] Database backup automation

## 📝 Documentation Needs

- [ ] API documentation (OpenAPI/Swagger)
- [ ] Deployment guide updates
- [ ] Contributing guidelines
- [ ] Game rules documentation
- [ ] Video tutorials

## 🐛 Known Bugs

- [ ] Socket reconnection sometimes loses game state
- [ ] Mobile viewport issues on game board
- [ ] Chat messages sometimes appear duplicated
- [ ] Rating change animation can overlap

## 💡 Ideas for Discussion

- **Progressive Web App** - Offline play capability?
- **Seasons/Leagues** - Reset ratings periodically?
- **Achievements System** - Badges and rewards?
- **Friends List** - Social features?
- **Game Modes** - Capture the flag? King of the hill?
- **Power-ups** - Temporary advantages?
- **Daily Challenges** - Engagement features?

---

## 📅 Sprint Planning

### Current Sprint (Priority 1 items)
1. Game creation UI improvements (randomize button, locks)
2. Game naming system
3. Fog of war modes
4. Movement system types
5. Additional player colors
6. Turn timer system
7. Notification dropdown
8. Navigation cleanup

### Next Sprint
- Audio file acquisition and integration
- Testing and bug fixes
- Performance optimization

---

*Last Updated: August 27, 2025*
*Use this document to track progress and collaborate on remaining work*