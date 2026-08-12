# Transcript Import & Search Filters — Plan

Status: approved design (2026-07-30). Expands transcript search from ~340 lectures to
the full catalogue and adds realm/series/date filtering. Owner is re-transcribing
**from scratch** via a 3rd party, ~100 audios/day, so the pipeline is incremental,
resumable, and idempotent.

## Locked decisions (owner-approved)
1. **Mapping key = `audioFileName`.** The vendor names every CSV as the original audio
   file with the extension swapped to `.csv` (e.g. `18Fiqhmuyassar.m4a` →
   `18Fiqhmuyassar.csv`). Join is an exact match on the filename **stem** (name
   without extension), so `.csv` ↔ `.m4a`/`.mp3`/… all line up. Deterministic — no
   duration/series guessing. (Confirmed: many lectures have `duration: 0`, so duration
   matching was never viable anyway.)
2. **`realm`** is stored as a word on each transcript, derived from the lecture's
   `sheikhId` → sheikh `nameArabic`: contains `النجمي` ⇒ `"najmi"`, else `"hasan"`.
   `sheikhId` is also stored (future scholars).
3. **v1 filter = realm only.** Series/date are denormalized now but wired into the UI
   later.
4. **Duration backfill is a SEPARATE script** (`update-lecture-durations-from-transcripts.js`),
   never inline in the importer — avoids surprise writes to prod lectures.
5. **`audioFileName` is stored on every transcript** as the permanent join/resilience
   key. If lecture `_id`s ever change again (re-import), transcripts re-key by
   `audioFileName` with zero re-transcription.

## CSV contract (from the vendor)
- Columns: `start`, `end`, `text`, `speaker`.
- `start`/`end` are **milliseconds** (integers).
- `speaker` is a generic diarization label (`Speaker 1/2`) — stored as-is, not meaningful.
- Filename = `<audioFileName-stem>.csv`, UTF-8, RTL text as-is.

## Transcript schema (evolved — additive, backward-compatible)
Existing: `lectureId, shortId, text, speaker, startTimeSec, startTimeMs, endTimeMs, sourceCsv`.
Added at import (denormalized from the matched lecture):
- `audioFileName` (String, indexed) — stable join key.
- `realm` (String enum `najmi`/`hasan`, indexed) — realm filter/facet.
- `sheikhId` (ObjectId) — canonical scholar ref.
- `seriesId` (ObjectId), `seriesTitle` (String) — series filter/dropdown (later).
- `dateRecorded` (Date), `dateRecordedHijri` (String) — date filter (later).

## Atlas Search index (manual, Atlas side)
Add to the `default` index mapping on the `transcripts` collection:
- `text` → string, Arabic analyzer (unchanged).
- `realm`, `sheikhId`, `seriesId` → `token` (exact-match filter).
- `dateRecorded` → `date` (range filter).
Rebuild/refresh the index after a bulk load. The search query later adds a
`compound.filter` clause for realm (then series/date).

## Scripts (all dry-run by default; `--apply` to write; search-DB writes only)
1. **`scripts/audit-transcript-mapping.js`** (READ-ONLY) — pre-flight safety net:
   - Stem-uniqueness of `audioFileName` across all lectures (ambiguous stems block a
     clean join — must be resolved first).
   - Given a CSV directory: two-way coverage (CSVs with no lecture; lectures with no CSV).
2. **`scripts/import-transcripts.js`** — CSV dir → transcripts, exact-join by stem,
   enrich (realm/sheikh/series/date/audioFileName), ms → sec/ms. Idempotent per lecture
   (replace that lecture's transcripts), resumable (`--skip-existing`), `--limit N`,
   `--apply`. Emits a per-run report: matched / unmatched / ambiguous / rows written.
3. **`scripts/update-lecture-durations-from-transcripts.js`** — sets `lecture.duration`
   (+ `durationVerified`) from each lecture's transcript `max(endTimeMs)`. Writes to the
   **main** DB, owner-run, dry-run default. Independent of the importer.

## Query/UI (later coding)
- `performAtlasSearch` gains `compound.filter` for `realm` when the client passes it.
- Homepage search: a 3-way realm toggle (Najmi / Hasan / Both). Series & date after.

## Rollout & safety
- Run the **audit** first; resolve any ambiguous stems before importing.
- Import in daily batches as CSVs arrive; `--skip-existing` makes re-runs cheap.
- Dry-run every batch, review the report, then `--apply`.
- Scale: 340 lectures ≈ 181k transcript docs → 3,200 ≈ ~1.7M (~10×); confirm search
  cluster tier/storage.
- Nothing destructive to lecture data; transcript re-imports are per-lecture replaces.

## Known limitation
ASR text has errors (e.g. `الميسر`→`المؤسر`). The Arabic analyzer + fuzzy matching
absorb much of it, and the UI already shows an "auto-generated, may contain errors"
disclaimer. Recall won't be perfect — acceptable.
