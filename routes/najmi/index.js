/**
 * Najmi Realm Routes — أرشيف العلامة أحمد بن يحيى النجمي (رحمه الله)
 *
 * A dedicated teal/emerald realm parallel to the default (gold) Sheikh Hasan site.
 * Every route filters strictly by the Najmi sheikhId — zero content bleed.
 *
 *   GET /najmi                       Home (hero + stats + return banner + featured)
 *   GET /najmi/series                Series list (category filter, teal)
 *   GET /najmi/series/:shortId/...   Series detail (reuses public/series-detail, realm=najmi)
 *   GET /najmi/bio                   Biography
 *   (GET /najmi/library              PDF hub — Phase 3)
 */
const express = require('express');
const router = express.Router();

const { Lecture, Series, Publication, SiteSettings } = require('../../models');
const { getNajmiSheikh } = require('../../utils/najmiSheikh');
const cache = require('../../utils/cache');
const { captureException } = require('../../utils/errorReporter');

const NAJMI_TTL = 600; // 10 min; invalidated on admin changes via invalidateHomepageCache()
const NAJMI_KEYWORDS_AR = 'الشيخ أحمد النجمي, العلامة أحمد بن يحيى النجمي, مفتي جازان, شرح صحيح مسلم, تأسيس الأحكام, فتح الرب الودود, دروس النجمي, كتب النجمي, المنهج السلفي';
const NAJMI_KEYWORDS_EN = 'Sheikh Ahmad al-Najmi, Ahmad ibn Yahya al-Najmi, Mufti of Jazan, Salafi scholars, Islamic lectures, Najmi books';

// Guard: every Najmi route needs the sheikh to exist
async function requireNajmiSheikh(req, res, next) {
  try {
    const sheikh = await getNajmiSheikh();
    if (!sheikh) {
      return res.status(404).send('أرشيف الشيخ أحمد النجمي غير متوفر حالياً');
    }
    req.najmiSheikh = sheikh;
    next();
  } catch (err) {
    console.error('Najmi sheikh lookup error:', err);
    captureException(err, req);
    res.status(500).send('Error loading Najmi archive');
  }
}

// Build a canonical /najmi/series URL for a series doc
function najmiSeriesUrl(series) {
  const en = series.slug_en || '';
  const ar = series.slug_ar ? encodeURIComponent(series.slug_ar) : '';
  return `/najmi/series/${series.shortId}/${en}/${ar}`.replace(/\/+$/,'');
}

// Category enum → Arabic/English label + fixed display order
const NAJMI_CATEGORY_ORDER = ['Aqeedah', 'Hadith', 'Fiqh', 'Tafsir', 'Seerah', 'Akhlaq', 'Other'];
const NAJMI_CATEGORY_LABELS = {
  Aqeedah: { ar: 'العقيدة', en: 'Aqeedah' }, Hadith: { ar: 'الحديث', en: 'Hadith' },
  Fiqh: { ar: 'الفقه', en: 'Fiqh' }, Tafsir: { ar: 'التفسير', en: 'Tafsir' },
  Seerah: { ar: 'السيرة', en: 'Seerah' }, Akhlaq: { ar: 'الأخلاق', en: 'Akhlaq' },
  Other: { ar: 'أخرى', en: 'Other' }
};

// Group the sheikh's visible series by category; show up to `perCat` per group
// (highest lecture count first), with the total count for the "view all" link.
async function loadSeriesByCategory(sheikhId, perCat) {
  const all = await Series.find({ sheikhId, isVisible: { $ne: false } })
    .sort({ lectureCount: -1, titleArabic: 1 })
    .select('titleArabic titleEnglish category lectureCount shortId slug_en slug_ar')
    .lean();

  const groups = {};
  for (const s of all) {
    const cat = NAJMI_CATEGORY_LABELS[s.category] ? s.category : 'Other';
    (groups[cat] = groups[cat] || []).push({ ...s, url: najmiSeriesUrl(s) });
  }

  return NAJMI_CATEGORY_ORDER
    .filter(cat => groups[cat] && groups[cat].length)
    .map(cat => ({
      key: cat,
      label: NAJMI_CATEGORY_LABELS[cat],
      total: groups[cat].length,
      series: groups[cat].slice(0, perCat)
    }));
}

