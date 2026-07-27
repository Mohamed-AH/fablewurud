# Upstream Port Plan — `Mohamed-AH/wurud` → `fablewurud`

Plan for porting changes made in the original repository (`mohamed-ah/wurud`)
into this fork, which additionally carries the code-audit remediation (Phases
0–6). Once this fork is confident/complete it becomes canonical and `wurud` is
retired.

> **STATUS: EXECUTED** (all 10 upstream commits ported). Highlights: R2 storage
> backend (config/r2.js, utils/r2Storage.js, streamController multi-provider
> serving/download, CSP, deps), Asdaa 403 fix + paste-HTML import (added to the
> extracted `routes/admin/articles.js` **with sanitization**), OCI/R2-aware
> transactional lecture delete, and the utility scripts/report generator.
> The article sanitizer was also broadened to preserve structural HTML.
> Remaining owner step: run/verify in a dev env with real R2 credentials.

## Divergence analysis

- **Fork point:** this fork's `Initial commit` (`c56bc28`) has a tree **identical**
  to wurud commit **`58d74e5`** (2026-07-07, "Merge PR #114"). That is the exact
  baseline both repos share.
- Since the fork, wurud advanced by **10 non-merge commits** (2026-07-11 → 07-13),
  merged to `wurud/main` via PRs #115–#123. None of them overlap the audit's
  security/observability work — porting is **additive**, but several land in files
  the audit refactored, so a few need a **manual merge**, not a clean cherry-pick.

## Change inventory (what to incorporate)

| # | Commit | Theme | Files | Conflict w/ audit |
|---|--------|-------|-------|-------------------|
| 1 | `7a0fe61` | **Cloudflare R2 storage backend** | `config/r2.js`✚, `utils/r2Storage.js`✚, `controllers/streamController.js`, `routes/admin/index.js`, `server.js`(dep), `package.json`, `.env.example`, `scripts/upload-to-r2-local.js`✚, `scripts/upload-to-oci-verify.js`, `docs/IMPORT_WORKFLOW.md` | **HIGH** (streamController, admin delete) |
| 2 | `0d3508a` | R2 serving via provider fallback + Asdaa 403 fix | `controllers/streamController.js`, `utils/asdaaExtractor.js` | **HIGH** (streamController) |
| 3 | `165eaaf` | R2 in CSP + Asdaa diagnostics | `server.js`, `utils/asdaaExtractor.js` | **LOW** (CSP add) |
| 4 | `ebfe89d` | Asdaa **paste-HTML** import fallback | `routes/admin/index.js`, `views/admin/article-form.ejs`✚ | **MEDIUM** (route moved to `articles.js`) |
| 5 | `e4b68f4` | Script: delete specific OCI files | `scripts/delete-from-oci.js`✚ | none |
| 6 | `9f34121` | Excel import: `Type=Lecture` support | `scripts/import-excel-generic.js` | none |
| 7 | `0726f1d` | Admin: interactive sort-order toggle | `views/admin/edit-series.ejs` | none |
| 8 | `52ad304` | Script: list audio filenames | `scripts/list-audio-filenames.js`✚ | none |
| 9 | `b9509ef` | Print-ready content report generator | `scripts/generate-report.js`✚ | none |
| 10 | `4d10fb7` | Branding + report font sizes | `scripts/generate-report.js`, `views/partials/footer.ejs` | none |

✚ = new file (clean add).

**Dominant theme:** commits 1–4 are one feature — **R2 as a second audio storage
backend** — split across a messy sequence of follow-up "fix CSP again" commits.
Treat them as a single logical unit when porting.

## Conflict hotspots (require manual merge)

### A. `controllers/streamController.js` — HIGH
Upstream generalizes OCI-only serving to multi-provider (OCI + R2): it swaps
`audioUrl.includes('objectstorage')` for `audioUrl.startsWith('http')`, detects
the provider, and adds `createR2PresignedUrl` for downloads. **The audit rewrote
the same blocks** — it added the `countThisPlay` guard (no play-count inflation
from range requests) and `captureException`, and removed the dead `proxyOciDownload`.
→ Re-apply upstream's R2 provider logic **on top of** the audited version: keep
`countThisPlay`, keep `captureException`, add provider detection + R2 presigned
download.

