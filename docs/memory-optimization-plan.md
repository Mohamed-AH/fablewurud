# Memory Optimization Plan - OOM Fix for 512MB Server

## Context

The Node.js/Mongoose app is crashing with OOM errors (Status 137) on a 512MB RAM Render server. Sentry has identified N+1 query issues (NODE-4, NODE-5, NODE-6) involving `Transcript.find` and `Lecture.findOne`. This plan addresses the memory killers: nested queries, missing `.lean()`, unnecessary data fetching, and large aggregations.

---

## Critical Issues Summary

| Priority | Issue | File:Line | Impact |
|----------|-------|-----------|--------|
| P0 | N+1 transcript context queries | `routes/search.js:369-424` | 2 queries per result (40 queries for 20 results) |
| P0 | Nested N+1 sections/series/lectures | `routes/index.js:168-202` | 55+ queries for homepage |
| P1 | N+1 schedule data | `routes/index.js:126-154` | 2 queries per schedule item |
| P1 | N+1 sheikh lecture counts | `routes/admin/index.js:1561-1566` | 1 query per sheikh |
| P1 | N+1 related khutba series | `routes/index.js:787-794` | 1 query per related series |
| P2 | Missing $project in aggregations | Multiple files | Full documents in memory |
| P2 | Bulk transcript update N+1 | `routes/admin/index.js:1219-1233` | 1 query per segment |
| P2 | N+1 admin sections | `routes/admin/index.js:2147-2152` | 1 query per section |

---

## Phase 1: Critical Fixes (P0)

### 1.1 Fix `enrichWithContext()` - routes/search.js:369-424

**Current Problem:**
```javascript
for (const result of results) {
  const contextBefore = await Transcript.find({...}).lean();  // Query 1
  const contextAfter = await Transcript.find({...}).lean();   // Query 2
}
```

**Solution:** Batch fetch all context in a single aggregation query.

```javascript
async function enrichWithContext(results) {
  const Transcript = getTranscript();
  if (!results.length) return [];

  // Build bulk query conditions
  const contextQueries = results.flatMap(result => [
    {
      lectureId: result.lectureId,
      startTimeSec: { $gte: result.startTimeSec - CONTEXT_WINDOW_SEC, $lt: result.startTimeSec },
      _id: { $ne: result._id },
      type: 'before',
      resultId: result._id
    },
    {
      lectureId: result.lectureId,
      startTimeSec: { $gt: result.startTimeSec, $lte: result.startTimeSec + CONTEXT_WINDOW_SEC },
      _id: { $ne: result._id },
      type: 'after',
      resultId: result._id
    }
  ]);

  // Single aggregation with $facet for each result's context
  const allContext = await Transcript.aggregate([
    {
      $match: {
        $or: results.map(r => ({
          lectureId: r.lectureId,
          startTimeSec: {
            $gte: r.startTimeSec - CONTEXT_WINDOW_SEC,
            $lte: r.startTimeSec + CONTEXT_WINDOW_SEC
          },
          _id: { $ne: r._id }
        }))
      }
    },
    { $project: { text: 1, lectureId: 1, startTimeSec: 1 } },
    { $sort: { lectureId: 1, startTimeSec: 1 } }
  ]);

  // Group context by lectureId and map to results
  const contextMap = new Map();
  for (const ctx of allContext) {
    const key = ctx.lectureId.toString();
    if (!contextMap.has(key)) contextMap.set(key, []);
    contextMap.get(key).push(ctx);
  }

  // Enrich results using the pre-fetched context
  return results.map(result => {
    const lectureContext = contextMap.get(result.lectureId.toString()) || [];
    const contextBefore = lectureContext
      .filter(c => c.startTimeSec < result.startTimeSec)
      .slice(-CONTEXT_ITEMS)
      .map(c => stripTimestamps(c.text))
      .join(' ');
    const contextAfter = lectureContext
      .filter(c => c.startTimeSec > result.startTimeSec)
      .slice(0, CONTEXT_ITEMS)
      .map(c => stripTimestamps(c.text))
      .join(' ');
    
    return {
      ...result,
      contextBefore,
      contextAfter,
      formattedTime: formatTime(result.startTimeSec),
      additionalHits: (result.additionalHits || []).map(hit => ({
        ...hit,
        formattedTime: formatTime(hit.startTimeSec)
      }))
    };
  });
}
```

**Memory savings:** Reduces from 40 queries to 1 query for 20 results.

---

### 1.2 Fix `fetchSectionsData()` - routes/index.js:168-202

**Current Problem:** Nested N+1 pattern - queries series per section, then lecture counts per series.

**Solution:** Use aggregation pipeline with `$lookup` and lecture counts.