// ---------------------------------------------------------------------------
// GET /najmi — the "Content" page (merged: About + series-by-category)
// ---------------------------------------------------------------------------
router.get('/', requireNajmiSheikh, async (req, res) => {
  try {
    const sheikh = req.najmiSheikh;

    // Cache the (locale-independent) page data; invalidated on admin content changes.
    const data = await cache.getOrSet('najmi:home', async () => {
      // Config: featuredSeriesCount is reused as "series shown per category"
      const settings = await SiteSettings.getSettings().catch(() => null);
      const cfgRaw = (settings && settings.homepage && settings.homepage.najmi) || {};
      const perCategory = Math.min(12, Math.max(2, cfgRaw.featuredSeriesCount || 4));
      const showLibrary = cfgRaw.showLibrary !== false;

      const [seriesCount, lectureCount, pubCount, categories, booksTeaser] = await Promise.all([
        Series.countDocuments({ sheikhId: sheikh._id, isVisible: { $ne: false } }),
        Lecture.countDocuments({ sheikhId: sheikh._id, published: true }),
        Publication.countDocuments({ sheikhId: sheikh._id, isPublished: { $ne: false } }),
        loadSeriesByCategory(sheikh._id, perCategory),
        showLibrary
          ? Publication.find({ sheikhId: sheikh._id, isPublished: { $ne: false } })
              .sort({ createdAt: -1 }).limit(4)
              .select('title category pageCount shortId slug_ar fileUrl').lean()
          : Promise.resolve([])
      ]);
      return { seriesCount, lectureCount, pubCount, categories, booksTeaser, showLibrary };
    }, NAJMI_TTL);

    res.render('najmi/index', {
      title: 'الشيخ العلامة أحمد بن يحيى النجمي',
      metaDescription: 'سيرة العلامة أحمد بن يحيى النجمي رحمه الله ودروسه ومحاضراته — أكثر من 1500 درس في 54 سلسلة و116 كتاباً.',
      metaKeywords: res.locals.locale === 'en' ? NAJMI_KEYWORDS_EN : NAJMI_KEYWORDS_AR,
      najmiSheikh: sheikh,
      stats: { seriesCount: data.seriesCount, lectureCount: data.lectureCount, pubCount: data.pubCount },
      categories: data.categories,
      booksTeaser: data.booksTeaser,
      showLibrary: data.showLibrary,
      canonicalPath: '/najmi'
    });
  } catch (err) {
    console.error('Najmi content page error:', err);
    captureException(err, req);
    res.status(500).send('Error loading Najmi content');
  }
});

// ---------------------------------------------------------------------------
// GET /najmi/series — series list
// ---------------------------------------------------------------------------
router.get('/series', requireNajmiSheikh, async (req, res) => {
  try {
    const sheikh = req.najmiSheikh;
    const series = await cache.getOrSet('najmi:series', async () => {
      const list = await Series.find({ sheikhId: sheikh._id, isVisible: { $ne: false } })
        .sort({ titleArabic: 1 })
        .select('titleArabic titleEnglish category lectureCount shortId slug_en slug_ar')
        .lean();
      return list.map(s => ({ ...s, url: najmiSeriesUrl(s) }));
    }, NAJMI_TTL);

    // Optional pre-filter from the Content page category "view all" links
    const validCats = ['Aqeedah', 'Hadith', 'Fiqh', 'Tafsir', 'Seerah', 'Akhlaq', 'Other'];
    const initialCat = validCats.includes(req.query.cat) ? req.query.cat : 'all';

    res.render('najmi/series', {
      title: 'سلاسل الشيخ أحمد النجمي',
      metaDescription: 'جميع سلاسل دروس العلامة أحمد بن يحيى النجمي رحمه الله في العقيدة والحديث والفقه والتفسير.',
      metaKeywords: res.locals.locale === 'en' ? NAJMI_KEYWORDS_EN : NAJMI_KEYWORDS_AR,
      najmiSheikh: sheikh,
      series,
      initialCat,
      canonicalPath: '/najmi/series'
    });
  } catch (err) {
    console.error('Najmi series list error:', err);
    captureException(err, req);
    res.status(500).send('Error loading series');
  }
});

