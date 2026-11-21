import { test, expect } from '@playwright/test';

test.describe('Speech notepad UI', () => {
  test('loads with editor, toolbar and record button', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Speech Notepad');
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#recordBtn')).toHaveAttribute('aria-pressed', 'false');
  });

  test('record button toggles recording state', async ({ page }) => {
    await page.goto('/');
    const record = page.locator('#recordBtn');

    await record.click();
    await expect(record).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#recordLabel')).toHaveText('Stop');

    await record.click();
    await expect(record).toHaveAttribute('aria-pressed', 'false');
  });

  test('typed text updates the word count', async ({ page }) => {
    await page.goto('/');
    await page.locator('#editor').fill('hello there world');
    await expect(page.locator('#wordCount')).toHaveText('3 words');
  });

  test('layout has no horizontal scroll at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto('/');
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});
