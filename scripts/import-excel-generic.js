#!/usr/bin/env node
/**
 * Generic Excel Import Script
 *
 * Imports lectures from Excel with proper metadata tracking for later processing.
 *
 * ============================================================================
 * WORKFLOW SEQUENCE
 * ============================================================================
 *
 * Step 1: IMPORT (this script - run on Cloud VM)
 *   node scripts/import-excel-generic.js data.xlsx --batch mybatch --dry-run
 *   node scripts/import-excel-generic.js data.xlsx --batch mybatch
 *
 * Step 2: UPLOAD AUDIO (run on Local PC with audio files)
 *   node scripts/upload-to-oci-local.js /path/to/audio --output manifest.json
 *
 * Step 3: UPDATE DB (run on Cloud VM)
 *   node scripts/upload-to-oci-verify.js --manifest manifest.json
 *
 * Step 4: FIX TITLES if needed (run on Cloud VM)
 *   node scripts/fix-lecture-titles-generic.js data.xlsx --batch mybatch --dry-run
 *   node scripts/fix-lecture-titles-generic.js data.xlsx --batch mybatch
 *
 * Step 5: PUBLISH (run on Cloud VM)
 *   node scripts/publish-batch.js --batch mybatch --dry-run
 *   node scripts/publish-batch.js --batch mybatch
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *   node scripts/import-excel-generic.js <excel-file> [options]
 *
 * Required:
 *   <excel-file>          Path to Excel file
 *   --batch <name>        Import batch identifier (e.g., "june2026", "ramadan1447")
 *
 * Options:
 *   --dry-run             Preview without writing to database
 *   --tags <t1,t2,...>    Comma-separated tags to apply to all lectures
 *   --env <path>          Path to .env file (default: .env)
 *   --series-suffix <s>   Suffix to add to series names (e.g., " - أرشيف")
 *   --location <loc>      Default location (e.g., "جامع الورود", "عن بعد")
 *   --unpublished         Import as unpublished (default: true)
 *
 * ============================================================================
 * EXPECTED EXCEL COLUMNS
 * ============================================================================
 *
 * Required:
 *   - S.No              : Serial number (for tracking)
 *   - TelegramFileName  : Audio filename
 *   - Sheikh            : Sheikh name in Arabic
 *
 * Optional:
 *   - SeriesName        : Series title
 *   - SequenceInSeries  : Lecture sequence (Arabic ordinal or number)
 *   - Serial            : Alternative to SequenceInSeries
 *   - TitleEnglish      : English title (falls back to Arabic if missing)
 *   - Category          : Aqeedah, Fiqh, Tafsir, Hadith, Seerah, Akhlaq, Other
 *   - Type              : "Series" or "Khutba"
 *   - ClipLength        : Duration (MM:SS or HH:MM:SS)
 *   - DateInGreg        : Recording date (DD.MM.YYYY)
 *   - Location/Online   : Location or "Online"
 *   - OriginalAuthor    : Book/source author
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

const EXCEL_FILE = args.find(a => !a.startsWith('--') && a !== getArg('--batch') && a !== getArg('--tags') && a !== getArg('--env') && a !== getArg('--series-suffix') && a !== getArg('--location'));
const BATCH_NAME = getArg('--batch');
const DRY_RUN = args.includes('--dry-run');
const TAGS = getArg('--tags') ? getArg('--tags').split(',').map(t => t.trim()) : [];
const SERIES_SUFFIX = getArg('--series-suffix') || '';
const DEFAULT_LOCATION = getArg('--location') || '';

if (!EXCEL_FILE || !BATCH_NAME) {
  console.log(`
Usage: node scripts/import-excel-generic.js <excel-file> --batch <name> [options]

Required:
  <excel-file>          Path to Excel file
  --batch <name>        Import batch identifier (e.g., "june2026")

Options:
  --dry-run             Preview without writing to database
  --tags <t1,t2,...>    Comma-separated tags for all lectures
  --series-suffix <s>   Suffix for series names (e.g., " - أرشيف")
  --location <loc>      Default location
  --env <path>          Path to .env file

Example:
  node scripts/import-excel-generic.js data.xlsx --batch june2026 --tags "online,عن بعد" --dry-run
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

async function createLecture(data, stats) {
  const existing = await Lecture.findOne({ audioFileName: data.audioFileName });
  if (existing) {
    console.log(`  ⏭️  Skipped (exists): ${data.audioFileName}`);
    stats.skipped++;
    return null;
  }

  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would create: ${data.titleArabic}`);
    stats.created++;
    return null;
  }

  // Generate unique slug
  const lectureNum = data.lectureNumber || 'x';
  const baseSlug = generateSlug(`${data.seriesTitle || data.titleArabic}-الدرس-${lectureNum}`);
  let slug = baseSlug;
  let suffix = 1;
  while (await Lecture.exists({ slug })) {
    suffix++;
    slug = `${baseSlug}-${suffix}`;
  }

  await Lecture.create({
    audioFileName: data.audioFileName,
    titleArabic: data.titleArabic,
    titleEnglish: data.titleEnglish || data.titleArabic,
    sheikhId: data.sheikhId,
    seriesId: data.seriesId,
    lectureNumber: data.lectureNumber,
    slug,
    duration: data.duration,
    durationSeconds: data.duration,
    fileSize: 0,
    category: data.category,
    location: data.location,
    tags: data.tags,
    dateRecorded: data.dateRecorded,
    descriptionArabic: data.descriptionArabic || '',
    descriptionEnglish: data.descriptionEnglish || '',
    published: false,
    metadata: data.metadata
  });

  stats.created++;
  return true;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('═'.repeat(70));
  console.log('  GENERIC EXCEL IMPORT');
  console.log('═'.repeat(70));
  console.log(`\n  Batch:    ${BATCH_NAME}`);
  console.log(`  File:     ${EXCEL_FILE}`);
  console.log(`  Mode:     ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  if (TAGS.length) console.log(`  Tags:     ${TAGS.join(', ')}`);
  if (SERIES_SUFFIX) console.log(`  Suffix:   "${SERIES_SUFFIX}"`);
  if (DEFAULT_LOCATION) console.log(`  Location: ${DEFAULT_LOCATION}`);

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

  const stats = { sheikhNew: false, series: 0, created: 0, skipped: 0, errors: [] };
  const seriesMap = new Map();

  try {
    // Sheikh
    const sheikhName = String(data[0].Sheikh).trim();
    console.log(`\n👤 Sheikh: ${sheikhName}`);
    const sheikh = await findOrCreateSheikh(sheikhName);
    if (sheikh.isNew) stats.sheikhNew = true;

    console.log('\n📚 Processing lectures...\n');

    for (const row of data) {
      try {
        const filename = getFilename(row.TelegramFileName);
        if (!filename) {
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

        // English title from Excel or fallback to Arabic
        const titleEn = row.TitleEnglish ? String(row.TitleEnglish).trim() : titleAr;

        await createLecture({
          audioFileName: filename,
          titleArabic: titleAr,
          titleEnglish: titleEn,
          seriesTitle: seriesTitle,
          sheikhId: sheikh._id,
          seriesId: series?._id || null,
          lectureNumber: extractLectureNumber(seq),
          duration: parseDuration(row.ClipLength),
          category: mapCategory(row.Category),
          location: getLocation(row),
          tags: getTags(row),
          dateRecorded: parseDate(row.DateInGreg),
          descriptionArabic: row.OriginalAuthor ? `من كتاب: ${row.OriginalAuthor}` : '',
          descriptionEnglish: row.OriginalAuthor ? `From: ${row.OriginalAuthor}` : '',
          metadata: {
            excelFilename: row.TelegramFileName,
            serialNo: row['S.No'],
            importBatch: BATCH_NAME,
            importedAt: new Date().toISOString()
          }
        }, stats);

      } catch (err) {
        console.error(`  ❌ Row ${row['S.No']}: ${err.message}`);
        stats.errors.push({ row: row['S.No'], error: err.message });
      }
    }

    // Update counts for all series that received lectures
    if (!DRY_RUN) {
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