// ---------------------------------------------------------------------------
// GET /najmi/series/:shortId/:slug_en?/:slug_ar? — series detail (reuse view)
// ---------------------------------------------------------------------------
router.get('/series/:shortId(\\d+)/:slug_en?/:slug_ar?', requireNajmiSheikh, async (req, res) => {
  try {
    const { findByShortId } = require('../../utils/findByIdOrSlug');
    const sheikh = req.najmiSheikh;
    const { shortId } = req.params;

    const series = await findByShortId(Series, shortId,
      { path: 'sheikhId', select: 'nameArabic nameEnglish honorific bioArabic bioEnglish shortId slug_en slug_ar' }
    );

    // 404 if not found, hidden, or belongs to a different realm (no content bleed)
    if (!series || series.isVisible === false ||
        String(series.sheikhId?._id || series.sheikhId) !== String(sheikh._id)) {
      return res.status(404).send('السلسلة غير موجودة');
    }

    // Canonical redirect within the realm
    const correctEn = series.slug_en || '';
    const correctAr = series.slug_ar || '';
    const providedAr = req.params.slug_ar ? decodeURIComponent(req.params.slug_ar) : '';
    if (req.params.slug_en !== correctEn || providedAr !== correctAr) {
      return res.redirect(301, najmiSeriesUrl(series));
    }

    const [lectures, siteSettings] = await Promise.all([
      Lecture.aggregate([
        { $match: { seriesId: series._id, published: true } },
        { $sort: { sortOrder: 1, lectureNumber: 1, createdAt: 1 } },
        { $lookup: { from: 'sheikhs', localField: 'sheikhId', foreignField: '_id', as: 'sheikhData' } },
        { $addFields: { sheikhId: { $arrayElemAt: ['$sheikhData', 0] } } },
        { $unset: ['sheikhData'] }
      ]),
      SiteSettings.getSettings()
    ]);

    const seriesStatsSettings = siteSettings.seriesStats || { minPlaysToShow: 100, showDuration: false };

    // Child series (mini-series)
    let childSeries = [];
    let childLectureCount = 0;
    const children = await Series.find({ parentSeriesId: series._id, isVisible: true })
      .select('_id titleArabic titleEnglish shortId slug_en slug_ar lectureCount').lean();
    if (children.length > 0) {
      const childIds = children.map(s => s._id);
      const childCounts = await Lecture.aggregate([
        { $match: { seriesId: { $in: childIds }, published: true } },
        { $group: { _id: '$seriesId', count: { $sum: 1 } } }
      ]);
      const countMap = new Map(childCounts.map(c => [c._id.toString(), c.count]));
      childSeries = children.map(child => ({ ...child, actualLectureCount: countMap.get(child._id.toString()) || 0 }));
      childLectureCount = childSeries.reduce((sum, c) => sum + c.actualLectureCount, 0);
    }

    const stats = {
      ownLectures: lectures.length,
      childLectures: childLectureCount,
      totalLectures: lectures.length + childLectureCount,
      totalPlays: lectures.reduce((sum, l) => sum + (l.playCount || 0), 0),
      totalDuration: lectures.reduce((sum, l) => sum + (l.duration || 0), 0),
      completeLectures: lectures.filter(l => l.lectureNumber).length
    };

    let parentSeries = null;
    if (series.parentSeriesId) {
      parentSeries = await Series.findById(series.parentSeriesId)
        .select('titleArabic titleEnglish shortId slug_en slug_ar').lean();
    }

    res.render('public/series-detail', {
      title: series.titleArabic,
      series,
      lectures,
      stats,
      childSeries,
      parentSeries,
      canonicalPath: najmiSeriesUrl(series),
      seriesStatsSettings,
      seriesBackUrl: '/najmi/series'
    });
  } catch (err) {
    console.error('Najmi series detail error:', err);
    captureException(err, req);
    res.status(500).send('Error loading series');
  }
});

// ---------------------------------------------------------------------------
// GET /najmi/library — PDF library hub (4-category filter)
// ---------------------------------------------------------------------------
router.get('/library', requireNajmiSheikh, async (req, res) => {
  try {
    const sheikh = req.najmiSheikh;
    const { publications, categories } = await cache.getOrSet('najmi:library', async () => {
      const pubs = await Publication.find({ sheikhId: sheikh._id, isPublished: { $ne: false } })
        .sort({ category: 1, title: 1 })
        .select('title titleEnglish category pageCount volumeCount fileUrl fileSize shortId slug_ar coverColor')
        .lean();
      // Category order + counts (fixed 4 categories)
      const CATEGORY_ORDER = ['الكتب', 'التعليقات', 'الرسائل', 'من السيرة الذاتية'];
      const counts = {};
      for (const p of pubs) counts[p.category] = (counts[p.category] || 0) + 1;
      const cats = CATEGORY_ORDER.filter(c => counts[c]).map(c => ({ name: c, count: counts[c] }));
      return { publications: pubs, categories: cats };
    }, NAJMI_TTL);

    res.render('najmi/library', {
      title: 'مكتبة الشيخ أحمد النجمي',
      metaDescription: 'مكتبة كتب ورسائل وتعليقات العلامة أحمد بن يحيى النجمي رحمه الله — 116 كتاباً في أربعة أبواب.',
      metaKeywords: res.locals.locale === 'en' ? NAJMI_KEYWORDS_EN : NAJMI_KEYWORDS_AR,
      najmiSheikh: sheikh,
      publications,
      categories,
      total: publications.length,
      canonicalPath: '/najmi/library'
    });
  } catch (err) {
    console.error('Najmi library error:', err);
    captureException(err, req);
    res.status(500).send('Error loading library');
  }
});

// GET /najmi/library/:shortId/download — track download then redirect to the file
router.get('/library/:shortId(\\d+)/download', requireNajmiSheikh, async (req, res) => {
  try {
    const pub = await Publication.findOne({
      shortId: parseInt(req.params.shortId),
      sheikhId: req.najmiSheikh._id
    }).select('fileUrl');
    if (!pub || !pub.fileUrl) return res.status(404).send('الملف غير موجود');
    // Fire-and-forget increment (don't block the redirect)
    Publication.updateOne({ _id: pub._id }, { $inc: { downloadCount: 1 } }).catch(() => {});
    res.redirect(pub.fileUrl);
  } catch (err) {
    console.error('Najmi download error:', err);
    captureException(err, req);
    res.status(500).send('Error');
  }
});

// ---------------------------------------------------------------------------
// GET /najmi/bio — merged into the Content page (/najmi). Redirect for old links.
// ---------------------------------------------------------------------------
router.get('/bio', (req, res) => res.redirect(301, '/najmi'));

module.exports = router;
