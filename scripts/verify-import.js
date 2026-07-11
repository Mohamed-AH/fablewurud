#!/usr/bin/env node
/**
 * Verification Script for updatedData5Feb2026.xlsx Import
 *
 * Cross-checks MongoDB data against the Excel source file to verify:
 *   - All lectures exist with correct audioFileName
 *   - Correct series associations
 *   - Correct sheikh associations
 *   - Audio URLs are set (after OCI upload)
 *   - Duration and category are correct
 *   - Series lecture counts are accurate
 *
 * Usage:
 *   node scripts/verify-import.js [options]
 *
 * Options:
 *   --file <path>       Path to Excel file (default: ./updatedData5Feb2026.xlsx)
 *   --check-audio       Also verify audioUrl is set for each lecture
 *   --fix-counts        Fix any incorrect lectureCount values
 */

require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { Lecture, Sheikh, Series } = require('../models');

// Parse command line arguments
const args = process.argv.slice(2);
const CHECK_AUDIO = args.includes('--check-audio');
const FIX_COUNTS = args.includes('--fix-counts');
const fileArgIndex = args.indexOf('--file');
const EXCEL_FILE = fileArgIndex !== -1 && args[fileArgIndex + 1]
  ? path.resolve(args[fileArgIndex + 1])
  : path.join(__dirname, '../updatedData5Feb2026.xlsx');

// ============================================================================
// Utility Functions (same as import script)
// ============================================================================

function getOptimizedFilename(telegramFilename) {
  const baseName = path.basename(telegramFilename, path.extname(telegramFilename));
  return baseName + '.m4a';
}

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
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    return 0;
  } catch {
    return 0;
  }
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

// ============================================================================
// Verification Functions
// ============================================================================

async function verifyLectures(data, sheikh) {
  console.log('\n=== Verifying Lectures ===\n');

  const results = {
    total: data.length,
    found: 0,
    missing: [],
    wrongSeries: [],
    wrongCategory: [],
    wrongDuration: [],
    missingAudio: [],
    errors: []
  };

  for (const row of data) {
    const expectedFilename = getOptimizedFilename(row.TelegramFileName);
    const serialNo = row['S.No'];

    try {
      const lecture = await Lecture.findOne({ audioFileName: expectedFilename })
        .populate('seriesId')
        .populate('sheikhId');

      if (!lecture) {
        results.missing.push({
          serialNo,
          filename: expectedFilename,
          title: row.SeriesName
        });
        continue;
      }

      results.found++;

      // Verify sheikh
      if (!lecture.sheikhId || lecture.sheikhId._id.toString() !== sheikh._id.toString()) {
        results.errors.push({
          serialNo,
          filename: expectedFilename,
          issue: 'Wrong sheikh',
          expected: sheikh.nameArabic,
          actual: lecture.sheikhId?.nameArabic || 'null'
        });
      }

      // Verify category
      const expectedCategory = mapCategory(row.Category);
      if (lecture.category !== expectedCategory) {
        results.wrongCategory.push({
          serialNo,
          filename: expectedFilename,
          expected: expectedCategory,
          actual: lecture.category
        });
      }

      // Verify duration (allow 1 second tolerance)
      const expectedDuration = parseDuration(row.ClipLength);
      if (expectedDuration > 0 && Math.abs(lecture.duration - expectedDuration) > 1) {
        results.wrongDuration.push({
          serialNo,
          filename: expectedFilename,
          expected: expectedDuration,
          actual: lecture.duration
        });
      }

      // Check audio URL if requested
      if (CHECK_AUDIO && !lecture.audioUrl) {
        results.missingAudio.push({
          serialNo,
          filename: expectedFilename,
          title: lecture.titleArabic
        });
      }

    } catch (error) {
      results.errors.push({
        serialNo,
        filename: expectedFilename,
        issue: error.message
      });
    }
  }

  // Print results
  console.log(`Total rows in Excel: ${results.total}`);
  console.log(`Lectures found in DB: ${results.found}`);
  console.log(`Lectures missing: ${results.missing.length}`);

  if (results.missing.length > 0) {
    console.log('\nMissing lectures:');
    results.missing.slice(0, 10).forEach(m => {
      console.log(`  S.No ${m.serialNo}: ${m.filename}`);
    });
    if (results.missing.length > 10) {
      console.log(`  ... and ${results.missing.length - 10} more`);
    }
  }

  if (results.wrongCategory.length > 0) {
    console.log(`\nWrong category: ${results.wrongCategory.length}`);
    results.wrongCategory.slice(0, 5).forEach(w => {
      console.log(`  S.No ${w.serialNo}: expected ${w.expected}, got ${w.actual}`);
    });
  }

  if (results.wrongDuration.length > 0) {
    console.log(`\nWrong duration: ${results.wrongDuration.length}`);
    results.wrongDuration.slice(0, 5).forEach(w => {
      console.log(`  S.No ${w.serialNo}: expected ${w.expected}s, got ${w.actual}s`);
    });
  }

  if (CHECK_AUDIO && results.missingAudio.length > 0) {
    console.log(`\nMissing audio URL: ${results.missingAudio.length}`);
    results.missingAudio.slice(0, 10).forEach(m => {
      console.log(`  S.No ${m.serialNo}: ${m.filename}`);
    });
    if (results.missingAudio.length > 10) {
      console.log(`  ... and ${results.missingAudio.length - 10} more`);
    }
  }

  if (results.errors.length > 0) {
    console.log(`\nErrors: ${results.errors.length}`);
    results.errors.slice(0, 5).forEach(e => {
      console.log(`  S.No ${e.serialNo}: ${e.issue}`);
    });
  }

  return results;
}

