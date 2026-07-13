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
