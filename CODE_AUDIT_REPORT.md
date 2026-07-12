# Comprehensive Code Audit — Wurud Islamic Audio Archive

**Date:** 2026-07-12
**Scope:** Full repository — Express.js + EJS (SSR) + MongoDB (Atlas) + OCI Object Storage + Sentry + Grafana Cloud
**Codebase size:** ~14,800 lines of first-party JS (excluding views, scripts, tests); ~1,060 test cases
**Deployment target:** Oracle Cloud Infrastructure (OCI) compute

---

## Executive Summary

The application is functional and shows genuine investment in performance (in-memory caching, batched aggregation pipelines, compound indexes) and monitoring (Sentry + Grafana push metrics). The security baseline is above average for a project this size: OAuth whitelisting, hardened session cookies, Helmet CSP, per-scope rate limiting, ObjectId validation, and dedicated XSS/injection test suites.

The problems cluster in four areas:

1. **A real stored-XSS hole** — the article HTML sanitizer is a regex blacklist that is trivially bypassable, and article content renders unescaped.
2. **Observability that is wired but not actually reporting** — route errors never reach Sentry, production console-suppression defeats the Sentry log integration, there is no release tracking, and Grafana receives no request/DB latency data.
3. **Data-integrity gaps** — multi-document counter updates run without transactions and drift (a repair script already exists as evidence).
4. **Structure & hygiene** — a 3,287-line admin route file, ~50 copy-pasted try/catch blocks, and production data/binaries committed to git.

| Priority | Count | Themes |
|----------|-------|--------|
| **Critical** | 3 | Stored XSS, errors invisible to Sentry, console-suppression breaks Sentry logs |
| **High** | 7 | Unauthenticated writes, no Sentry release/env, no latency metrics, no transactions, weak test gates, unsafe uncaughtException, god-file architecture |
| **Medium** | 11 | PII to Sentry, play-count inflation, secrets/data in git, duplicate DB pools, missing index, admin regex injection, unstructured logs, Docker hardening, env validation, silent test skips, `/debug-sentry` |
| **Low** | 7 | Dead code, missing direct dependency, non-indexable filters, route duplication, debug logging, repo bloat, contradictory deploy configs |

---

## CRITICAL

### C1. Stored XSS via bypassable article HTML sanitizer
**Files:** `routes/articles.js:6-17` · `views/public/article-detail.ejs:294` · `routes/article-editor/index.js:162-237` · `routes/admin/index.js` (import-from-url)

Article content renders **unescaped**:

```ejs
<%- article.content %>   <!-- article-detail.ejs:294 -->
```

after passing through a regex blacklist that only strips **quoted** event handlers:

```js
.replace(/on\w+\s*=\s*"[^"]*"/gi, '')   // quoted only
.replace(/on\w+\s*=\s*'[^']*'/gi, '')
```

**Verified bypasses (executed against the actual sanitizer):**

| Input | Result |
|-------|--------|
| `<img src=x onerror=alert(1)>` | survives — unquoted handler |
| `<a href="javascript:alert(1)">` | survives — `javascript:` URIs never stripped |
| `<svg onload=alert(1)>` | survives — unquoted handler |

**Attack surface:** article editors (role `articleEditor`, described as *external contributors*) and the admin "import from URL" flow, which ingests raw HTML from asdaa-alsaa.com and stores it. A malicious or compromised editor — or a poisoned source page — plants script that runs in every visitor's browser on a public article page, enabling session/cookie theft and admin-account takeover.

**Fix:** replace the blacklist with a proper allowlist sanitizer (`sanitize-html` or DOMPurify via `jsdom`), configured to permit only the semantic tags/classes the design needs (`.quran`, `.hadith`, `.section-header`, `p`, `a[href]` with `http(s)` only, headings, lists). Keep sanitization **server-side on write** (not just on render) so stored data is clean.

---

### C2. Route errors are swallowed before Sentry ever sees them
**Files:** every route handler (e.g. `routes/index.js:368`, `routes/search.js:165`, `routes/api/*`)

`Sentry.setupExpressErrorHandler(app)` only captures errors that are thrown uncaught or passed to `next(err)`. But essentially every handler ends with:

```js
} catch (error) {
  console.error('Homepage error:', error);
  res.status(500).send('Error loading homepage');
}
```

The error is caught, logged to stdout, and a 500 is returned — **never forwarded to Sentry**. In production the only event Sentry receives is the synthetic `/debug-sentry`. Error tracking is effectively dark for real traffic.

