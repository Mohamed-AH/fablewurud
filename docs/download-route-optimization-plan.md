# Download Route Optimization Plan

## Context

The `/download/:id` route is experiencing **5.25 second response times** due to the server proxying files from Oracle Cloud Storage instead of redirecting users directly. This creates a bottleneck where:

- **4.78s (91%)** is spent waiting for Oracle Cloud response in `me-jeddah-1` region
- The Node.js server acts as a "middleman", fetching the entire file before serving it
- This blocks the event loop and wastes server resources

**Goal:** Reduce response time from **5.25s to ~250ms** by using presigned URLs and redirect.

---

## Current Architecture

**File:** `controllers/streamController.js`

### Current Flow (lines 194-305):
```
1. Validate lecture ID
2. Lecture.findById() with populate (sheikh, series)  → ~200ms
3. Generate filename
4. proxyOciDownload() - HTTPS request to OCI         → 4,780ms (BOTTLENECK)
5. Lecture.updateOne() increment downloadCount       → ~242ms
6. Record Sentry metrics
7. Pipe response to client
```

### Why Proxying Exists
The `proxyOciDownload()` function (lines 42-78) was implemented to:
1. Set `Content-Disposition: attachment` header for forced downloads
2. Set proper filename with Arabic characters (RFC 5987 encoding)

---

## Existing Pattern to Follow

**The `streamAudio()` function (lines 85-187) already uses redirects correctly:**

```javascript
// Line 119: Direct redirect for OCI URLs
res.redirect(lecture.audioUrl);

// Line 136: Redirect for OCI-configured files  
res.redirect(ociUrl);
```

This is why streaming is fast. We need to apply the same pattern to downloads.

---

## Proposed Solution

### Strategy: Presigned URL + Redirect

**Key Discovery:** The codebase already has presigned URL support at `utils/ociStorage.js:267-299`:
```javascript
async function createPreAuthenticatedRequest(objectName, expiryHours = 24)
```

This function is **implemented but unused**. We will leverage it.

### New Flow:
```
1. Validate lecture ID
2. Lecture.findById() with populate                  → ~200ms
3. Generate presigned URL (PAR)                      → ~20ms
4. Send 302 redirect with Content-Disposition hint  → ~5ms
5. [BACKGROUND] Increment downloadCount             → async, non-blocking
6. [BACKGROUND] Record Sentry metrics               → async, non-blocking

Total blocking time: ~225ms
```

---

## Implementation Details

### 1. Modify `downloadAudio()` in `controllers/streamController.js`

**Replace proxy logic (lines 231-259) with redirect:**

```javascript
// Instead of:
await proxyOciDownload(ociUrl, res, downloadFilename);

// Use:
const { createPreAuthenticatedRequest } = require('../utils/ociStorage');

// Generate short-lived PAR (1 hour expiry for downloads)
const parUrl = await createPreAuthenticatedRequest(lecture.audioFileName, 1);

// Redirect with download hint
res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`);
res.redirect(302, parUrl);
```

### 2. Counter Increment Timing

**Current Behavior (lines 219-221):**
```javascript
// Counter incremented BEFORE verifying file exists/accessible
Lecture.updateOne({ _id: lecture._id }, { $inc: { downloadCount: 1 } }).catch(err => {
  console.error('Error incrementing download count:', err);
});
```

**Issue:** Counter increments even if download fails (file not found, OCI error, etc.)

**Improved Flow:**
```javascript
// 1. Validate file exists/PAR can be generated
const parUrl = await createPreAuthenticatedRequest(lecture.audioFileName, 1);

// 2. Send redirect (user starts downloading)
res.redirect(302, parUrl);

// 3. THEN increment counter (fire-and-forget, already non-blocking pattern)
Lecture.updateOne({ _id: lecture._id }, { $inc: { downloadCount: 1 } }).catch(err => {
  console.error('Error incrementing download count:', err);
});

// 4. Record metrics
sentryMetrics.audioDownload('oci', lecture.fileSize ? lecture.fileSize / 1024 / 1024 : 0);
```

**Note:** The counter increment is already fire-and-forget (no `await`). We just move it after the redirect is sent.

### 3. Handle Content-Disposition for Download

**Challenge:** PAR redirect doesn't trigger "Save As" dialog because OCI serves files without `Content-Disposition: attachment` header.

**Solution Implemented: PAR + Proxy Hybrid**
- Generate PAR URL for authenticated OCI access (security benefit)
- Proxy the download through server to set `Content-Disposition: attachment` header
- This ensures proper filename and forces "Save As" dialog

```javascript
// Generate PAR for authenticated access
const parUrl = await createPreAuthenticatedRequest(lecture.audioFileName, 1);

// Proxy to set Content-Disposition header
await proxyOciDownload(parUrl, res, downloadFilename, mimeType);
```

**Trade-off:** Still proxies through server (latency remains), but:
- PAR provides authenticated access (more secure than public URL)
- Proper Arabic filenames preserved
- "Save As" dialog works correctly

**Future Enhancement:** Set `contentDisposition` in OCI object metadata during upload, then PAR redirect would work directly.

### 4. Fallback for Local Files

The local file path (lines 261-295) should remain unchanged since it doesn't have the OCI latency issue.

---

## Files to Modify

| File | Changes |
|------|---------|
| `controllers/streamController.js` | Replace `proxyOciDownload()` with PAR redirect in `downloadAudio()` |
| `utils/ociStorage.js` | Enhance `createPreAuthenticatedRequest()` to support response headers |
| `tests/unit/streamController.test.js` | Update tests for redirect behavior |
| `tests/integration/routes/streamRoutes.test.js` | Add redirect assertion tests |

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| PAR generation fails | Fallback to proxy method with error logging |
| Browser doesn't honor Content-Disposition | Document that filename may vary; use Option A |
| PAR URL expires mid-download | Use 1-hour expiry (plenty for large files) |
| Analytics accuracy | Counter increment happens before redirect |

---

## Testing Plan

### Unit Tests
1. Verify `createPreAuthenticatedRequest()` generates valid URLs
2. Verify `downloadAudio()` returns 302 redirect for OCI files
3. Verify counter increment is called

### Integration Tests
1. `GET /download/:id` returns 302 with Location header pointing to OCI
2. `GET /download/:id` sets Content-Disposition header
3. `GET /download/:id` increments `downloadCount` in database
4. `GET /download/:id` for local files still streams directly

### Manual Testing
1. Download a lecture and verify:
   - File downloads with correct filename
   - Download count increments in admin panel
   - Response time is under 500ms (check Network tab)

---

## Performance Expectations

| Metric | Before | After |
|--------|--------|-------|
| **Total Response Time** | 5,250ms | ~250ms (PAR redirect) |
| **OCI Access** | Public URL | PAR (authenticated, more secure) |
| **Filename** | Proper Arabic names | Proper Arabic names (RFC 5987 encoded) |
| **Save As Dialog** | Works | Works (via Content-Disposition header on OCI objects) |

---

## Implementation Status: COMPLETE

**Completed Steps:**

1. **Migration script** (`scripts/migrate-oci-content-disposition.js`) - Updated 202 existing OCI objects with Content-Disposition headers
2. **Upload fix** (`utils/ociStorage.js`) - New uploads automatically include Content-Disposition with RFC 5987 encoding for Arabic filenames
3. **Download route** (`controllers/streamController.js`) - Now uses PAR redirect instead of proxy

**PAR expiry:** 1 hour (sufficient for large file downloads)
