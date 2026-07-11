#!/usr/bin/env node
/**
 * Import Script for updatedData5Feb2026.xlsx
 *
 * Imports 151 lectures organized into three groups:
 *   - S.No 1-33:   Current continuations (masjid + some online)
 *   - S.No 34-99:  Ramadan Archive
 *   - S.No 100-151: Online Classes
 *
 * Usage:
 *   node scripts/import-5feb2026.js [options]
 *
 * Options:
 *   --dry-run     Preview changes without writing to database
 *   --file <path> Path to Excel file (default: ./updatedData5Feb2026.xlsx)
 *
 * Requirements:
 *   - MongoDB connection via MONGODB_URI environment variable
 *   - Excel file with expected columns
 */

require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { Lecture, Sheikh, Series } = require('../models');

// ============================================================================
// Configuration
// ============================================================================

const SERIES_SUFFIX_ONLINE = ' - عن بعد';
const SERIES_SUFFIX_ARCHIVE_RAMADAN = ' - أرشيف رمضان';
const SERIES_SUFFIX_ARCHIVE = ' - أرشيف';
const KHUTBA_SERIES_TITLE = 'خطب الجمعة';

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const fileArgIndex = args.indexOf('--file');
const EXCEL_FILE = fileArgIndex !== -1 && args[fileArgIndex + 1]
  ? path.resolve(args[fileArgIndex + 1])
  : path.join(__dirname, '../updatedData5Feb2026.xlsx');

// ============================================================================
// Arabic Number Parser (Extended to support compound ordinals up to 100+)
// ============================================================================

const ARABIC_ORDINALS = {
  'الأول': 1, 'الاول': 1,
  'الثاني': 2,
  'الثالث': 3,
  'الرابع': 4,
  'الخامس': 5,
  'السادس': 6,
  'السابع': 7,
  'الثامن': 8,
  'التاسع': 9,
  'العاشر': 10,
  'الحادي عشر': 11,
  'الثاني عشر': 12,
  'الثالث عشر': 13,
  'الرابع عشر': 14,
  'الخامس عشر': 15,
  'السادس عشر': 16,
  'السابع عشر': 17,
  'الثامن عشر': 18,
  'التاسع عشر': 19,
  'العشرون': 20,
  'الحادي والعشرون': 21, 'الواحد والعشرون': 21,
  'الثاني والعشرون': 22,
  'الثالث والعشرون': 23,
  'الرابع والعشرون': 24,
  'الخامس والعشرون': 25,
  'السادس والعشرون': 26,
  'السابع والعشرون': 27,
  'الثامن والعشرون': 28,
  'التاسع والعشرون': 29,
  'الثلاثون': 30,
  'الحادي والثلاثون': 31, 'الواحد والثلاثون': 31, 'واحد و الثلاثون': 31,
  'الثاني والثلاثون': 32, 'الثاني و  الثلاثون': 32,
  'الثالث والثلاثون': 33, 'الثالث و  الثلاثون': 33,
  'الرابع والثلاثون': 34,
  'الخامس والثلاثون': 35,
  'السادس والثلاثون': 36,
  // ... 40s
  'الأربعون': 40,
  // ... 50s
  'الخمسون': 50,
  // ... 60s
  'الستون': 60,
  // ... 70s
  'السبعون': 70,
  // ... 80s
  'الثمانون': 80,
  // ... 90s
  'التسعون': 90,
  'الحادي والتسعون': 91, 'الواحد والتسعون': 91,
  'الثاني والتسعون': 92,
  'الثالث والتسعون': 93,
  'الرابع والتسعون': 94,
  'الخامس والتسعون': 95,
  'السادس والتسعون': 96,
  'السابع والتسعون': 97,
  'الثامن والتسعون': 98,
  'التاسع والتسعون': 99,
  'المائة': 100
};

