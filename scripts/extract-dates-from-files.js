/**
 * Date Extraction Script
 *
 * Logic:
 * 1. Match lecture by filename (unique identifier)
 * 2. Try to extract date from iPhone filename format
 * 3. Fallback to DateInGreg column from Excel
 * 4. Convert Gregorian to Hijri using Ummulqura calendar
 *
 * iPhone filename formats commonly seen:
 * - Recording_YYYYMMDD_HHMMSS.mp3
 * - Audio_Recording_YYYYMMDD.m4a
 * - YYYYMMDD_HHMMSS.mp3
 * - lecture_name_YYYYMMDD.mp3
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const moment = require('moment-hijri');
const connectDB = require('../config/database');
const { Lecture } = require('../models');

// Configure moment-hijri to use Ummulqura calendar
moment.updateLocale('en', {
  iMonths: [
    'Muharram', 'Safar', 'Rabi\' al-awwal', 'Rabi\' al-thani',
    'Jumada al-awwal', 'Jumada al-thani', 'Rajab', 'Sha\'ban',
    'Ramadan', 'Shawwal', 'Dhu al-Qi\'dah', 'Dhu al-Hijjah'
  ]
});

/**
 * Extract date from various filename formats
 *
 * Supported formats:
 * 1. Mp3 Editor_YYMMDDHHMMSS.mp3 (e.g., Mp3 Editor_251013152911.mp3)
 * 2. AUD-YYYYMMDD-WA####.m4a (WhatsApp format: AUD-20251213-WA0001.m4a)
 * 3. AUDIO-YYYY-MM-DD-HH-MM-SS.m4a (e.g., AUDIO-2025-12-22-17-23-19.m4a)
 * 4. Standard YYYYMMDD format (e.g., 20240615.mp3)
 */
function extractDateFromFilename(filename) {
  if (!filename) return null;

  console.log(`  🔍 Analyzing filename: ${filename}`);

  // Pattern 1: Mp3 Editor_YYMMDDHHMMSS format (with various separators)
  // Example: Mp3 Editor_251013152911.mp3 → 2025-10-13
  // Also matches: Mp3-Editor-251013152911-extra.mp3
  const pattern1 = /Mp3[-_\s]*Editor[-_](\d{2})(\d{2})(\d{2})/i;
  const match1 = filename.match(pattern1);

  if (match1) {
    const [, yy, mm, dd] = match1;
    // YY = 25 means 2025, YY = 24 means 2024
    const year = 2000 + parseInt(yy);
    const month = mm;
    const day = dd;
    const dateStr = `${year}-${month}-${day}`;
    const date = new Date(dateStr);

    if (!isNaN(date.getTime())) {
      console.log(`    ✓ Extracted (Mp3 Editor format): ${dateStr}`);
      return date;
    }
  }

  // Pattern 2: WhatsApp Audio format: AUD-YYYYMMDD-WA####
  // Example: AUD-20251213-WA0001.m4a → 2025-12-13
  const pattern2 = /AUD-(\d{4})(\d{2})(\d{2})-WA/i;
  const match2 = filename.match(pattern2);

  if (match2) {
    const [, year, month, day] = match2;
    const dateStr = `${year}-${month}-${day}`;
    const date = new Date(dateStr);

    if (!isNaN(date.getTime())) {
      console.log(`    ✓ Extracted (WhatsApp format): ${dateStr}`);
      return date;
    }
  }

  // Pattern 3: AUDIO-YYYY-MM-DD-HH-MM-SS format
  // Example: AUDIO-2025-12-22-17-23-19.m4a → 2025-12-22
  const pattern3 = /AUDIO-(\d{4})-(\d{2})-(\d{2})-/i;
  const match3 = filename.match(pattern3);

  if (match3) {
    const [, year, month, day] = match3;
    const dateStr = `${year}-${month}-${day}`;
    const date = new Date(dateStr);

    if (!isNaN(date.getTime())) {
      console.log(`    ✓ Extracted (AUDIO format): ${dateStr}`);
      return date;
    }
  }

  // Pattern 4: Ringtone_AUD-YYYYMMDD-WA#### format
  // Example: Ringtone_AUD-20251029-WA0006.mp3 → 2025-10-29
  const pattern4 = /Ringtone_AUD-(\d{4})(\d{2})(\d{2})-WA/i;
  const match4 = filename.match(pattern4);

  if (match4) {
    const [, year, month, day] = match4;
    const dateStr = `${year}-${month}-${day}`;
    const date = new Date(dateStr);

    if (!isNaN(date.getTime())) {
      console.log(`    ✓ Extracted (Ringtone format): ${dateStr}`);
      return date;
    }
  }

  // Pattern 5: Standard YYYYMMDD format anywhere in filename
  // Example: Recording_20240615_143022.mp3 → 2024-06-15
  const pattern5 = /(\d{4})(\d{2})(\d{2})/;
  const match5 = filename.match(pattern5);

  if (match5) {
    const [, year, month, day] = match5;
    const dateStr = `${year}-${month}-${day}`;
    const date = new Date(dateStr);

    // Validate the date is reasonable (not in future, not too old)
    const now = new Date();
    const minDate = new Date('2000-01-01');
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 7); // Allow dates up to 7 days in future

    if (date >= minDate && date <= maxDate && !isNaN(date.getTime())) {
      console.log(`    ✓ Extracted (standard YYYYMMDD): ${dateStr}`);
      return date;
    }
  }

  // Pattern 6: Standard YYYY-MM-DD format with dashes
  // Example: 2024-06-15.mp3 → 2024-06-15
  const pattern6 = /(\d{4})-(\d{2})-(\d{2})/;
  const match6 = filename.match(pattern6);

  if (match6) {
    const [, year, month, day] = match6;
    const dateStr = `${year}-${month}-${day}`;
    const date = new Date(dateStr);

    const now = new Date();
    const minDate = new Date('2000-01-01');
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 7);

    if (date >= minDate && date <= maxDate && !isNaN(date.getTime())) {
      console.log(`    ✓ Extracted (YYYY-MM-DD format): ${dateStr}`);
      return date;
    }
  }

  console.log(`    ✗ No valid date found in filename`);
  return null;
}

