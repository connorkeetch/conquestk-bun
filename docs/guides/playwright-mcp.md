# 🎭 Playwright MCP Tools Documentation

## Overview
The Playwright MCP server provides browser automation capabilities directly within Claude. This allows for automated testing, web scraping, and browser interaction without leaving the Claude environment.

## Available Tools

### 🌐 puppeteer_navigate
**Purpose**: Navigate to a URL in the browser
```
mcp__puppeteer__puppeteer_navigate
Parameters:
- url: string (required) - The URL to navigate to
- launchOptions: object (optional) - PuppeteerJS launch options
- allowDangerous: boolean (optional) - Allow dangerous launch options like --no-sandbox
```
**When to use**: 
- Starting a browser session
- Loading a web page for testing
- Navigating between pages in your app

### 📸 puppeteer_screenshot
**Purpose**: Capture screenshots of the current page or specific elements
```
mcp__puppeteer__puppeteer_screenshot
Parameters:
- name: string (required) - Name for the screenshot
- selector: string (optional) - CSS selector for element to screenshot
- width: number (optional, default: 800) - Width in pixels
- height: number (optional, default: 600) - Height in pixels
- encoded: boolean (optional) - Return as base64 data URI instead of binary
```
**When to use**:
- Visual regression testing
- Capturing UI states for documentation
- Debugging visual issues
- Creating before/after comparisons

### 🖱️ puppeteer_click
**Purpose**: Click on page elements
```
mcp__puppeteer__puppeteer_click
Parameters:
- selector: string (required) - CSS selector for element to click
```
**When to use**:
- Testing button interactions
- Navigating through UI flows
- Triggering actions in the app
- Testing game controls (like deploying armies, attacking)

### ✏️ puppeteer_fill
**Purpose**: Fill out input fields
```
mcp__puppeteer__puppeteer_fill
Parameters:
- selector: string (required) - CSS selector for input field
- value: string (required) - Value to fill
```
**When to use**:
- Testing form submissions
- Entering game names or settings
- Testing login/registration flows
- Inputting test data

### 📝 puppeteer_select
**Purpose**: Select options from dropdown menus
```
mcp__puppeteer__puppeteer_select
Parameters:
- selector: string (required) - CSS selector for select element
- value: string (required) - Value to select
```
**When to use**:
- Testing dropdown menus
- Selecting game settings
- Testing filter options (like tier selection in leaderboards)

### 👆 puppeteer_hover
**Purpose**: Hover over elements
```
mcp__puppeteer__puppeteer_hover
Parameters:
- selector: string (required) - CSS selector for element to hover
```
**When to use**:
- Testing hover effects
- Triggering tooltips
- Testing territory hover effects in the game map

### 💻 puppeteer_evaluate
**Purpose**: Execute JavaScript in the browser console
```
mcp__puppeteer__puppeteer_evaluate
Parameters:
- script: string (required) - JavaScript code to execute
```
**When to use**:
- Checking application state
- Manipulating the DOM for testing
- Accessing browser APIs
- Getting computed styles or values

## Risk Game Testing Examples

### Example 1: Testing Game Creation with Ranked Mode
```javascript
// Navigate to the game
await puppeteer_navigate({ url: 'http://localhost:5173' })

// Click create game button
await puppeteer_click({ selector: 'button:contains("Create Game")' })

// Fill in game name
await puppeteer_fill({ 
  selector: 'input[placeholder="Enter game name"]', 
  value: 'Test Ranked Game' 
})

// Enable ranked mode
await puppeteer_click({ selector: 'input[type="checkbox"]#ranked' })

// Set player count
await puppeteer_click({ selector: 'button:contains("4")' })

// Take screenshot of configured game
await puppeteer_screenshot({ 
  name: 'ranked-game-setup',
  selector: '.game-creation-form'
})

// Create the game
await puppeteer_click({ selector: 'button:contains("Create Game")' })
```

