# Sentry Metrics Implementation Plan

## Context

The Sentry integration is working (verified via `scripts/test-sentry-metrics.js`), and metrics appear on the dashboard. Now we need to instrument the actual application to capture meaningful business and performance metrics.

**Goal**: Add Sentry metrics at strategic points to track audio usage, search performance, and key operations without major code refactoring.

---

## Phase 1: Create Sentry Metrics Utility

**Create**: `/home/user/wurud/utils/sentryMetrics.js`

Follow the same pattern as `logger.js` (lazy Sentry loading to avoid circular deps):

```javascript
// Domain-specific helpers:
sentryMetrics.audioPlay(source)           // count - stream started
sentryMetrics.audioDownload(source, sizeMB) // count + distribution
sentryMetrics.searchLatency(latencyMs, mode, resultCount)  // distribution
sentryMetrics.searchEmpty(mode)           // count - zero results
sentryMetrics.cacheHit(key)               // count
sentryMetrics.cacheMiss(key)              // count
sentryMetrics.uploadLatency(latencyMs)    // distribution (admin)
```

---

## Phase 2: Audio Play/Download Tracking (High Priority)

**File**: `/home/user/wurud/controllers/streamController.js`

### Stream (lines 107-156)
Add after existing `recordAudioPlay()` calls:
- `sentryMetrics.audioPlay('oci')` at line 114 (OCI URL path)
- `sentryMetrics.audioPlay('oci')` at line 130 (OCI configured path)
- `sentryMetrics.audioPlay('local')` at line 156 (local file path)

### Download (lines 214-276)
Add after `incrementDownloadCount()`:
- `sentryMetrics.audioDownload('oci', lecture.fileSize / 1024 / 1024)` at line 229
- `sentryMetrics.audioDownload('local', lecture.fileSize / 1024 / 1024)` at line 276

---

## Phase 3: Search Tracking

**File**: `/home/user/wurud/routes/search.js`

At line 104 (after existing `recordSearch()`), add:
```javascript
sentryMetrics.searchLatency(searchLatency, SEARCH_MODE, results.length);
if (results.length === 0) {
  sentryMetrics.searchEmpty(SEARCH_MODE);
}
```

---

## Phase 4: Cache Hit/Miss Tracking

**File**: `/home/user/wurud/utils/cache.js`

In `get()` method (around line 54):
- Add `sentryMetrics.cacheHit(key)` on cache hit
- Add `sentryMetrics.cacheMiss(key)` when returning undefined

---

## Phase 5: Upload Tracking (Admin)

**File**: `/home/user/wurud/routes/api/lectures.js`

In POST `/` handler (lines 24-174):
- Wrap full operation with timing: `sentryMetrics.uploadLatency(latencyMs)`

---

## Critical Files

| File | Changes |
|------|---------|
| `utils/sentryMetrics.js` | **New file** - metrics utility |
| `controllers/streamController.js` | Add audioPlay/audioDownload calls |
| `routes/search.js` | Add searchLatency/searchEmpty calls |
| `utils/cache.js` | Add cacheHit/cacheMiss calls |
| `routes/api/lectures.js` | Add uploadLatency (optional) |

---

## Metric Naming Convention

All metrics prefixed with `wurud.`:
- `wurud.audio.play` (count)
- `wurud.audio.download` (count)
- `wurud.audio.download.size` (distribution, MB)
- `wurud.search.latency` (distribution, ms)
- `wurud.search.empty` (count)
- `wurud.cache.hit` (count)
- `wurud.cache.miss` (count)
- `wurud.upload.latency` (distribution, ms)

**Tags** (low cardinality):
- `source`: `'oci'` | `'local'`
- `mode`: `'atlas'` | `'local'`

---

## Verification

1. Deploy changes
2. Trigger real operations:
   - Play a lecture (stream)
   - Download a lecture
   - Search for content
   - Visit homepage (cache)
3. Check Sentry Metrics Explorer after 2-3 minutes
4. Verify metrics appear with correct tags
