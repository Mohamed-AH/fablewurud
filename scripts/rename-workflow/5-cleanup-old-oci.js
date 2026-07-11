#!/usr/bin/env node
/**
 * Step 5: Cleanup Old OCI Files (runs locally)
 *
 * Deletes old OCI files after MongoDB commit is confirmed.
 * Only run this AFTER Step 4 completes successfully.
 *
 * Usage:
 *   node scripts/rename-workflow/5-cleanup-old-oci.js --input renames-committed.json --dry-run
 *   node scripts/rename-workflow/5-cleanup-old-oci.js --input renames-committed.json --apply
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const oci = require(path.join(__dirname, '..', '..', 'config', 'oci'));

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')
    ? args[idx + 1]
    : null;
}

const INPUT_FILE = getArg('--input');
const DRY_RUN = !args.includes('--apply');

if (!INPUT_FILE) {
  console.log(`
Usage: node scripts/rename-workflow/5-cleanup-old-oci.js --input <file> [options]

Options:
  --input <file>    Renames-committed.json from Step 4 (required)
  --apply           Actually delete old files (default is dry-run)

SAFETY: Default is dry-run. Use --apply to execute.
IMPORTANT: Only run this after Step 4 completes successfully.
`);
  process.exit(1);
}

const PROGRESS_FILE = INPUT_FILE.replace('.json', '-cleanup-progress.json');

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return {
    startedAt: new Date().toISOString(),
    deleted: [],
    failed: [],
    skipped: []
  };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function main() {
  if (!oci.isConfigured()) {
    console.error('[ERROR] OCI credentials not configured.');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('  STEP 5: CLEANUP OLD OCI FILES');
  console.log('='.repeat(60));
  console.log(`
  Mode:  ${DRY_RUN ? 'DRY RUN' : 'LIVE (DELETING)'}
  Input: ${INPUT_FILE}
`);

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`[ERROR] Input file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  const committedData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));

  if (!committedData.renames || committedData.renames.length === 0) {
    console.log('[INFO] No files to clean up.\n');
    process.exit(0);
  }

  console.log(`[INFO] ${committedData.renames.length} old files to delete\n`);

  const progress = loadProgress();
  const alreadyDeleted = new Set(progress.deleted);
  const pending = committedData.renames.filter(r => !alreadyDeleted.has(r.filename));

  if (pending.length === 0) {
    console.log('[INFO] All already cleaned up.\n');
    process.exit(0);
  }

  const client = oci.client;
  if (!client) {
    console.error('[ERROR] OCI client not initialized');
    process.exit(1);
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  // Dry-run
  if (DRY_RUN) {
    console.log('-'.repeat(60));
    console.log('  DRY RUN: Files that would be deleted');
    console.log('-'.repeat(60));

    for (let i = 0; i < Math.min(pending.length, 20); i++) {
      const r = pending[i];
      console.log(`  [${i + 1}] ${r.filename}`);
    }

    if (pending.length > 20) {
      console.log(`  ... and ${pending.length - 20} more`);
    }

    console.log(`\n[DRY RUN] Would delete ${pending.length} files`);
    console.log(`\nTo execute: node scripts/rename-workflow/5-cleanup-old-oci.js --input ${INPUT_FILE} --apply\n`);
    process.exit(0);
  }

  // LIVE EXECUTION
  console.log('='.repeat(60));
  console.log('  DELETING OLD OCI FILES (LIVE)');
  console.log('='.repeat(60));
  console.log('');

  let deleteCount = 0;
  let errorCount = 0;
  let skipCount = 0;

  for (let i = 0; i < pending.length; i++) {
    const r = pending[i];
    const progressStr = `[${i + 1}/${pending.length}]`;

    try {
      await client.deleteObject({
        namespaceName: namespace,
        bucketName: bucketName,
        objectName: r.filename
      });

      progress.deleted.push(r.filename);
      saveProgress(progress);

      console.log(`${progressStr} [DELETED] ${r.filename}`);
      deleteCount++;

    } catch (error) {
      if (error.statusCode === 404) {
        console.log(`${progressStr} [ALREADY GONE] ${r.filename}`);
        progress.skipped.push(r.filename);
        saveProgress(progress);
        skipCount++;
      } else {
        console.log(`${progressStr} [ERROR] ${r.filename}: ${error.message}`);
        progress.failed.push({
          filename: r.filename,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        saveProgress(progress);
        errorCount++;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('  CLEANUP SUMMARY');
  console.log('='.repeat(60));
  console.log(`
  Deleted:      ${deleteCount}
  Already gone: ${skipCount}
  Errors:       ${errorCount}
`);

  if (errorCount === 0) {
    console.log('[SUCCESS] Cleanup complete.\n');
    console.log('Rename workflow finished. You can now:');
    console.log('  1. Run audit script to verify sync');
    console.log('  2. Delete progress files when satisfied\n');
  } else {
    console.log('[WARNING] Some files could not be deleted.');
    console.log('Review the errors and re-run if needed.\n');
  }
}

main().catch(err => {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
});
