# Repo Hygiene — status & remaining owner actions

Code-audit Phase 6 (finding M3/L6). Documents what was cleaned up in the working
tree and the one step that still requires **explicit owner approval** because it
rewrites shared git history.

## Done (working tree)

- **Planning docs relocated** from the repo root into `docs/`:
  - `docs/guides/` — deployment, data-migration, OAuth, testing, performance, fix guides
  - `docs/plans/` — url-architecture, quick-links, design-improvement, blueprint, requirements, fixes-needed, review-todo
  - `docs/reports/` — design-critique, series-comparison, test-results-summary
  - `docs/archive/` — legacy `claude.md`, `claude-archive.md`
  - Root now holds only `CLAUDE.md` (project context) and `CODE_AUDIT_REPORT.md` (active audit).
- **Untracked from git** (Phase 0), so they no longer ship in new commits or the Docker image:
  - `.env.production` (placeholders only, but should never be tracked)
  - `data-export-2mar.txt` (682 KB DB dump)
  - `gtmetrix.pdf` (1.7 MB report)
- `.gitignore` now ignores `.env*` (except `.env.example`/`.env.test`), `data-export-*.txt`, and `*.pdf`.

## Still tracked — owner decision

These are import/reference data. Left tracked intentionally; remove if they're no
longer needed by the import scripts:

- `khutba_archive.xlsx`, `updatedData.xlsx`, `updatedData5Feb2026.xlsx`
- `lectures_with_series2.csv`, `series-export-2026-01-25.csv`

## ⚠️ Remaining: purge from git HISTORY (needs approval — rewrites history)

Untracking removes files from `HEAD` forward, but they **still exist in past
commits**. Confirmed still in history:

- `.env.production`
- `data-export-2mar.txt`
- `gtmetrix.pdf`

Fully removing them rewrites history and requires a **force-push** that every
collaborator must then re-sync to. Do NOT run this without coordinating with all
contributors and confirming no open PRs depend on the current history.

### Recommended procedure (git-filter-repo)

```sh
# 1. Back up the repo first (clone --mirror somewhere safe).
# 2. Install git-filter-repo (https://github.com/newren/git-filter-repo).
git filter-repo \
  --path .env.production \
  --path data-export-2mar.txt \
  --path gtmetrix.pdf \
  --invert-paths

# 3. Re-add the remote (filter-repo drops it) and force-push all branches/tags:
git remote add origin git@github.com:Mohamed-AH/fablewurud.git
git push --force --all origin
git push --force --tags origin

# 4. Every collaborator re-clones or hard-resets to the rewritten history.
```

### If `.env.production` ever held real secrets
It currently contains placeholders, so this is precautionary — but treat any
secret that was ever committed as compromised: **rotate it** (MongoDB password,
SESSION_SECRET, OAuth client secret, OCI keys, Grafana/Telegram tokens) rather
than relying on history removal alone.
