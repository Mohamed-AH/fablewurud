# H7 — Admin Route File Split (continuation plan)

`routes/admin/index.js` was a 3,287-line god-file (code-audit finding H7). Phase 3
extracted the **articles** group into `routes/admin/articles.js` as a proven,
verified pattern. This document specifies how to extract the remaining groups
**correctly and safely**. Do it in a dev environment where the admin panel can be
exercised end-to-end (OAuth + DB + uploads) — the route-table diff below is
necessary but not sufficient on its own.

> Status after Phase 3: `routes/admin/index.js` ≈ 3,016 lines. `articles` extracted.

---

## The proven pattern (what was done for articles)

1. Create `routes/admin/<resource>.js`:
   ```js
   const express = require('express');
   const router = express.Router();
   // + only the imports the moved handlers actually use (see "Shared dependencies")
   // ... moved route handlers, VERBATIM ...
   module.exports = router;
   ```
2. In `routes/admin/index.js`, delete the moved block and replace it with:
   ```js
   router.use(require('./<resource>'));
   ```
3. **Move handlers verbatim** — do not "improve" them in the same commit. Behavior
   change and file move must never mix (keeps the route-table diff meaningful).
4. **One resource per commit.** Never batch multiple groups — it makes a
   regression impossible to bisect.

---

## Mandatory verification (per extraction)

**A. Route-table byte-diff must be identical.** Use the enumerator (kept in the
audit scratchpad; reproduce it if lost — it walks `router.stack` recursing into
mounted sub-routers and prints sorted `method path` lines):

```
node routelist.js > before.txt   # on the pre-extraction file
# ...perform extraction...
node routelist.js > after.txt
diff before.txt after.txt        # MUST be empty
```
The admin router currently exposes **87 routes**. After any extraction the count
and every `method path` line must be unchanged.

**B. `node -c routes/admin/index.js` and `node -c routes/admin/<resource>.js`** clean.

**C. Load test:** `NODE_ENV=test node -e "require('./routes/admin/index')"` resolves.

**D. E2E (do this in dev — cannot be done in the audit sandbox):** log in as admin
and exercise at least one GET (list/render) and one mutating POST per extracted
group. Confirm auth guards, EJS renders, redirects, and cache invalidation still work.

---

## Shared dependencies (the main hazard)

Extracted handlers rely on bindings currently defined at the top of
`routes/admin/index.js`. Each new sub-router must import exactly what its handlers
use:

| Binding | Source | Notes |
|---|---|---|
| `isAdmin`, `isEditor`, `isSuperAdmin` | `../../middleware/auth` | keep the SAME guard each route already uses (67× isAdmin, 12× isSuperAdmin, 1× isEditor) |
| `cache` | `../../utils/cache` | |
| `convertToHijri` | `../../utils/dateUtils` | lectures/schedule |
| `sanitizeArticleHtml` | `../../utils/sanitizeHtml` | articles only (already moved) |
| `withTransaction` | `../../utils/dbTransaction` | lectures (delete/create counter flows) |
| `escapeRegex` | `../../utils/validators` | search handlers |
| `captureException` | `../../utils/errorReporter` | every handler's catch block |
| `invalidateNoticeBannerCache` | `../../utils/i18n` | notice-banner group |
| **`invalidateHomepageCache()`** | **local, defined in `index.js`** | **see below** |

### ⚠️ `invalidateHomepageCache()` — extract to a shared helper FIRST
It's a module-local function in `index.js` used by many handlers across groups.
Before extracting groups that call it, move it (and any other local helpers) into
`routes/admin/helpers.js` and import it from both `index.js` and the sub-routers:
```js
// routes/admin/helpers.js
const cache = require('../../utils/cache');
function invalidateHomepageCache() {
  cache.invalidatePattern('homepage:*');
  cache.invalidatePattern('search:*');
  cache.del('sitemap:xml');
}
module.exports = { invalidateHomepageCache };
```
Do this as its own commit (with route-table diff) before the group extractions.

### Parent middleware is inherited
`index.js` does `router.use(adminI18nMiddleware)` at the top. Because sub-routers
are mounted with `router.use(require('./x'))` on the SAME admin router, they
inherit it — do **not** re-add it in sub-routers. Keep per-route `isAdmin`/
`isSuperAdmin` guards as they are.

### Inline `require()` inside handlers is fine to leave
Many handlers do `const { Lecture } = require('../../models')` inline. Paths are
identical from `routes/admin/*.js` (same depth), so moved handlers keep working
unchanged. Optionally hoist to the top of the new file — but as a SEPARATE commit.

---

## Remaining groups to extract (suggested order: leaf → entangled)

Order chosen so the simplest, most self-contained groups go first. Route counts
are current; confirm exact line ranges at extraction time (they shift each commit).

| Order | Resource | Routes | Guard | Notes / entanglement |
|---|---|---|---|---|
| 1 | `sheikhs` | 6 | isAdmin | self-contained; delete guarded by lecture/series count check |
| 2 | `schedule` | 6 | isAdmin | uses `convertToHijri`; self-contained |
| 3 | `article-editors` | 6 | isSuperAdmin | Admin model management; self-contained |
| 4 | `users` | 5 | isSuperAdmin | admin/editor management; self-contained |
| 5 | `notice-banner` + `maintenance-mode` + `homepage-config` | 6 | isAdmin | small SiteSettings groups; uses `invalidateNoticeBannerCache` |
| 6 | `analytics` | 3 | isAdmin | reads PageView/metrics |
| 7 | `sections` | 11 | isAdmin | cross-refs series (`/sections/:id/series/*`); uses `invalidateHomepageCache` |
| 8 | `series` | 8 | isAdmin | uses `invalidateHomepageCache`; cross-refs sections & lectures |
| 9 | `lectures` | 10 | isAdmin | most entangled: uploads (multer/OCI), `withTransaction`, transcripts, counts |
| 10 | `api` (admin XHR) | 11 | isAdmin | `/admin/api/*` used by admin UI JS; verify no path collisions with above |

Leave the dashboard/login/upload/manage/duration-status "shell" routes in
`index.js` (they're the entry points and orchestration).

### Path-collision watch
- No root-level `/:param` route exists in the admin router today (verified), so
  mount order is currently safe. Re-check with `grep -nE "router\.(get|post)\('/:"`
  before each extraction — if one is ever added, mount order starts to matter.
- `/sections/:id/series/:seriesId/*` nested routes must stay together in the
  `sections` sub-router.

---

## Definition of done for H7
- `routes/admin/index.js` reduced to the shell (dashboard/login/orchestration) +
  `router.use(require('./<resource>'))` mounts, target < ~400 lines.
- Every extraction commit has an identical before/after route-table diff.
- Admin panel E2E-smoke-tested in dev after the full split.
- `captureException` already present in all handlers (Phase 3) — carried along.
