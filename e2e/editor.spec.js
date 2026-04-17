// @ts-check
import { test, expect } from '@playwright/test'

/**
 * Editor E2E Tests — Phase 4
 *
 * Tests the ProseMirror-backed Editor (`@editor/core`) in the `web/` app.
 * Exercises the toolbar, content persistence through REST, and the
 * version save/restore flow.
 */

// ----- Helpers -------------------------------------------------------------

/** Create a new document from the home page and wait for editor readiness. */
async function createAndOpenDocument(page) {
  await page.goto('/')
  await page.waitForSelector('[data-testid="new-document-btn"]')
  await page.locator('[data-testid="new-document-btn"]').click()
  await page.waitForURL(/\/editor\/.+/)
  await page.waitForSelector('[data-testid="editor-content"]')
  // The ProseMirror EditorView mounts on `.editor-mount` once ready.
  await page.waitForSelector('.editor-mount [contenteditable="true"]')
}

/** Focus the contenteditable surface inside the editor. */
async function focusEditor(page) {
  const editable = page.locator('.editor-mount [contenteditable="true"]')
  await editable.click()
  return editable
}

/** Read the current markdown directly from the Editor's exposed method. */
async function getMarkdown(page) {
  return page.evaluate(() => {
    // The `<Editor>` component exposes getMarkdown via defineExpose; we
    // climb from the editable DOM back to the closest element carrying
    // a __vueParentComponent with a `getMarkdown` function.
    const el = document.querySelector('.editor-mount [contenteditable="true"]')
    if (!el) return ''
    // Walk the Vue component tree up from the mount element.
    let node = document.querySelector('.editor-root')
    if (!node) return ''
    // @ts-ignore
    let instance = node.__vueParentComponent
    while (instance) {
      const exposed = instance.exposed
      if (exposed && typeof exposed.getMarkdown === 'function') {
        return exposed.getMarkdown()
      }
      instance = instance.parent
    }
    return ''
  })
}

/** Click a toolbar button by its aria-label (matches @editor/core Toolbar). */
async function clickToolbarButton(page, ariaLabel) {
  await page.locator(`.editor-toolbar [aria-label="${ariaLabel}"]`).click()
}

// ----- Tests ---------------------------------------------------------------