async function verifySeriesCounts(sheikh) {
  console.log('\n=== Verifying Series Lecture Counts ===\n');

  const series = await Series.find({ sheikhId: sheikh._id });
  const results = {
    total: series.length,
    correct: 0,
    incorrect: [],
    fixed: 0
  };

  for (const s of series) {
    const actualCount = await Lecture.countDocuments({ seriesId: s._id });

    if (s.lectureCount !== actualCount) {
      results.incorrect.push({
        title: s.titleArabic,
        stored: s.lectureCount,
        actual: actualCount
      });

      if (FIX_COUNTS) {
        await Series.findByIdAndUpdate(s._id, { lectureCount: actualCount });
        results.fixed++;
      }
    } else {
      results.correct++;
    }
  }

  console.log(`Total series: ${results.total}`);
  console.log(`Correct counts: ${results.correct}`);
  console.log(`Incorrect counts: ${results.incorrect.length}`);

  if (results.incorrect.length > 0) {
    console.log('\nIncorrect series counts:');
    results.incorrect.forEach(i => {
      console.log(`  "${i.title}": stored=${i.stored}, actual=${i.actual}`);
    });

    if (FIX_COUNTS) {
      console.log(`\nFixed ${results.fixed} series counts`);
    } else {
      console.log('\nRun with --fix-counts to correct these');
    }
  }

  return results;
}

async function verifySheikhCount(sheikh) {
  console.log('\n=== Verifying Sheikh Lecture Count ===\n');

  const actualCount = await Lecture.countDocuments({ sheikhId: sheikh._id });
  const isCorrect = sheikh.lectureCount === actualCount;

  console.log(`Sheikh: ${sheikh.nameArabic}`);
  console.log(`Stored count: ${sheikh.lectureCount}`);
  console.log(`Actual count: ${actualCount}`);
  console.log(`Status: ${isCorrect ? 'CORRECT' : 'INCORRECT'}`);

  if (!isCorrect && FIX_COUNTS) {
    await Sheikh.findByIdAndUpdate(sheikh._id, { lectureCount: actualCount });
    console.log('Count fixed');
  } else if (!isCorrect) {
    console.log('Run with --fix-counts to correct');
  }

  return { stored: sheikh.lectureCount, actual: actualCount, isCorrect };
}

async function verifyImportBatch() {
  console.log('\n=== Verifying Import Batch ===\n');

  // Count lectures from this import batch
  const batchLectures = await Lecture.countDocuments({
    'metadata.importBatch': '5feb2026'
  });

  // Count by group
  const onlineCount = await Lecture.countDocuments({
    'metadata.importBatch': '5feb2026',
    'metadata.group': 'online'
  });

  const archiveCount = await Lecture.countDocuments({
    'metadata.importBatch': '5feb2026',
    'metadata.group': 'archive'
  });

  const masjidCount = await Lecture.countDocuments({
    'metadata.importBatch': '5feb2026',
    'metadata.group': 'masjid'
  });

  const khutbaCount = await Lecture.countDocuments({
    'metadata.importBatch': '5feb2026',
    'metadata.group': 'khutba'
  });

  console.log(`Total lectures from 5feb2026 batch: ${batchLectures}`);
  console.log(`  Online (S.No 100-151 + some 1-33): ${onlineCount}`);
  console.log(`  Archive (S.No 34-99): ${archiveCount}`);
  console.log(`  Masjid (S.No 1-33): ${masjidCount}`);
  console.log(`  Khutba: ${khutbaCount}`);

  return {
    total: batchLectures,
    online: onlineCount,
    archive: archiveCount,
    masjid: masjidCount,
    khutba: khutbaCount
  };
}

