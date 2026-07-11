const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Lecture, Series } = require('../../models');
const cache = require('../../utils/cache');
const { sanitizeSearchInput } = require('../../utils/validators');

const isProduction = process.env.NODE_ENV === 'production';

// Cache TTL for API endpoints (in seconds)
const API_CACHE_TTL = 300; // 5 minutes

/**
 * Homepage API - Server-side filtering and pagination
 *
 * Endpoints:
 * - GET /api/homepage/series - Paginated series list with lectures
 * - GET /api/homepage/standalone - Paginated standalone lectures
 * - GET /api/homepage/stats - Get counts for all tabs
 */

// Helper: Detect series type from tags or title
function getSeriesType(series) {
  const tags = series.tags || [];
  const title = series.titleArabic || '';

  if (tags.includes('online') || title.includes('عن بعد')) {
    return 'online';
  }
  if (tags.includes('archive-ramadan') || title.includes('أرشيف رمضان')) {
    return 'archive-ramadan';
  }
  if (tags.includes('archive') || title.includes('أرشيف')) {
    return 'archive';
  }
  return 'masjid';
}

// Helper: Check if series is a khutba series
function isKhutbaSeries(series) {
  const tags = series.tags || [];
  const title = series.titleArabic || '';

  if (tags.includes('khutba')) {
    return true;
  }
  return title.includes('خطب') || title.includes('خطبة');
}

