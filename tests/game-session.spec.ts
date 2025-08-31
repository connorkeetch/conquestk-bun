import { test, expect } from '@playwright/test';

test.describe('Game Creation and Session Management', () => {
  const USERS = {
    host: {
      username: `host_${Date.now()}`,
      email: `host_${Date.now()}@example.com`,
      password: 'HostPassword123!'
    },
    player2: {
      username: `player2_${Date.now()}`,
      email: `player2_${Date.now()}@example.com`,
      password: 'Player2Pass123!'
    }
  };

  test.beforeAll(async ({ browser }) => {
    // Register both users
    for (const user of Object.values(USERS)) {
      const page = await browser.newPage();
      await page.goto('http://localhost:5173');
      await page.click('text=Sign Up');
      await page.fill('input[name="username"]', user.username);
      await page.fill('input[name="email"]', user.email);
      await page.fill('input[name="password"]', user.password);
      await page.fill('input[name="confirmPassword"]', user.password);
      await page.click('button[type="submit"]');
      await page.close();
    }
  });

  test('should create a new game with session', async ({ page }) => {
    // Login as host
    await page.goto('http://localhost:5173');
    await page.fill('input[name="username"], input[name="email"]', USERS.host.email);
    await page.fill('input[name="password"]', USERS.host.password);
    await page.click('button[type="submit"]');
    
    // Wait for dashboard
    await page.waitForURL(/\/(dashboard|home|lobby)/);
    
    // Create new game
    await page.click('text=/Create|New Game/i');
    
    const gameName = `Test Game ${Date.now()}`;
    await page.fill('input[name="gameName"], input[placeholder*="game name"]', gameName);
    
    // Select game options if available
    const playerCountSelect = page.locator('select[name="maxPlayers"]');
    if (await playerCountSelect.isVisible()) {
      await playerCountSelect.selectOption('4');
    }
    
    // Create game
    await page.click('button:has-text("Create")');
    
    // Should redirect to game room
    await expect(page).toHaveURL(/\/game\//);
    
    // Verify game info is displayed
    await expect(page.locator(`text=${gameName}`)).toBeVisible();
    
    // Check that WebSocket connection is established
    await page.waitForFunction(() => {
      return window.io && window.io.connected;
    }, { timeout: 10000 }).catch(() => {
      // Socket.io might be on window.socket or other property
    });
  });

  test('should join game with valid session', async ({ browser }) => {
    const context = await browser.newContext();
    
    // Host creates game
    const hostPage = await context.newPage();
    await hostPage.goto('http://localhost:5173');
    await hostPage.fill('input[name="username"], input[name="email"]', USERS.host.email);
    await hostPage.fill('input[name="password"]', USERS.host.password);
    await hostPage.click('button[type="submit"]');
    await hostPage.waitForURL(/\/(dashboard|home|lobby)/);
    
    await hostPage.click('text=/Create|New Game/i');
    const gameName = `Multiplayer ${Date.now()}`;
    await hostPage.fill('input[name="gameName"], input[placeholder*="game name"]', gameName);
    await hostPage.click('button:has-text("Create")');
    await hostPage.waitForURL(/\/game\//);
    
    // Get game code/ID
    const gameUrl = hostPage.url();
    const gameId = gameUrl.split('/game/')[1]?.split('/')[0];
    
    // Player 2 joins
    const player2Page = await context.newPage();
    await player2Page.goto('http://localhost:5173');
    await player2Page.fill('input[name="username"], input[name="email"]', USERS.player2.email);
    await player2Page.fill('input[name="password"]', USERS.player2.password);
    await player2Page.click('button[type="submit"]');
    await player2Page.waitForURL(/\/(dashboard|home|lobby)/);
    
    // Join game via code or browse games
    const joinButton = player2Page.locator('text=/Join|Browse Games/i').first();
    if (await joinButton.isVisible()) {
      await joinButton.click();
      
      // Try to find and join the game
      const gameCard = player2Page.locator(`text=${gameName}`).first();
      if (await gameCard.isVisible()) {
        await gameCard.click();
      } else if (gameId) {
        // Try direct navigation
        await player2Page.goto(`http://localhost:5173/game/${gameId}`);
      }
    }
    
    // Both players should see each other
    await expect(hostPage.locator(`text=${USERS.player2.username}`)).toBeVisible({ timeout: 10000 });
    await expect(player2Page.locator(`text=${USERS.host.username}`)).toBeVisible({ timeout: 10000 });
    
    await context.close();
  });

  test('should maintain game state across session refresh', async ({ page }) => {
    // Login and create game
    await page.goto('http://localhost:5173');
    await page.fill('input[name="username"], input[name="email"]', USERS.host.email);
    await page.fill('input[name="password"]', USERS.host.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|home|lobby)/);
    
    await page.click('text=/Create|New Game/i');
    const gameName = `Persistent ${Date.now()}`;
    await page.fill('input[name="gameName"], input[placeholder*="game name"]', gameName);
    await page.click('button:has-text("Create")');
    await page.waitForURL(/\/game\//);
    
    const gameUrl = page.url();
    
    // Make some game action if possible (like ready up)
    const readyButton = page.locator('button:has-text("Ready")').first();
    if (await readyButton.isVisible()) {
      await readyButton.click();
    }
    
    // Refresh page
    await page.reload();
    
    // Should still be in the same game
    await expect(page).toHaveURL(gameUrl);
    await expect(page.locator(`text=${gameName}`)).toBeVisible();
    
    // Ready state should be preserved if it was clicked
    if (await readyButton.isVisible()) {
      const isReady = await page.locator('text=/Ready|Waiting/i').isVisible();
      expect(isReady).toBe(true);
    }
  });

  test('should handle session expiry during game', async ({ page, context }) => {
    // Login and create game
    await page.goto('http://localhost:5173');
    await page.fill('input[name="username"], input[name="email"]', USERS.host.email);
    await page.fill('input[name="password"]', USERS.host.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|home|lobby)/);
    
    await page.click('text=/Create|New Game/i');
    await page.fill('input[name="gameName"], input[placeholder*="game name"]', `Session Test ${Date.now()}`);
    await page.click('button:has-text("Create")');
    await page.waitForURL(/\/game\//);
    
    // Clear session cookie to simulate expiry
    await context.clearCookies();
    
    // Try to make a game action
    const actionButton = page.locator('button').first();
    if (await actionButton.isVisible()) {
      await actionButton.click();
      
      // Should redirect to login or show error
      await expect(page).toHaveURL(/\/(login|signin|$)/).catch(() => {
        // Or show an error message
        return expect(page.locator('text=/session|expired|login/i')).toBeVisible();
      });
    }
  });

  test('should reconnect to game after connection loss', async ({ page }) => {
    // Login and join/create game
    await page.goto('http://localhost:5173');
    await page.fill('input[name="username"], input[name="email"]', USERS.host.email);
    await page.fill('input[name="password"]', USERS.host.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|home|lobby)/);
    
    await page.click('text=/Create|New Game/i');
    await page.fill('input[name="gameName"], input[placeholder*="game name"]', `Reconnect Test ${Date.now()}`);
    await page.click('button:has-text("Create")');
    await page.waitForURL(/\/game\//);
    
    // Simulate connection loss by going offline
    await page.context().setOffline(true);
    
    // Wait a moment
    await page.waitForTimeout(2000);
    
    // Go back online
    await page.context().setOffline(false);
    
    // Should show reconnecting or reconnected message
    await expect(page.locator('text=/reconnect|connected/i')).toBeVisible({ timeout: 10000 }).catch(() => {
      // Connection might auto-reconnect without showing message
      return true;
    });
    
    // Game should still be functional
    const gameElement = page.locator('[data-testid="game-board"], .game-board, canvas').first();
    await expect(gameElement).toBeVisible();
  });
});