**Fix:** introduce a shared `asyncHandler(fn)` wrapper that forwards rejections to `next(err)`, and a single terminal error middleware that renders the response *after* Sentry's handler has captured the error. This also deletes ~50 duplicated try/catch blocks (see H7).

---

### C3. Production console-suppression silently defeats the Sentry log integration
**Files:** `instrument.js:29-38` · `utils/logger.js:192-204` · `server.js:53`

`instrument.js` runs first and installs `Sentry.consoleLoggingIntegration({ levels: ['log','warn','error'] })`, which **wraps** `console.log`. Then `server.js` calls `suppressConsoleInProduction()`, which does:

```js
console.log = () => {};   // replaces Sentry's wrapper with a no-op
```

In production this removes Sentry's console hook, so `console.log` breadcrumbs/logs stop flowing, and the `logger.db/oci/auth/...` breadcrumb helpers (which lean on console in dev) go nowhere. The two systems are configured to fight each other.

**Fix:** pick one path. Either (a) keep the Sentry console integration and stop clobbering `console.log` — route noise through the `logger` abstraction instead of the global `console`; or (b) drop the console integration and emit structured events explicitly. Given H6/M7 (structured logging), option (b) aligned with a `pino`-style logger is the cleaner long-term target.

---

## HIGH

### H1. Unauthenticated write endpoints (IDOR / abuse)
**Files:** `routes/api/lectures.js:465` (`/:id/verify-duration`), `routes/api/lectures.js:552` (`/:id/play`)

Both are public (`access: Public`) and key on a caller-supplied ObjectId:
- `POST /:id/play` — anyone can inflate any lecture's `playCount` without limit, corrupting "most played" ordering and analytics.
- `POST /:id/verify-duration` — a public caller can write `duration` and set `durationVerified: true` on any lecture (bounded to one write per lecture, clamped 0.1–43200s, but still an unauthenticated DB write).

**Fix:** require a lightweight signed token or session for `verify-duration`; debounce/deduplicate `play` server-side (see M2) and treat the value as advisory. At minimum apply a strict per-IP+per-ID rate limit.

### H2. Sentry has no release tracking and a mis-derived environment
**File:** `instrument.js:19-23`

```js
const environment = process.env.METRIC_TAG || 'development';   // instance label, not env
Sentry.init({ dsn, environment /* no release */ });
```

- `METRIC_TAG` is the Grafana *instance* label (`"stable"`, `"test"`) — not a deploy environment. Prod/staging can't be told apart in Sentry.
- No `release` → no regression detection, no suspect-commit, no per-deploy attribution.

**Fix:** `environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV`, `release: <git-sha or ASSET_VERSION>`, and upload source maps tagged with the same release.

### H3. No API/DB latency metrics reach Grafana
**Files:** `utils/metrics.js:151-171`

`requestTrackingMiddleware` computes `duration` on `res.on('finish')` then **discards it** — it only records a count when `status >= 400`. There is no request-duration histogram (p50/p95/p99) and no MongoDB operation timing. The only latency signal that exists is `recordSearch` (search) — replicate that pattern.

**Fix:** emit an HTTP request-duration histogram (labelled by normalized route + status) and wire MongoDB command monitoring (`commandStarted`/`commandSucceeded`) or a timing plugin to a DB-latency metric. Reconsider Sentry `tracesSampleRate: 1.0` (currently 100%) once traffic grows.

### H4. No transactions around multi-document counter updates
**Files:** `routes/admin/index.js:235-266` (lecture delete), similar in sheikh/series flows

Lecture deletion runs three non-atomic ops (decrement series count, decrement sheikh count, delete lecture). A crash between steps drifts `lectureCount` permanently — the presence of `scripts/sync-lecture-counts.js` confirms this happens.

**Fix:** wrap related writes in an Atlas multi-document transaction (`session.withTransaction`). Better long-term: drop the denormalized `lectureCount` (most read paths already compute counts live via aggregation) and eliminate the drift class entirely.

### H5. Test coverage thresholds are effectively unenforced
**File:** `jest.config.js:23-30`

```js
coverageThreshold: { global: { branches: 5, functions: 5, lines: 10, statements: 10 } }
```

With ~1,060 real test cases the actual coverage is far higher, but the gate passes with almost nothing tested — it protects nothing.

**Fix:** measure real coverage, set the floor just beneath it, and ratchet upward. Add regression tests for every endpoint touched by C1/H1.

