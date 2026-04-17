// @ts-check
import { test, expect } from '@playwright/test'

/**
 * Document List E2E Tests
 *
 * Tests for the home view: loading, creating, navigating to, and deleting
 * documents. Targets the REST-backed UI (`useDocuments` + `/api`).
 */

test.describe('Document List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="documents-title"]')
  })

  test('page loads and shows the app title', async ({ page }) => {
    const appTitle = page.locator('[data-testid="app-title"]')
    await expect(appTitle).toBeVisible()
    await expect(appTitle).toHaveText('كُرّاس')
  })

  test('page shows documents heading', async ({ page }) => {
    const heading = page.locator('[data-testid="documents-title"]')
    await expect(heading).toBeVisible()
    await expect(heading).toHaveText('المستندات')
  })

  test('new document button is visible', async ({ page }) => {
    const newBtn = page.locator('[data-testid="new-document-btn"]')
    await expect(newBtn).toBeVisible()
    await expect(newBtn).toHaveText('مستند جديد')
  })

  test('click new document creates a document and navigates to editor', async ({
    page,
  }) => {
    const newBtn = page.locator('[data-testid="new-document-btn"]')
    await newBtn.click()

    await page.waitForURL(/\/editor\/.+/)
    expect(page.url()).toMatch(/\/editor\/.+/)

    await expect(page.locator('[data-testid="editor-content"]')).toBeVisible()
  })

  test('navigate back to home shows the created document in the list', async ({
    page,
  }) => {
    const itemsBefore = page.locator('[data-testid="document-item"]')
    const countBefore = await itemsBefore.count()

    await page.locator('[data-testid="new-document-btn"]').click()
    await page.waitForURL(/\/editor\/.+/)

    await page.goto('/')
    await page.waitForSelector('[data-testid="documents-title"]')

    const items = page.locator('[data-testid="document-item"]')
    await expect(items).toHaveCount(countBefore + 1, { timeout: 5000 })
  })

  test('delete a document removes it from the list', async ({ page }) => {
    await page.locator('[data-testid="new-document-btn"]').click()
    await page.waitForURL(/\/editor\/.+/)

    await page.goto('/')
    await page.waitForSelector('[data-testid="documents-title"]')

    const items = page.locator('[data-testid="document-item"]')
    const initialCount = await items.count()
    expect(initialCount).toBeGreaterThan(0)

    page.on('dialog', async (dialog) => {
      await dialog.accept()
    })

    const firstItem = items.first()
    await firstItem.hover()
    const deleteBtn = firstItem.locator('[data-testid="delete-document-btn"]')
    await deleteBtn.click()

    await expect(items).toHaveCount(initialCount - 1)
  })
})
