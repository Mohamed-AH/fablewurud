const express = require('express');
const router = express.Router();
const { Lecture, Sheikh, Series, Section, Schedule, SiteSettings, Article } = require('../models');
const cache = require('../utils/cache');

// Cache TTLs (in seconds)
const CACHE_TTL = {
  HOMEPAGE: 300,        // 5 minutes for homepage data
  SERIES_LIST: 600,     // 10 minutes for series list
  SITEMAP: 3600,        // 1 hour for sitemap
  SCHEDULE: 300,        // 5 minutes for schedule
  ARTICLES: 600         // 10 minutes for articles
};

// Helper function to fetch homepage data (for caching)
async function fetchHomepageData() {
  // Fetch all visible series with their sheikhs
  const series = await Series.find({ isVisible: { $ne: false } })
    .populate('sheikhId', 'nameArabic nameEnglish honorific')
    .sort({ createdAt: -1 })
    .lean();

  // For each series, fetch its lectures (sorted by sortOrder for correct display order)
  // Optimized: Uses $project to limit memory usage
  const seriesList = await Promise.all(
    series.map(async (s) => {
      const lectures = await Lecture.aggregate([
        {
          $match: {
            seriesId: s._id,
            published: true
          }
        },
        {
          $sort: {
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
            descriptionArabic: 1,
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

      // Get original author - prefer Series.bookAuthor, fallback to lecture description
      const originalAuthor = s.bookAuthor || lectures.find(l => l.descriptionArabic)?.descriptionArabic
        ?.replace('من كتاب: ', '') || null;

      return {
        ...s,
        sheikh: s.sheikhId,
        lectures: lectures,
        lectureCount: lectures.length,
        originalAuthor: originalAuthor
      };
    })
  );

  // Filter out series with no published lectures
  const filteredSeries = seriesList.filter(s => s.lectureCount > 0);

  // Get all standalone lectures (not in any series)
  const standaloneLectures = await Lecture.find({
    seriesId: null,
    published: true
  })
    .populate('sheikhId', 'nameArabic nameEnglish honorific')
    .sort({ dateRecorded: -1, createdAt: -1 })
    .lean();

  // Get محاضرات متفرقة series (miscellaneous lectures)
  const miscSeries = await Series.findOne({
    titleArabic: /محاضرات متفرقة/i,
    isVisible: { $ne: false }
  })
    .populate('sheikhId', 'nameArabic nameEnglish honorific')
    .lean();

  let miscLectures = [];
  if (miscSeries) {
    miscLectures = await Lecture.find({
      seriesId: miscSeries._id,
      published: true
    })
      .populate('sheikhId', 'nameArabic nameEnglish honorific')
      .sort({ dateRecorded: -1, createdAt: -1 })
      .lean();
  }

  // Combine standalone and miscellaneous lectures for Lectures tab
  const allStandaloneLectures = [...standaloneLectures, ...miscLectures];

  // Get Khutba series (for Khutbas tab)
  const khutbaSeries = filteredSeries.filter(s => {
    if (s.tags && s.tags.includes('khutba')) {
      return true;
    }
    return s.titleArabic && (
      s.titleArabic.includes('خطب') ||
      s.titleArabic.includes('خطبة')
    );
  });

  // Get total lecture count
  const totalLectureCount = await Lecture.countDocuments({ published: true });

  return {
    seriesList: filteredSeries,
    standaloneLectures: allStandaloneLectures,
    khutbaSeries,
    totalLectureCount
  };
}

// Helper function to fetch schedule data (for caching)
// Optimized: Uses aggregation to batch lecture counts + latest lectures
// Includes child series lectures in parent's count
async function fetchScheduleData() {
  const scheduleItems = await Schedule.find({ isActive: true })
    .populate('seriesId', 'titleArabic titleEnglish slug')
    .sort({ sortOrder: 1 })
    .lean();

  if (!scheduleItems.length) return [];

  // Filter items with valid seriesId and get their IDs
  const validItems = scheduleItems.filter(item => item.seriesId);
  const seriesIds = validItems.map(item => item.seriesId._id);

  // Find child series for scheduled parent series
  const childSeries = await Series.find({
    parentSeriesId: { $in: seriesIds },
    isVisible: true
  }).select('_id parentSeriesId').lean();

  // Build parent -> children map
  const childrenMap = new Map();
  for (const child of childSeries) {
    const parentId = child.parentSeriesId.toString();
    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId).push(child._id);
  }

  // Get all series IDs we need counts for (parents + children)
  const allChildIds = childSeries.map(c => c._id);
  const allSeriesIds = [...seriesIds, ...allChildIds];

  // Batch query: Get counts and latest lectures
  const seriesStats = await Lecture.aggregate([
    { $match: { seriesId: { $in: allSeriesIds }, published: true } },
    { $sort: { seriesId: 1, dateRecorded: -1, createdAt: -1 } },
    {
      $group: {
        _id: '$seriesId',
        lectureCount: { $sum: 1 },
        latestLecture: { $first: '$$ROOT' }
      }
    },
    {
      $project: {
        lectureCount: 1,
        'latestLecture.titleArabic': 1,
        'latestLecture.titleEnglish': 1,
        'latestLecture.slug': 1,
        'latestLecture.dateRecorded': 1,
        'latestLecture.createdAt': 1,
        'latestLecture.lectureNumber': 1
      }
    }
  ]);

  const statsMap = new Map(seriesStats.map(s => [s._id.toString(), s]));

  const weeklySchedule = validItems.map(item => {
    const seriesId = item.seriesId._id.toString();
    const ownStats = statsMap.get(seriesId) || {};
    let ownCount = ownStats.lectureCount || 0;

    // Add child series lecture counts
    let childCount = 0;
    const children = childrenMap.get(seriesId) || [];
    for (const childId of children) {
      const childStats = statsMap.get(childId.toString());
      if (childStats) {
        childCount += childStats.lectureCount || 0;
      }
    }

    const totalCount = ownCount + childCount;
    const latestLecture = ownStats.latestLecture || null;
    const isNew = latestLecture && (
      Date.now() - new Date(latestLecture.dateRecorded || latestLecture.createdAt) < 7 * 24 * 60 * 60 * 1000
    );

    return {
      ...item,
      latestLecture,
      lectureCount: totalCount,
      isNew
    };
  });

  const dayOrder = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  return weeklySchedule.sort((a, b) => dayOrder.indexOf(a.dayOfWeek) - dayOrder.indexOf(b.dayOfWeek));
}

// Helper function to fetch recent articles for homepage
async function fetchRecentArticles(limit = 10) {
  return Article.find({ isPublished: true })
    .sort({ publishedAt: -1 })
    .limit(limit)
    .select('shortId type publishedAt sourceUrl title summary slug slug_ar')
    .lean();
}

// Helper function to fetch homepage sections with their series
// Optimized: Uses aggregation pipeline instead of N+1 queries (55+ -> 1 query)
async function fetchSectionsData() {
  const sections = await Section.aggregate([
    { $match: { isVisible: true } },
    { $sort: { displayOrder: 1 } },
    // Lookup series for each section
    {
      $lookup: {
        from: 'series',
        let: { sectionId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$sectionId', '$$sectionId'] },
              isVisible: { $ne: false }
            }
          },
          { $sort: { sectionOrder: 1 } },
          // Lookup sheikh for each series
          {
            $lookup: {
              from: 'sheikhs',
              localField: 'sheikhId',
              foreignField: '_id',
              as: 'sheikhData',
              pipeline: [{ $project: { nameArabic: 1, nameEnglish: 1, honorific: 1 } }]
            }
          },
          { $addFields: { sheikh: { $arrayElemAt: ['$sheikhData', 0] } } },
          // Lookup lecture count for each series
          {
            $lookup: {
              from: 'lectures',
              let: { seriesId: '$_id' },
              pipeline: [
                { $match: { $expr: { $eq: ['$seriesId', '$$seriesId'] }, published: true } },
                { $count: 'count' }
              ],
              as: 'lectureCountArr'
            }
          },
          {
            $addFields: {
              lectureCount: { $ifNull: [{ $arrayElemAt: ['$lectureCountArr.count', 0] }, 0] }
            }
          },
          // Filter out series with no published lectures
          { $match: { lectureCount: { $gt: 0 } } },
          // Clean up temporary fields
          { $project: { lectureCountArr: 0, sheikhData: 0, sheikhId: 0 } }
        ],
        as: 'series'
      }
    },
    // Only keep sections with at least one series
    { $match: { 'series.0': { $exists: true } } },
    { $addFields: { totalSeriesCount: { $size: '$series' } } }
  ]);

  return sections;
}

// @route   GET /
// @desc    Homepage - Series-based view with tabs
// @access  Public
router.get('/', async (req, res) => {
  try {
    // PERFORMANCE: Execute all independent queries in parallel
    const [weeklySchedule, totalLectureCount, totalArticleCount, homepageSections, settings, recentArticles] = await Promise.all([
      cache.getOrSet('homepage:schedule', fetchScheduleData, CACHE_TTL.SCHEDULE),
      cache.getOrSet('homepage:lectureCount', () => Lecture.countDocuments({ published: true }), CACHE_TTL.HOMEPAGE),
      cache.getOrSet('homepage:articleCount', () => Article.countDocuments({ isPublished: true }), CACHE_TTL.ARTICLES),
      cache.getOrSet('homepage:sections', fetchSectionsData, CACHE_TTL.HOMEPAGE),
      SiteSettings.getSettings().catch(err => {
        console.error('Failed to get site settings:', err.message);
        return null;
      }),
      cache.getOrSet('homepage:articles', () => fetchRecentArticles(10), CACHE_TTL.ARTICLES)
    ]);

    // Process site settings (handle null from catch)
    let showPublicStats = false;
    let homepageConfig = {
      showSchedule: true,
      scheduleLayout: 'cards',
      showSeriesTab: true,
      showStandaloneTab: true,
      showKhutbasTab: true
    };
    if (settings) {
      showPublicStats = settings.shouldShowPublicStats();
      if (settings.homepage) {
        homepageConfig = {
          showSchedule: settings.homepage.showSchedule !== false,
          scheduleLayout: settings.homepage.scheduleLayout || 'cards',
          showSeriesTab: settings.homepage.showSeriesTab !== false,
          showStandaloneTab: settings.homepage.showStandaloneTab !== false,
          showKhutbasTab: settings.homepage.showKhutbasTab !== false
        };
      }
    }

    // Get active tab from URL query parameter (default to 'series')
    const validTabs = ['series', 'lectures', 'khutbas'];
    const activeTab = validTabs.includes(req.query.tab) ? req.query.tab : 'series';

    // SEO metadata for homepage - emphasizing transcript search
    const locale = res.locals.locale || 'ar';
    const metaDescription = locale === 'ar'
      ? 'البحث في التفريغ الصوتي لدروس الشيخ حسن بن محمد الدغريري - من الكلمة المكتوبة إلى اللحظة المسموعة. ابحث في نصوص أكثر من ' + (totalLectureCount || 500) + ' درس صوتي في العقيدة والفقه والتفسير.'
      : 'Search audio transcripts of Sheikh Hasan Dhaghriri lectures. From written word to audio moment. Search text of ' + (totalLectureCount || 500) + '+ Islamic lectures on Aqeedah, Fiqh, and Tafsir.';
    const metaKeywords = locale === 'ar'
      ? 'البحث في التفريغ الصوتي, تفريغ الدروس, الشيخ حسن الدغريري, البحث في نصوص الدروس, محاضرات إسلامية, جامع الورود جدة, شرح كتاب التوحيد, شرح عمدة الأحكام, دروس العقيدة'
      : 'audio transcript search, Islamic lecture transcripts, Sheikh Hasan Dhaghriri, search lecture text, Islamic lectures, Jeddah, Aqeedah, Fiqh, Tafsir';

    res.render('public/index', {
      title: locale === 'ar' ? 'البحث في التفريغ الصوتي' : 'Audio Transcript Search',
      metaDescription,
      metaKeywords,
      seriesList: [],           // Empty - loaded via API
      standaloneLectures: [],   // Empty - loaded via API
      khutbaSeries: [],         // Empty - loaded via API
      weeklySchedule,
      totalLectureCount,
      totalArticleCount,
      homepageSections,
      homepageConfig,
      showPublicStats,
      lazyLoadSeries: true,     // Flag for template to show loading state
      activeTab,                // Pass active tab for server-side rendering
      recentArticles: recentArticles || []  // Recent articles for sidebar
    });
  } catch (error) {
    console.error('Homepage error:', error);
    res.status(500).send('Error loading homepage');
  }
});

// @route   GET /browse
// @desc    Browse all lectures with filters and pagination
// @access  Public
router.get('/browse', async (req, res) => {
  try {
    const { search, category, fromDateHijri, toDateHijri } = req.query;
    const locale = res.locals.locale || 'ar';

    // Pagination
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 50;
    const skip = (page - 1) * limit;

    // Build query
    const query = { published: true };

    // Category filter
    if (category) {
      query.category = category;
    }

    // Search filter
    if (search) {
      query.$text = { $search: search };
    }

    // Hijri date range filter (uses dateRecordedHijri field with format YYYY/MM/DD)
    if (fromDateHijri || toDateHijri) {
      const normalizeHijriDate = (dateStr) => {
        if (!dateStr) return null;
        const normalized = dateStr.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
        return normalized;
      };

      const fromNorm = normalizeHijriDate(fromDateHijri);
      const toNorm = normalizeHijriDate(toDateHijri);

      if (fromNorm || toNorm) {
        query.dateRecordedHijri = {};
        if (fromNorm) {
          query.dateRecordedHijri.$gte = fromNorm;
        }
        if (toNorm) {
          query.dateRecordedHijri.$lte = toNorm;
        }
      }
    }

    // Get total count for pagination
    const totalCount = await Lecture.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    // Execute query with pagination
    // Sort by dateRecorded DESC (primary), createdAt DESC (fallback)
    const lectures = await Lecture.find(query)
      .sort({ dateRecorded: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sheikhId', 'nameArabic nameEnglish honorific')
      .populate('seriesId', 'titleArabic titleEnglish shortId slug')
      .lean();

    res.render('public/browse', {
      title: locale === 'ar' ? 'جميع المحاضرات' : 'All Lectures',
      lectures,
      search: search || '',
      category: category || '',
      fromDateHijri: fromDateHijri || '',
      toDateHijri: toDateHijri || '',
      pagination: {
        page,
        totalPages,
        totalCount,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Browse error:', error);
    res.status(500).send('Error loading browse page');
  }
});

// @route   GET /lectures/:shortId/:slug_en?/:slug_ar?
// @desc    Single lecture detail page (new URL format with shortId)
// @access  Public
router.get('/lectures/:shortId(\\d+)/:slug_en?/:slug_ar?', async (req, res) => {
  try {
    const { findByShortId, buildCanonicalUrl } = require('../utils/findByIdOrSlug');
    const { shortId, slug_en, slug_ar } = req.params;

    // Query by shortId only (numeric, indexed, fast)
    const lecture = await findByShortId(Lecture, shortId, [
      { path: 'sheikhId', select: 'nameArabic nameEnglish honorific bioArabic bioEnglish slug shortId slug_en slug_ar' },
      { path: 'seriesId', select: 'titleArabic titleEnglish descriptionArabic descriptionEnglish category slug shortId slug_en slug_ar' }
    ]);

    if (!lecture || !lecture.published) {
      return res.status(404).send('Lecture not found');
    }

    // SEO Redirect: if slugs don't match current values, 301 redirect to canonical URL
    const correctSlugEn = lecture.slug_en || '';
    const correctSlugAr = lecture.slug_ar || '';
    const providedSlugAr = slug_ar ? decodeURIComponent(slug_ar) : '';

    if (slug_en !== correctSlugEn || providedSlugAr !== correctSlugAr) {
      const canonicalUrl = buildCanonicalUrl('lectures', lecture);
      if (canonicalUrl) {
        return res.redirect(301, canonicalUrl);
      }
    }

    const canonicalPath = buildCanonicalUrl('lectures', lecture);

    // PERFORMANCE: Execute related lectures and transcript queries in parallel
    const models = require('../models');
    const Transcript = models.Transcript;

    // Build parallel query promises
    const relatedLecturesPromise = lecture.seriesId
      ? Lecture.find({
          _id: { $ne: lecture._id },
          seriesId: lecture.seriesId._id,
          published: true
        })
          .sort({ lectureNumber: 1, dateRecorded: 1, createdAt: 1 })
          .populate('sheikhId', 'nameArabic nameEnglish honorific shortId slug_en slug_ar')
          .populate('seriesId', 'titleArabic titleEnglish shortId slug_en slug_ar')
          .lean()
      : Promise.resolve([]);

    // Fetch transcript excerpt directly (eliminates separate countDocuments query)
    const transcriptPromise = Transcript
      ? Transcript.find({ shortId: lecture.shortId })
          .sort({ startTimeSec: 1 })
          .limit(10)
          .select('text')
          .lean()
          .catch(err => {
            console.warn('Failed to fetch transcript excerpt:', err.message);
            return [];
          })
      : Promise.resolve([]);

    const [relatedLectures, excerptSegments] = await Promise.all([
      relatedLecturesPromise,
      transcriptPromise
    ]);

    // Derive hasTranscript from result (no separate count query needed)
    const hasTranscript = excerptSegments.length > 0;
    const transcriptExcerpt = hasTranscript
      ? excerptSegments.map(s => s.text).join(' ').substring(0, 1000)
      : '';

    // Build meta description including transcript excerpt for SEO
    const locale = res.locals.locale || 'ar';
    let metaDescription;
    if (transcriptExcerpt) {
      metaDescription = locale === 'ar'
        ? `${lecture.titleArabic} - ${transcriptExcerpt.substring(0, 150)}...`
        : `${lecture.titleEnglish || lecture.titleArabic} - ${transcriptExcerpt.substring(0, 150)}...`;
    } else if (lecture.descriptionArabic) {
      metaDescription = locale === 'ar'
        ? lecture.descriptionArabic.substring(0, 200)
        : (lecture.descriptionEnglish || lecture.descriptionArabic).substring(0, 200);
    } else {
      metaDescription = locale === 'ar'
        ? `${lecture.titleArabic} - درس صوتي من دروس الشيخ ${lecture.sheikhId?.nameArabic || ''}`
        : `${lecture.titleEnglish || lecture.titleArabic} - Audio lecture by Sheikh ${lecture.sheikhId?.nameEnglish || lecture.sheikhId?.nameArabic || ''}`;
    }

    res.render('public/lecture', {
      title: lecture.titleArabic,
      metaDescription,
      lecture,
      relatedLectures,
      canonicalPath: canonicalPath || `/lectures/${lecture._id}`,
      hasTranscript,
      transcriptExcerpt
    });
  } catch (error) {
    console.error('Lecture detail error:', error);
    res.status(500).send('Error loading lecture');
  }
});

// @route   GET /lectures/:idOrSlug
// @desc    Legacy lecture route - redirects to new URL format
// @access  Public
router.get('/lectures/:idOrSlug', async (req, res) => {
  try {
    const { findWithRedirectCheck, buildCanonicalUrl } = require('../utils/findByIdOrSlug');

    // Get lecture by ID or slug
    const { doc: lecture } = await findWithRedirectCheck(
      Lecture,
      req.params.idOrSlug,
      [
        { path: 'sheikhId', select: 'nameArabic nameEnglish honorific bioArabic bioEnglish slug' },
        { path: 'seriesId', select: 'titleArabic titleEnglish descriptionArabic descriptionEnglish category slug' }
      ]
    );

    if (!lecture || !lecture.published) {
      return res.status(404).send('Lecture not found');
    }

    // 301 redirect to new URL format if shortId exists
    if (lecture.shortId) {
      const newUrl = buildCanonicalUrl('lectures', lecture);
      if (newUrl) {
        // Preserve query parameters (like ?lang=en) in redirect
        const queryString = Object.keys(req.query).length > 0 ? '?' + new URLSearchParams(req.query).toString() : '';
        return res.redirect(301, newUrl + queryString);
      }
    }

    // Fallback: render page if no shortId yet (during migration)
    let relatedLectures = [];

    if (lecture.seriesId) {
      relatedLectures = await Lecture.find({
        _id: { $ne: lecture._id },
        seriesId: lecture.seriesId._id,
        published: true
      })
        .sort({ lectureNumber: 1, dateRecorded: 1, createdAt: 1 })
        .populate('sheikhId', 'nameArabic nameEnglish honorific')
        .populate('seriesId', 'titleArabic titleEnglish')
        .lean();
    }

    res.render('public/lecture', {
      title: lecture.titleArabic,
      lecture,
      relatedLectures,
      canonicalPath: '/lectures/' + (lecture.slug ? encodeURIComponent(lecture.slug) : lecture._id),
      hasTranscript: false,
      transcriptExcerpt: ''
    });
  } catch (error) {
    console.error('Lecture detail error:', error);
    res.status(500).send('Error loading lecture');
  }
});

// @route   GET /sheikhs
// @desc    List all sheikhs
// @access  Public
router.get('/sheikhs', async (req, res) => {
  try {
    const sheikhs = await Sheikh.find()
      .sort({ nameArabic: 1 })
      .lean();

    res.render('public/sheikhs', {
      title: 'الشيوخ',
      sheikhs
    });
  } catch (error) {
    console.error('Sheikhs page error:', error);
    res.status(500).send('Error loading sheikhs page');
  }
});

// @route   GET /sheikhs/:shortId/:slug_en?/:slug_ar?
// @desc    Single sheikh profile page (new URL format with shortId)
// @access  Public
router.get('/sheikhs/:shortId(\\d+)/:slug_en?/:slug_ar?', async (req, res) => {
  try {
    const { findByShortId, buildCanonicalUrl } = require('../utils/findByIdOrSlug');
    const { shortId, slug_en, slug_ar } = req.params;

    // Query by shortId only (numeric, indexed, fast)
    const sheikh = await findByShortId(Sheikh, shortId);

    if (!sheikh) {
      return res.status(404).send('Sheikh not found');
    }

    // SEO Redirect: if slugs don't match current values, 301 redirect to canonical URL
    const correctSlugEn = sheikh.slug_en || '';
    const correctSlugAr = sheikh.slug_ar || '';
    const providedSlugAr = slug_ar ? decodeURIComponent(slug_ar) : '';

    if (slug_en !== correctSlugEn || providedSlugAr !== correctSlugAr) {
      const canonicalUrl = buildCanonicalUrl('sheikhs', sheikh);
      if (canonicalUrl) {
        return res.redirect(301, canonicalUrl);
      }
    }

    // PERFORMANCE: Execute lectures and series queries in parallel
    const [lectures, series] = await Promise.all([
      Lecture.find({
        sheikhId: sheikh._id,
        published: true
      })
        .sort({ createdAt: -1 })
        .populate('sheikhId', 'nameArabic nameEnglish honorific shortId slug_en slug_ar')
        .populate('seriesId', 'titleArabic titleEnglish shortId slug_en slug_ar')
        .lean(),
      Series.find({ sheikhId: sheikh._id, isVisible: { $ne: false } })
        .sort({ titleArabic: 1 })
        .lean()
    ]);

    // Calculate statistics
    const stats = {
      totalLectures: lectures.length,
      totalPlays: lectures.reduce((sum, lecture) => sum + (lecture.playCount || 0), 0),
      totalDuration: lectures.reduce((sum, lecture) => sum + (lecture.duration || 0), 0)
    };

    const canonicalPath = buildCanonicalUrl('sheikhs', sheikh);

    res.render('public/sheikh', {
      title: sheikh.nameArabic,
      sheikh,
      lectures,
      series,
      stats,
      canonicalPath: canonicalPath || `/sheikhs/${sheikh._id}`
    });
  } catch (error) {
    console.error('Sheikh profile error:', error);
    res.status(500).send('Error loading sheikh profile');
  }
});

// @route   GET /sheikhs/:idOrSlug
// @desc    Legacy sheikh route - redirects to new URL format
// @access  Public
router.get('/sheikhs/:idOrSlug', async (req, res) => {
  try {
    const { findWithRedirectCheck, buildCanonicalUrl } = require('../utils/findByIdOrSlug');

    // Get sheikh by ID or slug
    const { doc: sheikh } = await findWithRedirectCheck(
      Sheikh,
      req.params.idOrSlug
    );

    if (!sheikh) {
      return res.status(404).send('Sheikh not found');
    }

    // 301 redirect to new URL format if shortId exists
    if (sheikh.shortId) {
      const newUrl = buildCanonicalUrl('sheikhs', sheikh);
      if (newUrl) {
        // Preserve query parameters (like ?lang=en) in redirect
        const queryString = Object.keys(req.query).length > 0 ? '?' + new URLSearchParams(req.query).toString() : '';
        return res.redirect(301, newUrl + queryString);
      }
    }

    // Fallback: render page if no shortId yet (during migration)
    const lectures = await Lecture.find({
      sheikhId: sheikh._id,
      published: true
    })
      .sort({ createdAt: -1 })
      .populate('sheikhId', 'nameArabic nameEnglish honorific slug')
      .populate('seriesId', 'titleArabic titleEnglish slug')
      .lean();

    const stats = {
      totalLectures: lectures.length,
      totalPlays: lectures.reduce((sum, lecture) => sum + (lecture.playCount || 0), 0),
      totalDuration: lectures.reduce((sum, lecture) => sum + (lecture.duration || 0), 0)
    };

    const series = await Series.find({ sheikhId: sheikh._id, isVisible: { $ne: false } })
      .sort({ titleArabic: 1 })
      .lean();

    res.render('public/sheikh', {
      title: sheikh.nameArabic,
      sheikh,
      lectures,
      series,
      stats,
      canonicalPath: '/sheikhs/' + (sheikh.slug ? encodeURIComponent(sheikh.slug) : sheikh._id)
    });
  } catch (error) {
    console.error('Sheikh profile error:', error);
    res.status(500).send('Error loading sheikh profile');
  }
});

// @route   GET /series
// @desc    List all series
// @access  Public
router.get('/series', async (req, res) => {
  try {
    // Only show visible series
    const series = await Series.find({ isVisible: { $ne: false } })
      .sort({ titleArabic: 1 })
      .populate('sheikhId', 'nameArabic nameEnglish honorific')
      .lean();

    res.render('public/series', {
      title: 'السلاسل',
      series
    });
  } catch (error) {
    console.error('Series page error:', error);
    res.status(500).send('Error loading series page');
  }
});

// @route   GET /series/:shortId/:slug_en?/:slug_ar?
// @desc    Single series profile page (new URL format with shortId)
// @access  Public
router.get('/series/:shortId(\\d+)/:slug_en?/:slug_ar?', async (req, res) => {
  try {
    const { findByShortId, buildCanonicalUrl } = require('../utils/findByIdOrSlug');
    const { shortId, slug_en, slug_ar } = req.params;

    // Query by shortId only (numeric, indexed, fast)
    const series = await findByShortId(Series, shortId,
      { path: 'sheikhId', select: 'nameArabic nameEnglish honorific bioArabic bioEnglish shortId slug_en slug_ar' }
    );

    // Return 404 if series not found or if hidden
    if (!series || series.isVisible === false) {
      return res.status(404).send('Series not found');
    }

    // SEO Redirect: if slugs don't match current values, 301 redirect to canonical URL
    const correctSlugEn = series.slug_en || '';
    const correctSlugAr = series.slug_ar || '';
    const providedSlugAr = slug_ar ? decodeURIComponent(slug_ar) : '';

    if (slug_en !== correctSlugEn || providedSlugAr !== correctSlugAr) {
      const canonicalUrl = buildCanonicalUrl('series', series);
      if (canonicalUrl) {
        return res.redirect(301, canonicalUrl);
      }
    }

    // PERFORMANCE: Execute lectures aggregation and site settings in parallel
    const mongoose = require('mongoose');
    const [lectures, siteSettings] = await Promise.all([
      Lecture.aggregate([
        {
          $match: {
            seriesId: series._id,
            published: true
          }
        },
        {
          $sort: {
            sortOrder: 1,
            lectureNumber: 1,
            createdAt: 1
          }
        },
        {
          $lookup: {
            from: 'sheikhs',
            localField: 'sheikhId',
            foreignField: '_id',
            as: 'sheikhData'
          }
        },
        {
          $addFields: {
            sheikhId: { $arrayElemAt: ['$sheikhData', 0] }
          }
        },
        {
          $unset: ['sheikhData']
        }
      ]),
      SiteSettings.getSettings()
    ]);

    const seriesStatsSettings = siteSettings.seriesStats || { minPlaysToShow: 100, showDuration: false };

    // Fetch child series (mini-series under this parent)
    let childSeries = [];
    let childLectureCount = 0;

    const children = await Series.find({
      parentSeriesId: series._id,
      isVisible: true
    }).select('_id titleArabic titleEnglish shortId slug_en slug_ar lectureCount').lean();

    if (children.length > 0) {
      // Get actual lecture counts for children
      const childIds = children.map(s => s._id);
      const childCounts = await Lecture.aggregate([
        { $match: { seriesId: { $in: childIds }, published: true } },
        { $group: { _id: '$seriesId', count: { $sum: 1 } } }
      ]);
      const countMap = new Map(childCounts.map(c => [c._id.toString(), c.count]));

      childSeries = children.map(child => ({
        ...child,
        actualLectureCount: countMap.get(child._id.toString()) || 0
      }));

      // Sum up child lecture counts
      childLectureCount = childSeries.reduce((sum, c) => sum + c.actualLectureCount, 0);
    }

    // Calculate statistics (including child series lectures in total)
    const stats = {
      ownLectures: lectures.length,
      childLectures: childLectureCount,
      totalLectures: lectures.length + childLectureCount,
      totalPlays: lectures.reduce((sum, lecture) => sum + (lecture.playCount || 0), 0),
      totalDuration: lectures.reduce((sum, lecture) => sum + (lecture.duration || 0), 0),
      completeLectures: lectures.filter(l => l.lectureNumber).length
    };

    // Check if this series is a child (has parent)
    let parentSeries = null;
    if (series.parentSeriesId) {
      parentSeries = await Series.findById(series.parentSeriesId)
        .select('titleArabic titleEnglish shortId slug_en slug_ar')
        .lean();
    }

    const canonicalPath = buildCanonicalUrl('series', series);

    res.render('public/series-detail', {
      title: series.titleArabic,
      series,
      lectures,
      stats,
      childSeries,
      parentSeries,
      canonicalPath: canonicalPath || `/series/${series._id}`,
      seriesStatsSettings
    });
  } catch (error) {
    console.error('Series profile error:', error);
    res.status(500).send('Error loading series profile');
  }
});

// @route   GET /series/:idOrSlug
// @desc    Legacy series route - redirects to new URL format
// @access  Public
router.get('/series/:idOrSlug', async (req, res) => {
  try {
    const { findWithRedirectCheck, buildCanonicalUrl } = require('../utils/findByIdOrSlug');

    // Get series by ID or slug
    const { doc: series } = await findWithRedirectCheck(
      Series,
      req.params.idOrSlug,
      { path: 'sheikhId', select: 'nameArabic nameEnglish honorific bioArabic bioEnglish slug' }
    );

    // Return 404 if series not found or if hidden
    if (!series || series.isVisible === false) {
      return res.status(404).send('Series not found');
    }

    // 301 redirect to new URL format if shortId exists
    if (series.shortId) {
      const newUrl = buildCanonicalUrl('series', series);
      if (newUrl) {
        // Preserve query parameters (like ?lang=en) in redirect
        const queryString = Object.keys(req.query).length > 0 ? '?' + new URLSearchParams(req.query).toString() : '';
        return res.redirect(301, newUrl + queryString);
      }
    }

    // Fallback: render page if no shortId yet (during migration)
    const mongoose = require('mongoose');
    const lectures = await Lecture.aggregate([
      {
        $match: {
          seriesId: series._id,
          published: true
        }
      },
      {
        $sort: {
          sortOrder: 1,
          lectureNumber: 1,
          createdAt: 1
        }
      },
      {
        $lookup: {
          from: 'sheikhs',
          localField: 'sheikhId',
          foreignField: '_id',
          as: 'sheikhData'
        }
      },
      {
        $addFields: {
          sheikhId: { $arrayElemAt: ['$sheikhData', 0] }
        }
      },
      {
        $unset: ['sheikhData']
      }
    ]);

    const stats = {
      totalLectures: lectures.length,
      totalPlays: lectures.reduce((sum, lecture) => sum + (lecture.playCount || 0), 0),
      totalDuration: lectures.reduce((sum, lecture) => sum + (lecture.duration || 0), 0),
      completeLectures: lectures.filter(l => l.lectureNumber).length
    };

    // Optimized: Bulk count with $in instead of N+1 queries
    let relatedKhutbaSeries = [];
    if (series.titleArabic === 'خطب الجمعة') {
      relatedKhutbaSeries = await Series.find({
        sheikhId: series.sheikhId._id,
        titleArabic: {
          $regex: 'خطبة.*جمعة',
          $options: 'i'
        },
        _id: { $ne: series._id }
      }).lean();

      if (relatedKhutbaSeries.length > 0) {
        const relatedIds = relatedKhutbaSeries.map(s => s._id);
        const counts = await Lecture.aggregate([
          { $match: { seriesId: { $in: relatedIds }, published: true } },
          { $group: { _id: '$seriesId', count: { $sum: 1 } } }
        ]);
        const countMap = new Map(counts.map(c => [c._id.toString(), c.count]));
        relatedKhutbaSeries.forEach(s => {
          s.actualLectureCount = countMap.get(s._id.toString()) || 0;
        });
      }
    }

    // Get site settings for series stats display
    const siteSettings = await SiteSettings.getSettings();
    const seriesStatsSettings = siteSettings.seriesStats || { minPlaysToShow: 100, showDuration: false };

    res.render('public/series-detail', {
      title: series.titleArabic,
      series,
      lectures,
      stats,
      relatedKhutbaSeries,
      canonicalPath: '/series/' + (series.slug ? encodeURIComponent(series.slug) : series._id),
      seriesStatsSettings
    });
  } catch (error) {
    console.error('Series profile error:', error);
    res.status(500).send('Error loading series profile');
  }
});

// Helper function to build sitemap URL for an entity
function buildSitemapUrl(type, doc) {
  // Use new URL format if shortId exists
  if (doc.shortId) {
    let url = `/${type}/${doc.shortId}`;
    if (doc.slug_en) {
      url += `/${doc.slug_en}`;
    }
    if (doc.slug_ar) {
      url += `/${encodeURIComponent(doc.slug_ar)}`;
    }
    return url;
  }
  // Fallback to legacy format
  return `/${type}/${doc.slug ? encodeURIComponent(doc.slug) : doc._id}`;
}

// Helper function to generate sitemap XML (for caching)
async function generateSitemap() {
  const baseUrl = 'https://rasmihassan.com';

  // Get all published lectures (include new fields for URL generation)
  const lectures = await Lecture.find({ published: true })
    .select('_id slug shortId slug_en slug_ar updatedAt')
    .lean();

  // Get all visible series (exclude hidden ones)
  const series = await Series.find({ isVisible: { $ne: false } })
    .select('_id slug shortId slug_en slug_ar updatedAt')
    .lean();

  // Get all sheikhs
  const sheikhs = await Sheikh.find()
    .select('_id slug shortId slug_en slug_ar updatedAt')
    .lean();

  // Get all published articles
  const articles = await Article.find({ isPublished: true })
    .select('_id slug shortId publishedAt updatedAt')
    .lean();

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Homepage -->
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/browse</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/sheikhs</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/series</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/articles</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
`;

  // Add articles
  for (const article of articles) {
    const lastmod = article.updatedAt ? new Date(article.updatedAt).toISOString().split('T')[0] :
                    (article.publishedAt ? new Date(article.publishedAt).toISOString().split('T')[0] : '');
    const articleUrl = article.slug || article.shortId || article._id;
    xml += `  <url>
    <loc>${baseUrl}/articles/${articleUrl}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
`;
  }

  // Add lectures (use new URL format if shortId exists)
  for (const lecture of lectures) {
    const lastmod = lecture.updatedAt ? new Date(lecture.updatedAt).toISOString().split('T')[0] : '';
    const lectureUrl = buildSitemapUrl('lectures', lecture);
    xml += `  <url>
    <loc>${baseUrl}${lectureUrl}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
`;
  }

  // Add series (use new URL format if shortId exists)
  for (const s of series) {
    const lastmod = s.updatedAt ? new Date(s.updatedAt).toISOString().split('T')[0] : '';
    const seriesUrl = buildSitemapUrl('series', s);
    xml += `  <url>
    <loc>${baseUrl}${seriesUrl}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
  }

  // Add sheikhs (use new URL format if shortId exists)
  for (const sheikh of sheikhs) {
    const lastmod = sheikh.updatedAt ? new Date(sheikh.updatedAt).toISOString().split('T')[0] : '';
    const sheikhUrl = buildSitemapUrl('sheikhs', sheikh);
    xml += `  <url>
    <loc>${baseUrl}${sheikhUrl}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
`;
  }

  xml += `</urlset>`;
  return xml;
}

// @route   GET /sitemap.xml
// @desc    XML Sitemap for SEO (uses slugs when available)
// @access  Public
router.get('/sitemap.xml', async (req, res) => {
  try {
    // Get sitemap from cache or generate
    const xml = await cache.getOrSet(
      'sitemap:xml',
      generateSitemap,
      CACHE_TTL.SITEMAP
    );

    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600'); // 1 hour browser cache
    res.send(xml);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).send('Error generating sitemap');
  }
});

// @route   GET /robots.txt
// @desc    Robots.txt for SEO
// @access  Public
router.get('/robots.txt', (req, res) => {
  const robotsTxt = `# Robots.txt for rasmihassan.com

User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /auth/

# Sitemap
Sitemap: https://rasmihassan.com/sitemap.xml

# Block AI training bots
User-agent: Amazonbot
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: GPTBot
Disallow: /

User-agent: meta-externalagent
Disallow: /
`;

  res.set('Content-Type', 'text/plain');
  res.send(robotsTxt);
});

module.exports = router;
