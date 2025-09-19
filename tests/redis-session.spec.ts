import { expect, test } from '@playwright/test'

test.describe('Redis Session Management', () => {
  const TEST_USER = {
    username: `session_test_${Date.now()}`,
    email: `session_${Date.now()}@example.com`,
    password: 'SessionTest123!',
  }

  test.beforeAll(async ({ browser }) => {
    // Register a test user
    const page = await browser.newPage()
    await page.goto('http://localhost:5173')

    await page.click('text=Sign Up')
    await page.fill('input[name="username"]', TEST_USER.username)
    await page.fill('input[name="email"]', TEST_USER.email)
    await page.fill('input[name="password"]', TEST_USER.password)
    await page.fill('input[name="confirmPassword"]', TEST_USER.password)
    await page.click('button[type="submit"]')

    await page.close()
  })

  test('should maintain session across page refreshes', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.fill('input[name="username"], input[name="email"]', TEST_USER.email)
    await page.fill('input[name="password"]', TEST_USER.password)
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/(dashboard|home|lobby)/)

    const cookies = await page.context().cookies()
    const sessionCookie = cookies.find((cookie) => {
      return cookie.name === 'connect.sid' || cookie.name === 'session'
    })
    expect(sessionCookie).toBeDefined()

    await page.reload()

    await expect(page).toHaveURL(/\/(dashboard|home|lobby)/)
    await expect(page.locator('text=Logout')).toBeVisible()
  })

  test('should share session across multiple tabs', async ({ browser }) => {
    const context = await browser.newContext()

    const page1 = await context.newPage()
    await page1.goto('http://localhost:5173')
    await page1.fill('input[name="username"], input[name="email"]', TEST_USER.email)
    await page1.fill('input[name="password"]', TEST_USER.password)
    await page1.click('button[type="submit"]')
    await page1.waitForURL(/\/(dashboard|home|lobby)/)

    const page2 = await context.newPage()
    await page2.goto('http://localhost:5173')
    await expect(page2).toHaveURL(/\/(dashboard|home|lobby)/)
    await expect(page2.locator('text=Logout')).toBeVisible()

    await page2.click('text=Logout')

    await page1.reload()
    await expect(page1).toHaveURL(/\/(login|signin|$)/)

    await context.close()
  })

  test('should expire session after inactivity', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.fill('input[name="username"], input[name="email"]', TEST_USER.email)
    await page.fill('input[name="password"]', TEST_USER.password)
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/(dashboard|home|lobby)/)

    const cookies = await page.context().cookies()
    const sessionCookie = cookies.find((cookie) => {
      return cookie.name === 'connect.sid' || cookie.name === 'session'
    })

    expect(sessionCookie).toBeDefined()
    expect(sessionCookie?.httpOnly).toBe(true)
    expect(sessionCookie?.secure).toBe(true)
    expect(sessionCookie?.sameSite === 'Strict' || sessionCookie?.sameSite === 'Lax').toBe(true)
  })

  test('should handle concurrent sessions correctly', async ({ browser }) => {
    const context1 = await browser.newContext()
    const context2 = await browser.newContext()

    const USER2 = {
      email: `concurrent_${Date.now()}@example.com`,
      password: 'Concurrent123!',
    }

    const registrationPage = await context2.newPage()
    await registrationPage.goto('http://localhost:5173')
    await registrationPage.click('text=Sign Up')
    await registrationPage.fill('input[name="username"]', `concurrent_${Date.now()}`)
    await registrationPage.fill('input[name="email"]', USER2.email)
    await registrationPage.fill('input[name="password"]', USER2.password)
    await registrationPage.fill('input[name="confirmPassword"]', USER2.password)
    await registrationPage.click('button[type="submit"]')
    await registrationPage.close()

    const page1 = await context1.newPage()
    await page1.goto('http://localhost:5173')
    await page1.fill('input[name="username"], input[name="email"]', TEST_USER.email)
    await page1.fill('input[name="password"]', TEST_USER.password)
    await page1.click('button[type="submit"]')
    await page1.waitForURL(/\/(dashboard|home|lobby)/)

    const page2 = await context2.newPage()
    await page2.goto('http://localhost:5173')
    await page2.fill('input[name="username"], input[name="email"]', USER2.email)
    await page2.fill('input[name="password"]', USER2.password)
    await page2.click('button[type="submit"]')
    await page2.waitForURL(/\/(dashboard|home|lobby)/)

    const cookies1 = await context1.cookies()
    const cookies2 = await context2.cookies()

    const session1 = cookies1.find((cookie) => {
      return cookie.name === 'connect.sid' || cookie.name === 'session'
    })
    const session2 = cookies2.find((cookie) => {
      return cookie.name === 'connect.sid' || cookie.name === 'session'
    })

    expect(session1?.value).not.toBe(session2?.value)

    await context1.close()
    await context2.close()
  })
})