// Helper: Escape regex special characters to prevent ReDoS attacks
function escapeRegex(string) {
  if (!string || typeof string !== 'string') return '';
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper: Build search query for series (sanitized against ReDoS and XSS)
function buildSeriesSearchQuery(search) {
  if (!search || typeof search !== 'string') return {};

  // Sanitize input to prevent XSS, then escape regex special chars
  const sanitized = sanitizeSearchInput(search, 200);
  const sanitizedSearch = escapeRegex(sanitized);
  if (!sanitizedSearch) return {};

  const searchRegex = new RegExp(sanitizedSearch, 'i');
  return {
    $or: [
      { titleArabic: searchRegex },
      { titleEnglish: searchRegex },
      { bookAuthor: searchRegex }
    ]
  };
}

// Helper: Build search query for lectures (sanitized against ReDoS and XSS)
function buildLectureSearchQuery(search) {
  if (!search || typeof search !== 'string') return {};

  // Sanitize input to prevent XSS, then escape regex special chars
  const sanitized = sanitizeSearchInput(search, 200);
  const sanitizedSearch = escapeRegex(sanitized);
  if (!sanitizedSearch) return {};

  const searchRegex = new RegExp(sanitizedSearch, 'i');
  return {
    $or: [
      { titleArabic: searchRegex },
      { titleEnglish: searchRegex },
      { descriptionArabic: searchRegex }
    ]
  };
}

/**
 * @route   GET /api/homepage/series
 * @desc    Get paginated series with their lectures
 * @access  Public
 *
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10)
 * - category: Filter by category (Fiqh, Aqeedah, etc.)
 * - type: Filter by series type (online, archive, archive-ramadan, masjid)
 * - search: Search term
 * - sort: Sort order (newest, oldest) - default: newest
 * - excludeKhutbas: Exclude khutba series (default: true)
 */
router.get('/series', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      type,
      search,
      sort = 'newest',
      excludeKhutbas = 'true'
    } = req.query;

    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);
    const pageNum = Math.max(1, isNaN(parsedPage) ? 1 : parsedPage);
    const limitNum = Math.min(50, Math.max(1, isNaN(parsedLimit) ? 10 : parsedLimit));
    const skip = (pageNum - 1) * limitNum;

    // Build base query
    const query = {
      isVisible: { $ne: false }
    };

    // Category filter
    if (category && category !== 'all') {
      query.category = category;
    }

    // If searching, find series that match by title OR have lectures matching the search
    let seriesIdsFromLectures = [];
    if (search) {
      // Find lectures matching the search term
      const lectureSearchQuery = buildLectureSearchQuery(search);
      if (Object.keys(lectureSearchQuery).length > 0) {
        const matchingLectures = await Lecture.find({
          ...lectureSearchQuery,
          published: true,
          seriesId: { $ne: null }
        }).select('seriesId').lean();
        // Get unique series IDs and convert to ObjectIds
        const uniqueIds = [...new Set(matchingLectures.map(l => l.seriesId?.toString()).filter(Boolean))];
        seriesIdsFromLectures = uniqueIds.map(id => new mongoose.Types.ObjectId(id));
      }

      // Build combined query: match series title OR have matching lectures
      const seriesSearchQuery = buildSeriesSearchQuery(search);
      if (seriesIdsFromLectures.length > 0) {
        query.$or = [
          ...(seriesSearchQuery.$or || []),
          { _id: { $in: seriesIdsFromLectures } }
        ];
      } else if (Object.keys(seriesSearchQuery).length > 0) {
        Object.assign(query, seriesSearchQuery);
      }
    }

    // Fetch series
    let seriesList = await Series.find(query)
      .populate('sheikhId', 'nameArabic nameEnglish honorific')
      .sort({ createdAt: sort === 'oldest' ? 1 : -1 })
      .lean();

    // Filter by series type (must be done after fetch since it's computed)
    if (type && type !== 'all') {
      seriesList = seriesList.filter(s => getSeriesType(s) === type);
    }

    // Exclude khutbas from series tab (they have their own tab)
    if (excludeKhutbas === 'true') {
      seriesList = seriesList.filter(s => !isKhutbaSeries(s));
    }

    // Get total count before pagination
    const totalCount = seriesList.length;

    // Apply pagination
    const paginatedSeries = seriesList.slice(skip, skip + limitNum);

    // Fetch all lectures for paginated series in ONE query (fixes N+1)
    // Optimized: Uses $project to limit memory usage
    const seriesIds = paginatedSeries.map(s => s._id);
    const allLectures = await Lecture.aggregate([
      {
        $match: {
          seriesId: { $in: seriesIds },
          published: true
        }
      },
      {
        $sort: {
          seriesId: 1,
          sortOrder: 1,
          lectureNumber: 1,
          createdAt: 1
        }
      },
      {
        $project: {
          _id: 1,
          seriesId: 1,
          titleArabic: 1,
          titleEnglish: 1,
          lectureNumber: 1,
          sortOrder: 1,
          dateRecorded: 1,
          createdAt: 1,
          durationSeconds: 1,
          duration: 1,
          audioUrl: 1,
          audioFileName: 1,
          slug: 1,
          shortId: 1
        }
      }
    ]);

    // Group lectures by seriesId for efficient lookup
    const lecturesBySeriesId = new Map();
    for (const lecture of allLectures) {
      const seriesIdStr = lecture.seriesId.toString();
      if (!lecturesBySeriesId.has(seriesIdStr)) {
        lecturesBySeriesId.set(seriesIdStr, []);
      }
      lecturesBySeriesId.get(seriesIdStr).push(lecture);
    }

    // Map series with their lectures
    const seriesWithLectures = paginatedSeries.map((s) => {
      const lectures = lecturesBySeriesId.get(s._id.toString()) || [];

      // Get most recent lecture date for sorting
      const mostRecentLecture = lectures.reduce((latest, lecture) => {
        const lectureDate = lecture.dateRecorded || lecture.createdAt;
        return lectureDate > latest ? lectureDate : latest;
      }, new Date(0));

      return {
        ...s,
        sheikh: s.sheikhId,
        lectures: lectures,
        lectureCount: lectures.length,
        originalAuthor: s.bookAuthor || null,
        seriesType: getSeriesType(s),
        mostRecentDate: mostRecentLecture
      };
    });

    // Filter out series with no published lectures
    const filteredSeries = seriesWithLectures.filter(s => s.lectureCount > 0);

    // Sort by most recent lecture date if sorting by newest
    if (sort === 'newest') {
      filteredSeries.sort((a, b) => new Date(b.mostRecentDate) - new Date(a.mostRecentDate));
    } else {
      filteredSeries.sort((a, b) => new Date(a.mostRecentDate) - new Date(b.mostRecentDate));
    }

    res.json({
      success: true,
      series: filteredSeries,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        pages: Math.ceil(totalCount / limitNum),
        hasMore: pageNum * limitNum < totalCount
      }
    });

  } catch (error) {
    console.error('Homepage series API error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch series',
      error: isProduction ? undefined : error.message
    });
  }
});

