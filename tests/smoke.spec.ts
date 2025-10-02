import { expect, test } from '@playwright/test'

test.describe('Landing page smoke', () => {
  test('renders hero copy and primary CTA', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /Strategic Warfare/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Join the War/i })).toBeVisible()
  })
})
