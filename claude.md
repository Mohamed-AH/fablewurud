# Islamic Audio Lectures Platform - Claude Instructions

<project_overview>
A web platform for hosting and streaming ~160 Arabic Islamic lecture audio files. Users can browse, stream, and download lectures. Admin can upload and manage content via Google OAuth-protected panel.

**Core Mission**: Make Islamic knowledge accessible through high-quality audio lectures with an Arabic-first, mobile-optimized interface.

**Data**: ~160 lectures (~3.4GB total), organized by sheikh and series, hosted on Oracle Cloud Object Storage.
</project_overview>

---

## Current Status

**Live URL**: https://rasmihassan.com
**Branch**: `claude/fix-homepage-tests-ovChk`
**Last Updated**: 2026-04-13

The platform is live with all core features operational:
- All lectures streaming from Oracle Cloud Object Storage
- Bilingual support (Arabic/English)
- Mobile-optimized responsive design
- SEO fully implemented
- MongoDB fail-fast resilience
- Bilingual notification banner system

---

## Current Initiative: OCI Migration & Monitoring

**Started**: 2026-03-31
**Goal**: Migrate from Render Free Tier (512MB RAM) to OCI Always Free (24GB RAM)
**Documentation**: `docs/migration-plan-render-to-oci.md`

### Migration Progress

| Phase | Focus | Status | Notes |
|-------|-------|--------|-------|
| 1.1 | Create ARM Compute Instance | IN PROGRESS | Ubuntu 22.04, 1 OCPU, 6GB RAM |
| 1.2 | VCN & Networking Setup | IN PROGRESS | VCN, Subnets, Internet Gateway, Security Lists |
| 1.3 | Initial Instance Setup | PENDING | Docker installation on Ubuntu |
| 1.4 | Firewall Configuration | PENDING | ufw setup for ports 22, 80, 443, 3000 |
| 2 | Application Deployment | PENDING | docker-compose.prod.yml + Caddy |
| 3 | Monitoring Setup | COMPLETE | Grafana Cloud + Sentry APM |
| 4 | DNS & SSL | PENDING | Point domain, update Google OAuth |
| 5 | Go Live & Cleanup | PENDING | Monitor, then remove Render |

### Instance Configuration (Planned)
- **Shape**: VM.Standard.A1.Flex (ARM Ampere)
- **OCPUs**: 1
- **Memory**: 6 GB
- **Image**: Ubuntu 22.04 (aarch64)
- **Boot Volume**: 50 GB

### Monitoring Implementation (COMPLETE)

Grafana Cloud push-based Prometheus monitoring implemented.

**Files:**
- `utils/metrics.js` - Metrics collection with prom-client
- `docs/MONITORING_PLAN.md` - Implementation details

**Commits:**
- `6c46140` Add monitoring plan for Grafana Cloud push-based metrics
- `ad10ba3` Refine monitoring plan with technical feedback
- `31c45e8` Implement push-based Prometheus monitoring for Grafana Cloud
- `c1e8829` Fix metrics push: use Influx line protocol for Grafana Cloud
- `10ab264` Add app_instance label to metrics for server differentiation

---

## Recent Completions

### Route Latency Optimization (2026-04-13)

Parallelized database queries across public routes for significant performance improvements.

**Results:**
| Route | Before | After | Improvement |
|-------|--------|-------|-------------|
| Homepage (`/`) | 4.89s | ~1.83s | 63% faster |
| Lecture page | 1.4s | ~650ms | 54% faster |
| Sheikh page | Sequential | Parallel | Faster |
| Series page | Sequential | Parallel | Faster |

**Commits:**
- `0296ce2` Optimize route latency by parallelizing database queries

### Sentry Integration (2026-04-07)

Full Sentry error tracking, performance monitoring, and business metrics.

**Features:**
- Error tracking with stack traces
- Performance monitoring with transaction spans
- Business metrics (plays, downloads, searches)
- Console logging integration

**Commits:**
- `cb96b94` Add Sentry error tracking and performance monitoring
- `3106742` Refactor Sentry setup to use instrument.js pattern
- `4038d76` Implement Sentry metrics for business observability
- `a8e156f` Add consoleLoggingIntegration to enable Sentry logs

### Search & Query Optimization (2026-04-08 - 2026-04-12)

**Performance fixes:**
- Search caching with async logging
- Eliminated in-memory blocking sorts on lecture queries
- Reduced search context fetch window (90s → 45s)
- Fixed audio playback by adding audioFileName to aggregation stages

**Commits:**
- `2be9527` Implement search cache and async logging for improved performance
- `f22322d` Eliminate in-memory blocking sort across all lecture queries
- `cb3a0f6` Optimize search context fetch: reduce window from 90s to 45s
- `a1e9f42` Fix audio playback by adding audioFileName to $project stages
- `ccff8d8` Fix incrementPlayCount error caused by global lean middleware

### Memory Optimization for 512MB Server (2026-04-07)

Implemented memory optimizations for Render Free Tier (512MB RAM limit).

**Commits:**
- `77755d5` Add memory optimization plan for OOM fix on 512MB server
- `2d47373` Implement memory optimization plan for 512MB server

### Test Stability (2026-04-07 - 2026-04-08)

Fixed flaky tests and MongoMemoryServer issues.

**Commits:**
- `48a4789` Fix flaky tests by sharing single MongoMemoryServer instance
- `eb945b1` Handle MongoMemoryServer download failures gracefully
- `91beab4` Fix search API test mock data missing required fields

---

### MongoDB Resilience & Notification System (2026-04-02)

**Features:**
- Fail-fast mechanism for MongoDB connection failures
- Server resilience during database outages (maintenance mode)
- Bilingual notification banner for site status updates
- Admin controls for notification management