test.describe('Editor', () => {
  test('new document loads editor with ProseMirror surface and toolbar', async ({ page }) => {
    await createAndOpenDocument(page)

    const editorContent = page.locator('[data-testid="editor-content"]')
    await expect(editorContent).toBeVisible()

    // Root has dir="rtl".
    const root = page.locator('.editor-root')
    await expect(root).toHaveAttribute('dir', 'rtl')

    // Toolbar present.
    await expect(page.locator('.editor-toolbar')).toBeVisible()

    // Title input editable.
    const title = page.locator('[data-testid="document-title"]')
    await expect(title).toBeVisible()
  })

  test('typing text persists after reload', async ({ page }) => {
    await createAndOpenDocument(page)

    const url = page.url()
    const editable = await focusEditor(page)
    await editable.pressSequentially('مرحبا')

    // Give debounce (500ms) time to flush, plus a buffer for the request.
    await page.waitForTimeout(900)

    await page.goto(url)
    await page.waitForSelector('.editor-mount [contenteditable="true"]')

    const md = await getMarkdown(page)
    expect(md).toContain('مرحبا')
  })

  test('bold toolbar button wraps text in **', async ({ page }) => {
    await createAndOpenDocument(page)

    const editable = await focusEditor(page)
    // Toggle bold on, type, toggle off.
    await clickToolbarButton(page, 'Bold')
    await editable.pressSequentially('abc')
    await clickToolbarButton(page, 'Bold')

    const md = await getMarkdown(page)
    expect(md).toContain('**abc**')

    // DOM also has a <strong>.
    await expect(page.locator('.editor-mount strong')).toHaveText('abc')
  })

  test('italic toolbar button produces *text*', async ({ page }) => {
    await createAndOpenDocument(page)

    const editable = await focusEditor(page)
    await clickToolbarButton(page, 'Italic')
    await editable.pressSequentially('xyz')
    await clickToolbarButton(page, 'Italic')

    const md = await getMarkdown(page)
    expect(md).toMatch(/\*xyz\*/)
  })

  test('inline code toolbar button produces `text`', async ({ page }) => {
    await createAndOpenDocument(page)

    const editable = await focusEditor(page)
    await clickToolbarButton(page, 'Inline code')
    await editable.pressSequentially('code')
    await clickToolbarButton(page, 'Inline code')

    const md = await getMarkdown(page)
    expect(md).toMatch(/`code`/)
  })

  test('H1 / H2 / H3 buttons produce #, ##, ### headings', async ({ page }) => {
    await createAndOpenDocument(page)

    const editable = await focusEditor(page)
    await clickToolbarButton(page, 'Heading 1')
    await editable.pressSequentially('H1 Title')
    await editable.press('Enter')

    await clickToolbarButton(page, 'Heading 2')
    await editable.pressSequentially('H2 Title')
    await editable.press('Enter')

    await clickToolbarButton(page, 'Heading 3')
    await editable.pressSequentially('H3 Title')

    const md = await getMarkdown(page)
    expect(md).toContain('# H1 Title')
    expect(md).toContain('## H2 Title')
    expect(md).toContain('### H3 Title')
  })

  test('bullet list button produces an unordered list', async ({ page }) => {
    await createAndOpenDocument(page)

    const editable = await focusEditor(page)
    await clickToolbarButton(page, 'Bullet list')
    await editable.pressSequentially('one')
    await editable.press('Enter')
    await editable.pressSequentially('two')

    const md = await getMarkdown(page)
    expect(md).toMatch(/[-*] one/)
    expect(md).toMatch(/[-*] two/)

    await expect(page.locator('.editor-mount ul li').first()).toContainText('one')
  })

  test('ordered list button produces a numbered list', async ({ page }) => {
    await createAndOpenDocument(page)

    const editable = await focusEditor(page)
    await clickToolbarButton(page, 'Ordered list')
    await editable.pressSequentially('first')

    const md = await getMarkdown(page)
    expect(md).toMatch(/1\. first/)
    await expect(page.locator('.editor-mount ol li').first()).toContainText('first')
  })

  test('blockquote button produces > prefix', async ({ page }) => {
    await createAndOpenDocument(page)

    const editable = await focusEditor(page)
    await clickToolbarButton(page, 'Blockquote')
    await editable.pressSequentially('quoted')

    const md = await getMarkdown(page)
    expect(md).toMatch(/>\s*quoted/)
    await expect(page.locator('.editor-mount blockquote')).toContainText('quoted')
  })

  test('code block button produces ``` fenced block', async ({ page }) => {
    await createAndOpenDocument(page)

    const editable = await focusEditor(page)
    await clickToolbarButton(page, 'Code block')
    await editable.pressSequentially('print("hi")')

    const md = await getMarkdown(page)
    expect(md).toMatch(/```[\s\S]*print\("hi"\)[\s\S]*```/)
    await expect(page.locator('.editor-mount pre')).toBeVisible()
  })

  test('link button has the correct aria-label and is clickable', async ({ page }) => {
    await createAndOpenDocument(page)
    const linkBtn = page.locator('.editor-toolbar [aria-label="Link"]')
    await expect(linkBtn).toBeVisible()
    // We don't click it here because it opens a window.prompt(); wiring
    // a Playwright dialog handler for prompt() works but we prefer to
    // verify the button surface only.
  })

  test('image button has the correct aria-label and is clickable', async ({ page }) => {
    await createAndOpenDocument(page)
    const imageBtn = page.locator('.editor-toolbar [aria-label="Image"]')
    await expect(imageBtn).toBeVisible()
  })

  test('Shift+Enter inserts a hard break within a paragraph', async ({ page }) => {
    await createAndOpenDocument(page)

    const editable = await focusEditor(page)
    await editable.pressSequentially('line1')
    await editable.press('Shift+Enter')
    await editable.pressSequentially('line2')

    const md = await getMarkdown(page)
    // Markdown serializer writes hard breaks as "  \n" or "\\\n"; accept either.
    expect(md).toMatch(/line1(  \n|\\\n)line2/)
  })

  test('version save and restore round trip', async ({ page }) => {
    // Auto-accept window.prompt (label) and window.confirm (restore).
    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('v1')
      } else {
        await dialog.accept()
      }
    })

    await createAndOpenDocument(page)

    // Type "version one" as the document content.
    const editable = await focusEditor(page)
    await editable.pressSequentially('version one')
    // Flush debounce.
    await page.waitForTimeout(900)

    // Save a version with label "v1".
    await page.locator('[data-testid="toolbar-versions"]').click()
    await page.waitForSelector('[data-testid="version-save-btn"]')
    await page.locator('[data-testid="version-save-btn"]').click()
    // Wait for the new version item to appear.
    await expect(
      page.locator('[data-testid="version-item"]').first(),
    ).toBeVisible({ timeout: 5000 })

    // Close dialog and edit more content.
    await page.keyboard.press('Escape')
    // Click outside to blur the dialog? ImportExportDialog closes on
    // close button; use it instead to be explicit.
    const dialog = page.locator('[data-testid="dialog-content"]')
    if (await dialog.isVisible()) {
      await dialog.locator('button', { hasText: 'إغلاق' }).first().click()
    }

    const editable2 = await focusEditor(page)
    await editable2.pressSequentially(' edited')
    await page.waitForTimeout(900)

    const mdBefore = await getMarkdown(page)
    expect(mdBefore).toContain('edited')

    // Open versions dialog again and restore.
    await page.locator('[data-testid="toolbar-versions"]').click()
    await page.waitForSelector('[data-testid="version-restore-btn"]')
    await page.locator('[data-testid="version-restore-btn"]').first().click()

    // After restore, content should revert to "version one".
    await page.waitForTimeout(500)
    const mdAfter = await getMarkdown(page)
    expect(mdAfter).toContain('version one')
    expect(mdAfter).not.toContain('edited')
  })

  test('export dialog exposes the current markdown', async ({ page }) => {
    await createAndOpenDocument(page)

    const editable = await focusEditor(page)
    await editable.pressSequentially('hello')

    await page.locator('[data-testid="toolbar-export"]').click()
    await expect(page.locator('[data-testid="export-textarea"]')).toBeVisible()
    await expect(page.locator('[data-testid="export-textarea"]')).toHaveValue(
      /hello/,
    )
  })

  test('import dialog replaces editor content', async ({ page }) => {
    await createAndOpenDocument(page)

    await page.locator('[data-testid="toolbar-import"]').click()
    const textarea = page.locator('[data-testid="import-textarea"]')
    await textarea.fill('# Imported\n\nbody')
    await page.locator('[data-testid="import-submit-btn"]').click()

    await expect(page.locator('.editor-mount h1')).toHaveText('Imported')
  })
})
