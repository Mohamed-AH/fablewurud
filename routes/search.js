const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const models = require('../models');
const {
  formatTime,
  stripTimestamps,
  stripSheikhPrefix
} = require('../utils/arabicSearch');
const { sanitizeSearchInput, sanitizeComment } = require('../utils/validators');
const { recordSearch } = require('../utils/metrics');
const sentryMetrics = require('../utils/sentryMetrics');
const cache = require('../utils/cache');

// Config from environment
const SEARCH_MODE = process.env.SEARCH_MODE || 'atlas';
const CONTEXT_WINDOW_SEC = parseInt(process.env.CONTEXT_WINDOW_SEC, 10) || 45;
const CONTEXT_ITEMS = parseInt(process.env.CONTEXT_ITEMS, 10) || 2;
const LOG_SEARCHES = process.env.LOG_SEARCHES !== 'false';
const SEARCH_CACHE_TTL = parseInt(process.env.SEARCH_CACHE_TTL, 10) || 300; // 5 minutes
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Helper to get search models (lazy access since they're initialized async)
const getTranscript = () => models.Transcript;
const getSearchLog = () => models.SearchLog;

/**
 * GET /search - Redirect to homepage (search consolidated on homepage)
 * The standalone search page has been decommissioned.
 */
router.get('/', (req, res) => {
  const query = req.query.q || '';
  // Redirect to homepage - the search functionality is now integrated there
  if (query) {
    res.redirect(301, `/?search=${encodeURIComponent(query)}`);
  } else {
    res.redirect(301, '/');
  }
});

/**
 * GET /search/results - Redirect to homepage (search consolidated on homepage)
 * The standalone search results page has been decommissioned.
 */
router.get('/results', (req, res) => {
  const query = req.query.q || '';
  // Redirect to homepage with search query
  if (query) {
    res.redirect(301, `/?search=${encodeURIComponent(query)}`);
  } else {
    res.redirect(301, '/');
  }
});

/**
 * GET /search/api - JSON API for enhanced search (used by homepage)
 */
router.get('/api', async (req, res) => {
  // Sanitize search input to prevent XSS
  const query = sanitizeSearchInput(req.query.q || '', 200);

  if (!query) {
    return res.json({
      success: true,
      query: '',
      results: [],
      searchLogId: null
    });
  }

  // Check if search models are initialized
  const Transcript = getTranscript();
  if (!Transcript) {
    return res.status(503).json({
      success: false,
      error: 'خدمة البحث غير متاحة حالياً. يرجى المحاولة لاحقاً.'
    });
  }

  try {
    // Strip sheikh prefix for cleaner matching
    const searchQuery = stripSheikhPrefix(query);
    const cacheKey = `search:${searchQuery.toLowerCase().trim()}`;

    // Check cache first
    const cachedResults = cache.get(cacheKey);
    if (cachedResults) {
      // Cache hit - return cached results with new log ID
      const searchLogId = LOG_SEARCHES ? new mongoose.Types.ObjectId() : null;

      // Send response immediately
      res.json({
        success: true,
        query,
        results: cachedResults,
        resultCount: cachedResults.length,
        searchLogId: searchLogId?.toString() || null
      });

      // Log asynchronously (don't block response)
      if (LOG_SEARCHES && searchLogId) {
        setImmediate(async () => {
          try {
            await logSearchAsync(searchLogId, query, searchQuery, cachedResults);
          } catch (err) {
            console.error('Async search logging failed:', err);
          }
        });
      }
      return;
    }

    // Cache miss - perform search
    let results = [];

    // Track search latency
    const searchStart = Date.now();

    if (SEARCH_MODE === 'atlas') {
      results = await performAtlasSearch(searchQuery);
    } else {
      results = await performLocalSearch(searchQuery);
    }

    const searchLatency = Date.now() - searchStart;

    // Enrich results with context
    results = await enrichWithContext(results);

    // Cache enriched results
    cache.set(cacheKey, results, SEARCH_CACHE_TTL);

    // Pre-generate ObjectId for async logging
    const searchLogId = LOG_SEARCHES ? new mongoose.Types.ObjectId() : null;

    // Record search metrics (term, result count, latency)
    recordSearch(query, results.length, searchLatency);

    // Sentry metrics for search performance
    sentryMetrics.searchLatency(searchLatency, SEARCH_MODE, results.length);
    if (results.length === 0) {
      sentryMetrics.searchEmpty(SEARCH_MODE);
    }

    // Send response immediately
    res.json({
      success: true,
      query,
      results,
      resultCount: results.length,
      searchLogId: searchLogId?.toString() || null
    });

    // Log asynchronously (don't block response)
    if (LOG_SEARCHES && searchLogId) {
      setImmediate(async () => {
        try {
          await logSearchAsync(searchLogId, query, searchQuery, results);
        } catch (err) {
          if (!isTest) console.error('Async search logging failed:', err);
        }
      });
    }
  } catch (error) {
    console.error('Search API error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ أثناء البحث. يرجى المحاولة مرة أخرى.'
    });
  }
});

