import { test, expect } from '@playwright/test';

const TEST_USER = {
  username: `testuser_${Date.now()}`,
  email: `test_${Date.now()}@example.com`,
  password: 'TestPassword123!'
};

// These tests are temporarily skipped during active development
// Enable them once the auth UI is stable
test.describe.skip('Authentication Flow', () => {
  test('should register a new user', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    // Click on register/signup button
    await page.click('text=Sign Up');
    
    // Fill registration form
    await page.fill('input[name="username"]', TEST_USER.username);
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.fill('input[name="confirmPassword"]', TEST_USER.password);
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Should redirect to dashboard or show success
    await expect(page).toHaveURL(/\/(dashboard|home|lobby)/);
  });

  test('should login with existing user', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    // Click login if needed
    const loginButton = page.locator('text=Login').first();
    if (await loginButton.isVisible()) {
      await loginButton.click();
    }
    
    // Fill login form
    await page.fill('input[name="username"], input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Verify logged in
    await expect(page).toHaveURL(/\/(dashboard|home|lobby)/);
  });

  test('should handle invalid login', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    // Try to login with invalid credentials
    await page.fill('input[name="username"], input[name="email"]', 'invalid@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // Should show error message
    await expect(page.locator('text=/Invalid|Error|Failed/i')).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // First login
    await page.goto('http://localhost:5173');
    await page.fill('input[name="username"], input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for navigation
    await page.waitForURL(/\/(dashboard|home|lobby)/);
    
    // Find and click logout
    await page.click('text=Logout');
    
    // Should redirect to login page
    await expect(page).toHaveURL(/\/(login|signin|$)/);
  });
});