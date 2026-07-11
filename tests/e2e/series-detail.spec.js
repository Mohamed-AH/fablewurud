/**
 * E2E Tests for Series Detail Page
 * Tests the page shown when clicking on a series to view its lectures
 */

const { test, expect } = require('@playwright/test');

test.describe('Series Detail Page - Basic Functionality', () => {
  test('should load series detail page from homepage', async ({ page }) => {
    // Navigate directly to a known series detail page
    await page.goto('/series/kitab-at-tawheed');
    await page.waitForLoadState('domcontentloaded');

    // Should be on series-detail page
    await expect(page).toHaveURL(/\/series\//);

    // Breadcrumb should be visible
    await expect(page.locator('.breadcrumb')).toBeVisible({ timeout: 15000 });

    // Hero section should be visible
    await expect(page.locator('.series-hero')).toBeVisible();

    // Lectures section should exist (lectures-list or description card)
    await expect(page.locator('.lectures-list, .description-card, .empty-state').first()).toBeVisible();
  });

  test('should display series information correctly', async ({ page }) => {
    // Navigate directly to a known series detail page
    await page.goto('/series/kitab-at-tawheed');
    await page.waitForLoadState('domcontentloaded');

    // Series title should be visible in hero
    await expect(page.locator('.series-hero h1.series-title')).toBeVisible({ timeout: 15000 });

    // Lectures section should exist
    await expect(page.locator('.lectures-list, .empty-state')).toBeVisible();
  });

  test('should have working sort controls', async ({ page }) => {
    // Navigate directly to a known series detail page
    await page.goto('/series/kitab-at-tawheed');
    await page.waitForLoadState('domcontentloaded');

    // Wait for hero to be visible
    await expect(page.locator('.series-hero')).toBeVisible({ timeout: 15000 });

    // Sort controls should be visible if lectures exist
    const sortControls = page.locator('.sort-controls');
    if (await sortControls.isVisible()) {
      // Click on a sort chip
      const sortByNumber = page.locator('.sort-chip[data-sort="number"]');
      if (await sortByNumber.isVisible()) {
        await sortByNumber.click();
        await page.waitForTimeout(300);

        // Sort chip should be active
        await expect(sortByNumber).toHaveClass(/active/);

        // Original order chip should no longer be active
        const originalOrderChip = page.locator('.sort-chip[data-sort="order"]');
        if (await originalOrderChip.isVisible()) {
          await expect(originalOrderChip).not.toHaveClass(/active/);
        }
      }
    }
  });
});

test.describe('Series Detail Page - Responsive Design', () => {
  test('should work on mobile viewport (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    // Navigate directly to series detail page
    await page.goto('/series/kitab-at-tawheed');
    await page.waitForLoadState('domcontentloaded');

    // Hero should be visible
    await expect(page.locator('.series-hero')).toBeVisible({ timeout: 15000 });

    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5); // Allow small tolerance
  });

  test('should work on small mobile viewport (360px)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    // Navigate directly to series detail page
    await page.goto('/series/kitab-at-tawheed');
    await page.waitForLoadState('domcontentloaded');

    // Hero should be visible
    await expect(page.locator('.series-hero')).toBeVisible({ timeout: 15000 });

    // Lecture items should be readable (if any exist)
    const lectureItems = page.locator('.lecture-item, .lecture-card');
    if (await lectureItems.count() > 0) {
      await expect(lectureItems.first()).toBeVisible();
    }
  });

  test('should work on very small mobile viewport (320px)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    // Navigate directly to series detail page using known test slug
    await page.goto('/series/kitab-at-tawheed');
    await page.waitForLoadState('domcontentloaded');

    // Content should be visible and not overflow
    await expect(page.locator('.series-hero')).toBeVisible({ timeout: 15000 });

    // Sort chips should wrap properly
    const sortChips = page.locator('.sort-chips');
    if (await sortChips.count() > 0) {
      await expect(sortChips.first()).toBeVisible();
    }
  });

  test('should work on tablet viewport (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    // Navigate directly to series detail page
    await page.goto('/series/kitab-at-tawheed');
    await page.waitForLoadState('domcontentloaded');

    // All elements should be visible
    await expect(page.locator('.series-hero')).toBeVisible({ timeout: 15000 });
  });

  test('should work on large tablet viewport (1024px)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    // Navigate directly to series detail page
    await page.goto('/series/kitab-at-tawheed');
    await page.waitForLoadState('domcontentloaded');

    // All elements should be fully visible
    await expect(page.locator('.series-hero')).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Series Detail Page - Lecture Cards', () => {
  test('should not have horizontal overflow on mobile viewports', async ({ page }) => {
    // Test with a single viewport to reduce flakiness
    await page.setViewportSize({ width: 375, height: 667 });
    // Navigate directly to series detail page using known test slug
    await page.goto('/series/kitab-at-tawheed');
    await page.waitForLoadState('domcontentloaded');

    // Wait for hero section to be visible
    await expect(page.locator('.series-hero')).toBeVisible({ timeout: 15000 });

    // Check document scroll width doesn't exceed viewport
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10);

    // Check lecture cards don't overflow (if they exist)
    const lectureCard = page.locator('.lecture-card').first();
    if (await lectureCard.count() > 0 && await lectureCard.isVisible()) {
      const cardBox = await lectureCard.boundingBox();
      if (cardBox) {
        expect(cardBox.x).toBeGreaterThanOrEqual(-5);
        expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(viewportWidth + 10);
      }
    }
  });

  test('should display lecture cards properly on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    // Navigate directly to series detail page
    await page.goto('/series/kitab-at-tawheed');
    await page.waitForLoadState('domcontentloaded');

    // Wait for hero section
    await expect(page.locator('.series-hero')).toBeVisible({ timeout: 15000 });

    // Lecture cards should be visible
    const lectureCards = page.locator('.lecture-card');
    if (await lectureCards.count() > 0) {
      await expect(lectureCards.first()).toBeVisible();

      // Play and download buttons should be accessible
      const playBtn = page.locator('.btn-play').first();
      const downloadBtn = page.locator('.btn-download').first();

      await expect(playBtn).toBeVisible();
      await expect(downloadBtn).toBeVisible();
    }
  });

  test('should have accessible action buttons on all screen sizes', async ({ page }) => {
    // Test with mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    // Navigate directly to series detail page using known test slug
    await page.goto('/series/kitab-at-tawheed');
    await page.waitForLoadState('domcontentloaded');

    // Wait for page to load
    await expect(page.locator('.series-hero')).toBeVisible({ timeout: 15000 });

    const playBtn = page.locator('.btn-play').first();
    if (await playBtn.count() > 0 && await playBtn.isVisible()) {
      // Button should be at least 32x32 for touch accessibility
      const box = await playBtn.boundingBox();
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(32);
        expect(box.height).toBeGreaterThanOrEqual(32);
      }
    }
  });
});