function extractLectureNumber(serialText) {
  if (!serialText || serialText === 'Not Available') return null;

  const text = String(serialText).trim();

  // First try direct match on known ordinals (sorted by length desc for longest match first)
  const sortedOrdinals = Object.entries(ARABIC_ORDINALS)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [word, num] of sortedOrdinals) {
    if (text.includes(word)) {
      return num;
    }
  }

  // Try extracting a leading number (e.g., "1", "2", etc. for archive rows)
  const leadingNum = text.match(/^(\d+)/);
  if (leadingNum) {
    return parseInt(leadingNum[1], 10);
  }

  // Try extracting any number from the text
  const anyNum = text.match(/\d+/);
  if (anyNum) {
    return parseInt(anyNum[0], 10);
  }

  return null;
}

// ============================================================================
// Utility Functions
// ============================================================================

function parseDuration(durationStr) {
  if (!durationStr || durationStr === '' || durationStr === null) {
    return 0;
  }

  try {
    let cleanStr = String(durationStr).trim();
    if (cleanStr.startsWith("'")) {
      cleanStr = cleanStr.substring(1);
    }

    const parts = cleanStr.split(':').map(p => {
      const num = parseInt(p, 10);
      return isNaN(num) ? 0 : num;
    });

    if (parts.length === 2) {
      return parts[0] * 60 + parts[1]; // MM:SS
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
    }

    return 0;
  } catch {
    return 0;
  }
}

function parseDate(dateStr) {
  if (!dateStr || dateStr === '') return null;

  try {
    const parts = String(dateStr).split('.');
    if (parts.length === 3) {
      const [day, month, year] = parts.map(p => parseInt(p, 10));
      return new Date(year, month - 1, day);
    }
  } catch {
    // Ignore parse errors
  }

  return null;
}

function mapCategory(excelCategory) {
  const categoryMap = {
    'Aqeedah': 'Aqeedah',
    'Fiqh': 'Fiqh',
    'Tafsir': 'Tafsir',
    'Tafseer': 'Tafsir',
    'Hadith': 'Hadith',
    'Hadeeth': 'Hadith',
    'Seerah': 'Seerah',
    'Akhlaq': 'Akhlaq',
    'Ramadhan': 'Fiqh',  // Map Ramadan to Fiqh as per requirements
    'Khutba': 'Other',
    'Khutbah': 'Other'
  };

  const normalized = String(excelCategory || '').trim();
  return categoryMap[normalized] || 'Other';
}

function getOptimizedFilename(telegramFilename) {
  // After optimize-audio.js, all files become .m4a with same base name
  const baseName = path.basename(telegramFilename, path.extname(telegramFilename));
  return baseName + '.m4a';
}

function mapLocation(locationOnline) {
  const loc = String(locationOnline || '').trim();
  if (loc === 'Online' || loc === 'عن بعد') return 'عن بعد';
  if (loc === 'Archive' || loc === 'أرشيف') return 'أرشيف رمضان';
  if (loc === 'جامع الورود') return 'جامع الورود';
  return loc || 'غير محدد';
}

function getTags(row) {
  const tags = [];
  const location = String(row['Location/Online'] || '').trim();

  if (location === 'Online') tags.push('online', 'عن بعد');
  if (location === 'Archive') tags.push('archive', 'ramadan', 'أرشيف', 'رمضان');
  if (location === 'جامع الورود') tags.push('masjid', 'جامع الورود');

  if (row.Type === 'Khutba') tags.push('khutba', 'خطبة');

  return tags;
}

// ============================================================================
// Database Operations
// ============================================================================

async function findOrCreateSheikh(nameArabic) {
  // Try exact match first
  let sheikh = await Sheikh.findOne({ nameArabic });

  // If not found, try with "الشيخ " prefix (common in existing data)
  if (!sheikh) {
    sheikh = await Sheikh.findOne({ nameArabic: `الشيخ ${nameArabic}` });
  }

  // If still not found, try without "الشيخ " prefix (in case Excel has it but DB doesn't)
  if (!sheikh && nameArabic.startsWith('الشيخ ')) {
    sheikh = await Sheikh.findOne({ nameArabic: nameArabic.replace(/^الشيخ /, '') });
  }

  if (!sheikh) {
    if (DRY_RUN) {
      console.log(`  [DRY-RUN] Would create sheikh: ${nameArabic}`);
      return { _id: new mongoose.Types.ObjectId(), nameArabic, isNew: true };
    }

    sheikh = await Sheikh.create({
      nameArabic,
      nameEnglish: nameArabic,
      honorific: 'حفظه الله',
      bioArabic: `الشيخ ${nameArabic}`,
      bioEnglish: `Sheikh ${nameArabic}`
    });
    console.log(`  Created sheikh: ${nameArabic}`);
  }

  return sheikh;
}