```javascript
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
          { $match: { $expr: { $eq: ['$sectionId', '$$sectionId'] }, isVisible: { $ne: false } } },
          { $sort: { sectionOrder: 1 } },
          // Lookup sheikh for each series
          {
            $lookup: {
              from: 'sheikhs',
              localField: 'sheikhId',
              foreignField: '_id',
              as: 'sheikh',
              pipeline: [{ $project: { nameArabic: 1, nameEnglish: 1, honorific: 1 } }]
            }
          },
          { $addFields: { sheikh: { $arrayElemAt: ['$sheikh', 0] } } },
          // Lookup lecture count
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
          { $match: { lectureCount: { $gt: 0 } } },
          { $project: { lectureCountArr: 0, sheikhId: 0 } }
        ],
        as: 'series'
      }
    },
    { $match: { 'series.0': { $exists: true } } },
    { $addFields: { totalSeriesCount: { $size: '$series' } } }
  ]);

  return sections;
}
```

**Memory savings:** Reduces from 55+ queries to 1 aggregation pipeline.

---

## Phase 2: High Priority Fixes (P1)

### 2.1 Fix `fetchScheduleData()` - routes/index.js:126-154

**Solution:** Use aggregation to get counts and latest lectures in one query.

```javascript
async function fetchScheduleData() {
  const scheduleItems = await Schedule.find({ isActive: true })
    .populate('seriesId', 'titleArabic titleEnglish slug')
    .sort({ sortOrder: 1 })
    .lean();

  if (!scheduleItems.length) return [];

  const seriesIds = scheduleItems.filter(i => i.seriesId).map(i => i.seriesId._id);

  // Get counts and latest lectures in ONE aggregation
  const seriesStats = await Lecture.aggregate([
    { $match: { seriesId: { $in: seriesIds }, published: true } },
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

  return scheduleItems
    .filter(item => item.seriesId)
    .map(item => {
      const stats = statsMap.get(item.seriesId._id.toString()) || {};
      const latestLecture = stats.latestLecture;
      const isNew = latestLecture && (
        Date.now() - new Date(latestLecture.dateRecorded || latestLecture.createdAt) < 7 * 24 * 60 * 60 * 1000
      );
      return { ...item, latestLecture, lectureCount: stats.lectureCount || 0, isNew };
    })
    .sort((a, b) => {
      const dayOrder = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
      return dayOrder.indexOf(a.dayOfWeek) - dayOrder.indexOf(b.dayOfWeek);
    });
}
```

**Memory savings:** Reduces from 14 queries (7 items x 2) to 2 queries.

---

### 2.2 Fix Sheikh Lecture Counts - routes/admin/index.js:1561-1566

**Solution:** Use aggregation with `$in` for bulk counts.

```javascript
router.get('/sheikhs', isAdmin, async (req, res) => {
  const { Sheikh, Lecture } = require('../../models');

  const sheikhs = await Sheikh.find().sort({ nameArabic: 1 }).lean();
  const sheikhIds = sheikhs.map(s => s._id);

  // Bulk count lectures per sheikh in ONE query
  const lectureCounts = await Lecture.aggregate([
    { $match: { sheikhId: { $in: sheikhIds }, published: true } },
    { $group: { _id: '$sheikhId', count: { $sum: 1 } } }
  ]);

  const countMap = new Map(lectureCounts.map(c => [c._id.toString(), c.count]));
  sheikhs.forEach(sheikh => {
    sheikh.actualLectureCount = countMap.get(sheikh._id.toString()) || 0;
  });

  res.render('admin/sheikhs', { title: 'Manage Sheikhs', user: req.user, sheikhs });
});
```

**Memory savings:** Reduces from N queries to 2 queries.

---

### 2.3 Fix Related Khutba Series - routes/index.js:787-794

**Solution:** Bulk count with `$in`.

```javascript
// After finding relatedKhutbaSeries
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
```

---

## Phase 3: Medium Priority Fixes (P2)

### 3.1 Add $project to Aggregations

**Files to update:**
- `routes/index.js:25-47` - Add `$project` to limit Lecture fields
- `routes/index.js:730-765` - Add `$project` after `$lookup`
- `routes/api/homepage.js:188-211` - Add `$project` stage

**Example fix for routes/index.js:25-47:**
```javascript
const lectures = await Lecture.aggregate([
  { $match: { seriesId: s._id, published: true } },
  { $addFields: { effectiveSortOrder: { $ifNull: ['$sortOrder', 999999] } } },
  { $sort: { effectiveSortOrder: 1, lectureNumber: 1, createdAt: 1 } },
  // ADD THIS $project stage
  {
    $project: {
      _id: 1,
      titleArabic: 1,
      titleEnglish: 1,
      lectureNumber: 1,
      sortOrder: 1,
      dateRecorded: 1,
      durationSeconds: 1,
      audioUrl: 1,
      slug: 1,
      shortId: 1
    }
  }
]);
```

---

### 3.2 Fix Bulk Transcript Update - routes/admin/index.js:1219-1233

**Solution:** Use `bulkWrite()` instead of individual updates.

