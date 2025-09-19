import { expect, test } from '@playwright/test'

test.describe('Smoke Tests - Basic App Functionality', () => {
  test('app should load successfully', async ({ page }) => {
    // Navigate to the app
    await page.goto('/')

    // Wait for the app to load
    await page.waitForLoadState('networkidle')

    // Check that the app title is visible
    await expect(page).toHaveTitle(/ConquestK|Risk/i)

    // Check for main app container or navigation
    const appContainer = page.locator('#root, .app, [data-testid="app-container"]').first()
    await expect(appContainer).toBeVisible()
  })

  test('navigation should be present', async ({ page }) => {
    await page.goto('/')

    // Check for navigation elements
    const navElement = page.locator('nav, header, [role="navigation"]').first()
    await expect(navElement).toBeVisible()
  })

  test('should show login/register options when not authenticated', async ({ page }) => {
    await page.goto('/')

    // Look for login or register buttons/links
    const authOptions = page.locator('text=/Login|Sign In|Register|Sign Up/i').first()
    await expect(authOptions).toBeVisible({ timeout: 10000 })
  })

  test('should handle 404 pages gracefully', async ({ page }) => {
    // Navigate to a non-existent page
    await page.goto('/this-page-does-not-exist-404')

    // Should show some indication of 404 or redirect to home
    await expect(page).toHaveURL(/\/(404|home|$)/)
  })
})

test.describe('Critical Path Tests', () => {
  test.skip('should allow game creation', async ({ page }) => {
    // Skip for now - implement when auth is stable
    await page.goto('/')

    // This would test the game creation flow
    // Add implementation when ready
  })

  test.skip('should display leaderboards', async ({ page }) => {
    // Skip for now - implement when leaderboards are stable
    await page.goto('/leaderboards')

    // This would test leaderboard display
    // Add implementation when ready
  })
})