### B. `routes/admin/index.js` lecture delete — MEDIUM
Upstream branches OCI-vs-R2 in the delete's storage-cleanup block. **The audit
wrapped that delete in `withTransaction` and moved the storage delete to AFTER the
DB commit.** → Merge the R2/OCI branch into the audited post-commit cleanup block.

### C. Asdaa `import-from-html` route — MEDIUM (+ security)
Upstream adds `POST /articles/import-from-html` to `routes/admin/index.js`. **The
audit extracted all admin article routes into `routes/admin/articles.js`.** → Add
the new route to `articles.js`, not `index.js`. **Security:** pasted HTML is
untrusted; ensure the extracted content is stored via the create/edit save path,
which already runs `sanitizeArticleHtml` (audit C1). Do not let it write raw HTML
directly.

### D. `server.js` CSP — LOW
Add `https://*.r2.dev` to `mediaSrc` and `connectSrc`. The audited CSP block is
otherwise unchanged in those lines — a small manual add.

### E. `package.json` / lockfile — LOW-MEDIUM
Add `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` alongside the audit's
`sanitize-html` / `oci-workrequests`, then regenerate `package-lock.json` (keep it
in sync — the hardened Dockerfile uses `npm ci`).

## Porting sequence (recommended)

Do it as clean, logically-grouped commits (not a replay of the 10 upstream commits).

**Step 1 — Clean adds (no conflict).** New R2 modules (`config/r2.js`,
`utils/r2Storage.js`), all new scripts (`upload-to-r2-local`, `delete-from-oci`,
`list-audio-filenames`, `generate-report`), the modified import script
(`import-excel-generic` Type=Lecture), the two view tweaks (`edit-series.ejs` sort
toggle, `article-form.ejs` paste-HTML UI, `footer.ejs` branding), and
`docs/IMPORT_WORKFLOW.md`. Also `utils/asdaaExtractor.js` (403 fix + diagnostics —
untouched by the audit, applies clean).

**Step 2 — Dependencies + config.** Merge `package.json` deps and regenerate the
lockfile; add R2 vars to `.env.example`; add `https://*.r2.dev` to the CSP; add R2
to `config/env.js` optional-integration warnings.

**Step 3 — streamController R2 serving.** Manual merge (hotspot A).

**Step 4 — Admin routes.** R2/OCI delete branch into the transactional delete
(hotspot B); `import-from-html` into `routes/admin/articles.js` with the sanitizer
guarantee (hotspot C).

**Step 5 — Verify** (see below).

## Improvements to apply while porting

- **Sanitize pasted HTML (security).** Guarantee `import-from-html` content passes
  through `sanitizeArticleHtml` on write — pasted HTML is the same stored-XSS class
  as audit C1. Add a regression test.
- **Carry the audit patterns into R2 code.** Put `captureException(error, req)` in
  the new streamController/admin catches; keep the `countThisPlay` play-count guard
  for R2 serving; keep transactional delete + delete-after-commit ordering for R2.
- **CSP precision.** `https://*.r2.dev` covers R2's dev domain. If a custom
  `R2_PUBLIC_URL` domain is used in production, add that exact host to `mediaSrc`
  instead of relying on the wildcard dev domain.
- **Consolidate the messy history.** Commits 3–4 are repeated CSP fixes; land them
  as one coherent "R2 backend" change here rather than replaying the churn.
- **Optional: unify storage.** OCI and R2 now have near-parallel `config/*` +
  `utils/*Storage.js` modules and provider branching in streamController. Consider a
  thin `storageProvider` abstraction later so a third backend doesn't multiply
  branches (not required for the port — a follow-up).

## Verification

- `node -c` + module load-test on every touched file (as in the audit phases).
- streamController: confirm OCI-served and R2-served lectures both stream and
  download; confirm play count still increments once per playback (not per seek).