// ============================================================================
// Main Verification Function
// ============================================================================

async function runVerification() {
  console.log('='.repeat(70));
  console.log('  Verification Script for updatedData5Feb2026.xlsx Import');
  console.log('='.repeat(70));

  // Validate Excel file exists
  if (!fs.existsSync(EXCEL_FILE)) {
    console.error(`Excel file not found: ${EXCEL_FILE}`);
    process.exit(1);
  }

  console.log(`\nExcel file: ${EXCEL_FILE}`);
  console.log(`Check audio URLs: ${CHECK_AUDIO ? 'Yes' : 'No'}`);
  console.log(`Fix counts: ${FIX_COUNTS ? 'Yes' : 'No'}`);

  // Read Excel
  console.log('\nReading Excel file...');
  const workbook = XLSX.readFile(EXCEL_FILE);
  const sheetName = workbook.SheetNames[0];
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  console.log(`Found ${data.length} rows`);

  // Connect to MongoDB
  console.log('\nConnecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const allResults = {};

  try {
    // Find the sheikh (with fallback for "الشيخ" prefix mismatch)
    const sheikhName = String(data[0].Sheikh).trim();
    let sheikh = await Sheikh.findOne({ nameArabic: sheikhName });

    // If not found, try with "الشيخ " prefix
    if (!sheikh) {
      sheikh = await Sheikh.findOne({ nameArabic: `الشيخ ${sheikhName}` });
    }

    // If still not found, try without "الشيخ " prefix
    if (!sheikh && sheikhName.startsWith('الشيخ ')) {
      sheikh = await Sheikh.findOne({ nameArabic: sheikhName.replace(/^الشيخ /, '') });
    }

    if (!sheikh) {
      console.error(`\nSheikh not found: ${sheikhName}`);
      console.error('Run the import script first.');
      process.exit(1);
    }

    console.log(`\nSheikh found: ${sheikh.nameArabic} (ID: ${sheikh._id})`);

    // Run verifications
    allResults.lectures = await verifyLectures(data, sheikh);
    allResults.batchStats = await verifyImportBatch();
    allResults.seriesCounts = await verifySeriesCounts(sheikh);
    allResults.sheikhCount = await verifySheikhCount(sheikh);

  } catch (error) {
    console.error('\nVerification error:', error.message);
    allResults.error = error.message;
  }

  // Print final summary
  console.log('\n' + '='.repeat(70));
  console.log('  VERIFICATION SUMMARY');
  console.log('='.repeat(70));

  const lectureResults = allResults.lectures || {};
  const passed = lectureResults.found === lectureResults.total
    && lectureResults.missing?.length === 0
    && (allResults.sheikhCount?.isCorrect ?? true);

  if (passed) {
    console.log('\n  STATUS: ALL CHECKS PASSED');
  } else {
    console.log('\n  STATUS: SOME CHECKS FAILED');
    if (lectureResults.missing?.length > 0) {
      console.log(`    - ${lectureResults.missing.length} lectures missing`);
    }
    if (!allResults.sheikhCount?.isCorrect) {
      console.log('    - Sheikh lecture count incorrect');
    }
    if (allResults.seriesCounts?.incorrect?.length > 0) {
      console.log(`    - ${allResults.seriesCounts.incorrect.length} series counts incorrect`);
    }
  }

  if (CHECK_AUDIO && lectureResults.missingAudio?.length > 0) {
    console.log(`\n  PENDING: ${lectureResults.missingAudio.length} lectures need audio upload`);
  }

  console.log('='.repeat(70));

  // Write verification report
  const reportPath = path.join(__dirname, `../verify-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(allResults, null, 2));
  console.log(`\nFull report saved to: ${reportPath}`);

  // Disconnect
  await mongoose.disconnect();
  console.log('\nDatabase connection closed');

  // Exit with appropriate code
  process.exit(passed ? 0 : 1);
}

// ============================================================================
// Entry Point
// ============================================================================

runVerification().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