/**
 * Parse date from Excel DateInGreg column
 * Supports multiple formats: DD/MM/YYYY, YYYY-MM-DD, etc.
 */
function parseDateFromExcel(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;

  console.log(`  📊 Parsing Excel date: ${dateStr}`);

  try {
    let gregorianDate = null;

    // Try DD/MM/YYYY format (common in Excel)
    let parsed = moment(dateStr, 'DD/MM/YYYY', true);
    if (parsed.isValid()) {
      gregorianDate = parsed.toDate();
    } else {
      // Try MM/DD/YYYY format
      parsed = moment(dateStr, 'MM/DD/YYYY', true);
      if (parsed.isValid()) {
        gregorianDate = parsed.toDate();
      } else {
        // Try ISO format YYYY-MM-DD
        parsed = moment(dateStr, 'YYYY-MM-DD', true);
        if (parsed.isValid()) {
          gregorianDate = parsed.toDate();
        } else {
          // Try standard parsing
          gregorianDate = new Date(dateStr);
          if (isNaN(gregorianDate.getTime())) {
            gregorianDate = null;
          }
        }
      }
    }

    if (gregorianDate) {
      console.log(`    ✓ Parsed Excel date: ${gregorianDate.toISOString().split('T')[0]}`);
      return gregorianDate;
    }
  } catch (error) {
    console.warn(`    ✗ Could not parse Excel date: ${dateStr}`);
  }

  return null;
}

/**
 * Convert Gregorian date to Hijri using Ummulqura calendar
 */
function convertToHijri(gregorianDate) {
  if (!gregorianDate) return null;

  try {
    // Use moment-hijri with Ummulqura calendar
    const hijriMoment = moment(gregorianDate);
    const hijriDate = hijriMoment.format('iYYYY/iMM/iDD'); // Format: 1445/06/15

    console.log(`    📅 Hijri (Ummulqura): ${hijriDate}`);
    return hijriDate;
  } catch (error) {
    console.warn(`    ✗ Could not convert to Hijri:`, error.message);
    return null;
  }
}

/**
 * Process dates for a single lecture
 */
async function processLecture(lecture, excelRow) {
  console.log(`\n📖 Processing: ${lecture.titleArabic.substring(0, 60)}...`);

  let gregorianDate = null;
  let source = null;

  // Step 1: Try to extract date from audioFileName (current filename in DB)
  if (lecture.audioFileName) {
    gregorianDate = extractDateFromFilename(lecture.audioFileName);
    if (gregorianDate) {
      source = 'audioFileName';
    }
  }

  // Step 2: Try to extract date from metadata.excelFilename (original filename)
  if (!gregorianDate && lecture.metadata && lecture.metadata.excelFilename) {
    console.log(`  📁 Trying original filename: ${lecture.metadata.excelFilename}`);
    gregorianDate = extractDateFromFilename(lecture.metadata.excelFilename);
    if (gregorianDate) {
      source = 'excelFilename';
    }
  }

  // Step 3: Fallback to Excel DateInGreg column
  if (!gregorianDate && excelRow) {
    const excelDate = excelRow.DateInGreg || excelRow.dateInGreg || excelRow.date_in_greg;
    gregorianDate = parseDateFromExcel(excelDate);
    if (gregorianDate) {
      source = 'excel CSV';
    }
  }

  // Step 4: Convert to Hijri if we have a date
  let hijriDate = null;
  if (gregorianDate) {
    hijriDate = convertToHijri(gregorianDate);
  }

  // Step 5: Update lecture if we found dates
  if (gregorianDate || hijriDate) {
    console.log(`  💾 Updating lecture...`);
    console.log(`    Source: ${source}`);
    console.log(`    Gregorian: ${gregorianDate ? gregorianDate.toISOString().split('T')[0] : 'N/A'}`);
    console.log(`    Hijri: ${hijriDate || 'N/A'}`);

    if (gregorianDate) lecture.dateRecorded = gregorianDate;
    if (hijriDate) lecture.dateRecordedHijri = hijriDate;

    await lecture.save();
    return { updated: true, source };
  } else {
    console.log(`  ⊘ No date found - skipping`);
    return { updated: false, source: 'none' };
  }
}

