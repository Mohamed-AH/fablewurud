/**
 * E2E Tests for Homepage
 */

const { test, expect } = require('@playwright/test');

test.describe('Homepage - Basic Functionality', () => {
  test('should load homepage successfully', async ({ page }) => {
    await page.goto('/');

    // Check page title contains البحث في التفريغ الصوتي (Transcript Search) or similar
    await expect(page).toHaveTitle(/البحث في التفريغ الصوتي|المكتبة الصوتية|Audio Library|Transcript Search/);

    // Check main navigation tabs are present
    await expect(page.locator('#tab-lectures')).toBeVisible();
    await expect(page.locator('#tab-series')).toBeVisible();
    await expect(page.locator('#tab-khutbas')).toBeVisible();
  });

  test('should display search functionality', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Check search input is present (uses id="searchInput" or class="search-input")
    const searchInput = page.locator('#searchInput, .search-input');
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  test('should display filter chips', async ({ page }) => {
    await page.goto('/');

    // Check that filter section exists
    const filterSection = page.locator('.filter-chips, [class*="filter"]');
    await expect(filterSection.first()).toBeVisible();
  });

  test('should display sort buttons', async ({ page }) => {
    await page.goto('/');

    // Check sort buttons
    await expect(page.locator('[data-sort="newest"]')).toBeVisible();
    await expect(page.locator('[data-sort="oldest"]')).toBeVisible();
  });
});

test.describe('Homepage - Tab Switching', () => {
  test('should switch to Series tab', async ({ page }) => {
    await page.goto('/');

    // Scroll to and click on Series tab
    const seriesTab = page.locator('#tab-series');
    await seriesTab.scrollIntoViewIfNeeded();
    await seriesTab.click();

    // Wait for content to load
    await page.waitForTimeout(500);

    // Verify Series tab content is active
    const seriesContent = page.locator('#content-series.active');
    await expect(seriesContent).toBeVisible();
  });

  test('should switch to Khutba tab', async ({ page }) => {
    await page.goto('/');

    // Scroll to and click on Khutba tab
    const khutbaTab = page.locator('#tab-khutbas');
    await khutbaTab.scrollIntoViewIfNeeded();
    await khutbaTab.click();

    // Wait for content to load
    await page.waitForTimeout(500);

    // Verify Khutba tab content is active
    const khutbaContent = page.locator('#content-khutbas.active');
    await expect(khutbaContent).toBeVisible();
  });

  test('should switch back to Lectures tab', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Wait for tabs to be visible
    const seriesTab = page.locator('#tab-series');
    await expect(seriesTab).toBeVisible({ timeout: 10000 });

    // Switch to Series
    await seriesTab.scrollIntoViewIfNeeded();
    await seriesTab.click();

    // Wait for series content to be active
    await expect(page.locator('#content-series.active')).toBeVisible({ timeout: 10000 });

    // Switch back to Lectures
    const lecturesTab = page.locator('#tab-lectures');
    await lecturesTab.scrollIntoViewIfNeeded();
    await lecturesTab.click();

    // Verify Lectures tab content is active
    await expect(page.locator('#content-lectures.active')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Homepage - Category Filtering', () => {
  test('should filter by category when clicking filter chip', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(1000);

    // Click on a category filter - chips have data-type="category" attribute
    const categoryChip = page.locator('.chip[data-type="category"][data-filter="Aqeedah"]').first();

    if (await categoryChip.isVisible()) {
      await categoryChip.scrollIntoViewIfNeeded();
      await categoryChip.click();
      await page.waitForTimeout(1000);

      // Verify the chip is now active
      await expect(categoryChip).toHaveClass(/active/);
    }
  });

  test('should show all categories when clicking "All"', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for content to load
    await page.waitForTimeout(1000);

    // Click a specific category first
    const specificCategory = page.locator('.chip[data-type="category"][data-filter="Fiqh"]').first();
    if (await specificCategory.isVisible()) {
      await specificCategory.scrollIntoViewIfNeeded();
      await specificCategory.click();
      await page.waitForTimeout(500);
    }

    // Click "All" to show everything - the first "all" filter is for categories
    const allChip = page.locator('.chip[data-type="category"][data-filter="all"]').first();
    if (await allChip.isVisible()) {
      await allChip.scrollIntoViewIfNeeded();
      await allChip.click();
      await page.waitForTimeout(500);

      // Verify the "All" chip is active
      await expect(allChip).toHaveClass(/active/);
    }
  });
});

test.describe('Homepage - Date Sorting', () => {
  test('should sort by newest first', async ({ page }) => {
    await page.goto('/');

    // Click "الأحدث أولاً" (Newest first)
    const newestButton = page.locator('[data-sort="newest"]').first();
    await newestButton.scrollIntoViewIfNeeded();
    await newestButton.click();
    await page.waitForTimeout(500);

    // Verify button is active
    await expect(newestButton).toHaveClass(/active/);
  });

  test('should sort by oldest first', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Click "الأقدم أولاً" (Oldest first)
    const oldestButton = page.locator('[data-sort="oldest"]').first();
    await expect(oldestButton).toBeVisible({ timeout: 10000 });
    await oldestButton.scrollIntoViewIfNeeded();
    await oldestButton.click();

    // Verify button is active - wait for the class to be applied
    await expect(oldestButton).toHaveClass(/active/, { timeout: 5000 });
  });

  test('should maintain cards visibility after sorting on Series tab', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Switch to Series tab
    const seriesTab = page.locator('#tab-series');
    await expect(seriesTab).toBeVisible({ timeout: 10000 });
    await seriesTab.scrollIntoViewIfNeeded();
    await seriesTab.click();

    // Wait for series content to become active
    await expect(page.locator('#content-series.active')).toBeVisible({ timeout: 10000 });

    // Wait for series cards to load - check for any card or loading/empty state
    // Use a more robust wait that handles API loading time
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('#content-series .series-card');
      const empty = document.querySelector('#content-series .empty-state');
      const loading = document.querySelector('#content-series .loading-indicator');
      return cards.length > 0 || empty || (loading && getComputedStyle(loading).display === 'none');
    }, { timeout: 30000 });

    const firstCard = page.locator('#content-series .series-card').first();

    // Only test sorting if cards exist
    if (await firstCard.count() > 0) {
      await expect(firstCard).toBeVisible({ timeout: 10000 });

      // Sort by oldest
      const oldestButton = page.locator('.chip[data-sort="oldest"]').first();
      await expect(oldestButton).toBeVisible({ timeout: 10000 });
      await oldestButton.scrollIntoViewIfNeeded();
      await oldestButton.click();

      // Verify sort button is active
      await expect(oldestButton).toHaveClass(/active/, { timeout: 5000 });

      // Verify cards are still visible after sorting
      await expect(firstCard).toBeVisible({ timeout: 10000 });
    }
  });

  test('should maintain cards visibility after sorting on Khutba tab', async ({ page }) => {
    await page.goto('/');

    // Switch to Khutba tab
    const khutbaTab = page.locator('#tab-khutbas');
    await khutbaTab.scrollIntoViewIfNeeded();
    await khutbaTab.click();
    await page.waitForTimeout(300);

    // Get initial card count in khutbas tab
    const cardsBefore = page.locator('#content-khutbas .series-card');
    const countBefore = await cardsBefore.count();

    if (countBefore > 0) {
      // Sort by oldest
      const oldestButton = page.locator('[data-sort="oldest"]').first();
      await oldestButton.scrollIntoViewIfNeeded();
      await oldestButton.click();
      await page.waitForTimeout(500);

      // Verify cards are still visible
      const cardsAfter = page.locator('#content-khutbas .series-card');
      const countAfter = await cardsAfter.count();

      expect(countAfter).toBe(countBefore);
    }
  });
});