```javascript
const bulkOps = segments
  .filter(seg => seg._id && seg.text)
  .map(seg => ({
    updateOne: {
      filter: { _id: seg._id },
      update: {
        $set: {
          text: seg.text.trim(),
          ...(seg.speaker ? { speaker: seg.speaker.trim() } : {})
        }
      }
    }
  }));

const result = await Transcript.bulkWrite(bulkOps);
res.json({
  success: true,
  message: `Updated ${result.modifiedCount} of ${segments.length} segments`
});
```

---

### 3.3 Fix Admin Sections - routes/admin/index.js:2147-2152

**Solution:** Use aggregation for series counts.

```javascript
const sections = await Section.find().sort({ displayOrder: 1 }).lean();
const sectionIds = sections.map(s => s._id);

const seriesCounts = await Series.aggregate([
  { $match: { sectionId: { $in: sectionIds } } },
  { $group: { _id: '$sectionId', count: { $sum: 1 } } }
]);

const countMap = new Map(seriesCounts.map(c => [c._id?.toString(), c.count]));
const sectionsWithCounts = sections.map(s => ({
  ...s,
  seriesCount: countMap.get(s._id.toString()) || 0
}));
```

---

## Verification Plan

1. **Run automated tests:**
   ```bash
   npm test
   ```

2. **Manual testing checklist:**
   - [ ] Homepage loads correctly with all sections
   - [ ] Search returns results with context
   - [ ] Series detail page shows lectures
   - [ ] Admin sheikhs page shows lecture counts
   - [ ] Admin sections page shows series counts
   - [ ] Bulk transcript editing works

3. **Memory monitoring:**
   ```bash
   # Monitor memory during load test
   NODE_OPTIONS="--max-old-space-size=450" npm start
   ```

4. **Query logging (development):**
   ```javascript
   mongoose.set('debug', true);
   ```

---

## Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `routes/search.js` | 369-424 | Refactor `enrichWithContext()` |
| `routes/index.js` | 168-202 | Refactor `fetchSectionsData()` |
| `routes/index.js` | 126-154 | Refactor `fetchScheduleData()` |
| `routes/index.js` | 787-794 | Bulk query for related series |
| `routes/index.js` | 903-910 | Same fix for legacy route |
| `routes/index.js` | 25-47, 730-765 | Add `$project` stages |
| `routes/admin/index.js` | 1561-1566 | Bulk sheikh counts |
| `routes/admin/index.js` | 1219-1233 | Use `bulkWrite()` |
| `routes/admin/index.js` | 2147-2152 | Bulk section counts |
| `routes/api/homepage.js` | 188-211 | Add `$project` stage |

---

---

## Additional Optimizations (Reviewer Suggestions)

### A. Index Verification

The compound index for context queries **already exists** at `models/Transcript.js:42`:
```javascript
transcriptSchema.index({ lectureId: 1, startTimeSec: 1 });
```
This ensures the `enrichWithContext()` aggregation will use an efficient index scan.

### B. Global Lean Middleware (Quick Win)

Add a plugin to `config/database.js` or before model initialization to default all read queries to `.lean()`:

```javascript
const mongoose = require('mongoose');

// Global plugin: Default find/findOne to lean() for memory efficiency
mongoose.plugin((schema) => {
  schema.pre('find', function() {
    if (this.options.lean === undefined) {
      this.lean();
    }
  });
  schema.pre('findOne', function() {
    if (this.options.lean === undefined) {
      this.lean();
    }
  });
});
```

**Caution:** This affects queries that call `.save()` after fetching. Those queries should explicitly use `{ lean: false }` or use `findById()` patterns that skip the middleware.

### C. Memory-Safe Chunked bulkWrite (3.2 Enhancement)

For bulk transcript updates, chunk large arrays to prevent memory spikes:

```javascript
const CHUNK_SIZE = 100;

async function chunkedBulkWrite(Model, operations) {
  const results = [];
  for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
    const chunk = operations.slice(i, i + CHUNK_SIZE);
    const result = await Model.bulkWrite(chunk);
    results.push(result);
  }
  return results;
}

// Usage in routes/admin/index.js:1219-1233
const bulkOps = segments
  .filter(seg => seg._id && seg.text)
  .map(seg => ({
    updateOne: {
      filter: { _id: seg._id },
      update: {
        $set: {
          text: seg.text.trim(),
          ...(seg.speaker ? { speaker: seg.speaker.trim() } : {})
        }
      }
    }
  }));

if (bulkOps.length > 100) {
  await chunkedBulkWrite(Transcript, bulkOps);
} else {
  await Transcript.bulkWrite(bulkOps);
}
```

### D. BSON Document Limit Note

The nested `$lookup` in `fetchSectionsData()` (Phase 1.2) returns all series within sections. At current scale (~10 users/week), this is safe. If sections grow to 100+ series each, consider:
- Adding `$limit` inside the inner `$lookup` pipeline
- Paginating section data via API

---

## Expected Outcome

- **Before:** 100+ database queries per homepage load
- **After:** ~5-10 optimized queries per homepage load
- **Memory reduction:** 60-70% reduction in peak memory usage
- **Response time:** 50-70% faster page loads