/**
 * Main function
 */
async function extractDates() {
  try {
    console.log('🚀 Starting date extraction...\n');
    console.log('📋 Logic:');
    console.log('  1. Match lecture by filename (unique)');
    console.log('  2. Try to extract date from filename (iPhone format)');
    console.log('  3. Fallback to DateInGreg column from Excel');
    console.log('  4. Convert to Hijri using Ummulqura calendar\n');

    // Connect to database
    await connectDB();
    console.log('✓ Connected to database\n');

    // Load Excel/CSV data (optional - for fallback dates)
    const csvPath = path.join(__dirname, '..', 'lectures_with_dates.csv');
    let excelData = {};

    if (fs.existsSync(csvPath)) {
      console.log(`📂 Loading Excel data from: ${csvPath}\n`);

      const rows = [];
      await new Promise((resolve, reject) => {
        fs.createReadStream(csvPath)
          .pipe(csv())
          .on('data', (row) => rows.push(row))
          .on('end', resolve)
          .on('error', reject);
      });

      // Index by filename for quick lookup
      rows.forEach(row => {
        const filename = row.audioFileName || row.audio_file_name || row.filename;
        if (filename) {
          excelData[filename] = row;
        }
      });

      console.log(`  Loaded ${rows.length} rows from Excel\n`);
    } else {
      console.log(`⚠️  No Excel file found at: ${csvPath}`);
      console.log(`  Will only extract dates from filenames\n`);
    }

    // Get all lectures with audio files
    const lectures = await Lecture.find({ audioFileName: { $ne: '' } });
    console.log(`📊 Found ${lectures.length} lectures with audio files\n`);

    const stats = {
      total: lectures.length,
      fromAudioFileName: 0,
      fromExcelFilename: 0,
      fromExcelCSV: 0,
      notFound: 0
    };

    // Process each lecture
    for (const lecture of lectures) {
      const excelRow = excelData[lecture.audioFileName];
      const result = await processLecture(lecture, excelRow);

      if (result.updated) {
        if (result.source === 'audioFileName') stats.fromAudioFileName++;
        else if (result.source === 'excelFilename') stats.fromExcelFilename++;
        else if (result.source === 'excel CSV') stats.fromExcelCSV++;
      } else {
        stats.notFound++;
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 EXTRACTION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total lectures:                ${stats.total}`);
    console.log(`From audioFileName:            ${stats.fromAudioFileName}`);
    console.log(`From metadata.excelFilename:   ${stats.fromExcelFilename}`);
    console.log(`From Excel CSV:                ${stats.fromExcelCSV}`);
    console.log(`No dates found:                ${stats.notFound}`);
    console.log('='.repeat(60));

    console.log('\n✅ Date extraction completed!\n');

  } catch (error) {
    console.error('\n❌ Extraction failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

/**
 * Test function - run this to test date extraction without touching database
 */
function testDateExtraction() {
  console.log('🧪 Testing date extraction with sample filenames...\n');

  const testFilenames = [
    'Mp3 Editor_251013152911.mp3',
    'Mp3-Editor-251013152911-1769324610319-341315626.mp3', // Modified filename from DB
    'Mp3 Editor_251013232021.mp3',
    'AUD-20251213-WA0001.m4a',
    'AUD-20251208-WA0007.m4a',
    'AUDIO-2025-12-22-17-23-19.m4a',
    'AUDIO-2025-12-22-14-05-29.m4a',
    'Ringtone_AUD-20251029-WA0006.mp3',
    '4_5996911497937164203.mp3',
    'Subulussalam.m4a',
    'مفاسد المظاهرات.m4a'
  ];

  testFilenames.forEach(filename => {
    console.log(`\n📝 Testing: ${filename}`);
    const date = extractDateFromFilename(filename);

    if (date) {
      const hijri = convertToHijri(date);
      console.log(`  ✅ Success!`);
      console.log(`     Gregorian: ${date.toISOString().split('T')[0]}`);
      console.log(`     Hijri: ${hijri}`);
    } else {
      console.log(`  ⚠️  No date extracted - will use Excel fallback`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log('✅ Test complete!\n');
  console.log('If results look good, run: node scripts/extract-dates-from-files.js');
  process.exit(0);
}

// Check command line argument
const args = process.argv.slice(2);
if (args.includes('--test') || args.includes('-t')) {
  testDateExtraction();
} else {
  // Run extraction
  extractDates();
}
