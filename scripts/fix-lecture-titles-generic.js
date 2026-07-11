#!/usr/bin/env node
/**
 * Generic Fix Lecture Titles Script
 *
 * Updates lecture titles for a specific import batch using Excel data.
 *
 * Usage:
 *   node scripts/fix-lecture-titles-generic.js <excel-file> --batch <name> [options]
 *
 * Options:
 *   --batch <name>   Import batch to update (required)
 *   --dry-run        Preview changes without updating
 *   --env <path>     Path to .env file (default: .env)
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const mongoose = require('mongoose');
const path = require('path');
const XLSX = require('xlsx');
const Lecture = require('../models/Lecture');

// Parse args
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--') ? args[idx + 1] : null;
}

const EXCEL_FILE = args.find(a => !a.startsWith('--') && a !== getArg('--batch') && a !== getArg('--env'));
const BATCH_NAME = getArg('--batch');
const DRY_RUN = args.includes('--dry-run');

if (!EXCEL_FILE || !BATCH_NAME) {
  console.log(`
Usage: node scripts/fix-lecture-titles-generic.js <excel-file> --batch <name> [options]

Options:
  --batch <name>   Import batch to update (required)
  --dry-run        Preview changes without updating
  --env <path>     Path to .env file

Example:
  node scripts/fix-lecture-titles-generic.js data.xlsx --batch june2026 --dry-run
`);
  process.exit(1);
}

function getFilename(name) {
  if (!name) return null;
  return path.basename(String(name).trim(), path.extname(name)) + '.m4a';
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  FIX LECTURE TITLES');
  console.log('═'.repeat(60));
  console.log(`\n  Batch: ${BATCH_NAME}`);
  console.log(`  File:  ${EXCEL_FILE}`);
  console.log(`  Mode:  ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  // Read Excel
  console.log('\n📖 Reading Excel...');
  const workbook = XLSX.readFile(EXCEL_FILE);
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
  console.log(`   Found ${data.length} rows`);

  // Connect
  console.log('\n📊 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('   Connected');

  const stats = { processed: 0, updated: 0, correct: 0, notFound: 0, errors: [] };

  console.log('\n📝 Processing...\n');

  for (const row of data) {
    const filename = getFilename(row.TelegramFileName);
    if (!filename) continue;

    stats.processed++;

    // Find lecture
    const lecture = await Lecture.findOne({
      'metadata.importBatch': BATCH_NAME,
      'metadata.serialNo': row['S.No']
    });

    if (!lecture) {
      console.log(`  ⚠️  Not found: S.No ${row['S.No']}`);
      stats.notFound++;
      continue;
    }

    // Build correct title
    const series = String(row.SeriesName || '').trim();
    const seq = String(row.SequenceInSeries || row.Serial || '').trim();
    const isKhutba = row.Type === 'Khutba';

    let title;
    if (isKhutba) {
      const parts = series.split('-');
      title = parts.length > 1 ? parts.slice(1).join('-').trim() : series;
    } else if (seq && series) {
      title = `${series} - ${seq}`;
    } else {
      title = seq || series || 'محاضرة';
    }

    if (lecture.titleArabic === title) {
      stats.correct++;
      continue;
    }

    console.log(`  S.No ${row['S.No']}: "${lecture.titleArabic}" → "${title}"`);

    if (!DRY_RUN) {
      try {
        await Lecture.updateOne({ _id: lecture._id }, { $set: { titleArabic: title } });
        stats.updated++;
      } catch (err) {
        stats.errors.push({ row: row['S.No'], error: err.message });
      }
    } else {
      stats.updated++;
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  Batch:          ${BATCH_NAME}`);
  console.log(`  Processed:      ${stats.processed}`);
  console.log(`  Updated:        ${stats.updated}`);
  console.log(`  Already correct: ${stats.correct}`);
  console.log(`  Not found:      ${stats.notFound}`);
  console.log(`  Errors:         ${stats.errors.length}`);

  if (DRY_RUN) {
    console.log('\n  ⚠️  DRY RUN - No changes made.');
  }

  console.log('═'.repeat(60));
  await mongoose.connection.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
