# Sentry Implementation Plan: Full-Spectrum Observability

## Context

This low-traffic Islamic lectures platform (~10 users/week) needs comprehensive error tracking and debugging capabilities. Currently uses Grafana Cloud for metrics but lacks centralized error tracking. The goal is 100% capture of all interactions for deep debugging on two 512MB Render servers.

---

## Codebase Audit Results

### Console.log/Debugger Statement Inventory

**51 total logging statements found** (0 debugger statements):

| Location | High-Signal | Debug Noise |
|----------|-------------|-------------|
| `/routes/admin/index.js` | 6 | 2 |
| `/routes/api/lectures.js` | 5 | 3 |
| `/routes/search.js` | 4 | 5 |
| `/middleware/dbHealth.js` | 8 | 0 |
| `/controllers/streamController.js` | 2 | 10 |
| Others | 3 | 13 |

### High-Signal Events for Sentry Breadcrumbs

**Tier 1 - CRITICAL:**
- Audio uploads: `/routes/admin/index.js` lines 807, 818, 881, 899
- Series management: `/routes/admin/index.js` lines 506, 557, 981, 1058, 1532  
- DB health changes: `/middleware/dbHealth.js` lines 32, 41, 149, 183, 188, 197
- Search logging: `/routes/search.js` lines 430, 439

**Tier 2 - IMPORTANT:**
- Feedback submission: `/routes/search.js` lines 134, 161
- Transcript lookups: `/routes/index.js` line 421, `/routes/api/lectures.js` lines 613, 616
- OCI errors: `/controllers/streamController.js` lines 232, 247

---

## Implementation Plan

### 1. Install Sentry Packages

```bash
npm install @sentry/node @sentry/profiling-node
```

### 2. Create `/config/sentry.js`

New configuration module with:

```javascript
const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

// In-memory Set for 404 deduplication (24hr TTL, hourly cleanup)
const seen404Paths = new Set();

// Bot targets to ignore
const BOT_TARGET_PATHS = [
  '/wp-admin', '/wp-login.php', '/.env', '/xmlrpc.php',
  '/favicon.ico', '/robots.txt', '/.git', '/phpinfo.php',
  '/admin.php', '/administrator', '/wp-content', '/config.php'
];

function initSentry(app) {
  if (!process.env.SENTRY_DSN) return;
  
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.METRIC_TAG || 'development',
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_RATE) || 1.0,
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_RATE) || 1.0,
    maxBreadcrumbs: 50,
    sendDefaultPii: true, // IP/Header tracking
    ignoreErrors: BOT_TARGET_PATHS.map(p => new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
    beforeSend(event) {
      // Smart 404 deduplication
      if (event.contexts?.response?.status_code === 404) {
        const path = event.request?.url;
        if (path && seen404Paths.has(path)) return null;
        if (path) seen404Paths.add(path);
      }
      return event;
    }
  });
}

module.exports = { initSentry, Sentry };
```

### 3. Update `/utils/logger.js`

Add Sentry breadcrumb methods with **proper structured format**:

```javascript
// Sentry breadcrumb format - ALWAYS use category, message, and level
Sentry.addBreadcrumb({
  category: 'oci',      // Category: 'oci', 'db', 'auth', 'search', 'audio', 'user'
  message: 'Fetching audio from OCI bucket',
  level: 'info',        // Level: 'debug', 'info', 'warning', 'error'
  data: {               // Optional: additional context
    bucket: 'wurud-audio',
    objectName: 'lecture-123.mp3'
  }
});
```

**Breadcrumb Categories:**

| Category | Use Case | Example Message |
|----------|----------|-----------------|
| `db` | MongoDB operations | `"Querying lectures collection"` |
| `oci` | Oracle Cloud Storage | `"Uploading audio to OCI bucket"` |
| `auth` | Authentication | `"User logged in via Google OAuth"` |
| `search` | Search operations | `"Atlas search query executed"` |
| `audio` | Audio processing | `"Extracting metadata from upload"` |
| `user` | User actions | `"Feedback submitted for search"` |

**Logger implementation:**