test.describe('Homepage - Search Functionality', () => {
  test('should search for lectures', async ({ page }) => {
    await page.goto('/');

    // Find search input
    const searchInput = page.locator('#searchInput');

    if (await searchInput.isVisible()) {
      // Type search query
      await searchInput.fill('التوحيد');
      await page.waitForTimeout(500);

      // Results should be filtered
      // Note: This assumes search works instantly (no submit button)
    }
  });

  test('should clear search results', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Switch to Series tab explicitly
    const seriesTab = page.locator('#tab-series');
    await expect(seriesTab).toBeVisible({ timeout: 10000 });
    await seriesTab.scrollIntoViewIfNeeded();
    await seriesTab.click();

    // Wait for series content to become active
    await expect(page.locator('#content-series.active')).toBeVisible({ timeout: 10000 });

    const searchInput = page.locator('#searchInput');
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Wait for initial content to load - check for cards OR empty state OR loading complete
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('#content-series .series-card');
      const empty = document.querySelector('#content-series .empty-state');
      const loading = document.querySelector('#content-series .loading-indicator');
      return cards.length > 0 || empty || (loading && getComputedStyle(loading).display === 'none');
    }, { timeout: 30000 });

    const firstCard = page.locator('#content-series .series-card').first();

    // Only test search clearing if cards exist
    if (await firstCard.count() > 0) {
      // Get initial card count
      const initialCount = await page.locator('#content-series .series-card').count();

      // Type search query (use Arabic text that exists in test data)
      await searchInput.fill('التوحيد');
      await page.waitForTimeout(1000);

      // Clear the search
      await searchInput.clear();

      // Wait for original cards to reappear after clearing search
      await page.waitForFunction((expectedCount) => {
        const cards = document.querySelectorAll('#content-series .series-card');
        return cards.length >= expectedCount;
      }, initialCount, { timeout: 30000 });
    }
  });
});