### H6. `uncaughtException` can keep the process alive in an undefined state
**File:** `server.js:41-50` · `middleware/dbHealth.js:52-97`

The handler returns without exiting when `isMongoError(error)` is true — but `isMongoError` matches any message merely *containing* `"connection"` or `"timeout"`. A genuinely fatal bug whose message happens to include those words leaves the process running after an uncaught exception, which Node explicitly warns is unsafe.

**Fix:** tighten the classifier to error *names/codes* only (not substring matches), and prefer a clean exit + supervisor restart over continuing past an uncaught exception.

### H7. `routes/admin/index.js` is a 3,287-line god file
**File:** `routes/admin/index.js`

It handles lectures, series, sheikhs, users, schedule, sections, articles, transcripts, homepage config, and maintenance in one module — the primary SRP violation and the biggest maintainability risk. `routes/index.js` (1,226 lines) has the same issue.

**Fix:** split into `controllers/<resource>.js` with thin route files; extract the repeated `try/catch → console.error → 500` into the `asyncHandler` from C2.

---

## MEDIUM

### M1. PII flows into Sentry
**Files:** `instrument.js:27` (`sendDefaultPii: true`) · `middleware/auth.js:33-38` (`[AUTH DEBUG]` logs `email`, `role`, `userId` on **every** admin request, ungated) · OAuth/`[Feedback]` debug lines

Client IPs plus user emails/IDs land in a third-party service. **Fix:** remove the ungated `[AUTH DEBUG]` log, gate remaining debug logs behind `!isProduction`, and reconsider `sendDefaultPii`.

### M2. Play count inflated by every HTTP range request
**File:** `controllers/streamController.js:110,127,154`

`$inc: { playCount: 1 }` fires on every request, but browsers issue multiple range requests per playback (initial + each seek). Counts over-report massively. **Fix:** count only requests without a `Range` header (or `Range: bytes=0-`), or debounce per session.

### M3. Secrets template, DB dump, and binaries committed to git
**Files:** `.env.production` (placeholders today, but not git-ignored) · `data-export-2mar.txt` (682 KB full DB export) · `gtmetrix.pdf` (1.7 MB) · `updatedData*.xlsx`, `*.csv`

`.gitignore` ignores `.env` (exact) but not `.env.production`, guaranteeing a future real-secret commit. **Fix:** ignore `.env*` except `.env.example`, purge `.env.production` and the data/binary files from history, move exports out of the repo.

### M4. Duplicate MongoDB connection pools
**File:** `server.js:152-166`

`MongoStore.create({ mongoUrl })` opens its own driver pool separate from `mongoose.connect()`, and `connectSearchDB()` opens a third — three pools under a 380 MB PM2 ceiling. **Fix:** `MongoStore.create({ client: mongoose.connection.getClient() })`.

### M5. Unindexed range query in `/browse`
**Files:** `routes/index.js:401-419` · `models/Lecture.js:96`

The Hijri filter runs `$gte/$lte` on `dateRecordedHijri`, a plain unindexed String, combined with `$text` search → scan. **Fix:** index it or store a comparable numeric/date form.

### M6. Admin search regex is unescaped (NoSQL/ReDoS surface)
**Files:** `routes/admin/index.js:199-201,2751-2752` · `routes/article-editor/index.js:64-65`

Admin/editor search uses `{ $regex: req.query.search }` without the `escapeRegex`/`sanitizeSearchInput` treatment the public homepage API correctly applies. `extended` body parsing means `?search[$ne]=` becomes an operator object. Admin-gated, so exposure is limited, but **fix** by applying the existing `escapeRegex` + `sanitizeMongoQuery` helpers uniformly.

### M7. Logs are unstructured plain text (poor cloud ingestion)
**Files:** throughout (`console.warn`/`console.error` with emoji prefixes)

OCI Logging / Grafana Loki query JSON far better than emoji-prefixed strings, and there's no trace/error correlation ID. **Fix:** emit structured JSON logs (`pino`) with a request/trace id shared with Sentry.

### M8. Dockerfile hardening
**File:** `Dockerfile`

Runs as **root** (no `USER`), uses `npm install` (non-reproducible) instead of `npm ci --omit=dev`, and `COPY . .` before install busts layer caching. **Fix:** non-root user, `npm ci`, copy `package*.json` → install → copy source (multistage).

### M9. Weak startup env validation
**File:** `server.js:56-59`