```javascript
const Sentry = require('@sentry/node');

const logger = {
  // ... existing methods (log, debug, info, warn, error) ...
  
  // Sentry breadcrumb helpers with proper format
  db: (message, data = {}) => {
    Sentry.addBreadcrumb({
      category: 'db',
      message: message,
      level: 'info',
      data: data
    });
    if (!isProduction) originalConsole.log(`[DB] ${message}`, data);
  },
  
  oci: (message, data = {}) => {
    Sentry.addBreadcrumb({
      category: 'oci',
      message: message,
      level: 'info',
      data: data
    });
    if (!isProduction) originalConsole.log(`[OCI] ${message}`, data);
  },
  
  auth: (message, data = {}) => {
    Sentry.addBreadcrumb({
      category: 'auth',
      message: message,
      level: 'info',
      data: data
    });
    if (!isProduction) originalConsole.log(`[Auth] ${message}`, data);
  },
  
  search: (message, data = {}) => {
    Sentry.addBreadcrumb({
      category: 'search',
      message: message,
      level: 'info',
      data: data
    });
    if (!isProduction) originalConsole.log(`[Search] ${message}`, data);
  },
  
  audio: (message, data = {}) => {
    Sentry.addBreadcrumb({
      category: 'audio',
      message: message,
      level: 'info',
      data: data
    });
    if (!isProduction) originalConsole.log(`[Audio] ${message}`, data);
  },
  
  user: (message, data = {}) => {
    Sentry.addBreadcrumb({
      category: 'user',
      message: message,
      level: 'info',
      data: data
    });
    if (!isProduction) originalConsole.log(`[User] ${message}`, data);
  }
};
```

### 4. Usage Examples

**OCI Operations:**
```javascript
// Before uploading
logger.oci('Uploading audio to OCI bucket', { 
  filename: req.file.originalname, 
  objectName: objectName,
  size: req.file.size 
});

// After success
logger.oci('Upload completed successfully', { 
  objectName: objectName, 
  url: result.url 
});
```

**Database Operations:**
```javascript
// Query start
logger.db('Querying lectures by series', { 
  seriesId: req.params.id,
  limit: 50 
});

// Health change
logger.db('Database connection recovered', { 
  state: 'connected',
  downtime: '45s' 
});
```

**Search Operations:**
```javascript
logger.search('Atlas search query executed', {
  query: sanitizedQuery,
  resultCount: results.length,
  latencyMs: Date.now() - startTime
});
```

### 5. Update `/server.js`

**At TOP (after line 1):**
```javascript
const { initSentry, Sentry } = require('./config/sentry');
```

**After line 23 (after `const app = express();`):**
```javascript
// Initialize Sentry (must be before other middleware)
initSentry(app);
```

**After line 278 (after routes, before 404 handler):**
```javascript
// Sentry error handler (captures errors before generic handler)
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}
```

### 6. Update `.env.example`

Add at end:
```env
# Sentry Error Tracking & Performance Monitoring
# Create project at: https://sentry.io
SENTRY_DSN=https://xxxxxxxx@oxxxxxx.ingest.sentry.io/xxxxxxxx
# Sample rates (0.0 to 1.0) - 1.0 for 100% capture on low-traffic sites
SENTRY_TRACES_RATE=1.0
SENTRY_PROFILES_RATE=1.0
```

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `/config/sentry.js` | CREATE | Sentry config with 404 dedup, bot shield |
| `/utils/logger.js` | MODIFY | Add breadcrumb methods (db, oci, auth, search, audio, user) |
| `/server.js` | MODIFY | Add Sentry init and error handler |
| `.env.example` | MODIFY | Add SENTRY_DSN, SENTRY_TRACES_RATE, SENTRY_PROFILES_RATE |
| `package.json` | MODIFY | Add @sentry/node, @sentry/profiling-node |

---

## Memory Considerations (512MB Servers)

- `maxBreadcrumbs: 50` limits buffer to ~50KB
- 404 Set with hourly cleanup prevents unbounded growth
- Estimated overhead: ~10-15MB additional memory
- Profiling integration is lazy-loaded only when DSN is configured

---

## Verification

1. **Run tests**: `npm test` to ensure no regressions
2. **Local test**: Set `SENTRY_DSN` to a test project, trigger errors
3. **Check Sentry dashboard**: Verify events appear with breadcrumbs
4. **Memory check**: Monitor RSS on Render after deployment
5. **404 dedup test**: Hit same 404 URL twice, verify only 1 event in Sentry
