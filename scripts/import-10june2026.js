#!/usr/bin/env node
/**
 * Import Script for testUpdatedData10June.xlsx
 *
 * Imports lectures with proper metadata for tracking and title fixes.
 *
 * Usage:
 *   node scripts/import-10june2026.js [options]
 *
 * Options:
 *   --dry-run     Preview changes without writing to database
 *   --file <path> Path to Excel file (default: ./testUpdatedData10June.xlsx)
 *   --env <path>  Path to .env file (default: .env)
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

// ============================================================================
// Configuration
// ============================================================================

const IMPORT_BATCH = '10june2026';

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const fileArgIndex = args.indexOf('--file');
const EXCEL_FILE = fileArgIndex !== -1 && args[fileArgIndex + 1]
  ? path.resolve(args[fileArgIndex + 1])
  : path.join(__dirname, '../testUpdatedData10June.xlsx');

// ============================================================================
// Arabic Number Parser
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
  'الحادي والعشرون': 21,
  'الثاني والعشرون': 22,
  'الثالث والعشرون': 23,
  'الرابع والعشرون': 24,
  'الخامس والعشرون': 25,
  'السادس والعشرون': 26,
  'السابع والعشرون': 27,
  'الثامن والعشرون': 28,
  'التاسع والعشرون': 29,
  'الثلاثون': 30
};

function extractLectureNumber(serialText) {
  if (!serialText || serialText === 'Not Available') return null;

  const text = String(serialText).trim();

  // Try direct match on known ordinals
  const sortedOrdinals = Object.entries(ARABIC_ORDINALS)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [word, num] of sortedOrdinals) {
    if (text.includes(word)) {
      return num;
    }
  }

  // Try extracting number
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
    'Ramadhan': 'Fiqh',
    'Khutba': 'Other',
    'Khutbah': 'Other'
  };

  const normalized = String(excelCategory || '').trim();
  return categoryMap[normalized] || 'Other';
}

function getOptimizedFilename(telegramFilename) {
  if (!telegramFilename) return null;
  const baseName = path.basename(telegramFilename, path.extname(telegramFilename));
  return baseName + '.m4a';
}

function mapLocation(locationOnline) {
  const loc = String(locationOnline || '').trim();
  if (loc === 'Online' || loc === 'عن بعد') return 'عن بعد';
  if (loc === 'Archive' || loc === 'أرشيف') return 'أرشيف';
  if (loc === 'جامع الورود') return 'جامع الورود';
  return loc || 'غير محدد';
}

function getTags(row) {
  const tags = [];
  const location = String(row['Location/Online'] || '').trim();

  if (location === 'Online') tags.push('online', 'عن بعد');
  if (location === 'Archive') tags.push('archive', 'أرشيف');
  if (location === 'جامع الورود') tags.push('masjid', 'جامع الورود');
  if (row.Type === 'Khutba') tags.push('khutba', 'خطبة');

  return tags;
}

// ============================================================================
// Database Operations
// ============================================================================

async function findOrCreateSheikh(nameArabic) {
  let sheikh = await Sheikh.findOne({ nameArabic });

  if (!sheikh) {
    sheikh = await Sheikh.findOne({ nameArabic: `الشيخ ${nameArabic}` });
  }

  if (!sheikh && nameArabic.startsWith('الشيخ ')) {
    sheikh = await Sheikh.findOne({ nameArabic: nameArabic.replace('الشيخ ', '') });
  }

  if (!sheikh) {
    if (DRY_RUN) {
      console.log(`  [DRY-RUN] Would create sheikh: ${nameArabic}`);
      return { _id: new mongoose.Types.ObjectId(), nameArabic, isNew: true };
    }

    sheikh = await Sheikh.create({
      nameArabic: nameArabic,
      nameEnglish: nameArabic,
      honorific: 'حفظه الله',
      bioArabic: `الشيخ ${nameArabic}`,
      bioEnglish: `Sheikh ${nameArabic}`
    });
    console.log(`  Created sheikh: ${nameArabic}`);
    return { ...sheikh.toObject(), isNew: true };
  }

  return { ...sheikh, isNew: false };
}

async function findOrCreateSeries(titleArabic, sheikhId, category, description, tags) {
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
      descriptionArabic: description ? `من كتاب: ${description}` : `سلسلة ${titleArabic}`,
      descriptionEnglish: description ? `From book: ${description}` : `Series: ${titleArabic}`,
      tags: tags || [],
      lectureCount: 0
    });
    console.log(`  Created series: ${titleArabic}`);
    return { ...series.toObject(), isNew: true };
  }

  return { ...series, isNew: false };
}

async function createLecture(data, stats) {
  // Check for duplicate
  const existing = await Lecture.findOne({ audioFileName: data.audioFileName });
  if (existing) {
    console.log(`  Skipped (exists): ${data.audioFileName}`);
    stats.lecturesSkipped++;
    return null;
  }

  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would create lecture: ${data.titleArabic}`);
    stats.lecturesCreated++;
    return null;
  }

  const lecture = await Lecture.create({
    audioFileName: data.audioFileName,
    titleArabic: data.titleArabic,
    titleEnglish: data.titleArabic,
    sheikhId: data.sheikhId,
    seriesId: data.seriesId,
    lectureNumber: data.lectureNumber,
    duration: data.duration,
    durationSeconds: data.duration,
    fileSize: data.fileSize || 0,
    category: data.category,
    location: data.location,
    tags: data.tags,
    dateRecorded: data.dateRecorded,
    descriptionArabic: data.descriptionArabic,
    descriptionEnglish: data.descriptionEnglish,
    published: false,
    metadata: data.metadata
  });

  stats.lecturesCreated++;
  return lecture;
}

// ============================================================================
// Main Import Function
// ============================================================================

async function runImport() {
  console.log('='.repeat(70));
  console.log(`  Import Script for ${IMPORT_BATCH}`);
  console.log('='.repeat(70));

  if (DRY_RUN) {
    console.log('\n*** DRY-RUN MODE - No changes will be made to the database ***\n');
  }

  // Validate Excel file exists
  if (!fs.existsSync(EXCEL_FILE)) {
    console.error(`Excel file not found: ${EXCEL_FILE}`);
    console.error('\nUsage: node scripts/import-10june2026.js [--dry-run] [--file <path>]');
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
  const requiredColumns = ['S.No', 'TelegramFileName', 'SeriesName', 'Sheikh'];
  const headers = Object.keys(data[0] || {});
  const missingColumns = requiredColumns.filter(c => !headers.includes(c));
  if (missingColumns.length > 0) {
    console.error(`Missing required columns: ${missingColumns.join(', ')}`);
    console.error(`Available columns: ${headers.join(', ')}`);
    process.exit(1);
  }

  // Connect to MongoDB
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

  const seriesMap = new Map();

  try {
    // Find or create the sheikh (assuming all rows have same sheikh)
    const sheikhName = String(data[0].Sheikh).trim();
    console.log(`\nSheikh: ${sheikhName}`);
    const sheikh = await findOrCreateSheikh(sheikhName);
    if (sheikh.isNew) stats.sheikhCreated = true;

    console.log('\n=== Processing Lectures ===\n');

    for (const row of data) {
      try {
        const audioFileName = getOptimizedFilename(row.TelegramFileName);
        if (!audioFileName) {
          console.log(`  Skipped row ${row['S.No']}: No filename`);
          stats.lecturesSkipped++;
          continue;
        }

        // Get or create series
        const seriesTitle = String(row.SeriesName || '').trim();
        let series = null;

        if (seriesTitle) {
          if (!seriesMap.has(seriesTitle)) {
            series = await findOrCreateSeries(
              seriesTitle,
              sheikh._id,
              mapCategory(row.Category),
              row.OriginalAuthor || '',
              getTags(row)
            );
            seriesMap.set(seriesTitle, series);
            if (series.isNew) stats.seriesCreated++;
          } else {
            series = seriesMap.get(seriesTitle);
          }
        }

        // Build title: "SeriesName - SequenceInSeries"
        const sequence = String(row.SequenceInSeries || row.Serial || '').trim();
        const isKhutba = row.Type === 'Khutba';

        let lectureTitle;
        if (isKhutba) {
          const parts = seriesTitle.split('-');
          lectureTitle = parts.length > 1 ? parts.slice(1).join('-').trim() : seriesTitle;
        } else if (sequence && seriesTitle) {
          lectureTitle = `${seriesTitle} - ${sequence}`;
        } else if (sequence) {
          lectureTitle = sequence;
        } else {
          lectureTitle = seriesTitle || 'محاضرة';
        }

        await createLecture({
          audioFileName,
          titleArabic: lectureTitle,
          sheikhId: sheikh._id,
          seriesId: series ? series._id : null,
          lectureNumber: extractLectureNumber(row.SequenceInSeries || row.Serial),
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
            importBatch: IMPORT_BATCH,
            importedAt: new Date().toISOString()
          }
        }, stats);

      } catch (error) {
        console.error(`  Error processing row ${row['S.No']}: ${error.message}`);
        stats.errors.push({ row: row['S.No'], error: error.message });
      }
    }

    // Update series lecture counts
    if (!DRY_RUN) {
      for (const [, series] of seriesMap) {
        if (!series.isNew) continue;
        const count = await Lecture.countDocuments({ seriesId: series._id });
        await Series.findByIdAndUpdate(series._id, { lectureCount: count });
      }

      // Update sheikh lecture count
      const lectureCount = await Lecture.countDocuments({ sheikhId: sheikh._id });
      await Sheikh.findByIdAndUpdate(sheikh._id, { lectureCount });
      console.log(`\nUpdated sheikh lecture count: ${lectureCount}`);
    }

  } catch (error) {
    console.error('\nImport error:', error.message);
    stats.errors.push({ message: error.message });
  }

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('  IMPORT SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Import Batch: ${IMPORT_BATCH}`);
  console.log(`  Sheikh created: ${stats.sheikhCreated ? 'Yes' : 'No'}`);
  console.log(`  Series created: ${stats.seriesCreated}`);
  console.log(`  Lectures created: ${stats.lecturesCreated}`);
  console.log(`  Lectures skipped: ${stats.lecturesSkipped}`);
  console.log(`  Errors: ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log('\n  Errors:');
    stats.errors.forEach(e => {
      console.log(`    Row ${e.row || 'N/A'}: ${e.error || e.message}`);
    });
  }

  if (DRY_RUN) {
    console.log('\n  *** DRY-RUN - No changes were made ***');
    console.log('  Run without --dry-run to apply changes.');
  } else {
    console.log('\n  Next steps:');
    console.log('  1. Upload audio files using upload-to-oci-local.js');
    console.log('  2. Update DB with upload-to-oci-verify.js');
    console.log(`  3. Fix titles if needed: node scripts/fix-lecture-titles-10june.js`);
    console.log(`  4. Publish: db.lectures.updateMany({'metadata.importBatch':'${IMPORT_BATCH}'},{$set:{published:true}})`);
  }

  console.log('='.repeat(70));

  await mongoose.connection.close();
  console.log('\nDatabase connection closed');
}

// Run
runImport().catch(err => {
  console.error('Fatal error:', err);
  mongoose.connection.close().catch(() => {});
  process.exit(1);
});