- Admin: confirm lecture delete removes the file from the correct backend and keeps
  `lectureCount` consistent (transaction).
- Article import: paste-HTML → saved article renders sanitized (XSS payload inert).
- Route-table diff on `routes/admin/*` unchanged except the added `import-from-html`.
- `npm ci` succeeds (lockfile in sync); mock-based unit suites green.

## Not porting / reconcile

- No upstream commit conflicts with the audit's security/observability fixes, so
  nothing needs to be dropped. When wurud is retired, this fork's audited baseline
  is authoritative; any *future* wurud change should be evaluated the same way
  (diff against the last-ported point).

---

# ROUND 2 (2026-07-26): Porting the Najmi archive feature

Last port stopped at wurud `a996f58`. Since then wurud advanced **21 commits**
(`a996f58..0de1cdc`, 2026-07-23 → 07-26) — and they are **the entire Sheikh Ahmed
Al-Najmi archive**, i.e. the feature we just wrote the N0–N7 plan for. Upstream
built it on the **pre-audit** codebase. So this round is: **port their working
implementation onto our audited base**, reconciling conflicts and design drift —
not build from the N0–N7 plan. (~3,514 insertions across 42 files.)

## ⚠️ Design drift vs the design approved in THIS repo (owner must decide)

Upstream's build diverges from the mock/spec approved here (`docs/mocks/najmi-archive-mocks.html`):

1. **Merged "Content" page.** Upstream merged Home + About + Series into `/najmi`
   (Phase 7A/B); **`/najmi/bio` now 301-redirects to `/najmi`**. Our approved spec
   had **separate** Home, Series, and a Biography page — and "السيرة" is item 5 in
   the approved Najmi mobile bottom nav. → Decide: adopt the merged page, or keep
   separate pages + a real bio route.
2. **PDF library = searchable row-list** (`article-style book cards`, commits
   c282f2b/4354fd3). Our approved spec said **cover-grid with generated cover art**.
   → Decide: adopt row-list, or restore the cover-grid.
3. **Banner wording** reworded "شيخه" → "الشيخ" (f45ac4e) — minor.

**Recommendation:** port upstream as the working baseline first (it is the newest,
owner-driven implementation), then apply designs 1–2 as a small follow-up if you
still want the cover-grid / separate bio from the mock.

## Realm mechanism — theirs vs the N0 plan

Upstream chose a **simpler, less generic** mechanism than our N0 plan:
- `middleware/realm.js` sets `res.locals.realm = 'najmi' | 'hasan'` from the path.
- The Najmi sheikh is identified via a **hardcoded** helper (`utils/najmiSheikh.js`)
  + `utils/realmFilter.js` for content filtering; `models/Sheikh.js` gains
  `titlePrefix`/`titlePrefixEnglish` (display), not the generic `key`/`theme`/
  `isPrimary` fields I planned.

