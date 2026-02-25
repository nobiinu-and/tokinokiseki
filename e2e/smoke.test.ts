import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { resolve } from 'path'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  app = await electron.launch({
    args: [resolve(__dirname, '../out/main/index.js')],
    env: { ...process.env, NODE_ENV: 'production' }
  })
  page = await app.firstWindow()
  // Wait for the home screen to fully render (loading complete)
  await page.waitForSelector('.home-screen', { timeout: 15_000 })
})

test.afterAll(async () => {
  if (app) {
    await app.close()
  }
})

test('window title is ときのきせき', async () => {
  const title = await page.title()
  expect(title).toBe('ときのきせき')
})

test('app logo is visible', async () => {
  const logo = page.locator('.app-logo h1')
  await expect(logo).toBeVisible()
})

test('tab bar shows 3 tabs', async () => {
  const tabs = page.locator('.tab-bar [role="tab"]')
  await expect(tabs).toHaveCount(3)
  await expect(tabs.nth(0)).toHaveText('ホーム')
  await expect(tabs.nth(1)).toHaveText('タイムライン')
  await expect(tabs.nth(2)).toHaveText('ギャラリー')
})

test('tab navigation works', async () => {
  // Click timeline tab
  await page.locator('.tab-bar [role="tab"]:has-text("タイムライン")').click()
  await expect(page.locator('.tab-bar [role="tab"]:has-text("タイムライン")')).toHaveAttribute(
    'aria-selected',
    'true'
  )

  // Click gallery tab
  await page.locator('.tab-bar [role="tab"]:has-text("ギャラリー")').click()
  await expect(page.locator('.tab-bar [role="tab"]:has-text("ギャラリー")')).toHaveAttribute(
    'aria-selected',
    'true'
  )

  // Go back to home
  await page.locator('.tab-bar [role="tab"]:has-text("ホーム")').click()
  await expect(page.locator('.tab-bar [role="tab"]:has-text("ホーム")')).toHaveAttribute(
    'aria-selected',
    'true'
  )
})
