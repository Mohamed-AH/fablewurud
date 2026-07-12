# Wurud — Islamic Audio Lecture Archive

A production web application that hosts and serves the audio lecture archive of
**Sheikh Hasan bin Mohammed Mansour Dhaghriri** — hundreds of recorded lessons in
Aqeedah, Fiqh, Tafsir, Hadith, Seerah, and more, organized into series, browsable
by scholar, and **searchable by the full text of their transcripts**.

The site is Arabic-first (right-to-left) with an English locale, server-rendered
for speed and SEO, and backed by cloud object storage for audio streaming.

---

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Running the App](#running-the-app)
- [Project Structure](#project-structure)
- [Content Model](#content-model)
- [URL Architecture](#url-architecture)
- [Admin & Roles](#admin--roles)
- [Importing Content](#importing-content)
- [Testing](#testing)
- [Deployment](#deployment)

---

## Features

**For visitors**
- 🎧 **Audio archive** — browse lectures by **series**, by **scholar**, or as a flat
  paginated list, with an in-page audio player (streaming with range/seek support).
- 🔎 **Transcript search** — search the *spoken text* of the lectures, not just
  titles. Results jump to the moment in the audio and show surrounding context.
- ✍️ **Articles** — a blog/articles section with rich formatted content, related
  articles, and reading-progress UI.
- 📅 **Weekly schedule** — a class timetable (card or table layout) linking to the
  relevant series.
- 🌐 **Bilingual, RTL-first** — Arabic (default) and English, with a language toggle.
- 📱 **Responsive** — mobile-first design with a bottom navigation bar and a
  collapsing mini audio player.
- 📥 **Downloads** — one-click "Save As" downloads with clean, human-readable filenames.
- 📨 **Contact form** — inquiries routed to a private Telegram chat.
- 🔗 **SEO** — server-rendered pages, canonical URLs, JSON-LD structured data, and
  an auto-generated `sitemap.xml` / `robots.txt`.

**For administrators**
- 🛠️ **Admin panel** — manage lectures, series, scholars, sections, schedule,
  articles, homepage layout, and site settings.
- ⬆️ **Audio management** — upload audio to cloud storage, auto-extract duration/
  metadata, and track play/download counts.
- 📝 **Article editor role** — external contributors can be granted access to fix
  article text, with full per-field edit history.
- 📊 **Analytics & health** — page-view analytics, a `/health` endpoint, and a
  built-in maintenance mode.

---

## How It Works

At a high level, a request flows like this:

```
Browser
  │
  ▼
Express server (server.js)
  ├─ Security & sessions   (Helmet CSP, rate limiting, MongoDB-backed sessions)
  ├─ i18n & locale         (Arabic RTL default / English)
  ├─ EJS server rendering  (views/ + layout, partials)
  ├─ In-memory cache       (hot queries cached with TTLs)
  │
  ├─ MongoDB (main)        ── lectures, series, scholars, articles, schedule, settings
  ├─ MongoDB (search)      ── transcripts + Atlas Search index (separate connection)
  └─ OCI Object Storage    ── audio files (streamed via redirect / pre-authenticated URLs)
```

Key ideas:

- **Server-side rendering (SSR).** Pages are rendered with EJS templates for fast
  first paint and SEO. Some list views hydrate additional content via lightweight
  JSON APIs.
- **Two databases.** Core content lives in the main MongoDB database. Transcripts
  live in a **separate** search database so full-text search (via MongoDB Atlas
  Search) scales independently. If the search database isn't configured, the site
  runs fine with search disabled.
- **Audio in object storage.** Audio isn't served from the app server. Lectures
  store an object-storage reference; `/stream/:id` redirects the player to Oracle
  Cloud Object Storage (or a short-lived pre-authenticated URL for downloads),
  keeping the app lightweight.
- **Caching.** Expensive homepage/series/sitemap queries are cached in-memory with
  short TTLs to keep the site responsive on modest hardware.
- **Graceful degradation.** If the database is unavailable the app enters a
  maintenance mode instead of crashing; optional integrations (search, storage,
  monitoring, contact) each disable themselves cleanly when not configured.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js ≥ 20 |
| Web framework | Express 4 |
| Views | EJS + express-ejs-layouts (server-side rendering) |
| Database | MongoDB (Mongoose ODM) — main + separate search DB |
| Full-text search | MongoDB Atlas Search (with a local text-index fallback) |
| Audio storage | Oracle Cloud Infrastructure (OCI) Object Storage |
| Auth | Passport + Google OAuth 2.0 (email whitelist) |
| Sessions | express-session + connect-mongo |
| Security | Helmet (CSP), express-rate-limit, server-side HTML sanitization |
| i18n | Custom middleware (Arabic RTL / English) |
| Monitoring | Sentry (errors/performance) + Grafana Cloud (metrics) |
| Testing | Jest (unit/integration) + Playwright (E2E) |

---

## Getting Started

### Prerequisites

- **Node.js ≥ 20** and npm
- **MongoDB** — a connection string (MongoDB Atlas recommended; a local `mongod`
  works for development)
- Optional but recommended for full functionality:
  - **Google OAuth 2.0** credentials (for the admin panel / login)
  - **OCI Object Storage** bucket (for audio upload/streaming)
  - A **Sentry** DSN and/or **Grafana Cloud** credentials (monitoring)
  - A **Telegram** bot token (contact form)

### Installation

```sh
# 1. Clone the repository
git clone https://github.com/Mohamed-AH/fablewurud.git
cd fablewurud

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env
#    then edit .env with your values (see Configuration below)

# 4. Start the development server
npm run dev
```

The app will be available at `http://localhost:3000`. The admin panel lives at
`/admin` (see [Admin & Roles](#admin--roles)).

> **Minimum to boot:** `MONGODB_URI` and `SESSION_SECRET`. Everything else is
> optional — the app warns at startup about any integration that self-disables.

---

## Configuration

Configuration is via environment variables (see `.env.example` for the full,
annotated list). Grouped by purpose:

**Core (required in production)**

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | Main MongoDB connection string |
| `SESSION_SECRET` | Secret used to encrypt sessions (use a long random string) |
| `NODE_ENV` | `development` \| `production` |
| `PORT` | HTTP port (default `3000`) |
| `SITE_URL` | Public base URL (used for canonical links / sitemap) |

**Authentication (admin login)**

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | Google OAuth 2.0 credentials |
| `ADMIN_EMAILS` | Comma-separated whitelist of admin emails |

**Audio storage (OCI)**

| Variable | Description |
|----------|-------------|
| `OCI_NAMESPACE`, `OCI_BUCKET`, `OCI_REGION` | Object Storage location |
| `OCI_TENANCY`, `OCI_USER`, `OCI_FINGERPRINT`, `OCI_PRIVATE_KEY` | API auth |
| `UPLOAD_DIR`, `MAX_FILE_SIZE` | Local upload staging dir and size cap |

**Transcript search**

| Variable | Description |
|----------|-------------|
| `SEARCH_MONGODB_URI` | Connection for the transcripts / search database |
| `SEARCH_MODE` | `atlas` (Atlas Search) or local text-index fallback |
| `CONTEXT_WINDOW_SEC`, `CONTEXT_ITEMS` | How much surrounding transcript context to show |
| `LOG_SEARCHES`, `SEARCH_LOG_TTL_DAYS` | Search-analytics logging |

**Monitoring (optional)**

| Variable | Description |
|----------|-------------|
| `SENTRY_DSN`, `SENTRY_TRACES_RATE`, `SENTRY_PROFILES_RATE` | Sentry error/perf tracking |
| `GRAFANA_URL`, `GRAFANA_USER_ID`, `GRAFANA_API_TOKEN` | Grafana Cloud metrics push |
| `METRIC_TAG` | Instance label to distinguish servers |

**Contact form (optional)**

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Route contact-form messages to Telegram |

> ⚠️ Never commit your real `.env`. Keep secrets out of version control and rotate
> anything that leaks.

---

## Running the App

```sh
npm run dev        # development with auto-reload (nodemon)
npm start          # production start (node server.js)
```

Useful endpoints:

- `/` — homepage (series, schedule, latest articles, transcript search)
- `/browse` — all lectures, paginated & filterable
- `/series`, `/sheikhs`, `/articles` — listings
- `/admin` — admin panel (requires login)
- `/health` — JSON health check (includes database status)
- `/sitemap.xml`, `/robots.txt` — SEO

---

## Project Structure

```
.
├── server.js              # App entry: middleware, security, route mounting
├── instrument.js          # Sentry initialization (loaded first)
├── config/                # DB, search DB, OCI, Passport, storage, env validation
├── models/                # Mongoose schemas (Lecture, Series, Sheikh, Article, …)
├── routes/                # Express routers
│   ├── index.js           #   public pages (home, browse, lecture/series/sheikh)
│   ├── articles.js        #   articles list & detail
│   ├── search.js          #   transcript search API
│   ├── admin/             #   admin panel
│   ├── article-editor/    #   external article-editor interface
│   └── api/               #   JSON APIs (lectures, series, sheikhs, homepage, contact)
├── controllers/           # Stream/download controllers
├── middleware/            # Auth, DB health, analytics, file validation, i18n context
├── utils/                 # Cache, metrics, OCI storage, sanitization, validators, …
├── views/                 # EJS templates (public, admin, partials, layout)
├── public/                # Static assets (CSS, JS, images)
├── scripts/               # Import & maintenance scripts
├── tests/                 # Jest (unit/integration) + Playwright (e2e)
└── docs/                  # Guides, plans, and reference docs
```

---

## Content Model

The core entities (Mongoose models in `models/`):

- **Sheikh** — a scholar (name in Arabic/English, honorific, bio, slug).
- **Series** — a course/collection of lectures on a book or topic, linked to a
  Sheikh; can be visible/hidden and nested under a parent series.
- **Lecture** — a single audio lesson: titles, description, category, dates
  (Gregorian + Hijri), audio reference, duration, play/download counts, ordering.
- **Article** — a written piece (with edit history for the article-editor role).
- **Section / Schedule / SiteSettings** — homepage sections, the weekly class
  schedule, and admin-controlled site configuration.
- **Transcript** — time-coded transcript segments (in the search database) that
  power full-text search.

Every content entity gets a stable numeric **`shortId`** plus SEO slugs, which
drive the URL scheme below.

---

## URL Architecture

Human- and SEO-friendly URLs built from a `shortId` and optional slugs, with
legacy formats 301-redirecting to the canonical URL:

```
/lectures/:shortId/:slug_en?/:slug_ar?      e.g. /lectures/142/tawheed-lesson-1/الدرس-الأول
/series/:shortId/:slug_en?/:slug_ar?
/sheikhs/:shortId/:slug_en?/:slug_ar?
/articles/:slugOrId
```

---

## Admin & Roles

Login is via **Google OAuth**. Access is granted only to whitelisted emails
(`ADMIN_EMAILS`) or users pre-created by an admin. There are three roles:

| Role | Can do |
|------|--------|
| `admin` | Full access: content, users, site settings, article editors |
| `editor` | Manage content (lectures, series, scholars, articles) |
| `articleEditor` | Edit article text only (title/body), via `/article-editor`, with tracked history |

The admin panel is at `/admin`; the article-editor interface is at `/article-editor`.

---

## Importing Content

Content is typically bulk-imported and then refined in the admin panel. Common
scripts (see `scripts/` and `package.json`):

```sh
npm run db:import           # import lectures from CSV
node scripts/import-excel.js <file.xlsx>   # import from a spreadsheet
npm run audio:upload        # upload local audio files to OCI Object Storage
node scripts/import-articles.js <file.json># import articles
```

Most scripts read `MONGODB_URI` from your environment and default to a dry-run or
print a summary before writing — always review a script's flags before running it
against a production database.

---

## Testing

```sh
npm test                 # full Jest suite with coverage
npm run test:unit        # unit tests only
npm run test:integration # integration tests (needs MongoDB)
npm run test:e2e         # Playwright end-to-end tests
```

- **Unit** tests cover utilities, models, and pure logic.
- **Integration** tests exercise routes/APIs against a real MongoDB (a
  service container in CI, or an in-memory server locally).
- **E2E** tests (Playwright) drive the rendered site in a browser.

---

## Deployment

The app is designed to run on modest cloud compute (it targets **Oracle Cloud
Infrastructure**). Several deployment paths are supported:

**Docker**

```sh
docker build -t wurud .
docker run -p 3000:3000 --env-file .env wurud
# or: docker-compose up -d
```

**PM2 (process manager)**

```sh
pm2 start ecosystem.config.js --env production
```

A sample **nginx** reverse-proxy config (`nginx.conf`) is included for TLS
termination and proxying to the Node process.

Operational notes:
- `/health` returns `200` when healthy and `503` (degraded) when the database is
  unreachable — wire it to your platform's health checks.
- Static assets are cache-busted and served with long-lived cache headers in
  production; HTML responses are sent no-cache so users always get the latest page.
- Audio bandwidth is offloaded to object storage, so the app process stays small.

---

## License

ISC. This project serves a specific Islamic audio archive; if you reuse the code,
please respect the content and configure it for your own data and integrations.