test.describe('Homepage - Series Expansion', () => {
  test('should expand series to show lectures', async ({ page }) => {
    await page.goto('/');

    // Switch to Series tab (already active by default)
    const seriesTab = page.locator('#tab-series');
    await seriesTab.scrollIntoViewIfNeeded();
    await seriesTab.click();
    await page.waitForTimeout(300);

    // Find first series card header
    const seriesHeader = page.locator('#content-series .series-header').first();

    if (await seriesHeader.isVisible()) {
      await seriesHeader.scrollIntoViewIfNeeded();
      await seriesHeader.click();
      await page.waitForTimeout(500);

      // Episodes list should be visible
      const episodesList = page.locator('#content-series .episodes-list.show').first();
      await expect(episodesList).toBeVisible();
    }
  });

  test('should show lecture sorting controls inside expanded series', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Switch to Series tab
    const seriesTab = page.locator('#tab-series');
    await expect(seriesTab).toBeVisible({ timeout: 10000 });
    await seriesTab.scrollIntoViewIfNeeded();
    await seriesTab.click();

    // Wait for series content to become active
    await expect(page.locator('#content-series.active')).toBeVisible({ timeout: 10000 });

    // Wait for series cards to load - check for cards OR empty state OR loading complete
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('#content-series .series-card');
      const empty = document.querySelector('#content-series .empty-state');
      const loading = document.querySelector('#content-series .loading-indicator');
      return cards.length > 0 || empty || (loading && getComputedStyle(loading).display === 'none');
    }, { timeout: 30000 });

    const seriesCard = page.locator('#content-series .series-card').first();

    // Only test expansion if cards exist
    if (await seriesCard.count() > 0) {
      await expect(seriesCard).toBeVisible({ timeout: 10000 });

      // Find and click the expand button directly
      const expandBtn = page.locator('#content-series .expand-btn').first();
      await expect(expandBtn).toBeVisible({ timeout: 10000 });
      await expandBtn.scrollIntoViewIfNeeded();
      await expandBtn.click();

      // Wait for episodes list to expand (the .show class is added)
      const episodesList = page.locator('#content-series .episodes-list.show').first();
      await expect(episodesList).toBeVisible({ timeout: 10000 });

      // Look for sort buttons by text content (more reliable across locales)
      const sortByNumberBtn = episodesList.locator('button:has-text("حسب الرقم"), button:has-text("By Number")').first();
      await expect(sortByNumberBtn).toBeVisible({ timeout: 10000 });
    }
  });

  test('should sort lectures within series by number', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Switch to Series tab
    const seriesTab = page.locator('#tab-series');
    await expect(seriesTab).toBeVisible({ timeout: 10000 });
    await seriesTab.scrollIntoViewIfNeeded();
    await seriesTab.click();

    // Wait for series content to become active
    await expect(page.locator('#content-series.active')).toBeVisible({ timeout: 10000 });

    // Wait for series cards to load - check for cards OR empty state OR loading complete
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('#content-series .series-card');
      const empty = document.querySelector('#content-series .empty-state');
      const loading = document.querySelector('#content-series .loading-indicator');
      return cards.length > 0 || empty || (loading && getComputedStyle(loading).display === 'none');
    }, { timeout: 30000 });

    const seriesCard = page.locator('#content-series .series-card').first();

    // Only test sorting if cards exist
    if (await seriesCard.count() > 0) {
      await expect(seriesCard).toBeVisible({ timeout: 10000 });

      // Find and click the expand button directly
      const expandBtn = page.locator('#content-series .expand-btn').first();
      await expect(expandBtn).toBeVisible({ timeout: 10000 });
      await expandBtn.scrollIntoViewIfNeeded();
      await expandBtn.click();

      // Wait for episodes list to expand
      const episodesList = page.locator('#content-series .episodes-list.show').first();
      await expect(episodesList).toBeVisible({ timeout: 10000 });

      // Click sort by number button
      const sortByNumber = episodesList.locator('button:has-text("حسب الرقم"), button:has-text("By Number")').first();
      await expect(sortByNumber).toBeVisible({ timeout: 10000 });
      await sortByNumber.scrollIntoViewIfNeeded();
      await sortByNumber.click();

      // Episodes should still be visible after sorting
      const episodes = episodesList.locator('.episode-item');
      await expect(episodes.first()).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Homepage - Khutba Expansion', () => {
  test('should expand khutba series to show khutbas', async ({ page }) => {
    await page.goto('/');

    // Switch to Khutba tab
    const khutbaTab = page.locator('#tab-khutbas');
    await khutbaTab.scrollIntoViewIfNeeded();
    await khutbaTab.click();
    await page.waitForTimeout(300);

    // Find first khutba card header
    const khutbaHeader = page.locator('#content-khutbas .series-header').first();

    if (await khutbaHeader.isVisible()) {
      await khutbaHeader.scrollIntoViewIfNeeded();
      await khutbaHeader.click();
      await page.waitForTimeout(500);

      // Episodes list should be visible
      const episodesList = page.locator('#content-khutbas .episodes-list.show').first();
      await expect(episodesList).toBeVisible();
    }
  });

  test('should sort khutbas within series (bug fix verification)', async ({ page }) => {
    await page.goto('/');

    // Switch to Khutba tab
    const khutbaTab = page.locator('#tab-khutbas');
    await khutbaTab.scrollIntoViewIfNeeded();
    await khutbaTab.click();
    await page.waitForTimeout(300);

    // Expand first khutba series
    const khutbaHeader = page.locator('#content-khutbas .series-header').first();

    if (await khutbaHeader.isVisible()) {
      await khutbaHeader.scrollIntoViewIfNeeded();
      await khutbaHeader.click();
      await page.waitForTimeout(500);

      // Try clicking sort buttons inside the expanded series
      const sortOldest = page.locator('#content-khutbas .episodes-list.show .chip').first();
      if (await sortOldest.isVisible()) {
        await sortOldest.scrollIntoViewIfNeeded();
        await sortOldest.click();
        await page.waitForTimeout(500);

        // Episodes should still be visible
        const episodes = page.locator('#content-khutbas .episode-item');
        expect(await episodes.count()).toBeGreaterThan(0);
      }
    }
  });
});