Only `SESSION_SECRET` fails fast; missing `GRAFANA_*`, `SENTRY_DSN`, `OCI_*`, `TELEGRAM_*` degrade silently at first use. **Fix:** validate a schema (envalid/zod) at boot.

### M10. Tests skip silently when MongoDB is unavailable
**Files:** integration suites

Graceful skips risk green CI where DB-dependent tests never ran. CI *does* provision `mongo:7`. **Fix:** `if (process.env.CI) throw` instead of skipping when the DB is unreachable.

### M11. `/debug-sentry` is live in production
**File:** `server.js:257-259`

Anyone can trigger a 500 / Sentry event. **Fix:** gate behind `!isProduction` or admin auth.

---

## LOW

- **L1. Dead code:** `fetchHomepageData()` (`routes/index.js:16-130`, never called/exported, contains an N+1) and `proxyOciDownload()` (`controllers/streamController.js`, superseded by PAR redirects). Remove.
- **L2. Missing direct dependency:** `config/oci.js` requires `oci-workrequests`, which is only a transitive lockfile entry, not in `package.json`. A dependency reshuffle breaks OCI init. Add it explicitly.
- **L3. Non-indexable filters:** `{ isVisible: { $ne: false } }` appears in ~8 queries; `$ne` can't use an index well. Default `isVisible: true` on all docs and query `isVisible: true`.
- **L4. Route duplication:** the new-shortId and legacy-redirect handlers for lectures/series/sheikhs are near-identical three times over. Extract a factory.
- **L5. Debug logging in hot paths:** `[AUTH DEBUG]`, `[Feedback]`, `[SearchLog]`, OAuth traces — gate or remove.
- **L6. Repo bloat:** ~20 planning markdown docs (`FIXES_NEEDED.md`, `COMPLETE_FIX_GUIDE.md`, `FINAL_FIX_GUIDE.md`, …) in the app repo. Move to a docs branch/wiki.
- **L7. Contradictory deploy configs:** `render.yaml`, `ecosystem.config.js` (PM2, "Render Free Tier" tuning), `Dockerfile`, `docker-compose.yml`, and `nginx.conf` coexist with Render/Heroku comments while deploying on OCI. Pick the OCI story; retune the 380 MB / `--max-old-space-size=400` limits for the actual OCI shape.

---

## What the codebase does well (keep these)

- Batched aggregation in the live read paths (`fetchSectionsData`, `fetchScheduleData`, search context enrichment) — no N+1 in production paths.
- Thoughtful compound indexes and a global `.lean()` plugin.
- OAuth whitelist + pre-created-user check; hardened session cookies; Helmet CSP; per-scope rate limiters.
- ReDoS-escaped, XSS-sanitized **public** search (the pattern to copy into admin search, M6).
- Graceful DB-degradation / maintenance mode with health checks.
- ~1,060 tests across unit / integration / Playwright E2E, with dedicated security suites.

---

# Remediation Plan (Phased)

Phases are ordered by risk-reduction-per-effort. Each phase is independently shippable and verifiable. Effort is rough engineering time for one developer.

## Phase 0 — Emergency security hotfixes (½–1 day)
*Goal: close the exploitable holes before anything else.*

| Task | Findings | Files |
|------|----------|-------|
| Replace article blacklist with allowlist sanitizer (`sanitize-html`), sanitize on **write** and render | C1 | `routes/articles.js`, `routes/article-editor/index.js`, `routes/admin/index.js` (import), migration to re-sanitize existing 338 articles |
| Require auth/token + hard rate-limit on `verify-duration`; debounce `play` | H1, M2 | `routes/api/lectures.js`, `controllers/streamController.js` |
| Gate `/debug-sentry` behind `!isProduction` | M11 | `server.js` |
| `.gitignore` `.env*` (except `.env.example`); purge `.env.production`, `data-export-2mar.txt`, PDFs/spreadsheets from history | M3 | `.gitignore`, git history (BFG/filter-repo) |
| Remove ungated `[AUTH DEBUG]` PII log; reconsider `sendDefaultPii` | M1 | `middleware/auth.js`, `instrument.js` |

**Verify:** XSS payloads (`<img onerror>`, `javascript:`, `<svg onload>`) render inert; unauthenticated `play`/`verify-duration` rejected; secret scan clean; existing article tests pass + new XSS regression tests added.

## Phase 1 — Make observability actually report (1–2 days)
*Goal: errors and latency become visible in Sentry/Grafana.*