async function findOrCreateSeries(titleArabic, sheikhId, category, bookAuthor, tags = []) {
  let series = await Series.findOne({ titleArabic, sheikhId });

  if (!series) {
    if (DRY_RUN) {
      console.log(`  [DRY-RUN] Would create series: ${titleArabic}`);
      return { _id: new mongoose.Types.ObjectId(), titleArabic, isNew: true };
    }

    series = await Series.create({
      titleArabic,
      titleEnglish: titleArabic,
      sheikhId,
      category,
      descriptionArabic: bookAuthor ? `شرح كتاب: ${bookAuthor}` : `سلسلة ${titleArabic}`,
      descriptionEnglish: bookAuthor ? `Explanation of: ${bookAuthor}` : `Series: ${titleArabic}`,
      bookAuthor: bookAuthor || undefined,
      tags,
      lectureCount: 0
    });
    console.log(`  Created series: ${titleArabic}`);
  }

  return series;
}

async function createLecture(data, stats) {
  // Check for duplicate
  const existing = await Lecture.findOne({ audioFileName: data.audioFileName });
  if (existing) {
    console.log(`  Skipping duplicate: ${data.audioFileName}`);
    stats.lecturesSkipped++;
    return null;
  }

  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would create lecture: ${data.titleArabic} (${data.audioFileName})`);
    stats.lecturesCreated++;
    return { _id: new mongoose.Types.ObjectId(), ...data };
  }

  const lecture = await Lecture.create({
    audioFileName: data.audioFileName,
    titleArabic: data.titleArabic,
    titleEnglish: data.titleArabic,
    sheikhId: data.sheikhId,
    seriesId: data.seriesId,
    lectureNumber: data.lectureNumber,
    duration: data.duration,
    fileSize: data.fileSize,
    category: data.category,
    location: data.location,
    tags: data.tags,
    dateRecorded: data.dateRecorded,
    published: false,
    featured: false,
    descriptionArabic: data.descriptionArabic || '',
    descriptionEnglish: data.descriptionEnglish || '',
    metadata: data.metadata
  });

  // Update series lecture count
  if (data.seriesId) {
    await Series.findByIdAndUpdate(data.seriesId, { $inc: { lectureCount: 1 } });
  }

  stats.lecturesCreated++;
  return lecture;
}

// ============================================================================
// Import Phases
// ============================================================================

async function importOnlineClasses(data, sheikh, stats) {
  console.log('\n=== Phase 1: Online Classes (S.No 100-151) ===\n');

  const onlineRows = data.filter(r => r['S.No'] >= 100 && r['S.No'] <= 151);
  const seriesMap = new Map(); // titleArabic -> series doc

  for (const row of onlineRows) {
    const seriesTitle = String(row.SeriesName || '').trim() + SERIES_SUFFIX_ONLINE;

    // Find or create online series
    if (!seriesMap.has(seriesTitle)) {
      const series = await findOrCreateSeries(
        seriesTitle,
        sheikh._id,
        mapCategory(row.Category),
        row.OriginalAuthor || '',
        ['online', 'عن بعد']
      );
      seriesMap.set(seriesTitle, series);
      if (series.isNew) stats.seriesCreated++;
    }

    const series = seriesMap.get(seriesTitle);

    // Build lecture title: "SeriesName - Sequence"
    const baseTitle = String(row.SeriesName || '').trim();
    const sequence = String(row.SequenceInSeries || '').trim();
    const lectureTitle = sequence && baseTitle ? `${baseTitle} - ${sequence}` : (sequence || baseTitle || 'محاضرة');

    await createLecture({
      audioFileName: getOptimizedFilename(row.TelegramFileName),
      titleArabic: lectureTitle,
      sheikhId: sheikh._id,
      seriesId: series._id,
      lectureNumber: extractLectureNumber(row.SequenceInSeries),
      duration: parseDuration(row.ClipLength),
      fileSize: 0, // Will be updated when audio is uploaded
      category: mapCategory(row.Category),
      location: mapLocation(row['Location/Online']),
      tags: getTags(row),
      dateRecorded: parseDate(row.DateInGreg),
      descriptionArabic: row.OriginalAuthor ? `من كتاب: ${row.OriginalAuthor}` : '',
      descriptionEnglish: row.OriginalAuthor ? `From book: ${row.OriginalAuthor}` : '',
      metadata: {
        excelFilename: row.TelegramFileName,
        originalFilename: row.TelegramFileName,
        serialNo: row['S.No'],
        importBatch: '5feb2026',
        group: 'online'
      }
    }, stats);
  }

  console.log(`  Processed ${onlineRows.length} online class entries`);
  return seriesMap;
}

async function importArchive(data, sheikh, stats) {
  console.log('\n=== Phase 2: Archive (S.No 34-99) ===\n');

  const archiveRows = data.filter(r => r['S.No'] >= 34 && r['S.No'] <= 99);
  const seriesMap = new Map();

  for (const row of archiveRows) {
    // Use different suffix based on category
    const isRamadan = row.Category === 'Ramadhan';
    const suffix = isRamadan ? SERIES_SUFFIX_ARCHIVE_RAMADAN : SERIES_SUFFIX_ARCHIVE;
    const seriesTitle = String(row.SeriesName || '').trim() + suffix;

    // Tags based on content type
    const tags = isRamadan
      ? ['archive', 'ramadan', 'أرشيف', 'رمضان']
      : ['archive', 'أرشيف'];

    if (!seriesMap.has(seriesTitle)) {
      const series = await findOrCreateSeries(
        seriesTitle,
        sheikh._id,
        mapCategory(row.Category),
        row.OriginalAuthor || '',
        tags
      );
      seriesMap.set(seriesTitle, series);
      if (series.isNew) stats.seriesCreated++;
    }

    const series = seriesMap.get(seriesTitle);

    // Build lecture title: "SeriesName - Sequence"
    const archiveBaseTitle = String(row.SeriesName || '').trim();
    const archiveSequence = String(row.SequenceInSeries || '').trim();
    const archiveLectureTitle = archiveSequence && archiveBaseTitle
      ? `${archiveBaseTitle} - ${archiveSequence}`
      : (archiveSequence || archiveBaseTitle || 'محاضرة');

    await createLecture({
      audioFileName: getOptimizedFilename(row.TelegramFileName),
      titleArabic: archiveLectureTitle,
      sheikhId: sheikh._id,
      seriesId: series._id,
      lectureNumber: extractLectureNumber(row.SequenceInSeries),
      duration: parseDuration(row.ClipLength),
      fileSize: 0,
      category: mapCategory(row.Category),
      location: mapLocation(row['Location/Online']),
      tags: getTags(row),
      dateRecorded: parseDate(row.DateInGreg),
      descriptionArabic: row.OriginalAuthor ? `من كتاب: ${row.OriginalAuthor}` : '',
      descriptionEnglish: row.OriginalAuthor ? `From book: ${row.OriginalAuthor}` : '',
      metadata: {
        excelFilename: row.TelegramFileName,
        originalFilename: row.TelegramFileName,
        serialNo: row['S.No'],
        importBatch: '5feb2026',
        group: isRamadan ? 'archive-ramadan' : 'archive'
      }
    }, stats);
  }

  console.log(`  Processed ${archiveRows.length} archive entries`);
  return seriesMap;
}

async function importCurrentContinuations(data, sheikh, onlineSeriesMap, stats) {
  console.log('\n=== Phase 3: Current Continuations (S.No 1-33) ===\n');

  const currentRows = data.filter(r => r['S.No'] >= 1 && r['S.No'] <= 33);
  const seriesMap = new Map();
  let khutbaSeries = null;

  for (const row of currentRows) {
    const location = String(row['Location/Online'] || '').trim();
    const isOnline = location === 'Online';
    const isKhutba = row.Type === 'Khutba';
    const baseTitle = String(row.SeriesName || '').trim();

    let series;

    if (isKhutba) {
      // Khutbas go into the khutba series
      if (!khutbaSeries) {
        khutbaSeries = await findOrCreateSeries(
          KHUTBA_SERIES_TITLE,
          sheikh._id,
          'Other',
          '',
          ['khutba', 'خطبة', 'جمعة']
        );
        if (khutbaSeries.isNew) stats.seriesCreated++;
      }
      series = khutbaSeries;
    } else if (isOnline) {
      // Online entries in 1-33 map to the online series (created in Phase 1)
      const onlineTitle = baseTitle + SERIES_SUFFIX_ONLINE;
      series = onlineSeriesMap.get(onlineTitle);

      if (!series) {
        // Online series might not exist yet if it's a new title not in 100-151
        series = await findOrCreateSeries(
          onlineTitle,
          sheikh._id,
          mapCategory(row.Category),
          row.OriginalAuthor || '',
          ['online', 'عن بعد']
        );
        onlineSeriesMap.set(onlineTitle, series);
        if (series.isNew) stats.seriesCreated++;
      }
    } else {
      // Masjid entries - find existing series or create new (no suffix)
      if (!seriesMap.has(baseTitle)) {
        const existingSeries = await findOrCreateSeries(
          baseTitle,
          sheikh._id,
          mapCategory(row.Category),
          row.OriginalAuthor || '',
          ['masjid', 'جامع الورود']
        );
        seriesMap.set(baseTitle, existingSeries);
        if (existingSeries.isNew) stats.seriesCreated++;
      }
      series = seriesMap.get(baseTitle);
    }

    // Build lecture title: "SeriesName - Sequence"
    let lectureTitle;
    if (isKhutba) {
      // Extract khutba title from SeriesName (e.g., "خطبة_الجمعة  -  تيسير تكاليف الزواج")
      const parts = baseTitle.split('-');
      lectureTitle = parts.length > 1 ? parts.slice(1).join('-').trim() : baseTitle;
    } else {
      const sequence = String(row.SequenceInSeries || '').trim();
      lectureTitle = sequence && baseTitle ? `${baseTitle} - ${sequence}` : (sequence || baseTitle || 'محاضرة');
    }

    await createLecture({
      audioFileName: getOptimizedFilename(row.TelegramFileName),
      titleArabic: lectureTitle,
      sheikhId: sheikh._id,
      seriesId: series._id,
      lectureNumber: isKhutba ? null : extractLectureNumber(row.SequenceInSeries),
      duration: parseDuration(row.ClipLength),
      fileSize: 0,
      category: mapCategory(row.Category),
      location: mapLocation(row['Location/Online']),
      tags: getTags(row),
      dateRecorded: parseDate(row.DateInGreg),
      descriptionArabic: row.OriginalAuthor ? `من كتاب: ${row.OriginalAuthor}` : '',
      descriptionEnglish: row.OriginalAuthor ? `From book: ${row.OriginalAuthor}` : '',
      metadata: {
        excelFilename: row.TelegramFileName,
        originalFilename: row.TelegramFileName,
        serialNo: row['S.No'],
        importBatch: '5feb2026',
        group: isOnline ? 'online' : (isKhutba ? 'khutba' : 'masjid')
      }
    }, stats);
  }

  console.log(`  Processed ${currentRows.length} current continuation entries`);
}

// ============================================================================
// Main Import Function
// ============================================================================

async function runImport() {
  console.log('='.repeat(70));
  console.log('  Import Script for updatedData5Feb2026.xlsx');
  console.log('='.repeat(70));

  if (DRY_RUN) {
    console.log('\n*** DRY-RUN MODE - No changes will be made to the database ***\n');
  }

  // Validate Excel file exists
  if (!fs.existsSync(EXCEL_FILE)) {
    console.error(`Excel file not found: ${EXCEL_FILE}`);
    console.error('\nUsage: node scripts/import-5feb2026.js [--dry-run] [--file <path>]');
    process.exit(1);
  }

  console.log(`Excel file: ${EXCEL_FILE}`);

  // Read Excel
  console.log('\nReading Excel file...');
  const workbook = XLSX.readFile(EXCEL_FILE);
  const sheetName = workbook.SheetNames[0];
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  console.log(`Found ${data.length} rows in sheet "${sheetName}"`);

  // Validate expected structure
  const requiredColumns = ['S.No', 'TelegramFileName', 'Type', 'SeriesName', 'Sheikh'];
  const headers = Object.keys(data[0] || {});
  const missingColumns = requiredColumns.filter(c => !headers.includes(c));
  if (missingColumns.length > 0) {
    console.error(`Missing required columns: ${missingColumns.join(', ')}`);
    process.exit(1);
  }

  // Connect to MongoDB (needed even for dry-run to verify existing data)
  console.log('\nConnecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const stats = {
    sheikhCreated: false,
    seriesCreated: 0,
    lecturesCreated: 0,
    lecturesSkipped: 0,
    errors: []
  };

  try {
    // Find or create the sheikh
    const sheikhName = String(data[0].Sheikh).trim();
    console.log(`\nSheikh: ${sheikhName}`);
    const sheikh = await findOrCreateSheikh(sheikhName);
    if (sheikh.isNew) stats.sheikhCreated = true;

    // Phase 1: Online Classes (100-151) - Create online series first
    const onlineSeriesMap = await importOnlineClasses(data, sheikh, stats);

    // Phase 2: Archive (34-99) - Ramadan and non-Ramadan archive
    await importArchive(data, sheikh, stats);

    // Phase 3: Current Continuations (1-33)
    await importCurrentContinuations(data, sheikh, onlineSeriesMap, stats);

    // Update sheikh lecture count
    if (!DRY_RUN) {
      const lectureCount = await Lecture.countDocuments({ sheikhId: sheikh._id });
      await Sheikh.findByIdAndUpdate(sheikh._id, { lectureCount });
      console.log(`\nUpdated sheikh lecture count: ${lectureCount}`);
    }

  } catch (error) {
    console.error('\nImport error:', error.message);
    stats.errors.push({ message: error.message, stack: error.stack });
  }

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('  IMPORT SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Mode: ${DRY_RUN ? 'DRY-RUN (no changes made)' : 'LIVE'}`);
  console.log(`  Sheikh created: ${stats.sheikhCreated ? 'Yes' : 'No (already existed)'}`);
  console.log(`  Series created: ${stats.seriesCreated}`);
  console.log(`  Lectures created: ${stats.lecturesCreated}`);
  console.log(`  Lectures skipped: ${stats.lecturesSkipped}`);
  console.log(`  Errors: ${stats.errors.length}`);
  console.log('='.repeat(70));

  if (stats.errors.length > 0) {
    console.log('\nErrors encountered:');
    stats.errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err.message}`);
    });
  }

  // Write report to file
  const reportPath = path.join(__dirname, `../import-report-${Date.now()}.json`);
  const report = {
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    excelFile: EXCEL_FILE,
    stats,
    errors: stats.errors
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to: ${reportPath}`);

  if (!DRY_RUN) {
    console.log('\nNext steps:');
    console.log('  1. Run verification: node scripts/verify-import.js');
    console.log('  2. Optimize audio: node scripts/optimize-audio.js <input-dir> <output-dir>');
    console.log('  3. Upload to OCI: node scripts/upload-to-oci.js <output-dir> --update-db');
    console.log('  4. Publish lectures after verification');
  }

  // Disconnect
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
    console.log('\nDatabase connection closed');
  }
}

// ============================================================================
// Entry Point
// ============================================================================

runImport().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