**Commits:**
- `588d9f2` Add fail-fast mechanism for MongoDB connection failures
- `c8c8903` Fix fail-fast to work on initial connection failure
- `55bddbc` Prevent server crashes during MongoDB outages
- `35e9985` Update database tests for maintenance mode behavior
- `32ded67` Add bilingual notification bar for site status update
- `4243280` Add admin controls for bilingual notification banner
- `229d187` Add Notice Banner to Quick Actions and fix async i18n tests
- `eb7d20f` Fix i18n tests hanging by mocking SiteSettings

### Test Stability Fixes (2026-03)

- `99106a1` Fix flaky tests in unit and E2E test suites
- `2764070` Fix E2E test failures for audio player and homepage
- `1b4fe44` Fix PageView test failures by using unique page paths

---

## Completed Initiatives (Archived)

> **Full details**: See `claude-archive.md`

| Initiative | Completed | Summary |
|------------|-----------|---------|
| Roadmap 4.3 & 4.5 | 2026-02-28 | Social sharing, English version, security audit |
| Memory Optimization | 2026-03-07 | LRU cache, MongoDB sessions, N+1 query fixes |
| Testing Coverage | 2026-03-05 | 415 unit tests, 434 E2E tests |
| Mobile Responsiveness | 2026-02-26 | All pages responsive to 320px |
| Admin Bilingual | 2026-02-25 | Full AR/EN support for admin panel |
| Dynamic Sections | 2026-02-25 | Homepage section management |

---

## Future Roadmap

### Priority: HIGH

| Item | Description | Status |
|------|-------------|--------|
| OCI Migration | Complete Phase 1-5 of migration plan | IN PROGRESS |
| Google Search Console | Verify and monitor indexing | Pending |

### Priority: MEDIUM

| Item | Description | Status |
|------|-------------|--------|
| Advanced Filters | Date range, duration, speaker dropdown | Not Started |
| Favorites System | LocalStorage-based bookmarking | Not Started |
| Real-time Transcript | Auto-scroll transcript with playback | Partial |

---

## Quick Reference

### Admin Access Points

| Feature | URL |
|---------|-----|
| Dashboard | `/admin` |
| Lecture Management | `/admin/lectures` |
| Series Management | `/admin/series` |
| Schedule Management | `/admin/schedule` |
| Analytics | `/admin/analytics` |
| Duration Status | `/admin/duration-status` |
| Bulk Upload | `/admin/bulk-upload` |
| Homepage Config | `/admin/homepage-config` |
| Section Management | `/admin/sections` |
| Notification Banner | `/admin/quick-actions` |

### Key API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/homepage/series` | Paginated series with lectures |
| `GET /api/homepage/standalone` | Paginated standalone lectures |
| `GET /api/homepage/khutbas` | Paginated khutba series |
| `GET /api/homepage/stats` | Tab counts for UI badges |
| `POST /api/lectures/:id/play` | Increment play count |
| `POST /api/lectures/:id/verify-duration` | Verify audio duration |

### Utility Scripts

| Script | Description |
|--------|-------------|
| `scripts/fix-lecture-slugs.js` | Regenerate lecture slugs |
| `scripts/fix-series-slugs.js` | Regenerate series slugs |
| `scripts/sync-oci-durations.js` | Batch sync durations from OCI |
| `scripts/seed-sections.js` | Create default homepage sections |
| `scripts/export-db-data.js` | Export all data for verification |

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js 20+ / Express.js |
| Database | MongoDB Atlas (Free Tier) |
| Storage | Oracle Cloud Object Storage |
| Auth | Passport.js + Google OAuth 2.0 |
| Templating | EJS |
| Deployment | Render Free Tier (migrating to OCI) |
| Monitoring | Grafana Cloud (push-based) |

**Fonts (self-hosted):**
- Arabic Display: Scheherazade New
- Arabic Body: Noto Naskh Arabic

---

## Project Structure

```
wurud/
├── server.js                 # Main Express app
├── config/
│   ├── database.js          # MongoDB connection
│   ├── passport.js          # Google OAuth
│   └── storage.js           # File paths
├── models/
│   ├── Lecture.js           # Audio metadata
│   ├── Sheikh.js            # Sheikh profiles
│   ├── Series.js            # Lecture series
│   ├── Section.js           # Homepage sections
│   ├── SiteSettings.js      # Site configuration
│   └── PageView.js          # Analytics
├── routes/
│   ├── index.js             # Public pages
│   ├── admin/               # Admin panel
│   ├── api/                 # REST APIs
│   └── stream.js            # Audio streaming
├── middleware/
│   ├── auth.js              # Authentication
│   ├── analytics.js         # Page tracking
│   └── adminI18n.js         # Admin translations
├── utils/
│   ├── i18n.js              # Translations
│   ├── cache.js             # In-memory LRU cache
│   ├── metrics.js           # Prometheus metrics
│   └── ociStorage.js        # OCI integration
├── public/
│   ├── css/
│   ├── js/
│   ├── fonts/               # Self-hosted fonts
│   └── images/
├── views/
│   ├── public/              # Public pages
│   ├── admin/               # Admin panel
│   └── partials/            # Shared components
├── docs/
│   ├── migration-plan-render-to-oci.md
│   └── MONITORING_PLAN.md
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

<investigate_before_answering>
Never speculate about code you have not opened. If the user references a specific file, you MUST read the file before answering. Make sure to investigate and read relevant files BEFORE answering questions about the codebase.
</investigate_before_answering>

---

> **Historical documentation**: See `claude-archive.md` for completed phases, detailed session logs, and legacy implementation details.
