# Backup & Redundancy Plan

**Status:** Drafted 2026-11-06 — approved direction, implementation pending (build Tier 0 first).
**Scope:** Low-cost (~$0/mo), practical disaster-recovery for the Wurud production stack (`rasmihassan.com`).
**Branch:** `claude/comprehensive-code-audit-mf1wc8`

---

## 1. Audit — current state

**Stack:** Render (Hobby, stateless) ← GitHub ← code; Cloudflare (free) in front; two MongoDB clusters (main + search); audio/PDF blobs split across Cloudflare R2, Oracle OCI, and the owner's local PC.

### Confirmed facts (owner, 2026-11-06)
1. **Both MongoDB clusters are Atlas M0 (free)** → Atlas keeps **no backups** of any kind.
2. **OCI and R2 hold _disjoint_ audio** — each file lives in exactly one cloud; the R2 set and the OCI set do not overlap. The only second copy of any audio file is the owner's **local PC**. (This is deliberate: splitting across two free tiers so the whole corpus fits — OCI Always-Free 20 GB + R2 free 10 GB.)
3. **Backups stored in R2** (owner considers GitHub not reliable enough).
4. **GitHub Actions** is an acceptable place to run the scheduled job.
5. **Daily** backup cadence (~24h RPO) is acceptable.

### Already protected
- **Code** → GitHub. Fully redundant.
- **Hasan audio / Najmi audio+PDF** → one cloud copy each (R2 or OCI) + owner's local-PC originals.
- **Najmi R2 bucket** has **Object Lock** (immutable — delete/overwrite/ransomware protection).
- Audio restore tooling exists: `restore-step1-mongodb.js`, `restore-step2-oci.js`, `audit-mongodb-oci-sync.js`, `check-local-backups.js`.

### Gaps (no automation exists anywhere — verified: no cron, no Render job, no scheduled workflow)

| Data store | Contents | Current backup | Gap |
|---|---|---|---|
| **Main MongoDB** (M0) | lectures, series, articles, publications, sheikhs, sections, schedule, settings, admins, counters | Manual, owner-run logical export (`export-db-data.js`) only | **No scheduled restorable dump.** M0 = no provider backup. Highest-probability risk: bad admin edit / migration / accidental drop with no recovery. |
| **Search MongoDB** (M0) | transcripts (~181k → ~1.7M docs), searchlogs | None | Transcripts are **expensive** (vendor re-transcription). |
| **Secrets / env vars** | Mongo URIs, R2/OCI keys, OAuth, Sentry, Telegram | Render dashboard only | **Single point of failure** — Render loss ⇒ cannot rebuild even with code + data. |
| **Cloudflare / DNS / registrar** | cache rules, DNS zone, Bot Fight, OAuth callback | Dashboard only | Recoverable but undocumented ⇒ slow, error-prone rebuild. |
| **Hasan audio R2 bucket** | audio blobs | OCI holds *other* files; local copy exists | No Object Lock/versioning on this bucket (unlike Najmi). |
| **PageView / SearchLog** | analytics, 30-day-TTL search logs | None | **Out of scope** — regenerable / low value. |

---

## 2. Plan (cost: $0/mo)

### Tier 0 — Daily DB dumps to R2 ⭐ (build first)
The single most important gap: M0 means these dumps are the **only** DB backup.

- **GitHub Actions** scheduled workflow (daily): `mongodump` (full BSON) of **both** clusters → gzip → upload to a dedicated **R2 backup bucket** (`wurud-backups`).
- **GFS retention**, auto-pruned: **7 daily · 4 weekly · 3 monthly**. Gzipped BSON is small (transcripts compress hard) — comfortably inside R2's free 10 GB.
- **Secrets** (GH Actions repo secrets): **read-only** Mongo URIs for both clusters + R2 keys.
- **Setup (owner, by hand):** create a read-only DB user on each cluster; allowlist in Atlas Network Access (GH Actions egress, or temporary `0.0.0.0/0` with SCRAM creds); create the `wurud-backups` R2 bucket.
- **R2-single-provider mitigation** (GitHub is out, so dumps would live only in R2): enable **Object Lock/versioning on the backup bucket** so a dump can't be silently deleted/overwritten; a one-command **"pull latest" helper** lets the owner periodically copy the newest dump to the local PC (fits the existing local-backup habit).
- **Restore:** `mongorestore` from a dump. RPO ~24h.

### Tier 1 — Blob protection (free; respects the free-tier split — no paid cross-replication)
- Enable **versioning/Object Lock on the Hasan R2 bucket** (match Najmi); confirm OCI bucket retention. Protects the *single* cloud copy of each file from accidental delete/overwrite.
- **Reconciliation report** (extends `audit-mongodb-oci-sync.js`): for every lecture in the DB, confirm its audio exists in its cloud home (R2 **or** OCI) **and** flag anything lacking a verified local-PC copy. Turns "is my local backup complete?" into a checkable fact.

### Tier 2 — Secrets & config escape hatch (free)
- Export Render env vars → **encrypted** (age/gpg) → stored in the R2 backup bucket + owner's password manager. One-time + on change.
- **Runbook doc**: CF cache rules + exported DNS zone file, registrar, OAuth callback, and the Atlas/OCI/R2 account facts.

### Tier 3 — Tested restore runbook (free)
- "Rebuild from zero" steps: new Atlas cluster + Render-from-git + env + `mongorestore` + blobs already live.
- **Quarterly test-restore** so backups are proven, not assumed.

### Out of scope (regenerable)
- `PageView`, `SearchLog`.

---

## 3. Failure points → coverage

| Failure | Covered by |
|---|---|
| Bad admin edit / dropped collection / corruption | Tier 0 daily dumps (24h RPO) |
| Atlas account loss/suspension (M0, no provider backup) | Tier 0 dumps live off-Atlas in R2 |
| Accidental R2/OCI object delete | Tier 1 Object Lock/versioning + local copy |
| Render loss | code in GitHub + Tier 2 env export ⇒ redeploy |
| R2 account loss | Object Lock on backup bucket + periodic local pull (Tier 0); OCI holds its share of audio |
| CF / DNS / registrar loss | Tier 2 runbook + zone export |
| Lost/undocumented recovery steps | Tier 3 runbook + quarterly drill |

---

## 4. Implementation order (pending go-ahead)

1. **Tier 0** — GH Actions workflow + `mongodump`/gzip/upload script, GFS prune script, "pull latest" helper. Dry-run first; nothing destructive.
2. **Tier 1** — bucket Object Lock/versioning (owner, dashboard) + reconciliation report script.
3. **Tier 2** — env export + encrypt helper + runbook doc.
4. **Tier 3** — restore runbook + first test-restore.

**Principles:** every script dry-runs by default; no destructive ops against the production DB; read-only DB credentials for backup; secrets only via GH Actions secrets / request_credential, never committed.