/**
 * POST /search/feedback - Submit feedback
 */
router.post('/feedback', async (req, res) => {
  try {
    const SearchLog = getSearchLog();
    if (!SearchLog) {
      console.warn('[Feedback] SearchLog model not initialized');
      return res.status(503).json({ error: 'خدمة البحث غير متاحة' });
    }

    const { logId, relevant, comment } = req.body;
    console.log('[Feedback] Received:', { logId, relevant, comment: comment?.slice(0, 50) });

    // Validate logId
    if (!logId || !mongoose.Types.ObjectId.isValid(logId)) {
      console.warn('[Feedback] Invalid logId:', logId);
      return res.status(400).json({ error: 'معرف غير صالح' });
    }

    // Validate relevant
    const relevantBool = relevant === 'true' || relevant === true;
    const isRelevantProvided = relevant === 'true' || relevant === 'false' || typeof relevant === 'boolean';

    if (!isRelevantProvided) {
      return res.status(400).json({ error: 'يرجى تحديد ما إذا كانت النتائج مفيدة' });
    }

    // Sanitize comment to prevent XSS
    const sanitizedComment = comment ? sanitizeComment(comment, 300) : undefined;

    // Update search log
    const result = await SearchLog.findByIdAndUpdate(logId, {
      relevant: relevantBool,
      relevantAt: new Date(),
      comment: sanitizedComment
    }, { new: true });

    if (result) {
      console.log('[Feedback] Saved successfully - ID:', logId, 'Relevant:', relevantBool);
    } else {
      console.warn('[Feedback] Log not found:', logId);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Feedback] Error:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء حفظ التقييم' });
  }
});

/**
 * Atlas Search - lucene.arabic analyzer handles normalization natively
 * Groups results by lectureId to prevent one lecture from dominating results
 */
