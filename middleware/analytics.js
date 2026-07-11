const { PageView } = require('../models');

/**
 * Middleware to track page views
 * Runs asynchronously to not block response
 */
const trackPageView = (req, res, next) => {
  // Skip tracking for:
  // - API routes
  // - Static assets
  // - Admin routes (track separately if needed)
  // - Bot/crawler requests
  const path = req.path;

  if (
    path.startsWith('/api/') ||
    path.startsWith('/admin/') ||
    path.startsWith('/auth/') ||
    path.startsWith('/stream/') ||
    path.startsWith('/download/') ||
    path.includes('.') || // Static files
    req.method !== 'GET'
  ) {
    return next();
  }

  // Check for common bot user agents
  const userAgent = req.get('User-Agent') || '';
  const isBot = /bot|crawl|spider|slurp|googlebot|bingbot|yandex/i.test(userAgent);

  if (isBot) {
    return next();
  }

  // Determine page type and resource ID
  let pageType = 'other';
  let resourceId = null;

  if (path === '/' || path === '') {
    pageType = 'homepage';
  } else if (path === '/lectures' || path.startsWith('/lectures/')) {
    pageType = 'lecture';
  } else if (path === '/series' || path.startsWith('/series/')) {
    pageType = 'series';
  } else if (path === '/sheikhs' || path.startsWith('/sheikhs/')) {
    pageType = 'sheikh';
  } else if (path === '/browse') {
    pageType = 'browse';
  }

  // Record the view asynchronously (don't block response)
  setImmediate(async () => {
    try {
      await PageView.recordView(path, pageType, resourceId);
    } catch (error) {
      // Log error but don't break the site
      console.error('Analytics tracking error:', error.message);
    }
  });

  next();
};

/**
 * Helper to get analytics summary for admin dashboard
 */
const getAnalyticsSummary = async () => {
  const { Lecture, SiteSettings } = require('../models');

  const [pageViewSummary, lectureStats, settings] = await Promise.all([
    PageView.getSummary(),
    Lecture.aggregate([
      { $match: { published: true } },
      {
        $group: {
          _id: null,
          totalPlays: { $sum: '$playCount' },
          totalDownloads: { $sum: '$downloadCount' },
          count: { $sum: 1 }
        }
      }
    ]),
    SiteSettings.getSettings()
  ]);

  const stats = lectureStats[0] || { totalPlays: 0, totalDownloads: 0, count: 0 };

  return {
    pageViews: pageViewSummary,
    lectures: {
      total: stats.count,
      totalPlays: stats.totalPlays,
      totalDownloads: stats.totalDownloads
    },
    settings: {
      showPublicStats: settings.analytics.showPublicStats,
      thresholds: {
        plays: settings.analytics.minPlaysToDisplay,
        downloads: settings.analytics.minDownloadsToDisplay,
        pageViews: settings.analytics.minPageViewsToDisplay
      }
    },
    shouldShowPublic: settings.shouldShowPublicStats()
  };
};

/**
 * Get top lectures by plays
 */
const getTopLectures = async (limit = 10) => {
  const { Lecture } = require('../models');

  return Lecture.find({ published: true })
    .sort({ playCount: -1 })
    .limit(limit)
    .select('titleArabic titleEnglish playCount downloadCount slug')
    .lean();
};

/**
 * Get top lectures by downloads
 */
const getTopDownloads = async (limit = 10) => {
  const { Lecture } = require('../models');

  return Lecture.find({ published: true })
    .sort({ downloadCount: -1 })
    .limit(limit)
    .select('titleArabic titleEnglish playCount downloadCount slug')
    .lean();
};

module.exports = {
  trackPageView,
  getAnalyticsSummary,
  getTopLectures,
  getTopDownloads
};
