# CSV Import Script

## Overview

The `import-csv.js` script imports lecture metadata from `lectures_with_series2.csv` into the Duroos platform database.

## Prerequisites

1. **MongoDB Connection**: Ensure MongoDB is running and the `MONGODB_URI` is set in `.env`
2. **CSV File**: Place `lectures_with_series2.csv` in the project root directory

## CSV Format

The CSV file should have the following columns:

| Column | Description | Example |
|--------|-------------|---------|
| `post_date` | Date of lecture | `15/05/2023` |
| `sheikh` | Sheikh name (Arabic) | `حسن الدغريري` |
| `series_name` | Series/course name (Arabic) | `شرح كتاب التوحيد` |
| `khutbah_title` | Lecture title (Arabic) | `شرح كتاب التوحيد - الدرس الأول` |
| `audio_length` | Duration (MM:SS or HH:MM:SS) | `45:32` or `1:15:30` |
| `location_or_online` | Location or "Online" | `مسجد الورود - جدة` |
| `series_part` | Lecture number in series | `1` (optional) |

## Usage

```bash
# Run the import script
npm run db:import

# OR
node scripts/import-csv.js
```

## What It Does

1. **Reads CSV File**: Parses the CSV and validates data
2. **Creates Sheikhs**: Finds or creates sheikh records
3. **Creates Series**: Finds or creates series records for each unique combination of series name and sheikh
4. **Creates Lectures**: Creates lecture entries with metadata:
   - Links to sheikh and series
   - Parses duration to seconds
   - Determines category from series/title keywords
   - Marks as unpublished (until audio file is uploaded)
5. **Updates Counts**: Increments lecture counts for sheikhs and series
6. **Avoids Duplicates**: Skips lectures that already exist (same title and sheikh)

## Category Detection

The script automatically assigns categories based on keywords:

- **Aqeedah**: عقيدة, توحيد
- **Fiqh**: فقه
- **Tafsir**: تفسير, قرآن
- **Hadith**: حديث
- **Seerah**: سيرة
- **General**: Default for everything else

## After Import

1. **Review Sheikhs**: Add English names and biographies via admin panel
2. **Review Series**: Add English titles and descriptions
3. **Upload Audio Files**: Use admin panel to upload actual audio files
4. **Link Files**: Associate uploaded files with lecture entries
5. **Publish**: Set `published: true` for lectures ready to go live

## Important Notes

- ⚠️ Lectures are created as `published: false` by default
- ⚠️ `audioFileName` is empty until file is uploaded
- ⚠️ Duplicate detection: Same title + same sheikh = duplicate
- ✅ Safe to run multiple times (won't create duplicates)
- ✅ Creates missing sheikhs and series automatically

## Example Output

```
🚀 Starting CSV import...

📂 Reading: /home/user/wurud/lectures_with_series2.csv

✓ Connected to database

📊 Found 160 rows in CSV

⚙️  Processing rows...

  ✓ Created sheikh: حسن الدغريري
  ✓ Created series: شرح كتاب التوحيد
  ✓ Created lecture: شرح كتاب التوحيد - الدرس الأول
  ✓ Created lecture: شرح كتاب التوحيد - الدرس الثاني
  ...

============================================================
📈 IMPORT SUMMARY
============================================================
Total rows processed:   160
Sheikhs created:        8
Series created:         12
Lectures created:       160
Errors:                 0
============================================================

✅ Import completed!

📝 Next steps:
   1. Review created sheikhs and add English names/bios
   2. Review created series and add English titles/descriptions
   3. Upload audio files via admin panel
   4. Link audio files to lectures
   5. Publish lectures
```

## Troubleshooting

### CSV File Not Found
```
❌ CSV file not found: /home/user/wurud/lectures_with_series2.csv

📝 Please place the CSV file at the project root with the name:
   lectures_with_series2.csv
```
**Solution**: Place the CSV file in the project root directory.

### MongoDB Connection Failed
```
❌ MongoDB connection failed: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution**: Ensure MongoDB is running and `MONGODB_URI` is set correctly in `.env`.

### Missing Required Fields
```
Row 42: Missing sheikh name
Row 78: Missing lecture title
```
**Solution**: Review the CSV file and ensure all required fields (sheikh, khutbah_title) are present.

## Data Validation

The script validates:
- ✅ Sheikh name is present
- ✅ Lecture title is present
- ✅ Duration format is valid
- ✅ Dates can be parsed
- ✅ No duplicate lectures (same title + sheikh)

Invalid rows are skipped and reported in the error summary.

---

# Admin Utility Scripts

## Fix Series Lecture Numbers

Fixes lecture numbers based on Arabic ordinals in titles (الأول, الثاني, الثالث...).

```bash
# Preview changes (dry-run)
node scripts/fix-series-lecture-numbers.js \
  --series 6975b906bc30f3df706f32ab \
  --env .env \
  --dry-run \
  --output preview.txt

# Apply changes
node scripts/fix-series-lecture-numbers.js \
  --series 6975b906bc30f3df706f32ab \
  --env .env
```

**Options:**
| Option | Description |
|--------|-------------|
| `--series ID` | Series ID (required) |
| `--env FILE` | Path to .env file (default: .env) |
| `--dry-run` | Preview without making changes |
| `--output FILE` | Save output to file |

---

## Fix Lecture Slugs

Regenerates slugs using series name + lecture number format.

```bash
# Preview all lectures
node scripts/fix-lecture-slugs.js \
  --env .env \
  --dry-run \
  --output preview.txt

# Preview specific series
node scripts/fix-lecture-slugs.js \
  --series SERIES_ID \
  --env .env \
  --dry-run

# Apply changes
node scripts/fix-lecture-slugs.js --env .env
```

---

## Export Database Data

Exports all lectures, series, and sheikhs to a text file for verification.

```bash
# Export as text
node scripts/export-db-data.js \
  --env .env \
  --output data-export.txt

# Export as JSON
node scripts/export-db-data.js \
  --env .env \
  --output data-export.json \
  --format json
```

---

## Sync OCI Durations

Fetches audio durations from OCI storage and updates MongoDB.

```bash
# Preview
node scripts/sync-oci-durations.js \
  --env .env \
  --dry-run

# Sync all
node scripts/sync-oci-durations.js --env .env

# Limit to N lectures
node scripts/sync-oci-durations.js \
  --env .env \
  --limit 10

# Force re-sync (even if duration exists)
node scripts/sync-oci-durations.js \
  --env .env \
  --force
```

---

## Generate Slugs

Generates slugs for lectures, series, and sheikhs that don't have them.

```bash
node scripts/generate-slugs.js --env .env
```
