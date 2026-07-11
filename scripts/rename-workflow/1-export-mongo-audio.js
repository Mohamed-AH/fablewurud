#!/usr/bin/env node
/**
 * Step 1: Export MongoDB Audio Records (runs on Google VM)
 *
 * Exports all lecture audioFileName records for use in rename planning.
 * Transfer the output file to your local machine for Step 2.
 *
 * Usage:
 *   node scripts/rename-workflow/1-export-mongo-audio.js --output mongo-export.json
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { Lecture } = require(path.join(__dirname, '..', '..', 'models'));

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')
    ? args[idx + 1]
    : null;
}

const OUTPUT_FILE = getArg('--output') || 'mongo-export.json';

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('[ERROR] MONGODB_URI environment variable is missing.');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('  STEP 1: EXPORT MONGODB AUDIO RECORDS');
  console.log('='.repeat(60));
  console.log(`\n  Output: ${OUTPUT_FILE}\n`);

  console.log('[INFO] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[INFO] Connected\n');

  console.log('[INFO] Exporting lectures with audioFileName...');

  const lectures = await Lecture.find(
    { audioFileName: { $ne: null } },
    { audioFileName: 1, _id: 1, titleArabic: 1 }
  ).lean();

  const exportData = {
    exportedAt: new Date().toISOString(),
    source: 'mongodb',
    totalRecords: lectures.length,
    records: lectures.map(l => ({
      mongoId: l._id.toString(),
      audioFileName: l.audioFileName,
      title: l.titleArabic
    }))
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(exportData, null, 2));

  console.log(`[INFO] Exported ${lectures.length} records\n`);
  console.log(`[SUCCESS] Saved to: ${OUTPUT_FILE}\n`);

  console.log('Next step:');
  console.log('  1. Copy this file to your local machine');
  console.log('  2. Run: node scripts/rename-workflow/2-plan-renames.js --mongo-export mongo-export.json\n');

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(`[ERROR] ${err.message}`);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exit(1);
});
