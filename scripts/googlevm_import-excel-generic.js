#!/usr/bin/env node
/**
 * GCE Free Tier Optimized Excel Import Script
 *
 * Optimized for Google Cloud Compute Engine free tier (1GB RAM, shared CPU).
 *
 * OPTIMIZATIONS:
 * 1. Pre-fetches existing audioFileName and slug values into memory Sets for O(1) lookups
 * 2. In-memory slug collision resolution (no database queries in loop)
 * 3. Chunked bulk writes (100 records at a time) to reduce network overhead
 * 4. Sequential processing to avoid CPU throttling on shared vCPU
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *   node scripts/googlevm_import-excel-generic.js <excel-file> --batch <name> [options]
 *
 * Required:
 *   <excel-file>          Path to Excel file
 *   --batch <name>        Import batch identifier (e.g., "june2026")
 *
 * Options:
 *   --dry-run             Preview without writing to database
 *   --tags <t1,t2,...>    Comma-separated tags for all lectures
 *   --series-suffix <s>   Suffix for series names
 *   --location <loc>      Default location
 *   --env <path>          Path to .env file
 *   --chunk-size <n>      Bulk write chunk size (default: 100)
 *
 * ============================================================================
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { Lecture, Sheikh, Series } = require('../models');
const { generateSlug } = require('../utils/slugify');

// ============================================================================
// Parse Arguments
// ============================================================================

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')
    ? args[idx + 1]
    : null;
}

const EXCEL_FILE = args.find(a => !a.startsWith('--') && a !== getArg('--batch') && a !== getArg('--tags') && a !== getArg('--env') && a !== getArg('--series-suffix') && a !== getArg('--location') && a !== getArg('--chunk-size'));
const BATCH_NAME = getArg('--batch');
const DRY_RUN = args.includes('--dry-run');
const TAGS = getArg('--tags') ? getArg('--tags').split(',').map(t => t.trim()) : [];
const SERIES_SUFFIX = getArg('--series-suffix') || '';
const DEFAULT_LOCATION = getArg('--location') || '';
const CHUNK_SIZE = parseInt(getArg('--chunk-size')) || 100;
const VERBOSE = args.includes('--verbose');
const REPLACE = args.includes('--replace');

if (!EXCEL_FILE || !BATCH_NAME) {
  console.log(`
Usage: node scripts/googlevm_import-excel-generic.js <excel-file> --batch <name> [options]

Required:
  <excel-file>          Path to Excel file
  --batch <name>        Import batch identifier (e.g., "june2026")

Options:
  --dry-run             Preview without writing to database
  --replace             Delete existing lectures with same filenames before import
  --verbose             Show skipped files and reasons
  --tags <t1,t2,...>    Comma-separated tags for all lectures
  --series-suffix <s>   Suffix for series names
  --location <loc>      Default location
  --env <path>          Path to .env file
  --chunk-size <n>      Bulk write chunk size (default: 100)

Example:
  node scripts/googlevm_import-excel-generic.js data.xlsx --batch june2026 --dry-run
`);
  process.exit(1);
}

// ============================================================================
// Arabic Number Parser
// ============================================================================

const ARABIC_ORDINALS = {
  'الأول': 1, 'الاول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4,
  'الخامس': 5, 'السادس': 6, 'السابع': 7, 'الثامن': 8, 'التاسع': 9,
  'العاشر': 10, 'الحادي عشر': 11, 'الثاني عشر': 12, 'الثالث عشر': 13,
  'الرابع عشر': 14, 'الخامس عشر': 15, 'السادس عشر': 16, 'السابع عشر': 17,
  'الثامن عشر': 18, 'التاسع عشر': 19, 'العشرون': 20,
  'الحادي والعشرون': 21, 'الثاني والعشرون': 22, 'الثالث والعشرون': 23,
  'الرابع والعشرون': 24, 'الخامس والعشرون': 25, 'السادس والعشرون': 26,
  'السابع والعشرون': 27, 'الثامن والعشرون': 28, 'التاسع والعشرون': 29,
  'الثلاثون': 30, 'الحادي والثلاثون': 31, 'الثاني والثلاثون': 32,
  'الثالث والثلاثون': 33, 'الرابع والثلاثون': 34, 'الخامس والثلاثون': 35,
  'الأربعون': 40, 'الخمسون': 50, 'الستون': 60, 'السبعون': 70,
  'الثمانون': 80, 'التسعون': 90, 'المائة': 100
};

function extractLectureNumber(text) {
  if (!text || text === 'Not Available') return null;
  const str = String(text).trim();

  for (const [word, num] of Object.entries(ARABIC_ORDINALS).sort((a, b) => b[0].length - a[0].length)) {
    if (str.includes(word)) return num;
  }

  const match = str.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

// ============================================================================
// Utility Functions
// ============================================================================

function parseDuration(str) {
  if (!str) return 0;
  const clean = String(str).trim().replace(/^'/, '');
  const parts = clean.split(':').map(p => parseInt(p, 10) || 0);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function parseDate(str) {
  if (!str) return null;
  const parts = String(str).split('.');
  if (parts.length === 3) {
    const [d, m, y] = parts.map(p => parseInt(p, 10));
    return new Date(y, m - 1, d);
  }
  return null;
}

function mapCategory(cat) {
  const map = {
    'Aqeedah': 'Aqeedah', 'Fiqh': 'Fiqh', 'Tafsir': 'Tafsir', 'Tafseer': 'Tafsir',
    'Hadith': 'Hadith', 'Hadeeth': 'Hadith', 'Seerah': 'Seerah', 'Akhlaq': 'Akhlaq',
    'Ramadhan': 'Fiqh', 'Khutba': 'Other', 'Khutbah': 'Other'
  };
  return map[String(cat || '').trim()] || 'Other';
}

function getFilename(name) {
  if (!name) return null;
  const base = path.basename(String(name).trim(), path.extname(name));
  return base + '.m4a';
}

function getLocation(row) {
  if (DEFAULT_LOCATION) return DEFAULT_LOCATION;
  const loc = String(row['Location/Online'] || '').trim();
  if (loc === 'Online') return 'عن بعد';
  if (loc === 'Archive') return 'أرشيف';
  return loc || 'غير محدد';
}

function getTags(row) {
  const tags = [...TAGS];
  const loc = String(row['Location/Online'] || '').trim();
  if (loc === 'Online') tags.push('online', 'عن بعد');
  if (loc === 'Archive') tags.push('archive', 'أرشيف');
  if (row.Type === 'Khutba') tags.push('khutba', 'خطبة');
  return [...new Set(tags)];
}

// ============================================================================
// In-Memory Slug Resolution
// ============================================================================

function resolveUniqueSlug(baseSlug, existingSlugs) {
  let slug = baseSlug;
  let suffix = 1;

  // Check against in-memory Set instead of database
  while (existingSlugs.has(slug)) {
    suffix++;
    slug = `${baseSlug}-${suffix}`;
  }

  // Add to Set immediately to prevent collisions with subsequent rows
  existingSlugs.add(slug);
  return slug;
}

// ============================================================================
// Database Operations
// ============================================================================

async function findOrCreateSheikh(name) {
  let sheikh = await Sheikh.findOne({ nameArabic: name });
  if (!sheikh) sheikh = await Sheikh.findOne({ nameArabic: `الشيخ ${name}` });
  if (!sheikh && name.startsWith('الشيخ ')) {
    sheikh = await Sheikh.findOne({ nameArabic: name.replace('الشيخ ', '') });
  }

  if (!sheikh) {
    if (DRY_RUN) {
      console.log(`  [DRY-RUN] Would create sheikh: ${name}`);
      return { _id: new mongoose.Types.ObjectId(), nameArabic: name, isNew: true };
    }
    sheikh = await Sheikh.create({
      nameArabic: name, nameEnglish: name, honorific: 'حفظه الله',
      bioArabic: `الشيخ ${name}`, bioEnglish: `Sheikh ${name}`
    });
    console.log(`  ✅ Created sheikh: ${name}`);
    return { _id: sheikh._id, nameArabic: sheikh.nameArabic, isNew: true };
  }
  return { _id: sheikh._id, nameArabic: sheikh.nameArabic, isNew: false };
}

async function findOrCreateSeries(title, sheikhId, category, description, tags) {
  const fullTitle = title + SERIES_SUFFIX;
  let series = await Series.findOne({ titleArabic: fullTitle, sheikhId });

  if (!series) {
    if (DRY_RUN) {
      console.log(`  [DRY-RUN] Would create series: ${fullTitle}`);
      return { _id: new mongoose.Types.ObjectId(), titleArabic: fullTitle, isNew: true };
    }
    series = await Series.create({
      titleArabic: fullTitle, titleEnglish: fullTitle, sheikhId, category,
      descriptionArabic: description ? `من كتاب: ${description}` : `سلسلة ${fullTitle}`,
      descriptionEnglish: description ? `From: ${description}` : `Series: ${fullTitle}`,
      tags: tags || [], lectureCount: 0
    });
    console.log(`  ✅ Created series: ${fullTitle}`);
    return { _id: series._id, titleArabic: series.titleArabic, isNew: true };
  }
  return { _id: series._id, titleArabic: series.titleArabic, isNew: false };
}

// ============================================================================
// Chunked Bulk Write
// ============================================================================

async function flushBulkWrites(bulkOps, stats) {
  if (bulkOps.length === 0) return;

  try {
    const result = await Lecture.bulkWrite(bulkOps, { ordered: false });
    stats.created += result.insertedCount || 0;
    console.log(`    📦 Bulk wrote ${result.insertedCount || bulkOps.length} lectures`);
  } catch (err) {
    // Handle duplicate key errors gracefully
    if (err.writeErrors) {
      const inserted = bulkOps.length - err.writeErrors.length;
      stats.created += inserted;
      stats.skipped += err.writeErrors.length;
      console.log(`    📦 Bulk wrote ${inserted} lectures (${err.writeErrors.length} duplicates skipped)`);
    } else {
      throw err;
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('═'.repeat(70));
  console.log('  GCE FREE TIER OPTIMIZED EXCEL IMPORT');
  console.log('═'.repeat(70));
  console.log(`\n  Batch:      ${BATCH_NAME}`);
  console.log(`  File:       ${EXCEL_FILE}`);
  console.log(`  Mode:       ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${REPLACE ? ' (replace)' : ''}${VERBOSE ? ' (verbose)' : ''}`);
  console.log(`  Chunk Size: ${CHUNK_SIZE}`);
  if (TAGS.length) console.log(`  Tags:       ${TAGS.join(', ')}`);
  if (SERIES_SUFFIX) console.log(`  Suffix:     "${SERIES_SUFFIX}"`);
  if (DEFAULT_LOCATION) console.log(`  Location:   ${DEFAULT_LOCATION}`);

  if (!fs.existsSync(EXCEL_FILE)) {
    console.error(`\n❌ File not found: ${EXCEL_FILE}`);
    process.exit(1);
  }

  // Read Excel
  console.log('\n📖 Reading Excel...');
  const workbook = XLSX.readFile(EXCEL_FILE);
  const sheetName = workbook.SheetNames[0];
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  console.log(`   Found ${data.length} rows in "${sheetName}"`);

  // Validate columns
  const headers = Object.keys(data[0] || {});
  const required = ['S.No', 'TelegramFileName', 'Sheikh'];
  const missing = required.filter(c => !headers.includes(c));
  if (missing.length) {
    console.error(`\n❌ Missing columns: ${missing.join(', ')}`);
    console.error(`   Available: ${headers.join(', ')}`);
    process.exit(1);
  }

  // Connect
  console.log('\n📊 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('   Connected');

  // =========================================================================
  // REPLACE MODE: Delete existing lectures with matching filenames
  // =========================================================================
  let deletedCount = 0;
  const filenamesToReplace = REPLACE
    ? new Set(data.map(row => getFilename(row.TelegramFileName)).filter(Boolean))
    : new Set();

  if (REPLACE) {
    if (DRY_RUN) {
      deletedCount = await Lecture.countDocuments({
        audioFileName: { $in: [...filenamesToReplace] }
      });
      console.log(`\n🗑️  [DRY-RUN] Would delete ${deletedCount} existing lectures`);
    } else {
      console.log('\n🗑️  Deleting existing lectures with matching filenames...');
      const deleteResult = await Lecture.deleteMany({
        audioFileName: { $in: [...filenamesToReplace] }
      });
      deletedCount = deleteResult.deletedCount;
      console.log(`   Deleted ${deletedCount} existing lectures`);
    }
  }

  // =========================================================================
  // OPTIMIZATION 1: Pre-fetch existing audioFileNames and slugs into memory
  // =========================================================================
  console.log('\n🔍 Pre-fetching existing records (RAM-optimized)...');

  const existingLectures = await Lecture.find({}, { audioFileName: 1, slug: 1 }).lean();
  const existingFiles = new Set(existingLectures.map(l => l.audioFileName));
  const existingSlugs = new Set(existingLectures.map(l => l.slug).filter(Boolean));

  // In dry-run replace mode, simulate deletion by removing files from the set
  if (REPLACE && DRY_RUN) {
    for (const filename of filenamesToReplace) {
      existingFiles.delete(filename);
    }
  }

  console.log(`   Loaded ${existingFiles.size} existing files, ${existingSlugs.size} slugs into memory`);
  console.log(`   Memory usage: ~${Math.round((existingFiles.size + existingSlugs.size) * 100 / 1024)} KB`);

  const stats = { sheikhNew: false, series: 0, created: 0, skipped: 0, deleted: 0, errors: [] };
  const seriesMap = new Map();
  const bulkOps = [];

  try {
    // Sheikh
    const sheikhName = String(data[0].Sheikh).trim();
    console.log(`\n👤 Sheikh: ${sheikhName}`);
    const sheikh = await findOrCreateSheikh(sheikhName);
    if (sheikh.isNew) stats.sheikhNew = true;

    console.log('\n📚 Processing lectures...\n');

    // =========================================================================
    // OPTIMIZATION 4: Sequential for...of loop (no parallel processing)
    // =========================================================================
    for (const row of data) {
      try {
        const filename = getFilename(row.TelegramFileName);
        if (!filename) {
          if (VERBOSE) console.log(`  [SKIP] No filename: row ${row.LectureNumber || '?'}`);
          stats.skipped++;
          continue;
        }

        // OPTIMIZATION 1: Check existence in memory O(1)
        if (existingFiles.has(filename)) {
          if (VERBOSE) console.log(`  [SKIP] Already exists: ${filename}`);
          stats.skipped++;
          continue;
        }

        // Series
        const seriesTitle = String(row.SeriesName || '').trim();
        let series = null;
        if (seriesTitle) {
          const key = seriesTitle + SERIES_SUFFIX;
          if (!seriesMap.has(key)) {
            series = await findOrCreateSeries(seriesTitle, sheikh._id, mapCategory(row.Category), row.OriginalAuthor, getTags(row));
            seriesMap.set(key, series);
            if (series.isNew) stats.series++;
          } else {
            series = seriesMap.get(key);
          }
        }

        // Title
        const seq = String(row.SequenceInSeries || row.Serial || '').trim();
        const isKhutba = row.Type === 'Khutba';
        let titleAr;
        if (isKhutba) {
          const parts = seriesTitle.split('-');
          titleAr = parts.length > 1 ? parts.slice(1).join('-').trim() : seriesTitle;
        } else if (seq && seriesTitle) {
          titleAr = `${seriesTitle} - ${seq}`;
        } else {
          titleAr = seq || seriesTitle || 'محاضرة';
        }

        const titleEn = row.TitleEnglish ? String(row.TitleEnglish).trim() : titleAr;

        // OPTIMIZATION 2: In-memory slug resolution
        const lectureNum = extractLectureNumber(seq) || 'x';
        const baseSlug = generateSlug(`${seriesTitle || titleAr}-الدرس-${lectureNum}`);
        const slug = resolveUniqueSlug(baseSlug, existingSlugs);

        // Mark file as existing to prevent duplicates within this import
        existingFiles.add(filename);

        if (DRY_RUN) {
          console.log(`  [DRY-RUN] Would create: ${titleAr}`);
          stats.created++;
          continue;
        }

        // OPTIMIZATION 3: Build bulk write operation
        bulkOps.push({
          insertOne: {
            document: {
              audioFileName: filename,
              titleArabic: titleAr,
              titleEnglish: titleEn,
              sheikhId: sheikh._id,
              seriesId: series?._id || null,
              lectureNumber: extractLectureNumber(seq),
              slug,
              duration: parseDuration(row.ClipLength),
              durationSeconds: parseDuration(row.ClipLength),
              fileSize: 0,
              category: mapCategory(row.Category),
              location: getLocation(row),
              tags: getTags(row),
              dateRecorded: parseDate(row.DateInGreg),
              descriptionArabic: row.OriginalAuthor ? `من كتاب: ${row.OriginalAuthor}` : '',
              descriptionEnglish: row.OriginalAuthor ? `From: ${row.OriginalAuthor}` : '',
              published: false,
              metadata: {
                excelFilename: row.TelegramFileName,
                serialNo: row['S.No'],
                importBatch: BATCH_NAME,
                importedAt: new Date().toISOString()
              }
            }
          }
        });

        // OPTIMIZATION 3: Flush in chunks
        if (bulkOps.length >= CHUNK_SIZE) {
          await flushBulkWrites(bulkOps, stats);
          bulkOps.length = 0; // Clear array
        }

      } catch (err) {
        console.error(`  ❌ Row ${row['S.No']}: ${err.message}`);
        stats.errors.push({ row: row['S.No'], error: err.message });
      }
    }

    // Flush remaining bulk operations
    if (bulkOps.length > 0 && !DRY_RUN) {
      await flushBulkWrites(bulkOps, stats);
    }

    // Update counts for all series
    if (!DRY_RUN) {
      console.log('\n📊 Updating lecture counts...');
      for (const [, s] of seriesMap) {
        const count = await Lecture.countDocuments({ seriesId: s._id, published: true });
        await Series.findByIdAndUpdate(s._id, { lectureCount: count });
      }
      const total = await Lecture.countDocuments({ sheikhId: sheikh._id, published: true });
      await Sheikh.findByIdAndUpdate(sheikh._id, { lectureCount: total });
    }

  } catch (err) {
    console.error(`\n❌ Import error: ${err.message}`);
    stats.errors.push({ error: err.message });
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('  SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  Batch:           ${BATCH_NAME}`);
  console.log(`  Sheikh created:  ${stats.sheikhNew ? 'Yes' : 'No'}`);
  console.log(`  Series created:  ${stats.series}`);
  if (REPLACE) console.log(`  Deleted:         ${deletedCount}`);
  console.log(`  Lectures:        ${stats.created}`);
  console.log(`  Skipped:         ${stats.skipped}`);
  console.log(`  Errors:          ${stats.errors.length}`);

  if (stats.errors.length) {
    console.log('\n  Errors:');
    stats.errors.slice(0, 10).forEach(e => console.log(`    Row ${e.row || '-'}: ${e.error}`));
    if (stats.errors.length > 10) console.log(`    ... and ${stats.errors.length - 10} more`);
  }

  if (DRY_RUN) {
    console.log('\n  ⚠️  DRY RUN - No changes made. Remove --dry-run to import.');
  } else {
    console.log('\n  ✅ Import complete!');
    console.log('\n  NEXT STEPS:');
    console.log('  ─'.repeat(35));
    console.log(`  1. Upload audio:   node scripts/upload-to-oci-local.js /path/to/audio`);
    console.log(`  2. Update DB:      node scripts/upload-to-oci-verify.js --manifest upload-manifest.json`);
    console.log(`  3. Fix titles:     node scripts/fix-lecture-titles-generic.js ${EXCEL_FILE} --batch ${BATCH_NAME}`);
    console.log(`  4. Publish:        node scripts/publish-batch.js --batch ${BATCH_NAME}`);
  }

  console.log('═'.repeat(70));

  await mongoose.connection.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  mongoose.connection.close().catch(() => {});
  process.exit(1);
});
