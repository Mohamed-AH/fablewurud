# Import Workflow

Complete workflow for importing lectures from Excel, uploading audio, and publishing.

## Prerequisites

- Cloud VM with MongoDB access
- Local PC with audio files and OCI credentials
- Excel file with lecture data

## Expected Excel Columns

| Column | Required | Description |
|--------|----------|-------------|
| S.No | Yes | Serial number for tracking |
| TelegramFileName | Yes | Audio filename |
| Sheikh | Yes | Sheikh name in Arabic |
| SeriesName | No | Series title |
| SequenceInSeries | No | Lecture sequence (Arabic ordinal or number) |
| Category | No | Aqeedah, Fiqh, Tafsir, Hadith, Seerah, Akhlaq, Other |
| Type | No | "Series" or "Khutba" |
| ClipLength | No | Duration (MM:SS or HH:MM:SS) |
| DateInGreg | No | Recording date (DD.MM.YYYY) |
| Location/Online | No | Location or "Online" |
| OriginalAuthor | No | Book/source author |

---

## Step 1: Import (Cloud VM)

Import lectures from Excel with metadata tracking.

```bash
# Preview first
node scripts/import-excel-generic.js data.xlsx --batch june2026 --dry-run

# Then import
node scripts/import-excel-generic.js data.xlsx --batch june2026
```

### Options

| Option | Description | Example |
|--------|-------------|---------|
| `--batch <name>` | **Required.** Batch identifier | `--batch june2026` |
| `--tags <t1,t2>` | Comma-separated tags | `--tags "online,عن بعد"` |
| `--series-suffix <s>` | Append to series names | `--series-suffix " - أرشيف"` |
| `--location <loc>` | Default location | `--location "جامع الورود"` |
| `--dry-run` | Preview without changes | |
| `--env <path>` | Path to .env file | `--env .env.production` |

---

## Step 2: Upload Audio (Local PC)

Upload audio files to cloud storage. Two backends are available:

- **OCI Object Storage** — Used for admin-panel single-file uploads (existing files live here)
- **Cloudflare R2** — Used for new bulk imports (S3-compatible, zero egress fees)

### Option A: Upload to OCI (existing workflow)

```bash
# Preview
node scripts/upload-to-oci-local.js /path/to/audio --dry-run

# Upload (skip existing files)
node scripts/upload-to-oci-local.js /path/to/audio --skip-existing
```

### Option B: Upload to R2 (recommended for new bulk imports)

#### R2 Setup (one-time)

1. Sign up at [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to **R2 Object Storage** > **Create bucket** (name: `wurud-audio`)
3. Enable public access: Bucket Settings > **Public Access** > Allow Access
4. Copy the public URL (e.g., `https://pub-xxxx.r2.dev`)
5. Create API token: **Manage R2 API Tokens** > **Create API Token**
   - Permissions: Object Read & Write
   - Scope: Apply to specific bucket (`wurud-audio`)
6. Add to your `.env` file:
   ```
   R2_ACCOUNT_ID=your-account-id
   R2_ACCESS_KEY_ID=your-access-key-id
   R2_SECRET_ACCESS_KEY=your-secret-access-key
   R2_BUCKET_NAME=wurud-audio
   R2_PUBLIC_URL=https://pub-xxxx.r2.dev
   ```

#### Upload to R2

```bash
# Preview
node scripts/upload-to-r2-local.js /path/to/audio --dry-run

# Upload (skip existing files)
node scripts/upload-to-r2-local.js /path/to/audio --skip-existing
```

### Upload Options (same for both OCI and R2)

| Option | Description |
|--------|-------------|
| `--skip-existing` | Skip files already in storage |
| `--output <file>` | Output manifest filename (default: upload-manifest.json) |
| `--limit <n>` | Process only first N files |
| `--verbose` | Show detailed progress |
| `--dry-run` | Preview without uploading |

### Output

Creates `upload-manifest.json` with uploaded file info. Transfer this to Cloud VM.
The verify script (Step 3) auto-detects whether the manifest came from OCI or R2.

---

## Step 3: Update Database (Cloud VM)

Update MongoDB with OCI URLs from the manifest.

```bash
# Transfer manifest to VM first, then:
node scripts/upload-to-oci-verify.js --manifest upload-manifest.json
```

### Options

| Option | Description |
|--------|-------------|
| `--manifest <file>` | **Required.** Path to manifest from Step 2 |
| `--skip-verify` | Skip OCI verification (trust manifest) |
| `--dry-run` | Preview without updating |
| `--verbose` | Show detailed progress |

---

## Step 4: Fix Titles (Cloud VM)

Optional. Fix lecture titles using Excel data if needed.

```bash
# Preview
node scripts/fix-lecture-titles-generic.js data.xlsx --batch june2026 --dry-run

# Apply
node scripts/fix-lecture-titles-generic.js data.xlsx --batch june2026
```

### Options

| Option | Description |
|--------|-------------|
| `--batch <name>` | **Required.** Target import batch |
| `--dry-run` | Preview without updating |

---

## Step 5: Publish (Cloud VM)

Publish lectures (set `published: true`).

```bash
# Preview
node scripts/publish-batch.js --batch june2026 --dry-run

# Publish
node scripts/publish-batch.js --batch june2026
```

### Options

| Option | Description |
|--------|-------------|
| `--batch <name>` | **Required.** Target import batch |
| `--force` | Publish even without audioUrl |
| `--dry-run` | Preview without updating |

---

## Quick Reference

```bash
# Complete workflow example for "june2026" batch

# 1. Import (Cloud VM)
node scripts/import-excel-generic.js data.xlsx --batch june2026

# 2. Upload (Local PC) — pick one:
node scripts/upload-to-oci-local.js ./audio --skip-existing   # OCI (admin uploads)
node scripts/upload-to-r2-local.js ./audio --skip-existing    # R2 (bulk imports)
# Transfer upload-manifest.json to Cloud VM

# 3. Update DB (Cloud VM) — works with both OCI and R2 manifests
node scripts/upload-to-oci-verify.js --manifest upload-manifest.json

# 4. Fix titles if needed (Cloud VM)
node scripts/fix-lecture-titles-generic.js data.xlsx --batch june2026

# 5. Publish (Cloud VM)
node scripts/publish-batch.js --batch june2026
```

---

## Querying by Batch

```javascript
// Find all lectures in a batch
db.lectures.find({ 'metadata.importBatch': 'june2026' })

// Count by status
db.lectures.countDocuments({ 'metadata.importBatch': 'june2026', published: true })
db.lectures.countDocuments({ 'metadata.importBatch': 'june2026', published: false })

// Find lectures without audio
db.lectures.find({
  'metadata.importBatch': 'june2026',
  $or: [{ audioUrl: { $exists: false } }, { audioUrl: '' }]
})
```

---

## Troubleshooting

### "next is not a function" error
Mongoose 8 compatibility issue. Pull latest code which fixes async middleware.

### Lectures not found in fix-titles
Ensure `--batch` matches exactly what was used during import.

### Audio not linking to lectures
Check that filenames in Excel match the actual audio filenames (after .m4a conversion).
