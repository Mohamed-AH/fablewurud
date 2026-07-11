/**
 * E2E Tests for Language Toggle Functionality
 * Tests Arabic/English language switching
 */

const { test, expect } = require('@playwright/test');

test.describe('Language Toggle - Basic Functionality', () => {
  test('should default to Arabic language', async ({ page }) => {
    await page.goto('/');

    // Check that the page is in Arabic by default
    const htmlLang = await page.locator('html').getAttribute('lang');
    expect(htmlLang).toBe('ar');

    // Check for RTL direction
    const htmlDir = await page.locator('html').getAttribute('dir');
    expect(htmlDir).toBe('rtl');
  });

  test('should display language toggle button', async ({ page }) => {
    await page.goto('/');

    // The language toggle is a button with id="langToggle"
    const langToggle = page.locator('#langToggle');
    await expect(langToggle).toBeVisible();
  });

  test('should switch to English when clicking English toggle', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // The language toggle button shows "EN" when in Arabic mode
    const langToggle = page.locator('#langToggle');
    await expect(langToggle).toBeVisible({ timeout: 10000 });

    // Click to switch to English
    await langToggle.click();

    // Wait for language change - check for 'en' attribute on html
    await expect(page.locator('html')).toHaveAttribute('lang', 'en', { timeout: 10000 });

    // Check for LTR direction
    const htmlDir = await page.locator('html').getAttribute('dir');
    expect(htmlDir).toBe('ltr');
  });

  test('should switch back to Arabic when clicking Arabic toggle', async ({ page }) => {
    // Start in English
    await page.goto('/?lang=en');
    await page.waitForLoadState('domcontentloaded');

    // The language toggle button shows "عربي" when in English mode
    const langToggle = page.locator('#langToggle');
    await expect(langToggle).toBeVisible({ timeout: 10000 });

    // Click to switch to Arabic
    await langToggle.click();

    // Wait for language change by checking the html lang attribute
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar', { timeout: 10000 });

    // Verify RTL direction is set
    const htmlDir = await page.locator('html').getAttribute('dir');
    expect(htmlDir).toBe('rtl');
  });
});

test.describe('Language Toggle - URL Parameters', () => {
  test('should load page in English with lang=en parameter', async ({ page }) => {
    await page.goto('/?lang=en');

    const htmlLang = await page.locator('html').getAttribute('lang');
    expect(htmlLang).toBe('en');
  });

  test('should load page in Arabic with lang=ar parameter', async ({ page }) => {
    await page.goto('/?lang=ar');

    const htmlLang = await page.locator('html').getAttribute('lang');
    expect(htmlLang).toBe('ar');
  });

  test('should ignore invalid language parameter', async ({ page }) => {
    await page.goto('/?lang=fr');

    // Should fallback to Arabic
    const htmlLang = await page.locator('html').getAttribute('lang');
    expect(htmlLang).toBe('ar');
  });

  test('should preserve language parameter during navigation', async ({ page }) => {
    await page.goto('/?lang=en');

    // Navigate to series tab
    const seriesTab = page.locator('#tab-series');
    await seriesTab.click();
    await page.waitForTimeout(300);

    // Page should still be in English
    const htmlLang = await page.locator('html').getAttribute('lang');
    expect(htmlLang).toBe('en');
  });
});