/**
 * @route   GET /api/homepage/standalone
 * @desc    Get paginated standalone lectures (not in a series)
 * @access  Public
 *
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - category: Filter by category
 * - search: Search term
 * - sort: Sort order (newest, oldest) - default: newest
 * - includeMisc: Include محاضرات متفرقة lectures (default: true)
 */
router.get('/standalone', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      search,
      sort = 'newest',
      includeMisc = 'true'
    } = req.query;

    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);
    const pageNum = Math.max(1, isNaN(parsedPage) ? 1 : parsedPage);
    const limitNum = Math.min(50, Math.max(1, isNaN(parsedLimit) ? 20 : parsedLimit));
    const skip = (pageNum - 1) * limitNum;

    // Build base query for standalone lectures
    const query = {
      seriesId: null,
      published: true
    };

    // Category filter
    if (category && category !== 'all') {
      query.category = category;
    }

    // Search filter
    if (search) {
      Object.assign(query, buildLectureSearchQuery(search));
    }

    // Get standalone lectures
    let lectures = await Lecture.find(query)
      .populate('sheikhId', 'nameArabic nameEnglish honorific')
      .sort({ dateRecorded: sort === 'oldest' ? 1 : -1, createdAt: sort === 'oldest' ? 1 : -1 })
      .lean();

    // Include محاضرات متفرقة (miscellaneous lectures) if requested
    if (includeMisc === 'true') {
      const miscSeries = await Series.findOne({
        titleArabic: /محاضرات متفرقة/i,
        isVisible: { $ne: false }
      }).lean();

      if (miscSeries) {
        const miscQuery = {
          seriesId: miscSeries._id,
          published: true
        };

        if (category && category !== 'all') {
          miscQuery.category = category;
        }
        if (search) {
          Object.assign(miscQuery, buildLectureSearchQuery(search));
        }

        const miscLectures = await Lecture.find(miscQuery)
          .populate('sheikhId', 'nameArabic nameEnglish honorific')
          .lean();

        lectures = [...lectures, ...miscLectures];

        // Re-sort combined list
        lectures.sort((a, b) => {
          const dateA = new Date(a.dateRecorded || a.createdAt);
          const dateB = new Date(b.dateRecorded || b.createdAt);
          return sort === 'oldest' ? dateA - dateB : dateB - dateA;
        });
      }
    }

    // Get total count
    const totalCount = lectures.length;

    // Apply pagination
    const paginatedLectures = lectures.slice(skip, skip + limitNum);

    res.json({
      success: true,
      lectures: paginatedLectures,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        pages: Math.ceil(totalCount / limitNum),
        hasMore: pageNum * limitNum < totalCount
      }
    });

  } catch (error) {
    console.error('Homepage standalone API error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch standalone lectures',
      error: isProduction ? undefined : error.message
    });
  }
});

/**
 * @route   GET /api/homepage/khutbas
 * @desc    Get paginated khutba series
 * @access  Public
 *
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10)
 * - search: Search term
 * - sort: Sort order (newest, oldest) - default: newest
 */
