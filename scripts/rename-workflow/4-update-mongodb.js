#!/usr/bin/env node
/**
 * Step 4: Update MongoDB (runs on Google VM)
 *
 * Updates MongoDB audioFileName records based on successful local renames.
 * This is the COMMIT POINT - after this, the renames are permanent.
 *
 * Usage:
 *   node scripts/rename-workflow/4-update-mongodb.js --input renames-ready.json --dry-run
 *   node scripts/rename-workflow/4-update-mongodb.js --input renames-ready.json --apply
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

const INPUT_FILE = getArg('--input');
const OUTPUT_FILE = getArg('--output') || 'renames-committed.json';
const DRY_RUN = !args.includes('--apply');

if (!INPUT_FILE) {
  console.log(`
Usage: node scripts/rename-workflow/4-update-mongodb.js --input <file> [options]

Options:
  --input <file>    Renames-ready.json from Step 3 (required)
  --output <file>   Output file (default: renames-committed.json)
  --apply           Actually update MongoDB (default is dry-run)

SAFETY: Default is dry-run. Use --apply to execute.
`);
  process.exit(1);
}

const PROGRESS_FILE = INPUT_FILE.replace('.json', '-db-progress.json');

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return {
    startedAt: new Date().toISOString(),
    committed: [],
    failed: []
  };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('[ERROR] MONGODB_URI environment variable is missing.');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('  STEP 4: UPDATE MONGODB');
  console.log('='.repeat(60));
  console.log(`
  Mode:   ${DRY_RUN ? 'DRY RUN' : 'LIVE (COMMIT POINT)'}
  Input:  ${INPUT_FILE}
  Output: ${OUTPUT_FILE}
`);

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`[ERROR] Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const readyData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));

  if (!readyData.renames || readyData.renames.length === 0) {
    console.log('[INFO] No renames to commit.\n');
    process.exit(0);
  }

  console.log(`[INFO] ${readyData.renames.length} renames to commit\n`);

  const progress = loadProgress();
  const alreadyCommitted = new Set(progress.committed.map(c => c.mongoId));
  const pending = readyData.renames.filter(r => !alreadyCommitted.has(r.mongoId));

  if (pending.length === 0) {
    console.log('[INFO] All already committed.\n');
    process.exit(0);
  }

  console.log(`[INFO] ${pending.length} pending commits\n`);

  // Connect to MongoDB
  console.log('[INFO] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[INFO] Connected\n');

  // Dry-run verification
  if (DRY_RUN) {
    console.log('-'.repeat(60));
    console.log('  DRY RUN: Verifying records exist');
    console.log('-'.repeat(60));

    let allOk = true;
    for (let i = 0; i < Math.min(pending.length, 20); i++) {
      const r = pending[i];
      const lecture = await Lecture.findById(r.mongoId, { audioFileName: 1 }).lean();

      if (!lecture) {
        console.log(`  [${i + 1}] ${r.mongoId} - NOT FOUND`);
        allOk = false;
      } else if (lecture.audioFileName !== r.filename) {
        console.log(`  [${i + 1}] ${r.mongoId} - MISMATCH`);
        console.log(`       Expected: ${r.filename}`);
        console.log(`       Found:    ${lecture.audioFileName}`);
        allOk = false;
      } else {
        console.log(`  [${i + 1}] ${r.mongoId} - OK`);
      }
    }

    if (pending.length > 20) {
      console.log(`  ... and ${pending.length - 20} more`);
    }

    console.log(`\n[DRY RUN] ${allOk ? 'PASSED' : 'ISSUES FOUND'}`);
    console.log(`\nTo execute: node scripts/rename-workflow/4-update-mongodb.js --input ${INPUT_FILE} --apply\n`);

    await mongoose.disconnect();
    process.exit(0);
  }

  // LIVE EXECUTION
  console.log('='.repeat(60));
  console.log('  COMMITTING TO MONGODB (LIVE)');
  console.log('='.repeat(60));
  console.log('\n  [WARN] This is the commit point. Changes are permanent.\n');

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < pending.length; i++) {
    const r = pending[i];
    const progressStr = `[${i + 1}/${pending.length}]`;

    console.log(`${progressStr} ${r.mongoId}`);
    console.log(`      ${r.filename} -> ${r.newFilename}`);

    try {
      // Update MongoDB
      const updateResult = await Lecture.findByIdAndUpdate(
        r.mongoId,
        { $set: { audioFileName: r.newFilename } },
        { new: true }
      ).lean();

      if (!updateResult) {
        throw new Error('Record not found');
      }

      // Verify update
      const verify = await Lecture.findById(r.mongoId, { audioFileName: 1 }).lean();
      if (!verify || verify.audioFileName !== r.newFilename) {
        throw new Error('Verification failed');
      }

      // Record commit
      progress.committed.push({
        mongoId: r.mongoId,
        filename: r.filename,
        newFilename: r.newFilename,
        committedAt: new Date().toISOString()
      });
      saveProgress(progress);

      console.log('      [COMMITTED]');
      successCount++;

    } catch (error) {
      console.log(`      [ERROR] ${error.message}`);

      progress.failed.push({
        mongoId: r.mongoId,
        filename: r.filename,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      saveProgress(progress);

      errorCount++;
      console.log('\n[STOPPED] Halting on first error.\n');
      break;
    }
  }

  // Write output for Step 5
  const committedData = {
    timestamp: new Date().toISOString(),
    inputFile: INPUT_FILE,
    summary: {
      total: pending.length,
      committed: successCount,
      failed: errorCount
    },
    renames: progress.committed
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(committedData, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  console.log(`
  Committed: ${successCount}
  Failed:    ${errorCount}

  Output: ${OUTPUT_FILE}
`);

  if (errorCount === 0 && successCount > 0) {
    console.log('[SUCCESS] All records committed.\n');
    console.log('Next steps:');
    console.log(`  1. Copy ${OUTPUT_FILE} to local machine`);
    console.log(`  2. Run: node scripts/rename-workflow/5-cleanup-old-oci.js --input ${OUTPUT_FILE} --apply\n`);
  }

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(`[ERROR] ${err.message}`);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exit(1);
});