### Example 2: Testing Leaderboard Functionality
```javascript
// Navigate to leaderboards
await puppeteer_navigate({ url: 'http://localhost:5173/leaderboards/skill' })

// Test tier filtering
await puppeteer_click({ selector: 'button:contains("Platinum")' })

// Screenshot filtered results
await puppeteer_screenshot({ 
  name: 'platinum-tier-leaderboard',
  selector: '.leaderboard-table'
})

// Test pagination
await puppeteer_click({ selector: 'button:contains("Next")' })

// Verify results updated
await puppeteer_evaluate({ 
  script: 'document.querySelector(".page-indicator").textContent' 
})
```

### Example 3: Visual Regression Testing for Components
```javascript
// Test SkillTierBadge rendering
await puppeteer_navigate({ url: 'http://localhost:5173/profile/user123' })

// Screenshot skill badge
await puppeteer_screenshot({
  name: 'skill-tier-badge-gold',
  selector: '.skill-tier-badge'
})

// Test progress bar
await puppeteer_screenshot({
  name: 'skill-progress-bar',
  selector: '.skill-progress-bar'
})
```

### Example 4: Testing Game Interactions
```javascript
// Join a game room
await puppeteer_navigate({ url: 'http://localhost:5173/room/abc123' })

// Deploy armies
await puppeteer_click({ selector: '.territory#alaska' })
await puppeteer_fill({ selector: 'input.deploy-count', value: '3' })
await puppeteer_click({ selector: 'button:contains("Deploy")' })

// Test attack
await puppeteer_click({ selector: '.territory#alaska' })
await puppeteer_click({ selector: '.territory#kamchatka' })
await puppeteer_click({ selector: 'button:contains("Attack")' })

// Capture battle result
await puppeteer_screenshot({
  name: 'battle-result',
  selector: '.battle-modal'
})
```

## Best Practices

### 1. **Always Start with Navigation**
Begin each test session by navigating to the correct URL to ensure a clean state.

### 2. **Use Specific Selectors**
Prefer IDs and data-testid attributes over generic class selectors for reliability.

### 3. **Add Wait Conditions**
For dynamic content, use evaluate to check if elements exist before interacting:
```javascript
await puppeteer_evaluate({
  script: 'document.querySelector(".loading-spinner") === null'
})
```

### 4. **Capture Screenshots Liberally**
Document each major state change with screenshots for debugging and verification.

### 5. **Test Different Viewports**
Test responsive design by setting different viewport sizes:
```javascript
await puppeteer_screenshot({
  name: 'mobile-view',
  width: 375,
  height: 667
})
```

### 6. **Clean Up State**
When testing game flows, ensure you reset or clean up state between tests.

## Common Testing Scenarios for Risk Game

1. **User Authentication Flow**
   - Register new account
   - Login with credentials
   - Password reset flow

2. **Game Lobby**
   - Create public/private games
   - Join existing games
   - View active games list

3. **Ranked System**
   - Create ranked game with restrictions
   - View skill rating changes
   - Navigate leaderboards
   - Check tier progression

4. **Gameplay**
   - Territory selection
   - Army deployment
   - Attack sequences
   - Fortification moves
   - End turn actions

5. **Map Editor**
   - Upload custom maps
   - Edit territories
   - Set adjacencies
   - Test map validation

6. **Profile & Stats**
   - View user profiles
   - Check game history
   - View rating history graph

## Troubleshooting

### Browser Not Launching
If Playwright fails to launch, try using `allowDangerous: true` in launchOptions:
```javascript
await puppeteer_navigate({
  url: 'http://localhost:5173',
  allowDangerous: true,
  launchOptions: { headless: false }
})
```

### Element Not Found
Ensure the page has loaded and elements are rendered:
1. Add delays if needed
2. Use more specific selectors
3. Check if element is in viewport

### Screenshot Issues
- Ensure sufficient width/height for full content
- Use element selectors for specific components
- Set encoded: true for base64 output if needed

## Integration with Development Workflow

The Playwright MCP tools are perfect for:

1. **Pre-commit Testing**: Run visual tests before committing
2. **Feature Verification**: Test new features as you develop
3. **Bug Reproduction**: Capture exact steps to reproduce issues
4. **Documentation**: Generate screenshots for docs
5. **Cross-browser Testing**: Test in different browser contexts

Remember: These tools run in a real browser environment, so they can test actual user interactions, JavaScript execution, and visual rendering - making them invaluable for comprehensive testing of the Risk game.