| Task | Findings | Files |
|------|----------|-------|
| Add `asyncHandler` + single terminal error middleware so errors reach Sentry | C2 | new `utils/asyncHandler.js`, all routes, `server.js` |
| Resolve console-suppression vs Sentry integration; route through `logger` | C3 | `instrument.js`, `utils/logger.js`, `server.js` |
| Set Sentry `release` + correct `environment`; upload source maps | H2 | `instrument.js`, CI |
| Emit HTTP request-duration histogram + MongoDB command timing to Grafana | H3 | `utils/metrics.js`, `server.js` |

**Verify:** throw a test error in a real route → it appears in Sentry with release + environment + breadcrumbs; Grafana shows p95 request latency and DB op latency.

## Phase 2 — Data integrity & DB efficiency (1–2 days)
| Task | Findings | Files |
|------|----------|-------|
| Wrap multi-doc counter updates in transactions (or drop denormalized counts) | H4 | `routes/admin/index.js`, delete flows |
| Reuse mongoose client for session store | M4 | `server.js` |
| Index `dateRecordedHijri`; convert `$ne:false` → `isVisible:true` default | M5, L3 | `models/Lecture.js`, `models/Series.js`, data migration |
| Apply `escapeRegex`/`sanitizeMongoQuery` to admin & editor search | M6 | `routes/admin/index.js`, `routes/article-editor/index.js` |

**Verify:** kill the process mid-delete in a test → counts remain consistent; connection count drops; `explain()` shows index use on the browse Hijri filter.

## Phase 3 — Architecture & maintainability (3–5 days)
| Task | Findings | Files |
|------|----------|-------|
| Split `routes/admin/index.js` into per-resource controllers | H7 | new `controllers/admin/*`, thin routers |
| Extract duplicated new/legacy route handlers into a factory | L4 | `routes/index.js` |
| Adopt structured JSON logging (`pino`) with request/trace ids | M7, C3, L5 | new `utils/logger.js`, remove debug `console.log`s |
| Delete dead code | L1 | `routes/index.js`, `controllers/streamController.js` |

**Verify:** no behavior change (full test suite green); admin file under ~400 lines each; logs parse as JSON.

## Phase 4 — DevOps & deployment hardening (1 day)
| Task | Findings | Files |
|------|----------|-------|
| Non-root Dockerfile, `npm ci --omit=dev`, multistage, layer caching | M8 | `Dockerfile` |
| Startup env schema validation (envalid/zod) | M9 | `server.js`, new `config/env.js` |
| Add `oci-workrequests` to dependencies | L2 | `package.json` |
| Consolidate deploy configs to the OCI story; retune memory limits | L7 | remove/retire Render/PM2 artifacts as appropriate |
| Narrow `isMongoError` classifier; exit-and-restart on true uncaught | H6 | `middleware/dbHealth.js`, `server.js` |

**Verify:** image runs as non-root; boot fails loudly on missing required env; container healthcheck green on OCI.

## Phase 5 — Testing health (1–2 days)
| Task | Findings | Files |
|------|----------|-------|
| Raise coverage thresholds to just below measured actuals; ratchet | H5 | `jest.config.js` |
| Fail (not skip) DB-dependent tests in CI | M10 | test setup, `.github/workflows/tests.yml` |
| Add regression tests for C1 (XSS), H1 (auth), H4 (transaction integrity) | C1, H1, H4 | `tests/integration/security`, `tests/integration/routes` |

**Verify:** CI fails if coverage regresses or DB is unreachable; new security tests fail against the old code, pass against the fix.

## Phase 6 — Repo hygiene (½ day)
| Task | Findings | Files |
|------|----------|-------|
| Move planning docs to a `docs/` branch or wiki | L6 | root `*.md` |
| Confirm large binaries/data removed from working tree and history | M3 | repo-wide |

**Verify:** clean `git status`; repo clone size materially smaller.

---

## Suggested sequencing

- **Week 1:** Phase 0 (day 1) → Phase 1 (days 2–3) → Phase 2 (days 4–5). This eliminates the exploitable risk and restores observability — the highest-value work.
- **Week 2:** Phase 3 (architecture) as the largest block, with Phase 4 interleaved.
- **Week 3:** Phase 5 + Phase 6, locking the improvements in with enforced gates and a clean repo.

Phases 0–2 are the ones that change production risk; 3–6 are durability and velocity investments that can be scheduled around feature work.