async function performAtlasSearch(query) {
  const Transcript = getTranscript();

  const pipeline = [
    {
      $search: {
        index: 'default',
        compound: {
          should: [
            // Phrase match with high boost for exact phrase relevance
            {
              phrase: {
                query,
                path: 'text',
                slop: 2,
                score: { boost: { value: 5 } }
              }
            },
            // Text match with fuzzy for typo tolerance
            {
              text: {
                query,
                path: 'text',
                fuzzy: { maxEdits: 1 }
              }
            }
          ],
          minimumShouldMatch: 1
        }
      }
    },
    {
      $limit: 100  // Get more results before grouping
    },
    {
      $lookup: {
        from: 'lectures',
        localField: 'lectureId',
        foreignField: '_id',
        as: 'lecture'
      }
    },
    {
      $unwind: {
        path: '$lecture',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $addFields: {
        score: { $meta: 'searchScore' }
      }
    },
    // Sort by score before grouping to ensure top hit is first
    {
      $sort: { score: -1 }
    },
    // Group by lectureId - keep top hit and collect additional hits
    {
      $group: {
        _id: '$lectureId',
        topHit: { $first: '$$ROOT' },
        additionalHits: {
          $push: {
            _id: '$_id',
            shortId: '$shortId',
            text: '$text',
            speaker: '$speaker',
            startTimeSec: '$startTimeSec',
            startTimeMs: '$startTimeMs',
            score: '$score'
          }
        },
        maxScore: { $max: '$score' }
      }
    },
    // Sort groups by their top score
    {
      $sort: { maxScore: -1 }
    },
    // Limit to top lectures
    {
      $limit: 20
    },
    // Reshape the output
    {
      $project: {
        _id: '$topHit._id',
        lectureId: '$_id',
        shortId: '$topHit.shortId',
        text: '$topHit.text',
        speaker: '$topHit.speaker',
        startTimeSec: '$topHit.startTimeSec',
        startTimeMs: '$topHit.startTimeMs',
        lectureTitle: '$topHit.lecture.titleArabic',
        lectureShortId: '$topHit.lecture.shortId',
        lectureSlugEn: '$topHit.lecture.slug_en',
        audioUrl: '$topHit.lecture.audioUrl',
        audioFileName: '$topHit.lecture.audioFileName',
        score: '$topHit.score',
        // Filter out the top hit from additional hits and limit to 5
        additionalHits: {
          $slice: [
            {
              $filter: {
                input: '$additionalHits',
                as: 'hit',
                cond: { $ne: ['$$hit._id', '$topHit._id'] }
              }
            },
            5
          ]
        }
      }
    }
  ];

  return await Transcript.aggregate(pipeline);
}

/**
 * Local text search fallback
 * Groups results by lectureId to prevent one lecture from dominating results
 */
async function performLocalSearch(query) {
  const Transcript = getTranscript();

  const results = await Transcript.find(
    { $text: { $search: query } },
    { score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(100)  // Get more results before grouping
    .populate('lectureId', 'titleArabic shortId slug_en audioUrl audioFileName')
    .lean();

  // Group results by lectureId
  const grouped = new Map();

  for (const r of results) {
    const lectureIdStr = r.lectureId?._id?.toString() || 'unknown';

    const hit = {
      _id: r._id,
      lectureId: r.lectureId?._id,
      shortId: r.shortId,
      text: r.text,
      speaker: r.speaker,
      startTimeSec: r.startTimeSec,
      startTimeMs: r.startTimeMs,
      lectureTitle: r.lectureId?.titleArabic,
      lectureShortId: r.lectureId?.shortId,
      lectureSlugEn: r.lectureId?.slug_en,
      audioUrl: r.lectureId?.audioUrl,
      audioFileName: r.lectureId?.audioFileName,
      score: r.score
    };

    if (!grouped.has(lectureIdStr)) {
      // First hit for this lecture becomes the top hit
      grouped.set(lectureIdStr, {
        ...hit,
        additionalHits: []
      });
    } else if (grouped.get(lectureIdStr).additionalHits.length < 5) {
      // Add to additional hits (up to 5)
      grouped.get(lectureIdStr).additionalHits.push({
        _id: r._id,
        shortId: r.shortId,
        text: r.text,
        speaker: r.speaker,
        startTimeSec: r.startTimeSec,
        startTimeMs: r.startTimeMs,
        score: r.score
      });
    }
  }

  // Convert to array and limit to 20 lectures
  return Array.from(grouped.values()).slice(0, 20);
}

/**
 * Enrich results with context (surrounding transcript lines)
 * Optimized: Batch fetch all context in a single aggregation (40 -> 1 query for 20 results)
 */
async function enrichWithContext(results) {
  const Transcript = getTranscript();
  if (!results.length) return [];

  // Build $or conditions for all results' context windows
  const orConditions = results.map(r => ({
    lectureId: r.lectureId,
    startTimeSec: {
      $gte: r.startTimeSec - CONTEXT_WINDOW_SEC,
      $lte: r.startTimeSec + CONTEXT_WINDOW_SEC
    },
    _id: { $ne: r._id }
  }));

  // Single aggregation to fetch all context segments
  const allContext = await Transcript.aggregate([
    { $match: { $or: orConditions } },
    { $project: { _id: 0, text: 1, lectureId: 1, startTimeSec: 1 } },
    { $sort: { lectureId: 1, startTimeSec: 1 } }
  ]);

  // Group context by lectureId for efficient lookup
  const contextMap = new Map();
  for (const ctx of allContext) {
    const key = ctx.lectureId.toString();
    if (!contextMap.has(key)) contextMap.set(key, []);
    contextMap.get(key).push(ctx);
  }

  // Enrich results using the pre-fetched context
  return results.map(result => {
    const lectureContext = contextMap.get(result.lectureId.toString()) || [];

    // Filter and limit context before (items with smaller timestamps)
    const contextBefore = lectureContext
      .filter(c => c.startTimeSec < result.startTimeSec && c.startTimeSec >= result.startTimeSec - CONTEXT_WINDOW_SEC)
      .slice(-CONTEXT_ITEMS)
      .map(c => stripTimestamps(c.text))
      .join(' ');

    // Filter and limit context after (items with larger timestamps)
    const contextAfter = lectureContext
      .filter(c => c.startTimeSec > result.startTimeSec && c.startTimeSec <= result.startTimeSec + CONTEXT_WINDOW_SEC)
      .slice(0, CONTEXT_ITEMS)
      .map(c => stripTimestamps(c.text))
      .join(' ');

    // Enrich additional hits with formatted time (no full context needed)
    const enrichedAdditionalHits = (result.additionalHits || []).map(hit => ({
      ...hit,
      formattedTime: formatTime(hit.startTimeSec)
    }));

    return {
      ...result,
      contextBefore,
      contextAfter,
      formattedTime: formatTime(result.startTimeSec),
      additionalHits: enrichedAdditionalHits
    };
  });
}

/**
 * Log search query asynchronously (best-effort, no failure)
 * @param {mongoose.Types.ObjectId} id - Pre-generated ObjectId
 * @param {string} query - Original query
 * @param {string} searchQuery - Normalized query
 * @param {Array} results - Search results
 */
async function logSearchAsync(id, query, searchQuery, results) {
  const SearchLog = getSearchLog();
  if (!SearchLog) {
    if (!isTest) console.warn('[SearchLog] Model not initialized - search not logged');
    return;
  }

  if (!isTest) console.log('[SearchLog] Creating log for query:', query);
  await SearchLog.create({
    _id: id,
    query,
    normalizedQuery: searchQuery,
    resultCount: results.length,
    topLectureIds: results.slice(0, 5).map(r => r.lectureId?.toString()).filter(Boolean),
    searchMode: SEARCH_MODE,
    relevant: null
  });
  if (!isTest) console.log('[SearchLog] Saved successfully - ID:', id.toString(), 'Results:', results.length);
}

module.exports = router;