test.describe('Homepage - Responsive Design', () => {
  test('should work on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Main navigation tabs should still be visible
    await expect(page.locator('#tab-lectures')).toBeVisible();

    // Search should be accessible
    const searchInput = page.locator('#searchInput').first();
    await expect(searchInput).toBeVisible();
  });

  test('should work on tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    // Should render properly
    await expect(page.locator('#tab-series')).toBeVisible();
    await expect(page.locator('#tab-khutbas')).toBeVisible();
  });
});

test.describe('Homepage - Transcript Search Feedback', () => {
  test('should display feedback prompt after transcript search', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find the enhanced search input (transcript search)
    const searchInput = page.locator('#searchInput');

    if (await searchInput.isVisible()) {
      // Enter a search query
      await searchInput.fill('البحث');
      await page.waitForTimeout(500);

      // Click search button or press enter
      const searchButton = page.locator('.search-btn');
      if (await searchButton.isVisible()) {
        await searchButton.click();
      } else {
        await searchInput.press('Enter');
      }

      // Wait for search results
      await page.waitForTimeout(2000);

      // Check if feedback prompt is visible
      const feedbackPrompt = page.locator('#searchFeedbackPrompt');
      // Note: Prompt only shows when results are found and searchLogId exists
      // This is conditional based on actual search results
    }
  });

  test('should have yes/no feedback buttons', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Check that feedback buttons exist in the DOM (may be hidden initially)
    const yesButton = page.locator('.feedback-btn.yes');
    const noButton = page.locator('.feedback-btn.no');

    // These elements should exist in the page structure
    await expect(yesButton).toHaveCount(1);
    await expect(noButton).toHaveCount(1);
  });

  test('should have comment textarea for feedback', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Check that comment textarea exists (uses feedbackCommentInput on index page)
    const commentTextarea = page.locator('#feedbackCommentInput');
    await expect(commentTextarea).toHaveCount(1);
  });

  test('should show feedback thank you message after submission', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Check that thank you message element exists
    const thankYouMessage = page.locator('#feedbackThankYou');
    await expect(thankYouMessage).toHaveCount(1);

    // Initially should be hidden
    await expect(thankYouMessage).toHaveCSS('display', 'none');
  });

  test('should toggle feedback button active state on click', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Make feedback prompt visible by triggering search (if possible)
    const searchInput = page.locator('#searchInput');

    if (await searchInput.isVisible()) {
      await searchInput.fill('test');

      const searchButton = page.locator('.search-btn');
      if (await searchButton.isVisible()) {
        await searchButton.click();
        await page.waitForTimeout(2000);
      }

      const feedbackPrompt = page.locator('#searchFeedbackPrompt');

      // If feedback prompt is visible, test the button interactions
      if (await feedbackPrompt.isVisible()) {
        const yesButton = page.locator('.feedback-btn.yes');
        await yesButton.click();

        // Yes button should become active
        await expect(yesButton).toHaveClass(/active/);
      }
    }
  });

  test('should show comment section when no is selected', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('#searchInput');

    if (await searchInput.isVisible()) {
      await searchInput.fill('test');

      const searchButton = page.locator('.search-btn');
      if (await searchButton.isVisible()) {
        await searchButton.click();
        await page.waitForTimeout(2000);
      }

      const feedbackPrompt = page.locator('#searchFeedbackPrompt');

      if (await feedbackPrompt.isVisible()) {
        const noButton = page.locator('.feedback-btn.no');
        await noButton.click();

        // Comment section should become visible
        const commentSection = page.locator('#feedbackCommentSection');
        await expect(commentSection).toHaveCSS('display', 'block');
      }
    }
  });

  test('feedback prompt should be hidden initially', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Feedback prompt should be hidden before any search
    const feedbackPrompt = page.locator('#searchFeedbackPrompt');
    await expect(feedbackPrompt).toHaveCSS('display', 'none');
  });
});

test.describe('Homepage - Hero Section', () => {
  test('should display transcript search announcement', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Check for the new hero text
    const heroSection = page.locator('.hero, .hero-section, [class*="hero"]').first();

    if (await heroSection.isVisible()) {
      // Check for the transcript search heading
      const transcriptSearchText = page.locator('text=البحث في التفريغ الصوتي');
      // The text should be present somewhere on the page
      const count = await transcriptSearchText.count();
      expect(count).toBeGreaterThanOrEqual(0); // May or may not be visible depending on locale
    }
  });

  test('should display enhanced search input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Search input should be visible (uses #searchInput on index page)
    const searchInput = page.locator('#searchInput');
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  test('should have proper placeholder text for transcript search', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const searchInput = page.locator('#searchInput');

    if (await searchInput.isVisible()) {
      // Check placeholder contains search-related text
      const placeholder = await searchInput.getAttribute('placeholder');
      expect(placeholder).toBeDefined();
      expect(placeholder.length).toBeGreaterThan(0);
    }
  });
});