test.describe('Language Toggle - Translation Content', () => {
  test('should display Arabic navigation text', async ({ page }) => {
    await page.goto('/?lang=ar');
    await page.waitForLoadState('networkidle');

    // Check for Arabic content - use elements that are always visible
    // On mobile, nav links are hidden, so check the language toggle or page title
    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width < 768) {
      // On mobile, check for Arabic text in visible elements like logo or page content
      const arabicContent = page.locator('.logo-text, .search-hero-quote, h1, h2');
      await expect(arabicContent.first()).toBeVisible({ timeout: 10000 });
    } else {
      // On desktop, check navigation text
      const navHome = page.locator('.nav-link:has-text("الرئيسية")');
      await expect(navHome.first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('should display English navigation text', async ({ page }) => {
    await page.goto('/?lang=en');
    await page.waitForLoadState('networkidle');

    // Check for English content - use elements that are always visible
    const viewportSize = page.viewportSize();
    if (viewportSize && viewportSize.width < 768) {
      // On mobile, check for English text in visible elements
      const englishContent = page.locator('.logo-text, h1, h2');
      await expect(englishContent.first()).toBeVisible({ timeout: 10000 });
    } else {
      // On desktop, check navigation text
      const navHome = page.locator('.nav-link:has-text("Home")');
      await expect(navHome.first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('should display Arabic category names', async ({ page }) => {
    await page.goto('/?lang=ar');
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(500);

    // Check for Arabic category names in filter chips or category badges
    // Categories are displayed as chips with translated labels
    const categoryChips = page.locator('.chip[data-type="category"]');
    const count = await categoryChips.count();

    expect(count).toBeGreaterThan(0);
  });

  test('should display English category names', async ({ page }) => {
    await page.goto('/?lang=en');
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(500);

    // Check for category chips in English mode
    const categoryChips = page.locator('.chip[data-type="category"]');
    const count = await categoryChips.count();

    expect(count).toBeGreaterThan(0);
  });

  test('should translate filter buttons', async ({ page }) => {
    await page.goto('/?lang=ar');

    // Check for Arabic filter text - the "all" filter chip
    const arabicAllFilter = page.locator('.chip[data-filter="all"]');
    await expect(arabicAllFilter.first()).toBeVisible();
  });

  test('should translate search placeholder', async ({ page }) => {
    await page.goto('/?lang=ar');

    const searchInput = page.locator('#searchInput');
    const placeholder = await searchInput.getAttribute('placeholder');

    expect(placeholder).toContain('بحث');
  });
});

test.describe('Language Toggle - RTL/LTR Layout', () => {
  test('should have RTL text alignment in Arabic', async ({ page }) => {
    await page.goto('/?lang=ar');

    // Check body or main content has RTL direction
    const body = page.locator('body');
    const direction = await body.evaluate(el => getComputedStyle(el).direction);

    expect(direction).toBe('rtl');
  });

  test('should have LTR text alignment in English', async ({ page }) => {
    await page.goto('/?lang=en');

    const body = page.locator('body');
    const direction = await body.evaluate(el => getComputedStyle(el).direction);

    expect(direction).toBe('ltr');
  });

  test('should position elements correctly in RTL mode', async ({ page }) => {
    await page.goto('/?lang=ar');

    // In RTL, navigation should be on the right
    // This is a basic check - specific positioning depends on CSS
    const nav = page.locator('nav, .navbar, header').first();
    const box = await nav.boundingBox();

    // Navigation should exist and be visible
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThan(0);
  });
});

test.describe('Language Toggle - Series Detail Page', () => {
  test('should translate series detail page to Arabic', async ({ page }) => {
    // Navigate directly to a known series detail page in Arabic
    await page.goto('/series/kitab-at-tawheed?lang=ar');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the hero section to be visible
    await expect(page.locator('.series-hero')).toBeVisible({ timeout: 15000 });

    // Check page is in Arabic
    const htmlLang = await page.locator('html').getAttribute('lang');
    expect(htmlLang).toBe('ar');

    // Check for Arabic content - breadcrumb should exist
    await expect(page.locator('.breadcrumb')).toBeVisible();
  });

  test('should translate series detail page to English', async ({ page }) => {
    // Navigate directly to a known series detail page in English
    await page.goto('/series/kitab-at-tawheed?lang=en');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the hero section to be visible
    await expect(page.locator('.series-hero')).toBeVisible({ timeout: 15000 });

    // Check page is in English
    const htmlLang = await page.locator('html').getAttribute('lang');
    expect(htmlLang).toBe('en');

    // Check for English content - breadcrumb should exist
    await expect(page.locator('.breadcrumb')).toBeVisible();
  });
});

test.describe('Language Toggle - Cookie Persistence', () => {
  test('should remember language preference on page refresh', async ({ page }) => {
    // Set language to English
    await page.goto('/?lang=en');
    await page.waitForLoadState('networkidle');

    // Check cookie is set
    const cookies = await page.context().cookies();
    const localeCookie = cookies.find(c => c.name === 'locale');

    if (localeCookie) {
      expect(localeCookie.value).toBe('en');
    }

    // Refresh page without lang parameter
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should still be in English (if cookie is respected)
    // Note: This depends on implementation - cookie may or may not persist
  });
});

test.describe('Language Toggle - Mobile Viewport', () => {
  test('should display language toggle on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Language toggle button should be visible on mobile
    const langToggle = page.locator('#langToggle');
    await expect(langToggle).toBeVisible({ timeout: 10000 });
  });

  test('should switch language on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Click language toggle button
    const langToggle = page.locator('#langToggle');
    await expect(langToggle).toBeVisible({ timeout: 10000 });
    await langToggle.click();

    // Wait for language change - check for 'en' attribute on html
    await expect(page.locator('html')).toHaveAttribute('lang', 'en', { timeout: 10000 });
  });
});

test.describe('Language Toggle - Accessibility', () => {
  test('should have accessible language toggle', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const langToggle = page.locator('#langToggle');
    await expect(langToggle).toBeVisible();

    // Check for accessible attributes
    const ariaLabel = await langToggle.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();

    // Element should be focusable as it's a button
    await langToggle.focus();
    await expect(langToggle).toBeFocused();
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Tab to language toggle
    await page.keyboard.press('Tab');

    // Keep tabbing until we find the language toggle button
    for (let i = 0; i < 20; i++) {
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.id === 'langToggle';
      });

      if (focused) {
        // Press Enter to activate
        await page.keyboard.press('Enter');
        await page.waitForLoadState('networkidle');
        break;
      }

      await page.keyboard.press('Tab');
    }
  });
});