Fine for exactly two scholars. Note the hardcoding limits future scholars; keep it
as-is for now (don't re-architect during the port), but flag for later.

## Change inventory

**Clean adds — new files, no conflict (take & adapt to audit patterns):**
`models/Publication.js`, `models/index.js`(+1), `middleware/realm.js`,
`routes/najmi/index.js`, `public/css/najmi.css`, `utils/{najmiSheikh,realmFilter,sheikhName}.js`,
`views/najmi/{index,series,library,bio}.ejs`,
`views/admin/{publication-form,publications-list}.ejs`,
`scripts/{import-najmi-lectures,import-publications,upload-pdfs-to-r2,set-najmi-title}.js`,
`docs/najmi-bio.md`.

**Take (views/models we haven't touched — upstream = baseline + realm additions):**
`models/{Sheikh,SiteSettings,Section}.js`, `public/css/admin.css`,
`views/layout.ejs`, `views/partials/{header,bottomNav}.ejs`,
`views/public/{index,series-detail}.ejs`, `views/admin/{dashboard,homepage-config,
manage,series-form,upload,partials/header}.ejs`, `tests/envSetup.js`.

**Manual merge — files WE changed AND upstream changed (7):**
| File | Upstream (Najmi) | Ours (audit/R2) | Approach |
|---|---|---|---|
| `routes/admin/index.js` | +350: publications CRUD, realm switcher, Najmi homepage-config | admin split (articles extracted → `articles.js`), captureException everywhere | **Put publications in a NEW `routes/admin/publications.js`** (our split pattern); merge realm switcher/config into index; keep route-table diff discipline |
| `routes/index.js` | +110: realm isolation on homepage/listings | captureException, dead-code removal | merge realm filters onto audited handlers |
| `routes/api/homepage.js` | +33: realm filtering | captureException | merge |
| `server.js` | +8: mount `/najmi` router + realm middleware | many audit changes | add mount + `app.use(realmMiddleware)` |
| `utils/r2Storage.js` | +6 | our ported version | small merge |
| `tests/globalSetup.js` | Mongo version bump | our M10 CI fail-not-skip | keep both |
| `CLAUDE.md` | their +238 Najmi tracking | our audit + N0–N7 plan | **do NOT take theirs**; our tracking already covers it — update phase status instead |

## Improvements to apply while porting (carry audit patterns in)

- **Observability:** `captureException(error, req)` into every new catch — najmi
  routes, admin publications handlers, the PDF download route.
- **Admin split:** publications → `routes/admin/publications.js` mounted like
  `articles.js`; verify the admin route-table diff (as in H7).
- **Security:** `escapeRegex` on the new publication/series search; `sanitizeArticleHtml`
  on any publication description that renders HTML; validate the PDF download `:shortId`.
- **Data integrity:** if publication delete adjusts any count, wrap in `withTransaction`.
- **PDF serving:** the `/najmi/library/:shortId/download` route should redirect to the
  R2 URL with `Content-Disposition: attachment` (Phase-1 direct download) and reuse our
  R2 conventions; add an "open in new tab" inline view.
- **CSP:** PDFs load from R2 — `*.r2.dev` is already allowed; if a **custom R2 domain**
  is used for the Najmi bucket, add that exact host to `mediaSrc`/`connectSrc`/`imgSrc`.
- **Tests:** reconcile `globalSetup` (keep CI-fail + Mongo bump); run unit suite
  `--runInBand`; add a smoke test for a Najmi route + Publication model.
- Upstream already fixed one N+1 (publications list, 1c6ee73) — good; verify it holds.

## Porting sequence (each step verifiable; no design decisions until Step 8)

1. **Models + utils + middleware** — Publication, Sheikh/SiteSettings/Section fields,
   realm.js, najmiSheikh/realmFilter/sheikhName, models/index. Load-test.
2. **Najmi realm** — `routes/najmi/index.js` + `views/najmi/*` + `public/css/najmi.css`.
   Add captureException.
3. **Wire-up** — `server.js`: mount `/najmi` + realm middleware.
4. **Homepage/realm isolation** — merge `routes/index.js`, `routes/api/homepage.js`,
   `views/public/index.ejs`, `views/partials/{header,bottomNav}.ejs`, `views/layout.ejs`
   (cross-archive banner + realm theming).
5. **Admin** — publications CRUD → `routes/admin/publications.js`; realm switcher +
   Najmi homepage-config into `routes/admin/index.js`; admin views. Route-table diff.
6. **Scripts + tests** — import/upload scripts (reconcile with our R2 utils);
   `globalSetup`/`envSetup` merge.
7. **Verify** — `node -c`, module load, admin route-table diff, unit suite (runInBand),
   R2/CSP check. Update CLAUDE.md N-phase checkboxes to reflect ported state.
8. **Design decisions** — apply the mock's cover-grid / separate-bio only if owner wants.

## Owner inputs
- **Decide the two design divergences** (merged Content page? row-list vs cover-grid?).
- Is the Najmi R2 bucket **public** (r2.dev) or a **custom domain**? (CSP + direct-URL).
- Confirm the import manifest and that the 7 GB is uploaded to R2.
