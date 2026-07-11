/**
 * Homepage Module - Server-side filtering and pagination
 *
 * Handles:
 * - Tab switching (series, lectures, khutbas)
 * - Category/type filtering via API
 * - Search via API with debounce
 * - Pagination (load more)
 * - URL state persistence
 */

(function() {
  'use strict';

  // Debug mode - only log in development (localhost)
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const log = isDev ? console.log.bind(console) : function() {};

  // Reinitialize Lucide icons after dynamic content is added
  function refreshIcons() {
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  // State
  const state = {
    tab: 'series',
    page: 1,
    limit: 10,
    category: 'all',
    type: 'all',
    search: '',
    sort: 'newest',
    loading: false,
    hasMore: {
      series: true,
      standalone: true,
      khutbas: true
    }
  };

  // Category translations
  const categoryTranslations = {
    ar: {
      'Tafsir': 'تفسير',
      'Hadith': 'حديث',
      'Fiqh': 'فقه',
      'Aqeedah': 'عقيدة',
      'Seerah': 'سيرة',
      'Akhlaq': 'أخلاق',
      'Other': 'أخرى'
    },
    en: {
      'Tafsir': 'Tafsir',
      'Hadith': 'Hadith',
      'Fiqh': 'Fiqh',
      'Aqeedah': 'Aqeedah',
      'Seerah': 'Seerah',
      'Akhlaq': 'Akhlaq',
      'Other': 'Other'
    }
  };

  // Get category translation
  function translateCategory(category) {
    const locale = getLocale();
    return categoryTranslations[locale]?.[category] || categoryTranslations['en'][category] || category;
  }

  // Get current locale (defined in index.ejs template)
  function getLocale() {
    return typeof currentLocale !== 'undefined' ? currentLocale : 'ar';
  }

  // Localized strings
  const strings = {
    ar: {
      loadMore: 'تحميل المزيد',
      loading: 'جاري التحميل...',
      play: 'تشغيل',
      download: 'تحميل',
      sheikh: 'الشيخ:',
      author: 'المؤلف:',
      lesson: 'درس',
      lessons: 'درس',
      showLessons: '+',
      showKhutbahs: '+',
      sortLessons: 'ترتيب الدروس:',
      byNumber: 'حسب الرقم',
      oldestFirst: 'الأقدم أولاً',
      newestFirst: 'الأحدث أولاً',
      noSeries: 'لا توجد سلاسل',
      noKhutbahs: 'لا توجد خطب',
      noLectures: 'لا توجد محاضرات',
      tryAnotherSearch: 'جرب بحثاً آخر'
    },
    en: {
      loadMore: 'Load More',
      loading: 'Loading...',
      play: 'Play',
      download: 'Download',
      sheikh: 'Sheikh:',
      author: 'Author:',
      lesson: 'lesson',
      lessons: 'lessons',
      showLessons: '+',
      showKhutbahs: '+',
      sortLessons: 'Sort lessons:',
      byNumber: 'By Number',
      oldestFirst: 'Oldest First',
      newestFirst: 'Newest First',
      noSeries: 'No series found',
      noKhutbahs: 'No khutbahs found',
      noLectures: 'No lectures found',
      tryAnotherSearch: 'Try another search'
    }
  };

  // Get localized string
  function t(key) {
    const locale = getLocale();
    return strings[locale]?.[key] || strings['ar'][key] || key;
  }

  // DOM elements
  let seriesContainer, standaloneContainer, khutbasContainer;
  let loadMoreBtn, loadingIndicator;

  /**
   * Initialize the module
   */
  function init() {
    log('[HOMEPAGE] init() starting');

    // Get containers
    seriesContainer = document.querySelector('#content-series .series-list');
    standaloneContainer = document.querySelector('#content-lectures .series-list');
    khutbasContainer = document.querySelector('#content-khutbas .series-list');
    log('[HOMEPAGE] Containers found:', { series: !!seriesContainer, standalone: !!standaloneContainer, khutbas: !!khutbasContainer });

    // Create load more button
    createLoadMoreButton();

    // Create loading indicator
    createLoadingIndicator();

    // Parse URL state
    parseUrlState();
    log('[HOMEPAGE] URL state parsed:', state);

    // Bind events
    bindEvents();
    log('[HOMEPAGE] Events bound');

    // Update UI to match state
    updateUIFromState();

    // Check if we need to load more (if no initial server-rendered content)
    checkInitialContent();
    log('[HOMEPAGE] init() complete');
  }

  /**
   * Parse URL query parameters to state
   */
  function parseUrlState() {
    const params = new URLSearchParams(window.location.search);

    if (params.has('tab')) {
      state.tab = params.get('tab');
    }
    if (params.has('category')) {
      state.category = params.get('category');
    }
    if (params.has('type')) {
      state.type = params.get('type');
    }
    if (params.has('search')) {
      state.search = params.get('search');
    }
    if (params.has('sort')) {
      state.sort = params.get('sort');
    }
  }

  /**
   * Update URL with current state
   */
  function updateUrl() {
    const params = new URLSearchParams();

    if (state.tab !== 'series') params.set('tab', state.tab);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.type !== 'all') params.set('type', state.type);
    if (state.search) params.set('search', state.search);
    if (state.sort !== 'newest') params.set('sort', state.sort);

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;

    window.history.replaceState({}, '', newUrl);
  }

  /**
   * Update UI elements to match current state
   */
  function updateUIFromState() {
    // Update tab - only modify classes if they differ from current state
    // This prevents the flash caused by removing and re-adding the same class
    const activeTab = document.getElementById('tab-' + state.tab);
    const activeContent = document.getElementById('content-' + state.tab);

    document.querySelectorAll('.nav-tab').forEach(tab => {
      const shouldBeActive = tab === activeTab;
      if (shouldBeActive && !tab.classList.contains('active')) {
        tab.classList.add('active');
      } else if (!shouldBeActive && tab.classList.contains('active')) {
        tab.classList.remove('active');
      }
    });

    document.querySelectorAll('.tab-content').forEach(content => {
      const shouldBeActive = content === activeContent;
      if (shouldBeActive && !content.classList.contains('active')) {
        content.classList.add('active');
      } else if (!shouldBeActive && content.classList.contains('active')) {
        content.classList.remove('active');
      }
    });

    // Update category chips
    document.querySelectorAll('.chip[data-type="category"]').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.filter === state.category);
    });

    // Update type chips
    document.querySelectorAll('.chip[data-type="seriesType"]').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.filter === state.type);
    });

    // Update sort chips
    document.querySelectorAll('.chip[data-sort]').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.sort === state.sort);
    });

    // Update title search input
    const titleSearchInput = document.getElementById('titleSearchInput');
    if (titleSearchInput && state.search) {
      titleSearchInput.value = state.search;
    }

    // Update clear button visibility
    updateClearButtonVisibility();

    // Update load more button position
    updateLoadMoreButton();
  }

  /**
   * Create load more button
   */
  function createLoadMoreButton() {
    loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'load-more-btn';
    loadMoreBtn.innerHTML = t('loadMore');
    loadMoreBtn.style.cssText = `
      display: none;
      width: 100%;
      max-width: 300px;
      margin: 24px auto;
      padding: 12px 24px;
      background: var(--color-gold, #C19A6B);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    `;
    loadMoreBtn.addEventListener('click', loadMore);
  }

  /**
   * Create loading indicator
   */
  function createLoadingIndicator() {
    loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 24px; color: #666;">
        <svg width="24" height="24" viewBox="0 0 24 24" class="spin">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.3"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2" fill="none"/>
        </svg>
        <span>${t('loading')}</span>
      </div>
    `;
    loadingIndicator.style.display = 'none';

    // Add spin animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .spin { animation: spin 1s linear infinite; }
      .load-more-btn:hover { background: var(--color-gold-dark, #A67C52); }
    `;
    document.head.appendChild(style);
  }

  /**
   * Update load more button position
   */
  function updateLoadMoreButton() {
    let container;
    if (state.tab === 'series') container = seriesContainer;
    else if (state.tab === 'lectures') container = standaloneContainer;
    else if (state.tab === 'khutbas') container = khutbasContainer;

    if (container) {
      // Remove from previous location
      if (loadMoreBtn.parentNode) {
        loadMoreBtn.parentNode.removeChild(loadMoreBtn);
      }
      if (loadingIndicator.parentNode) {
        loadingIndicator.parentNode.removeChild(loadingIndicator);
      }

      // Add after container
      container.parentNode.appendChild(loadingIndicator);
      container.parentNode.appendChild(loadMoreBtn);

      // Show/hide based on hasMore
      const tabKey = state.tab === 'lectures' ? 'standalone' : state.tab;
      loadMoreBtn.style.display = state.hasMore[tabKey] ? 'block' : 'none';
    }
  }

  /**
   * Check if initial content was server-rendered
   */
  function checkInitialContent() {
    const container = getActiveContainer();
    if (container) {
      const cards = container.querySelectorAll('.series-card');
      // If filters are applied but no cards, fetch from API
      if (cards.length === 0 || state.category !== 'all' || state.type !== 'all' || state.search) {
        // Filters active, need to fetch
        state.page = 1;
        fetchData(true);
      }
    }
  }

  /**
   * Get the active container based on current tab
   */
  function getActiveContainer() {
    if (state.tab === 'series') return seriesContainer;
    if (state.tab === 'lectures') return standaloneContainer;
    if (state.tab === 'khutbas') return khutbasContainer;
    return null;
  }

  /**
   * Bind event listeners
   */
  function bindEvents() {
    // Tab switching
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', function() {
        const tabName = this.id.replace('tab-', '');
        switchTab(tabName);
      });
    });

    // Category filter chips
    document.querySelectorAll('.chip[data-type="category"]').forEach(chip => {
      chip.addEventListener('click', function() {
        setFilter('category', this.dataset.filter);
      });
    });

    // Series type filter chips
    document.querySelectorAll('.chip[data-type="seriesType"]').forEach(chip => {
      chip.addEventListener('click', function() {
        setFilter('type', this.dataset.filter);
      });
    });

    // Sort chips
    document.querySelectorAll('.chip[data-sort]').forEach(chip => {
      chip.addEventListener('click', function() {
        setSort(this.dataset.sort);
      });
    });

    // Title/Name search input with debounce (separate from transcript search)
    const titleSearchInput = document.getElementById('titleSearchInput');
    const titleSearchIcon = document.getElementById('titleSearchIcon');
    log('[TITLE SEARCH] titleSearchInput element:', titleSearchInput);
    log('[TITLE SEARCH] titleSearchIcon element:', titleSearchIcon);

    if (titleSearchInput) {
      log('[TITLE SEARCH] Attaching input event listener');
      let searchTimeout;

      // Input event with debounce
      titleSearchInput.addEventListener('input', function() {
        log('[TITLE SEARCH] Input event fired, value:', this.value);
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          log('[TITLE SEARCH] Debounce complete, calling setSearch with:', this.value);
          setSearch(this.value);
        }, 300);
      });

      // Enter key handler
      titleSearchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          log('[TITLE SEARCH] Enter key pressed, value:', this.value);
          clearTimeout(searchTimeout);
          setSearch(this.value);
        }
      });

      // Focus event for debugging
      titleSearchInput.addEventListener('focus', function() {
        log('[TITLE SEARCH] Input focused');
      });
    } else {
      console.warn('[TITLE SEARCH] titleSearchInput element NOT FOUND!');
    }

    // Search icon click handler
    if (titleSearchIcon) {
      titleSearchIcon.addEventListener('click', function() {
        log('[TITLE SEARCH] Search icon clicked');
        const value = titleSearchInput?.value || '';
        log('[TITLE SEARCH] Icon click - searching for:', value);
        setSearch(value);
      });
    }

    // Clear filters button
    const clearBtn = document.getElementById('clearFiltersBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', clearAllFilters);
    }
  }

  /**
   * Switch tab
   */
  function switchTab(tabName) {
    state.tab = tabName;
    state.page = 1;

    updateUIFromState();
    updateUrl();

    // Fetch data if needed (filters applied or no content)
    const container = getActiveContainer();
    const cards = container ? container.querySelectorAll('.series-card') : [];

    if (cards.length === 0 || state.category !== 'all' || state.type !== 'all' || state.search) {
      fetchData(true);
    } else {
      // Apply client-side filter to existing content
      applyClientSideFilter();
    }
  }

  /**
   * Set filter and fetch data
   */
  function setFilter(filterType, value) {
    if (filterType === 'category') {
      state.category = value;
    } else if (filterType === 'type') {
      state.type = value;
    }

    state.page = 1;
    updateUIFromState();
    updateUrl();
    fetchData(true);
  }

  /**
   * Set sort order
   */
  function setSort(sortValue) {
    state.sort = sortValue;
    state.page = 1;

    updateUIFromState();
    updateUrl();
    fetchData(true);
  }

  /**
   * Set search term (for title/series name search)
   */
  function setSearch(term) {
    log('[TITLE SEARCH] setSearch() called with:', term);
    state.search = term.trim();
    state.page = 1;
    log('[TITLE SEARCH] Updated state.search:', state.search);

    updateUrl();
    updateClearButtonVisibility();
    log('[TITLE SEARCH] Calling fetchData to search by title/series name');
    fetchData(true);
  }

  /**
   * Clear all filters
   */
  function clearAllFilters() {
    state.category = 'all';
    state.type = 'all';
    state.search = '';
    state.sort = 'newest';
    state.page = 1;

    // Clear title search input
    const titleSearchInput = document.getElementById('titleSearchInput');
    if (titleSearchInput) titleSearchInput.value = '';

    updateUIFromState();
    updateUrl();
    fetchData(true);
  }

  /**
   * Update clear button visibility
   */
  function updateClearButtonVisibility() {
    const clearBtn = document.getElementById('clearFiltersBtn');
    if (!clearBtn) return;

    const hasActiveFilter =
      state.category !== 'all' ||
      state.type !== 'all' ||
      state.sort !== 'newest' ||
      state.search !== '';

    clearBtn.style.display = hasActiveFilter ? 'inline-block' : 'none';
  }

  /**
   * Load more data (pagination)
   */
  function loadMore() {
    state.page++;
    fetchData(false);
  }

  /**
   * Fetch data from API (for title/series name search)
   * @param {boolean} replace - If true, replace content; if false, append
   */
  async function fetchData(replace = true) {
    log('[TITLE SEARCH] fetchData() called, replace:', replace);
    if (state.loading) {
      log('[TITLE SEARCH] Already loading, returning');
      return;
    }

    state.loading = true;
    loadingIndicator.style.display = 'block';
    loadMoreBtn.style.display = 'none';

    try {
      let url;
      const params = new URLSearchParams();
      params.set('page', state.page);
      params.set('sort', state.sort);

      if (state.category !== 'all') params.set('category', state.category);
      if (state.search) params.set('search', state.search);

      if (state.tab === 'series') {
        url = '/api/homepage/series';
        params.set('limit', '10');
        if (state.type !== 'all') params.set('type', state.type);
      } else if (state.tab === 'lectures') {
        url = '/api/homepage/standalone';
        params.set('limit', '20');
      } else if (state.tab === 'khutbas') {
        url = '/api/homepage/khutbas';
        params.set('limit', '10');
      }

      const fullUrl = `${url}?${params.toString()}`;
      log('[TITLE SEARCH] Fetching from:', fullUrl);
      const response = await fetch(fullUrl);
      const data = await response.json();
      log('[TITLE SEARCH] API Response:', { success: data.success, count: data.series?.length || data.lectures?.length });

      if (data.success) {
        if (state.tab === 'lectures') {
          renderStandaloneLectures(data.lectures, replace);
          state.hasMore.standalone = data.pagination.hasMore;
        } else {
          const seriesData = data.series || [];
          if (state.tab === 'series') {
            renderSeries(seriesData, replace);
            state.hasMore.series = data.pagination.hasMore;
          } else if (state.tab === 'khutbas') {
            renderKhutbas(seriesData, replace);
            state.hasMore.khutbas = data.pagination.hasMore;
          }
        }

        updateLoadMoreButton();
      }
    } catch (error) {
      console.error('[TITLE SEARCH] Error fetching data:', error);
    } finally {
      state.loading = false;
      loadingIndicator.style.display = 'none';
    }
  }

  /**
   * Render series cards
   */
  function renderSeries(seriesList, replace) {
    if (!seriesContainer) return;

    // Remove loading skeleton if present
    const skeleton = document.getElementById('seriesLoadingSkeleton');
    if (skeleton) skeleton.remove();

    if (replace) {
      seriesContainer.innerHTML = '';
    }

    if (seriesList.length === 0 && replace) {
      seriesContainer.innerHTML = renderEmptyState('series');
      return;
    }

    seriesList.forEach(series => {
      const card = createSeriesCard(series, false);
      seriesContainer.appendChild(card);
    });
    refreshIcons();
  }

  /**
   * Render khutba series cards
   */
  function renderKhutbas(seriesList, replace) {
    if (!khutbasContainer) return;

    if (replace) {
      khutbasContainer.innerHTML = '';
    }

    if (seriesList.length === 0 && replace) {
      khutbasContainer.innerHTML = renderEmptyState('khutbas');
      return;
    }

    seriesList.forEach(series => {
      const card = createSeriesCard(series, true);
      khutbasContainer.appendChild(card);
    });
    refreshIcons();
  }

  /**
   * Render standalone lectures
   */
  function renderStandaloneLectures(lectures, replace) {
    if (!standaloneContainer) return;

    if (replace) {
      standaloneContainer.innerHTML = '';
    }

    if (lectures.length === 0 && replace) {
      standaloneContainer.innerHTML = renderEmptyState('standalone');
      return;
    }

    lectures.forEach(lecture => {
      const card = createStandaloneLectureCard(lecture);
      standaloneContainer.appendChild(card);
    });
    refreshIcons();
  }

  /**
   * Create a series card element
   */
  function createSeriesCard(series, isKhutba = false) {
    const div = document.createElement('div');
    div.className = 'series-card';
    div.dataset.category = series.category || 'Other';
    div.dataset.date = series.mostRecentDate ? new Date(series.mostRecentDate).getTime() : 0;
    div.dataset.seriesType = series.seriesType || 'masjid';

    const seriesIdPrefix = isKhutba ? 'khutba-' : '';
    const episodesId = isKhutba ? `khutba-episodes-${series._id}` : `episodes-${series._id}`;
    const btnId = isKhutba ? `khutba-btn-${series._id}` : `btn-${series._id}`;
    const toggleFn = isKhutba ? 'toggleKhutba' : 'toggleSeries';
    const btnText = isKhutba ? t('showKhutbahs') : t('showLessons');

    const locale = getLocale();
    const sheikhName = locale === 'ar'
      ? (series.sheikh?.nameArabic || '')
      : (series.sheikh?.nameEnglish || series.sheikh?.nameArabic || '');
    const seriesTitle = locale === 'ar'
      ? (series.titleArabic || '')
      : (series.titleEnglish || series.titleArabic || '');
    const categoryLabel = translateCategory(series.category);

    const seriesUrl = series.slug ? `/series/${encodeURIComponent(series.slug)}` : `/series/${series._id}`;

    div.innerHTML = `
      <div class="series-header" onclick="${toggleFn}('${series._id}')">
        <button class="expand-btn" id="${btnId}" aria-label="${isKhutba ? 'Show Khutbahs' : 'Show Lessons'}">
          <i data-lucide="plus" class="expand-icon"></i>
        </button>
        <div class="series-content">
          <h2 class="series-title"><a href="${seriesUrl}" onclick="event.stopPropagation()">${escapeHtml(seriesTitle)}</a></h2>
          <div class="series-sheikh">${escapeHtml(sheikhName)}</div>
          <div class="series-info">
            <span class="series-lesson-count">${series.lectureCount || 0} ${t('lesson')}</span>
            <span class="category-badge">${categoryLabel}</span>
          </div>
        </div>
      </div>

      <div class="episodes-list" id="${episodesId}">
        <div class="episode-sort-bar">
          <span class="episode-sort-label">${t('sortLessons')}</span>
          <div class="episode-sort-chips">
            <button class="sort-chip active" onclick="sortSeriesLectures('${seriesIdPrefix}${series._id}', 'number'); event.stopPropagation();">
              ${t('byNumber')}
            </button>
            <button class="sort-chip" onclick="sortSeriesLectures('${seriesIdPrefix}${series._id}', 'oldest'); event.stopPropagation();">
              ${t('oldestFirst')}
            </button>
            <button class="sort-chip" onclick="sortSeriesLectures('${seriesIdPrefix}${series._id}', 'newest'); event.stopPropagation();">
              ${t('newestFirst')}
            </button>
          </div>
        </div>
        <div class="episodes-container">
          ${(series.lectures || []).map((lecture, index) => createEpisodeHtml(lecture, index, sheikhName)).join('')}
        </div>
      </div>
    `;

    return div;
  }

  /**
   * Create episode HTML for a lecture within a series
   */
  function createEpisodeHtml(lecture, index, sheikhName) {
    const locale = getLocale();
    const duration = lecture.duration && lecture.duration > 0
      ? `<i data-lucide="clock"></i> ${formatTime(lecture.duration)}`
      : '';

    const hijriDate = lecture.dateRecordedHijri
      ? `<i data-lucide="calendar"></i> ${formatHijriDate(lecture.dateRecordedHijri)}`
      : '';

    const lectureDate = lecture.dateRecorded ? new Date(lecture.dateRecorded).getTime() : 0;
    const lectureTitle = locale === 'ar'
      ? (lecture.titleArabic || '')
      : (lecture.titleEnglish || lecture.titleArabic || '');
    const titleEscaped = escapeHtml(lectureTitle).replace(/'/g, "\\'");
    const sheikhEscaped = escapeHtml(sheikhName).replace(/'/g, "\\'");

    return `
      <div class="episode-item" data-lecture-number="${index + 1}" data-date="${lectureDate}">
        <div class="episode-header">
          <div class="episode-number">${index + 1}</div>
          <div class="episode-title">${escapeHtml(lectureTitle)}</div>
        </div>
        <div class="episode-meta">
          ${duration ? `<span>${duration}</span>` : ''}
          ${lecture.location ? `<span>${escapeHtml(lecture.location)}</span>` : ''}
          ${hijriDate ? `<span class="hijri-date">${hijriDate}</span>` : ''}
        </div>
        <div class="episode-actions">
          <button class="btn-play" onclick="playAudio('${lecture._id}', '${titleEscaped}', '${sheikhEscaped}')">
            <i data-lucide="play"></i> ${t('play')}
          </button>
          <a href="/download/${lecture._id}" class="btn-download">
            <i data-lucide="download"></i> ${t('download')}
          </a>
        </div>
      </div>
    `;
  }

  /**
   * Create a standalone lecture card
   */
  function createStandaloneLectureCard(lecture) {
    const div = document.createElement('div');
    div.className = 'series-card';
    const locale = getLocale();

    const lectureDate = lecture.dateRecorded ? new Date(lecture.dateRecorded).getTime() :
      (lecture.createdAt ? new Date(lecture.createdAt).getTime() : Date.now());
    div.dataset.date = lectureDate;
    div.dataset.hijri = lecture.dateRecordedHijri || '';

    const sheikhName = locale === 'ar'
      ? (lecture.sheikhId?.nameArabic || '')
      : (lecture.sheikhId?.nameEnglish || lecture.sheikhId?.nameArabic || '');
    const lectureTitle = locale === 'ar'
      ? (lecture.titleArabic || '')
      : (lecture.titleEnglish || lecture.titleArabic || '');
    const duration = lecture.duration && lecture.duration > 0
      ? `<i data-lucide="clock"></i> ${formatTime(lecture.duration)}`
      : '';
    const hijriDate = lecture.dateRecordedHijri
      ? `<i data-lucide="calendar"></i> ${formatHijriDate(lecture.dateRecordedHijri)}`
      : '';

    const titleEscaped = escapeHtml(lectureTitle).replace(/'/g, "\\'");
    const sheikhEscaped = escapeHtml(sheikhName).replace(/'/g, "\\'");

    div.innerHTML = `
      <div class="series-header">
        <h2 class="series-title">${escapeHtml(lectureTitle)}</h2>
        <div class="series-meta">
          <div class="series-sheikh">
            ${t('sheikh')} ${escapeHtml(sheikhName)}
          </div>
        </div>
        <div class="series-info">
          ${duration ? `<span>${duration}</span>` : ''}
          ${hijriDate ? `<span class="hijri-date">${hijriDate}</span>` : ''}
        </div>
        <div class="episode-actions" style="margin-top: 16px;">
          ${lecture.audioFileName || lecture.audioUrl ? `
            <button class="btn-play" onclick="playAudio('${lecture._id}', '${titleEscaped}', '${sheikhEscaped}')">
              <i data-lucide="play"></i> ${t('play')}
            </button>
            <a href="/download/${lecture._id}" class="btn-download">
              <i data-lucide="download"></i> ${t('download')}
            </a>
          ` : ''}
        </div>
      </div>
    `;

    return div;
  }

  /**
   * Render empty state
   */
  function renderEmptyState(tabType) {
    const emptyMessages = {
      series: { ar: 'لا توجد سلاسل', en: 'No series found' },
      khutbas: { ar: 'لا توجد خطب', en: 'No khutbahs found' },
      standalone: { ar: 'لا توجد محاضرات', en: 'No lectures found' }
    };
    const locale = getLocale();
    const emptyMsg = emptyMessages[tabType]?.[locale] || emptyMessages[tabType]?.['ar'] || tabType;

    return `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="book-open"></i></div>
        <h3 class="empty-title">${emptyMsg}</h3>
        <p class="empty-text">${t('tryAnotherSearch')}</p>
      </div>
    `;
  }

  /**
   * Format Hijri date
   */
  function formatHijriDate(dateStr) {
    if (!dateStr) return '';

    const locale = getLocale();
    // Only convert to Arabic numerals for Arabic locale
    if (locale === 'ar') {
      const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
      return dateStr.replace(/[0-9]/g, d => arabicNumerals[parseInt(d)]);
    }
    return dateStr;
  }

  /**
   * Format time in H:MM:SS or MM:SS
   */
  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Apply client-side filter to existing content
   * (Used when filters match server-rendered content)
   */
  function applyClientSideFilter() {
    const container = getActiveContainer();
    if (!container) return;

    const cards = container.querySelectorAll('.series-card');
    cards.forEach(card => {
      const category = card.dataset.category;
      const seriesType = card.dataset.seriesType;

      const categoryMatch = state.category === 'all' || category === state.category;
      const typeMatch = state.type === 'all' || seriesType === state.type;

      card.style.display = (categoryMatch && typeMatch) ? 'block' : 'none';
    });

    // Apply sort
    sortCards(container);
  }

  /**
   * Sort cards in container
   */
  function sortCards(container) {
    const cards = Array.from(container.querySelectorAll('.series-card'));

    cards.sort((a, b) => {
      const dateA = parseInt(a.dataset.date) || 0;
      const dateB = parseInt(b.dataset.date) || 0;
      return state.sort === 'newest' ? dateB - dateA : dateA - dateB;
    });

    cards.forEach(card => container.appendChild(card));
  }

  // Expose functions globally for onclick handlers
  window.switchTab = switchTab;
  window.filterBySeriesType = (type) => setFilter('type', type);
  window.sortByDate = setSort;
  window.clearAllFilters = clearAllFilters;

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/**
 * Enhanced Search Module
 * Handles transcript search with push-down results display
 */
(function() {
  'use strict';

  // Debug mode - only log in development (localhost)
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const log = isDev ? console.log.bind(console) : function() {};

  // State for enhanced search
  const searchState = {
    isActive: false,
    query: '',
    results: [],
    searchLogId: null,
    currentPlayingBtn: null,
    feedbackSelected: null,
    feedbackSubmitted: false
  };

  // DOM elements
  let searchInput, searchResultsContainer, searchResultsList, searchResultsCount;
  let searchAudioPlayer;
  let feedbackPrompt, feedbackYesBtn, feedbackNoBtn, feedbackCommentSection;
  let feedbackCommentInput, feedbackSubmitBtn, feedbackThankYou;

  // Get current locale
  function getLocale() {
    return typeof currentLocale !== 'undefined' ? currentLocale : 'ar';
  }

  // Localized strings for search
  const searchStrings = {
    ar: {
      resultsIn: 'تم العثور على نتائج في',
      lectures: 'محاضرة',
      noResults: 'لم يتم العثور على نتائج',
      tryDifferent: 'جرّب استخدام كلمات مختلفة أو أقل',
      searching: 'جاري البحث...',
      playFrom: 'تشغيل',
      pause: 'إيقاف',
      moreResults: 'نتائج أخرى',
      inSameLecture: 'من هذه المحاضرة',
      otherResults: 'نتائج أخرى في نفس المحاضرة:',
      goToLecture: 'الذهاب للمحاضرة'
    },
    en: {
      resultsIn: 'Found results in',
      lectures: 'lecture(s)',
      noResults: 'No results found',
      tryDifferent: 'Try using different or fewer words',
      searching: 'Searching...',
      playFrom: 'Play',
      pause: 'Pause',
      moreResults: 'more results',
      inSameLecture: 'in this lecture',
      otherResults: 'Other results in this lecture:',
      goToLecture: 'Go to Lecture'
    }
  };

  function ts(key) {
    const locale = getLocale();
    return searchStrings[locale]?.[key] || searchStrings['ar'][key] || key;
  }

  /**
   * Initialize enhanced search (hero transcript search)
   */
  function initEnhancedSearch() {
    log('[HERO SEARCH] initEnhancedSearch() starting');

    searchInput = document.getElementById('searchInput');
    searchResultsContainer = document.getElementById('enhancedSearchResults');
    searchResultsList = document.getElementById('searchResultsList');
    searchResultsCount = document.getElementById('searchResultsCount');
    searchAudioPlayer = document.getElementById('searchAudioPlayer');

    // Feedback elements
    feedbackPrompt = document.getElementById('searchFeedbackPrompt');
    feedbackYesBtn = document.getElementById('feedbackYesBtn');
    feedbackNoBtn = document.getElementById('feedbackNoBtn');
    feedbackCommentSection = document.getElementById('feedbackCommentSection');
    feedbackCommentInput = document.getElementById('feedbackCommentInput');
    feedbackSubmitBtn = document.getElementById('feedbackSubmitBtn');
    feedbackThankYou = document.getElementById('feedbackThankYou');

    log('[HERO SEARCH] Elements found:', {
      searchInput: !!searchInput,
      searchResultsContainer: !!searchResultsContainer,
      searchResultsList: !!searchResultsList,
      searchResultsCount: !!searchResultsCount,
      searchAudioPlayer: !!searchAudioPlayer,
      feedbackPrompt: !!feedbackPrompt
    });

    if (!searchInput || !searchResultsContainer) {
      console.warn('[HERO SEARCH] Required elements not found, aborting init');
      return;
    }

    // Handle Enter key in search input
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        log('[HERO SEARCH] Enter key pressed');
        e.preventDefault();
        performSearch();
      }
    });
    log('[HERO SEARCH] Enter key listener attached');

    // Handle audio ended
    if (searchAudioPlayer) {
      searchAudioPlayer.addEventListener('ended', function() {
        if (searchState.currentPlayingBtn) {
          searchState.currentPlayingBtn.classList.remove('playing');
          searchState.currentPlayingBtn.innerHTML = `<span class="play-icon"><i data-lucide="play"></i></span> ${ts('playFrom')}`;
          searchState.currentPlayingBtn = null;
        }
      });
    }

    log('[HERO SEARCH] initEnhancedSearch() complete');
  }

  /**
   * Perform enhanced search (transcript search via /search/api)
   */
  async function performSearch() {
    log('[HERO SEARCH] performSearch() called');
    const query = searchInput?.value?.trim();
    log('[HERO SEARCH] Query:', query);

    if (!query) {
      log('[HERO SEARCH] Empty query, returning');
      return;
    }

    searchState.query = query;
    searchState.isActive = true;

    // Show loading state
    showSearchLoading();
    log('[HERO SEARCH] Fetching transcript results from /search/api');

    try {
      const response = await fetch(`/search/api?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      log('[HERO SEARCH] API Response:', data);

      if (data.success) {
        log('[HERO SEARCH] Success! Results count:', data.results?.length);
        searchState.results = data.results;
        searchState.searchLogId = data.searchLogId;
        renderSearchResults(data.results, query);
      } else {
        log('[HERO SEARCH] API Error:', data.error);
        showSearchError(data.error || 'حدث خطأ أثناء البحث');
      }
    } catch (error) {
      console.error('[HERO SEARCH] Fetch error:', error);
      showSearchError('حدث خطأ أثناء البحث. يرجى المحاولة مرة أخرى.');
    }
  }

  /**
   * Show loading state
   */
  function showSearchLoading() {
    searchResultsContainer.classList.add('active');
    searchResultsList.innerHTML = `
      <div class="search-loading">
        <div class="spinner"></div>
        <span>${ts('searching')}</span>
      </div>
    `;
    searchResultsCount.textContent = '';
  }

  /**
   * Show error message
   */
  function showSearchError(message) {
    searchResultsList.innerHTML = `
      <div class="search-no-results">
        <div class="search-no-results-icon">⚠️</div>
        <div class="search-no-results-text">${escapeHtml(message)}</div>
      </div>
    `;
  }

  /**
   * Render search results
   */
  function renderSearchResults(results, query) {
    searchResultsContainer.classList.add('active');

    if (results.length === 0) {
      searchResultsList.innerHTML = `
        <div class="search-no-results">
          <div class="search-no-results-icon">🔍</div>
          <div class="search-no-results-text">${ts('noResults')}: "${escapeHtml(query)}"</div>
          <div class="search-no-results-hint">${ts('tryDifferent')}</div>
        </div>
      `;
      searchResultsCount.textContent = '';
      return;
    }

    searchResultsCount.textContent = `(${ts('resultsIn')} ${results.length} ${ts('lectures')})`;

    // Show feedback prompt if we have results and haven't submitted feedback yet
    showFeedbackPrompt();

    const html = results.map((result, index) => {
      const audioUrl = result.audioUrl || (result.audioFileName ? `/audio/${result.audioFileName}` : '');
      const hasAudio = !!audioUrl;
      const hasAdditionalHits = result.additionalHits && result.additionalHits.length > 0;

      return `
        <article class="search-result-card">
          <h3 class="result-lecture-title">${escapeHtml(result.lectureTitle || 'محاضرة')}</h3>

          <div class="result-meta">
            ${result.speaker ? `<span class="result-speaker">${escapeHtml(result.speaker)}</span>` : ''}
            <span class="result-timestamp"><i data-lucide="clock"></i> ${escapeHtml(result.formattedTime || '')}</span>
          </div>

          <div class="result-context">
            ${result.contextBefore ? `<span class="context-before">${escapeHtml(result.contextBefore)} </span>` : ''}
            <span class="hit-text">${escapeHtml(result.text)}</span>
            ${result.contextAfter ? `<span class="context-after"> ${escapeHtml(result.contextAfter)}</span>` : ''}
          </div>

          <div class="result-actions">
            ${hasAudio ? `
              <button
                type="button"
                class="result-play-btn"
                data-audio-url="${escapeHtml(audioUrl)}"
                data-start-time="${result.startTimeSec || 0}"
                onclick="playSearchAudio(this)"
              >
                <span class="play-icon"><i data-lucide="play"></i></span> ${ts('playFrom')}
              </button>
            ` : ''}

            ${result.lectureShortId ? `
              <a
                href="https://rasmihassan.com/lectures/${result.lectureShortId}${result.lectureSlugEn ? '/' + result.lectureSlugEn : ''}"
                class="goto-lecture-btn"
                target="_blank"
              >
                <span class="goto-icon">↗</span> ${ts('goToLecture')}
              </a>
            ` : ''}

            ${hasAdditionalHits ? `
              <button
                type="button"
                class="result-expand-btn"
                onclick="toggleAdditionalResults(this, 'additional-${index}')"
              >
                <span class="expand-icon">▼</span>
                ${result.additionalHits.length} ${ts('moreResults')} ${ts('inSameLecture')}
              </button>
            ` : ''}
          </div>

          ${hasAdditionalHits ? `
            <div class="additional-results" id="additional-${index}">
              <div class="additional-results-header">${ts('otherResults')}</div>
              ${result.additionalHits.map(hit => {
                const hitAudioUrl = audioUrl;
                return `
                  <div class="additional-hit">
                    <span class="additional-hit-text">
                      <strong><i data-lucide="clock"></i> ${escapeHtml(hit.formattedTime || formatTime(hit.startTimeSec))}</strong>
                      ${escapeHtml(hit.text)}
                    </span>
                    ${hitAudioUrl ? `
                      <button
                        type="button"
                        class="additional-hit-play"
                        data-audio-url="${escapeHtml(hitAudioUrl)}"
                        data-start-time="${hit.startTimeSec || 0}"
                        onclick="playSearchAudio(this)"
                      >
                        ▶ ${ts('playFrom')}
                      </button>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          ` : ''}
        </article>
      `;
    }).join('');

    searchResultsList.innerHTML = html;
    refreshIcons();
  }

  /**
   * Clear enhanced search and restore normal view
   */
  function clearEnhancedSearch() {
    searchState.isActive = false;
    searchState.query = '';
    searchState.results = [];
    searchState.searchLogId = null;
    searchState.feedbackSelected = null;
    searchState.feedbackSubmitted = false;

    // Hide results container
    searchResultsContainer.classList.remove('active');
    searchResultsList.innerHTML = '';
    searchResultsCount.textContent = '';

    // Reset feedback UI
    hideFeedbackPrompt();

    // Clear search input
    if (searchInput) {
      searchInput.value = '';
    }

    // Stop any playing audio
    if (searchAudioPlayer) {
      searchAudioPlayer.pause();
      searchAudioPlayer.src = '';
    }

    if (searchState.currentPlayingBtn) {
      searchState.currentPlayingBtn.classList.remove('playing');
      searchState.currentPlayingBtn = null;
    }
  }

  /**
   * Play audio from search result
   */
  function playSearchAudio(btn) {
    const audioUrl = btn.dataset.audioUrl;
    const startTime = parseFloat(btn.dataset.startTime) || 0;

    if (!audioUrl || !searchAudioPlayer) return;

    // If clicking the same button that's playing, pause it
    if (searchState.currentPlayingBtn === btn && !searchAudioPlayer.paused) {
      searchAudioPlayer.pause();
      btn.classList.remove('playing');
      btn.innerHTML = `<span class="play-icon"><i data-lucide="play"></i></span> ${ts('playFrom')}`;
      searchState.currentPlayingBtn = null;
      return;
    }

    // Reset previous playing button
    if (searchState.currentPlayingBtn) {
      searchState.currentPlayingBtn.classList.remove('playing');
      searchState.currentPlayingBtn.innerHTML = `<span class="play-icon"><i data-lucide="play"></i></span> ${ts('playFrom')}`;
    }

    // Load and play new audio
    searchAudioPlayer.src = audioUrl;
    searchAudioPlayer.currentTime = startTime;
    searchAudioPlayer.play()
      .then(() => {
        btn.classList.add('playing');
        btn.innerHTML = `<span class="play-icon">⏸</span> ${ts('pause')}`;
        searchState.currentPlayingBtn = btn;
      })
      .catch(err => {
        console.error('Audio playback error:', err);
        alert('حدث خطأ أثناء تشغيل الصوت');
      });
  }

  /**
   * Toggle additional results visibility
   */
  function toggleAdditionalResults(btn, targetId) {
    const target = document.getElementById(targetId);
    if (!target) return;

    const isOpen = target.classList.contains('open');
    if (isOpen) {
      target.classList.remove('open');
      btn.classList.remove('expanded');
    } else {
      target.classList.add('open');
      btn.classList.add('expanded');
    }
  }

  /**
   * Format time in H:MM:SS or MM:SS
   */
  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Show feedback prompt
   */
  function showFeedbackPrompt() {
    if (!feedbackPrompt || searchState.feedbackSubmitted) return;

    feedbackPrompt.classList.add('active');
    feedbackPrompt.classList.remove('submitted');

    // Reset button states
    if (feedbackYesBtn) feedbackYesBtn.classList.remove('selected');
    if (feedbackNoBtn) feedbackNoBtn.classList.remove('selected');
    if (feedbackCommentSection) feedbackCommentSection.classList.remove('active');
    if (feedbackCommentInput) feedbackCommentInput.value = '';
    if (feedbackThankYou) feedbackThankYou.classList.remove('active');
  }

  /**
   * Hide feedback prompt
   */
  function hideFeedbackPrompt() {
    if (feedbackPrompt) {
      feedbackPrompt.classList.remove('active');
      feedbackPrompt.classList.remove('submitted');
    }
    if (feedbackYesBtn) feedbackYesBtn.classList.remove('selected');
    if (feedbackNoBtn) feedbackNoBtn.classList.remove('selected');
    if (feedbackCommentSection) feedbackCommentSection.classList.remove('active');
    if (feedbackCommentInput) feedbackCommentInput.value = '';
    if (feedbackThankYou) feedbackThankYou.classList.remove('active');
  }

  /**
   * Select feedback (yes/no)
   */
  function selectFeedback(isRelevant) {
    searchState.feedbackSelected = isRelevant;

    // Update button states
    if (feedbackYesBtn) {
      feedbackYesBtn.classList.toggle('selected', isRelevant === true);
    }
    if (feedbackNoBtn) {
      feedbackNoBtn.classList.toggle('selected', isRelevant === false);
    }

    // Show comment section
    if (feedbackCommentSection) {
      feedbackCommentSection.classList.add('active');
    }
  }

  /**
   * Submit search feedback
   */
  async function submitSearchFeedback() {
    if (searchState.feedbackSelected === null || !searchState.searchLogId) {
      console.warn('[FEEDBACK] No feedback selected or no searchLogId');
      return;
    }

    // Disable submit button during submission
    if (feedbackSubmitBtn) {
      feedbackSubmitBtn.disabled = true;
    }

    try {
      const comment = feedbackCommentInput?.value?.trim() || '';

      const response = await fetch('/search/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          logId: searchState.searchLogId,
          relevant: searchState.feedbackSelected,
          comment: comment
        })
      });

      const data = await response.json();

      if (data.success) {
        log('[FEEDBACK] Submitted successfully');
        searchState.feedbackSubmitted = true;

        // Hide feedback prompt and show thank you
        if (feedbackPrompt) {
          feedbackPrompt.classList.remove('active');
          feedbackPrompt.classList.add('submitted');
        }
        if (feedbackThankYou) {
          feedbackThankYou.classList.add('active');

          // Auto-hide thank you message after 3 seconds
          setTimeout(() => {
            if (feedbackThankYou) {
              feedbackThankYou.classList.remove('active');
            }
          }, 3000);
        }
      } else {
        console.error('[FEEDBACK] Error:', data.error);
      }
    } catch (error) {
      console.error('[FEEDBACK] Submit error:', error);
    } finally {
      if (feedbackSubmitBtn) {
        feedbackSubmitBtn.disabled = false;
      }
    }
  }

  // Expose functions globally
  window.performSearch = performSearch;
  window.clearEnhancedSearch = clearEnhancedSearch;
  window.playSearchAudio = playSearchAudio;
  window.toggleAdditionalResults = toggleAdditionalResults;
  window.selectFeedback = selectFeedback;
  window.submitSearchFeedback = submitSearchFeedback;

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEnhancedSearch);
  } else {
    initEnhancedSearch();
  }
})();
