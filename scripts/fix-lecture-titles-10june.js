#!/usr/bin/env node
/**
 * Fix Lecture Titles Script for 10june2026 Import
 *
 * Updates lecture titles for the 10june2026 import batch to match the correct format:
 * "{SeriesName} - {SequenceInSeries}" e.g., "المورد العذب الزلال - العاشر"
 *
 * Usage:
 *   node scripts/fix-lecture-titles-10june.js --dry-run    # Preview changes
 *   node scripts/fix-lecture-titles-10june.js              # Apply changes
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const mongoose = require('mongoose');
const path = require('path');
const XLSX = require('xlsx');

const Lecture = require('../models/Lecture');

const DRY_RUN = process.argv.includes('--dry-run');
const IMPORT_BATCH = '10june2026';

// Excel file path
const fileArgIndex = process.argv.indexOf('--file');
const EXCEL_FILE = fileArgIndex !== -1 && process.argv[fileArgIndex + 1]
  ? path.resolve(process.argv[fileArgIndex + 1])
  : path.join(__dirname, '..', 'testUpdatedData10June.xlsx');

function getOptimizedFilename(originalFilename) {
  if (!originalFilename) return null;
  const name = String(originalFilename).trim();
  return name.replace(/\.mp3$/i, '.m4a');
}

async function main() {
  console.log('======================================================================');
  console.log(`  Fix Lecture Titles for ${IMPORT_BATCH} Import`);
  console.log('======================================================================');
  console.log(`\nMode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Excel file: ${EXCEL_FILE}`);

  // Read Excel file
  console.log('\nReading Excel file...');
  const workbook = XLSX.readFile(EXCEL_FILE);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);

  console.log(`Found ${data.length} rows`);

  // Connect to MongoDB
  console.log('\nConnecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const stats = {
    processed: 0,
    updated: 0,
    skipped: 0,
    notFound: 0,
    alreadyCorrect: 0,
    errors: []
  };

  console.log('\n=== Processing Lectures ===\n');

  for (const row of data) {
    const audioFileName = getOptimizedFilename(row.TelegramFileName);
    if (!audioFileName) {
      console.log(`  Skipping row ${row['S.No']}: No filename`);
      stats.skipped++;
      continue;
    }

    stats.processed++;

    // Find the lecture by metadata
    const lecture = await Lecture.findOne({
      'metadata.importBatch': IMPORT_BATCH,
      'metadata.serialNo': row['S.No']
    });

    if (!lecture) {
      console.log(`  NOT FOUND: S.No ${row['S.No']} - ${audioFileName}`);
      stats.notFound++;
      continue;
    }

    // Build the correct title
    const seriesName = String(row.SeriesName || '').trim();
    const sequence = String(row.SequenceInSeries || row.Serial || '').trim();
    const isKhutba = row.Type === 'Khutba';

    let correctTitle;
    if (isKhutba) {
      // For khutbas, extract the topic from SeriesName
      const parts = seriesName.split('-');
      correctTitle = parts.length > 1 ? parts.slice(1).join('-').trim() : seriesName;
    } else if (sequence && seriesName) {
      // Standard format: "SeriesName - Sequence"
      correctTitle = `${seriesName} - ${sequence}`;
    } else if (sequence) {
      correctTitle = sequence;
    } else {
      correctTitle = seriesName || 'محاضرة';
    }

    // Check if title already correct
    if (lecture.titleArabic === correctTitle) {
      stats.alreadyCorrect++;
      continue;
    }

    console.log(`  S.No ${row['S.No']}: "${lecture.titleArabic}" → "${correctTitle}"`);

    if (!DRY_RUN) {
      try {
        await Lecture.updateOne(
          { _id: lecture._id },
          { $set: { titleArabic: correctTitle } }
        );
        stats.updated++;
      } catch (error) {
        console.error(`    ERROR updating: ${error.message}`);
        stats.errors.push({ serialNo: row['S.No'], error: error.message });
      }
    } else {
      stats.updated++;
    }
  }

  console.log('\n======================================================================');
  console.log('  SUMMARY');
  console.log('======================================================================');
  console.log(`  Import Batch: ${IMPORT_BATCH}`);
  console.log(`  Processed: ${stats.processed}`);
  console.log(`  Updated: ${stats.updated}`);
  console.log(`  Already correct: ${stats.alreadyCorrect}`);
  console.log(`  Not found: ${stats.notFound}`);
  console.log(`  Skipped: ${stats.skipped}`);
  console.log(`  Errors: ${stats.errors.length}`);

  if (DRY_RUN) {
    console.log('\n  DRY RUN - No changes were made.');
    console.log('  Run without --dry-run to apply changes.');
  }

  await mongoose.connection.close();
  console.log('\nDatabase connection closed');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