router.get('/khutbas', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      sort = 'newest'
    } = req.query;

    const parsedPage = parseInt(page);
    const parsedLimit = parseInt(limit);
    const pageNum = Math.max(1, isNaN(parsedPage) ? 1 : parsedPage);
    const limitNum = Math.min(50, Math.max(1, isNaN(parsedLimit) ? 10 : parsedLimit));
    const skip = (pageNum - 1) * limitNum;

    // Build base query
    const query = {
      isVisible: { $ne: false }
    };

    // If searching, find series that match by title OR have lectures matching the search
    let seriesIdsFromLectures = [];
    if (search) {
      // Find lectures matching the search term
      const lectureSearchQuery = buildLectureSearchQuery(search);
      if (Object.keys(lectureSearchQuery).length > 0) {
        const matchingLectures = await Lecture.find({
          ...lectureSearchQuery,
          published: true,
          seriesId: { $ne: null }
        }).select('seriesId').lean();
        // Get unique series IDs and convert to ObjectIds
        const uniqueIds = [...new Set(matchingLectures.map(l => l.seriesId?.toString()).filter(Boolean))];
        seriesIdsFromLectures = uniqueIds.map(id => new mongoose.Types.ObjectId(id));
      }

      // Build combined query: match series title OR have matching lectures
      const seriesSearchQuery = buildSeriesSearchQuery(search);
      if (seriesIdsFromLectures.length > 0) {
        query.$or = [
          ...(seriesSearchQuery.$or || []),
          { _id: { $in: seriesIdsFromLectures } }
        ];
      } else if (Object.keys(seriesSearchQuery).length > 0) {
        Object.assign(query, seriesSearchQuery);
      }
    }

    // Fetch all series first
    let seriesList = await Series.find(query)
      .populate('sheikhId', 'nameArabic nameEnglish honorific')
      .sort({ createdAt: sort === 'oldest' ? 1 : -1 })
      .lean();

    // Filter to only khutba series
    seriesList = seriesList.filter(s => isKhutbaSeries(s));

    // Get total count before pagination
    const totalCount = seriesList.length;

    // Apply pagination
    const paginatedSeries = seriesList.slice(skip, skip + limitNum);

    // Fetch all lectures for paginated series in ONE query (fixes N+1)
    // Optimized: Uses $project to limit memory usage
    const seriesIds = paginatedSeries.map(s => s._id);
    const allLectures = await Lecture.aggregate([
      {
        $match: {
          seriesId: { $in: seriesIds },
          published: true
        }
      },
      {
        $sort: {
          seriesId: 1,
          sortOrder: 1,
          lectureNumber: 1,
          createdAt: 1
        }
      },
      {
        $project: {
          _id: 1,
          seriesId: 1,
          titleArabic: 1,
          titleEnglish: 1,
          lectureNumber: 1,
          sortOrder: 1,
          dateRecorded: 1,
          createdAt: 1,
          durationSeconds: 1,
          duration: 1,
          audioUrl: 1,
          audioFileName: 1,
          slug: 1,
          shortId: 1
        }
      }
    ]);

    // Group lectures by seriesId for efficient lookup
    const lecturesBySeriesId = new Map();
    for (const lecture of allLectures) {
      const seriesIdStr = lecture.seriesId.toString();
      if (!lecturesBySeriesId.has(seriesIdStr)) {
        lecturesBySeriesId.set(seriesIdStr, []);
      }
      lecturesBySeriesId.get(seriesIdStr).push(lecture);
    }

    // Map series with their lectures
    const seriesWithLectures = paginatedSeries.map((s) => {
      const lectures = lecturesBySeriesId.get(s._id.toString()) || [];

      const mostRecentLecture = lectures.reduce((latest, lecture) => {
        const lectureDate = lecture.dateRecorded || lecture.createdAt;
        return lectureDate > latest ? lectureDate : latest;
      }, new Date(0));

      return {
        ...s,
        sheikh: s.sheikhId,
        lectures: lectures,
        lectureCount: lectures.length,
        originalAuthor: s.bookAuthor || null,
        mostRecentDate: mostRecentLecture
      };
    });

    // Filter out series with no published lectures
    const filteredSeries = seriesWithLectures.filter(s => s.lectureCount > 0);

    // Sort by most recent lecture date
    if (sort === 'newest') {
      filteredSeries.sort((a, b) => new Date(b.mostRecentDate) - new Date(a.mostRecentDate));
    } else {
      filteredSeries.sort((a, b) => new Date(a.mostRecentDate) - new Date(b.mostRecentDate));
    }

    res.json({
      success: true,
      series: filteredSeries,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        pages: Math.ceil(totalCount / limitNum),
        hasMore: pageNum * limitNum < totalCount
      }
    });

  } catch (error) {
    console.error('Homepage khutbas API error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch khutbas',
      error: isProduction ? undefined : error.message
    });
  }
});

