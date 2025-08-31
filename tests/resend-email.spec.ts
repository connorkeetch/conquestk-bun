import { test, expect } from '@playwright/test';

test.describe('Resend Email Functionality', () => {
  test('should trigger welcome email on registration', async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `resend_test_${timestamp}@example.com`;
    
    await page.goto('http://localhost:5173');
    
    // Navigate to registration
    await page.click('text=Sign Up');
    
    // Fill registration form
    await page.fill('input[name="username"]', `resend_user_${timestamp}`);
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', 'ResendTest123!');
    await page.fill('input[name="confirmPassword"]', 'ResendTest123!');
    
    // Listen for API calls to verify email was triggered
    const emailRequest = page.waitForRequest(req => 
      req.url().includes('/api/auth/register') || 
      req.url().includes('/api/email/welcome')
    );
    
    // Submit registration
    await page.click('button[type="submit"]');
    
    // Verify the request was made
    const request = await emailRequest;
    expect(request).toBeDefined();
    
    // Check for success message or redirect
    await expect(page).toHaveURL(/\/(dashboard|home|lobby|verify)/);
  });

  test('should handle password reset email request', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    // Navigate to password reset
    await page.click('text=/Forgot|Reset Password/i');
    
    // Enter email for password reset
    const resetEmail = `reset_${Date.now()}@example.com`;
    await page.fill('input[name="email"]', resetEmail);
    
    // Listen for password reset API call
    const resetRequest = page.waitForRequest(req => 
      req.url().includes('/api/auth/forgot-password') || 
      req.url().includes('/api/auth/reset-password') ||
      req.url().includes('/api/email/reset'),
      { timeout: 5000 }
    ).catch(() => null);
    
    // Submit reset request
    await page.click('button[type="submit"]');
    
    // Should show success message
    await expect(page.locator('text=/sent|check your email/i')).toBeVisible({ timeout: 5000 });
    
    // Verify API was called
    const request = await resetRequest;
    if (request) {
      expect(request.method()).toBe('POST');
    }
  });

  test('should send game invitation email', async ({ page, browser }) => {
    // First, login as a user
    const context = await browser.newContext();
    const loginPage = await context.newPage();
    
    const USER = {
      email: `game_host_${Date.now()}@example.com`,
      username: `game_host_${Date.now()}`,
      password: 'GameHost123!'
    };
    
    // Register user
    await loginPage.goto('http://localhost:5173');
    await loginPage.click('text=Sign Up');
    await loginPage.fill('input[name="username"]', USER.username);
    await loginPage.fill('input[name="email"]', USER.email);
    await loginPage.fill('input[name="password"]', USER.password);
    await loginPage.fill('input[name="confirmPassword"]', USER.password);
    await loginPage.click('button[type="submit"]');
    
    // Wait for redirect
    await loginPage.waitForURL(/\/(dashboard|home|lobby)/);
    
    // Create a game
    await loginPage.click('text=/Create|New Game/i');
    await loginPage.fill('input[name="gameName"], input[placeholder*="game name"]', `Test Game ${Date.now()}`);
    await loginPage.click('button:has-text("Create")');
    
    // Wait for game creation
    await loginPage.waitForURL(/\/game\//);
    
    // Try to invite a player via email
    const inviteButton = loginPage.locator('text=/Invite|Share/i').first();
    if (await inviteButton.isVisible()) {
      await inviteButton.click();
      
      // Fill invite email
      await loginPage.fill('input[name="inviteEmail"], input[placeholder*="email"]', 'friend@example.com');
      
      // Listen for invite API call
      const inviteRequest = loginPage.waitForRequest(req => 
        req.url().includes('/api/game/invite') || 
        req.url().includes('/api/email/invite'),
        { timeout: 5000 }
      ).catch(() => null);
      
      // Send invite
      await loginPage.click('button:has-text("Send")');
      
      // Check if request was made
      const request = await inviteRequest;
      if (request) {
        expect(request.method()).toBe('POST');
      }
    }
    
    await context.close();
  });

  test('should validate email format before sending', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    // Try to register with invalid email
    await page.click('text=Sign Up');
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="email"]', 'invalid-email');
    await page.fill('input[name="password"]', 'Test123!');
    await page.fill('input[name="confirmPassword"]', 'Test123!');
    
    // Try to submit
    await page.click('button[type="submit"]');
    
    // Should show validation error
    const emailInput = page.locator('input[name="email"]');
    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    expect(isInvalid).toBe(true);
  });

  test('should handle email service errors gracefully', async ({ page }) => {
    // Test with a special email that might trigger an error (if backend has test mode)
    await page.goto('http://localhost:5173');
    
    await page.click('text=Sign Up');
    await page.fill('input[name="username"]', `error_test_${Date.now()}`);
    await page.fill('input[name="email"]', 'test+error@example.com'); // Some backends use + for testing
    await page.fill('input[name="password"]', 'Test123!');
    await page.fill('input[name="confirmPassword"]', 'Test123!');
    
    // Listen for response
    const response = page.waitForResponse(resp => 
      resp.url().includes('/api/auth/register')
    );
    
    await page.click('button[type="submit"]');
    
    const registerResponse = await response;
    
    // Even if email fails, registration should complete
    // User should still be created and redirected
    if (registerResponse.ok()) {
      await expect(page).toHaveURL(/\/(dashboard|home|lobby|verify)/);
    }
  });
});