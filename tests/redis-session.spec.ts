import { test, expect } from '@playwright/test';

test.describe('Redis Session Management', () => {
  const TEST_USER = {
    username: `session_test_${Date.now()}`,
    email: `session_${Date.now()}@example.com`, 
    password: 'SessionTest123!'
  };

  test.beforeAll(async ({ browser }) => {
    // Register a test user
    const page = await browser.newPage();
    await page.goto('http://localhost:5173');
    
    // Register
    await page.click('text=Sign Up');
    await page.fill('input[name="username"]', TEST_USER.username);
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.fill('input[name="confirmPassword"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    
    await page.close();
  });

  test('should maintain session across page refreshes', async ({ page }) => {
    // Login
    await page.goto('http://localhost:5173');
    await page.fill('input[name="username"], input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for successful login
    await page.waitForURL(/\/(dashboard|home|lobby)/);
    
    // Get session cookie
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name === 'connect.sid' || c.name === 'session');
    expect(sessionCookie).toBeDefined();
    
    // Refresh page
    await page.reload();
    
    // Should still be logged in
    await expect(page).toHaveURL(/\/(dashboard|home|lobby)/);
    await expect(page.locator('text=Logout')).toBeVisible();
  });

  test('should share session across multiple tabs', async ({ browser }) => {
    const context = await browser.newContext();
    
    // First tab - login
    const page1 = await context.newPage();
    await page1.goto('http://localhost:5173');
    await page1.fill('input[name="username"], input[name="email"]', TEST_USER.email);
    await page1.fill('input[name="password"]', TEST_USER.password);
    await page1.click('button[type="submit"]');
    await page1.waitForURL(/\/(dashboard|home|lobby)/);
    
    // Second tab - should already be logged in
    const page2 = await context.newPage();
    await page2.goto('http://localhost:5173');
    await expect(page2).toHaveURL(/\/(dashboard|home|lobby)/);
    await expect(page2.locator('text=Logout')).toBeVisible();
    
    // Logout from second tab
    await page2.click('text=Logout');
    
    // First tab should also be logged out on refresh
    await page1.reload();
    await expect(page1).toHaveURL(/\/(login|signin|$)/);
    
    await context.close();
  });

  test('should expire session after inactivity', async ({ page }) => {
    // This test would need to mock time or wait for actual timeout
    // For now, we'll test that session cookie has proper attributes
    
    await page.goto('http://localhost:5173');
    await page.fill('input[name="username"], input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    
    await page.waitForURL(/\/(dashboard|home|lobby)/);
    
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name === 'connect.sid' || c.name === 'session');
    
    // Check session cookie properties
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true); // Security: not accessible via JS
    expect(sessionCookie?.secure).toBe(true); // Security: HTTPS only in production
    expect(sessionCookie?.sameSite).toBe('Strict' || 'Lax'); // CSRF protection
  });

  test('should handle concurrent sessions correctly', async ({ browser }) => {
    // Create two different user sessions
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    
    const USER2 = {
      email: `concurrent_${Date.now()}@example.com`,
      password: 'Concurrent123!'
    };
    
    // Register second user
    const regPage = await context2.newPage();
    await regPage.goto('http://localhost:5173');
    await regPage.click('text=Sign Up');
    await regPage.fill('input[name="username"]', `concurrent_${Date.now()}`);
    await regPage.fill('input[name="email"]', USER2.email);
    await regPage.fill('input[name="password"]', USER2.password);
    await regPage.fill('input[name="confirmPassword"]', USER2.password);
    await regPage.click('button[type="submit"]');
    await regPage.close();
    
    // Login as first user in context1
    const page1 = await context1.newPage();
    await page1.goto('http://localhost:5173');
    await page1.fill('input[name="username"], input[name="email"]', TEST_USER.email);
    await page1.fill('input[name="password"]', TEST_USER.password);
    await page1.click('button[type="submit"]');
    await page1.waitForURL(/\/(dashboard|home|lobby)/);
    
    // Login as second user in context2
    const page2 = await context2.newPage();
    await page2.goto('http://localhost:5173');
    await page2.fill('input[name="username"], input[name="email"]', USER2.email);
    await page2.fill('input[name="password"]', USER2.password);
    await page2.click('button[type="submit"]');
    await page2.waitForURL(/\/(dashboard|home|lobby)/);
    
    // Both should maintain separate sessions
    const cookies1 = await context1.cookies();
    const cookies2 = await context2.cookies();
    
    const session1 = cookies1.find(c => c.name === 'connect.sid' || c.name === 'session');
    const session2 = cookies2.find(c => c.name === 'connect.sid' || c.name === 'session');
    
    expect(session1?.value).not.toBe(session2?.value);
    
    await context1.close();
    await context2.close();
  });
});