/**
 * @route   GET /api/homepage/stats
 * @desc    Get counts for all tabs (for showing tab badges)
 * @access  Public
 */
router.get('/stats', async (req, res) => {
  try {
    const { category, type, search } = req.query;

    // Build series query
    const seriesQuery = { isVisible: { $ne: false } };
    if (category && category !== 'all') {
      seriesQuery.category = category;
    }
    if (search) {
      Object.assign(seriesQuery, buildSeriesSearchQuery(search));
    }

    // Get all series
    let allSeries = await Series.find(seriesQuery).lean();

    // Filter by type if specified
    if (type && type !== 'all') {
      allSeries = allSeries.filter(s => getSeriesType(s) === type);
    }

    // Count series (non-khutba)
    const regularSeries = allSeries.filter(s => !isKhutbaSeries(s));

    // Count khutba series
    const khutbaSeries = allSeries.filter(s => isKhutbaSeries(s));

    // Get lectures for regular series to check if they have any
    const seriesIds = regularSeries.map(s => s._id);
    const seriesWithLectures = await Lecture.aggregate([
      { $match: { seriesId: { $in: seriesIds }, published: true } },
      { $group: { _id: '$seriesId' } }
    ]);
    const seriesCount = seriesWithLectures.length;

    // Count standalone lectures
    const standaloneQuery = {
      seriesId: null,
      published: true
    };
    if (category && category !== 'all') {
      standaloneQuery.category = category;
    }
    if (search) {
      Object.assign(standaloneQuery, buildLectureSearchQuery(search));
    }

    let standaloneCount = await Lecture.countDocuments(standaloneQuery);

    // Add misc series lectures to standalone count
    const miscSeries = await Series.findOne({
      titleArabic: /محاضرات متفرقة/i,
      isVisible: { $ne: false }
    }).lean();

    if (miscSeries) {
      const miscQuery = {
        seriesId: miscSeries._id,
        published: true
      };
      if (category && category !== 'all') {
        miscQuery.category = category;
      }
      if (search) {
        Object.assign(miscQuery, buildLectureSearchQuery(search));
      }
      standaloneCount += await Lecture.countDocuments(miscQuery);
    }

    // Count khutba lectures
    const khutbaIds = khutbaSeries.map(s => s._id);
    const khutbaWithLectures = await Lecture.aggregate([
      { $match: { seriesId: { $in: khutbaIds }, published: true } },
      { $group: { _id: '$seriesId' } }
    ]);
    const khutbaCount = khutbaWithLectures.length;

    // Total lecture count
    const totalLectures = await Lecture.countDocuments({ published: true });

    res.json({
      success: true,
      stats: {
        series: seriesCount,
        standalone: standaloneCount,
        khutbas: khutbaCount,
        totalLectures
      }
    });

  } catch (error) {
    console.error('Homepage stats API error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats',
      error: isProduction ? undefined : error.message
    });
  }
});

module.exports = router;
