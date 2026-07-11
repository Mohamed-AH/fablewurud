# Search Cache and Async Logging Implementation Plan

## Context

Currently, search queries in `/routes/search.js` perform database operations synchronously before returning results to users. The `logSearch()` function (line 101) awaits `SearchLog.create()`, adding latency to every search request. By caching search results and moving logging to run asynchronously after the response is sent, we can significantly improve response times.

### Performance Impact (from Sentry traces)

| Metric | Before | After |
|--------|--------|-------|
| Database Latency | ~928ms | ~0ms (Cache Hit) |
| Logging Overhead | ~194ms (Blocking) | 0ms (Non-blocking) |
| User Experience | Wait for Write + Search | Instant Results |

## Changes Overview

1. **Search Cache**: Use the existing in-memory cache (`/utils/cache.js`) to cache search results
2. **Async Logging**: Move `logSearch()` to use `setImmediate()` pattern (like analytics middleware)

## Implementation Details

### 1. Add Cache to Search API (`/routes/search.js`)

**Add imports and config (near line 12):**
```javascript
const cache = require('../utils/cache');
const SEARCH_CACHE_TTL = parseInt(process.env.SEARCH_CACHE_TTL, 10) || 300; // 5 minutes
```

**Modify the `/api` endpoint (lines 56-127):**
- Create cache key from normalized query: `search:${searchQuery.toLowerCase().trim()}`
- Check cache before performing search
- Cache enriched results after search
- Skip metrics recording for cache hits (to keep latency metrics accurate)

**Important**: Cache key uses `searchQuery` which is already normalized via `stripSheikhPrefix()` at line 80. This ensures Arabic variations (with/without diacritics, sheikh prefix) hit the same cache entry.

### 2. Async Logging with Pre-generated ID

**Problem**: The `searchLogId` is returned in the response for user feedback. With async logging, we can't wait for `SearchLog.create()` to get the ID.

**Solution**: Pre-generate the MongoDB ObjectId before sending response:
```javascript
const searchLogId = new mongoose.Types.ObjectId();
// Send response immediately with searchLogId
res.json({ 
  success: true, 
  query, 
  results, 
  resultCount: results.length, 
  searchLogId: searchLogId.toString() 
});

// Log asynchronously with error handling (matches analytics.js pattern)
setImmediate(async () => {
  try {
    await logSearchAsync(searchLogId, query, searchQuery, results);
  } catch (err) {
    console.error('Async search logging failed:', err);
  }
});
```

**Note**: `mongoose` is already imported at line 3 in search.js.

### 3. Create New Async Logging Function

Replace the synchronous `logSearch()` function with `logSearchAsync()` that accepts a pre-generated ObjectId:

```javascript
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
    console.warn('[SearchLog] Model not initialized - search not logged');
    return;
  }

  console.log('[SearchLog] Creating log for query:', query);
  await SearchLog.create({
    _id: id,  // Pass ObjectId directly, don't re-cast from string
    query,
    normalizedQuery: searchQuery,
    resultCount: results.length,
    topLectureIds: results.slice(0, 5).map(r => r.lectureId?.toString()).filter(Boolean),
    searchMode: SEARCH_MODE,
    relevant: null
  });
  console.log('[SearchLog] Saved successfully - ID:', id.toString(), 'Results:', results.length);
}
```

### 4. Add Cache Invalidation (`/routes/admin/index.js`)

Modify `invalidateHomepageCache()` (line 12) to also invalidate search cache when content changes:
```javascript
function invalidateHomepageCache() {
  cache.invalidatePattern('homepage:*');
  cache.invalidatePattern('search:*');  // Add this line
  cache.del('sitemap:xml');
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `/routes/search.js` | Add cache, async logging, pre-generated ID |
| `/routes/admin/index.js` | Add search cache invalidation |
| `/tests/integration/routes/search.test.js` | Add tests for cache behavior and async logging |

## Existing Utilities to Reuse

- **Cache**: `/utils/cache.js` - `get()`, `set()`, `getOrSet()`, `invalidatePattern()`
- **Async pattern**: `/middleware/analytics.js:52-59` - `setImmediate()` with try/catch

## Design Decisions

1. **Cache key**: Use normalized query (after `stripSheikhPrefix()`) for better cache hit rate
2. **Cache TTL**: 5 minutes (configurable via `SEARCH_CACHE_TTL` env var), matches homepage cache
3. **What to cache**: Enriched results (after context enrichment) for maximum performance benefit
4. **Don't cache searchLogId**: Each search should create a new log for accurate analytics
5. **Graceful degradation**: If async logging fails, feedback submission will simply fail to find the document (acceptable, as logging is already "best-effort")
6. **ObjectId handling**: Pass ObjectId object directly to `SearchLog.create()` to avoid unnecessary string-to-ObjectId conversion overhead
7. **Error handling**: Wrap async logging in try/catch to prevent unhandled promise rejections from crashing the Node.js process

## Verification

1. **Unit test cache behavior**: Verify second identical query doesn't hit database
2. **Verify async logging**: Response should return before log is created
3. **Test searchLogId format**: Should be valid ObjectId
4. **Test feedback flow**: Feedback should still work after short delay
5. **Run existing tests**: `npm test -- tests/integration/routes/search.test.js`
6. **Manual test**: Search in browser, verify response time improvement

## Implementation Checklist

- [x] Add cache import and TTL config to search.js
- [x] Implement cache check before search
- [x] Cache enriched results after search
- [x] Replace `logSearch()` with `logSearchAsync()` 
- [x] Pre-generate ObjectId and send response before logging
- [x] Wrap async logging in try/catch
- [x] Add search cache invalidation to admin routes
- [x] Add integration tests for cache hits/misses
- [x] Add integration tests for async logging
- [ ] Manual browser testing
