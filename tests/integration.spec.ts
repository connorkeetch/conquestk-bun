import { test, expect } from '@playwright/test';

test.describe('Basic Integration Tests', () => {
  test('frontend should be accessible', async ({ page }) => {
    const response = await page.goto('http://localhost:5173');
    expect(response?.status()).toBeLessThan(400);
    
    // Check that React app loads
    await expect(page.locator('#root')).toBeVisible();
  });

  test('backend API should be accessible', async ({ request }) => {
    const response = await request.get('http://localhost:5001/api/health');
    expect(response.status()).toBeLessThan(500);
  });

  test('should load the main application', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    // Wait for React to render
    await page.waitForLoadState('networkidle');
    
    // Check for any main content
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('backend should handle CORS properly', async ({ request }) => {
    const response = await request.get('http://localhost:5001/api/health', {
      headers: {
        'Origin': 'http://localhost:5173'
      }
    });
    
    const headers = response.headers();
    expect(headers['access-control-allow-origin']).toBeTruthy();
  });

  test('should check Redis connection via API', async ({ request }) => {
    // Try to access a protected endpoint to trigger session check
    const response = await request.get('http://localhost:5001/api/auth/me');
    
    // Even if unauthorized, it should respond (not crash)
    expect([401, 403, 200]).toContain(response.status());
  });

  test('should verify WebSocket endpoint exists', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    // Check if Socket.io client script loads
    const socketScriptExists = await page.evaluate(() => {
      return typeof io !== 'undefined' || 
             document.querySelector('script[src*="socket.io"]') !== null;
    });
    
    expect(socketScriptExists).toBeTruthy();
  });
});