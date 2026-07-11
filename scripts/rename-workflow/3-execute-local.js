#!/usr/bin/env node
/**
 * Step 3: Execute Local Renames (runs locally)
 *
 * Performs OCI copy/verify and local file renames.
 * Does NOT touch MongoDB - outputs a file for Step 4.
 * Does NOT delete old OCI files - that's Step 5 after DB commit.
 *
 * Usage:
 *   node scripts/rename-workflow/3-execute-local.js --plan rename-plan.json --dry-run
 *   node scripts/rename-workflow/3-execute-local.js --plan rename-plan.json --local-dir /path/to/audio --apply
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

const PLAN_FILE = getArg('--plan');
const LOCAL_DIR = getArg('--local-dir');
const DRY_RUN = !args.includes('--apply');
const OUTPUT_FILE = getArg('--output') || 'renames-ready.json';

if (!PLAN_FILE) {
  console.log(`
Usage: node scripts/rename-workflow/3-execute-local.js --plan <file> [options]

Options:
  --plan <file>         Rename plan from Step 2 (required)
  --local-dir <path>    Local audio directory to sync
  --output <file>       Output file (default: renames-ready.json)
  --apply               Actually execute (default is dry-run)

SAFETY: Default is dry-run. Use --apply to execute.
This script does NOT delete old files - that happens in Step 5.
`);
  process.exit(1);
}

const PROGRESS_FILE = PLAN_FILE.replace('.json', '-local-progress.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForWorkRequest(wrClient, workRequestId, maxWaitMs = 120000) {
  const startTime = Date.now();
  let lastStatus = '';

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await wrClient.getWorkRequest({ workRequestId });
      const status = (response.workRequest.status || '').toUpperCase();
      lastStatus = status;

      if (status === 'SUCCEEDED') {
        return { success: true, status };
      } else if (status === 'FAILED' || status === 'CANCELED') {
        return { success: false, status, error: `Work request ended: ${status}` };
      }

      await sleep(1000);
    } catch (error) {
      if (error.statusCode === 404) {
        return { success: true, status: 'SUCCEEDED_NO_RECORD' };
      }
      throw error;
    }
  }

  return { success: false, status: lastStatus, error: 'Work request timeout' };
}

async function verifyOciFile(client, namespace, bucket, filename, expectedSize) {
  try {
    const response = await client.headObject({
      namespaceName: namespace,
      bucketName: bucket,
      objectName: filename
    });

    const actualSize = parseInt(response.contentLength, 10);

    if (expectedSize !== null && actualSize !== expectedSize) {
      return {
        exists: true,
        sizeMatch: false,
        actualSize,
        error: `Size mismatch: expected ${expectedSize}, got ${actualSize}`
      };
    }

    return { exists: true, sizeMatch: true, actualSize };
  } catch (error) {
    if (error.statusCode === 404) {
      return { exists: false, error: 'File not found' };
    }
    throw error;
  }
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return {
    startedAt: new Date().toISOString(),
    completed: [],
    failed: []
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
  console.log('  STEP 3: EXECUTE LOCAL RENAMES');
  console.log('='.repeat(60));
  console.log(`
  Mode:      ${DRY_RUN ? 'DRY RUN' : 'LIVE'}
  Plan:      ${PLAN_FILE}
  Local Dir: ${LOCAL_DIR || '(not specified)'}
  Output:    ${OUTPUT_FILE}
`);

  if (!fs.existsSync(PLAN_FILE)) {
    console.error(`[ERROR] Plan file not found: ${PLAN_FILE}`);
    process.exit(1);
  }

  const plan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));

  if (plan.summary.collisions > 0) {
    console.error('[ERROR] Plan has unresolved collisions.');
    process.exit(1);
  }

  const renames = plan.renames.filter(r => !r.hasCollision && r.newFilename);

  if (renames.length === 0) {
    console.log('[INFO] No renames to execute.\n');
    process.exit(0);
  }

  const progress = loadProgress();
  const alreadyCompleted = new Set(progress.completed.map(c => c.filename));
  const pending = renames.filter(r => !alreadyCompleted.has(r.filename));

  console.log(`[INFO] ${renames.length} total, ${pending.length} pending\n`);

  if (pending.length === 0) {
    console.log('[INFO] All already completed.\n');
    process.exit(0);
  }

  const client = oci.client;
  const wrClient = oci.workRequestClient;

  if (!client || !wrClient) {
    console.error('[ERROR] OCI clients not initialized');
    process.exit(1);
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();
  const region = oci.getRegion();

  // Dry-run verification
  if (DRY_RUN) {
    console.log('-'.repeat(60));
    console.log('  DRY RUN: Verifying files');
    console.log('-'.repeat(60));

    let allOk = true;
    for (let i = 0; i < Math.min(pending.length, 20); i++) {
      const r = pending[i];
      const ociCheck = await verifyOciFile(client, namespace, bucketName, r.filename, null);
      const localCheck = LOCAL_DIR && fs.existsSync(path.join(LOCAL_DIR, r.filename));

      const ociStatus = ociCheck.exists ? 'OK' : 'MISSING';
      const localStatus = LOCAL_DIR ? (localCheck ? 'OK' : 'MISSING') : 'N/A';

      if (!ociCheck.exists) allOk = false;

      console.log(`  [${i + 1}/${pending.length}] ${r.filename.substring(0, 40)}...`);
      console.log(`       OCI: ${ociStatus} | Local: ${localStatus}`);
    }

    if (pending.length > 20) {
      console.log(`  ... and ${pending.length - 20} more`);
    }

    console.log(`\n[DRY RUN COMPLETE] ${allOk ? 'PASSED' : 'SOME ISSUES'}`);
    console.log(`\nTo execute: node scripts/rename-workflow/3-execute-local.js --plan ${PLAN_FILE} --apply\n`);
    process.exit(0);
  }

  // LIVE EXECUTION
  console.log('='.repeat(60));
  console.log('  EXECUTING (LIVE)');
  console.log('='.repeat(60));
  console.log('\n  [NOTE] Old OCI files are NOT deleted in this step.\n');

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < pending.length; i++) {
    const r = pending[i];
    const progressStr = `[${i + 1}/${pending.length}]`;

    let ociCopySucceeded = false;
    let localRenamed = false;
    let localOldPath = null;
    let localNewPath = null;

    console.log(`\n${progressStr} ${r.filename}`);
    console.log(`      -> ${r.newFilename}`);

    try {
      // Step 1: Copy in OCI
      console.log('  OCI copy...');
      const copyResponse = await client.copyObject({
        namespaceName: namespace,
        bucketName: bucketName,
        copyObjectDetails: {
          sourceObjectName: r.filename,
          destinationRegion: region,
          destinationNamespace: namespace,
          destinationBucket: bucketName,
          destinationObjectName: r.newFilename
        }
      });

      // Step 2: Wait for copy
      if (copyResponse.opcWorkRequestId) {
        const waitResult = await waitForWorkRequest(wrClient, copyResponse.opcWorkRequestId);
        if (!waitResult.success) {
          throw new Error(`OCI copy failed: ${waitResult.error}`);
        }
      }
      ociCopySucceeded = true;

      // Step 3: Verify copy
      const verifyResult = await verifyOciFile(client, namespace, bucketName, r.newFilename, r.ociSize);
      if (!verifyResult.exists) {
        throw new Error('New OCI file not found after copy');
      }
      if (!verifyResult.sizeMatch) {
        throw new Error(verifyResult.error);
      }
      console.log(`  OCI verified: ${verifyResult.actualSize} bytes`);

      // Step 4: Local rename
      if (LOCAL_DIR) {
        localOldPath = path.join(LOCAL_DIR, r.filename);
        localNewPath = path.join(LOCAL_DIR, r.newFilename);

        if (fs.existsSync(localOldPath)) {
          if (fs.existsSync(localNewPath)) {
            throw new Error(`Local destination exists: ${localNewPath}`);
          }
          fs.renameSync(localOldPath, localNewPath);
          localRenamed = true;
          console.log('  Local renamed');
        } else {
          console.log('  Local file not found (skipped)');
        }
      }

      // Record success
      progress.completed.push({
        filename: r.filename,
        newFilename: r.newFilename,
        mongoId: r.mongoId,
        ociSize: verifyResult.actualSize,
        localRenamed: localRenamed,
        completedAt: new Date().toISOString()
      });
      saveProgress(progress);

      console.log('  [OK]');
      successCount++;

    } catch (error) {
      console.log(`  [ERROR] ${error.message}`);

      // Rollback local
      if (localRenamed && localOldPath && localNewPath) {
        try {
          if (fs.existsSync(localNewPath)) {
            fs.renameSync(localNewPath, localOldPath);
            console.log('  [ROLLBACK] Local restored');
          }
        } catch (fsErr) {
          console.error(`  [FATAL] Local rollback failed: ${fsErr.message}`);
        }
      }

      // Rollback OCI copy
      if (ociCopySucceeded) {
        try {
          await client.deleteObject({
            namespaceName: namespace,
            bucketName: bucketName,
            objectName: r.newFilename
          });
          console.log('  [ROLLBACK] OCI copy deleted');
        } catch (ociErr) {
          console.error(`  [FATAL] OCI rollback failed: ${ociErr.message}`);
        }
      }

      progress.failed.push({
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

  // Write output for Step 4
  const readyData = {
    timestamp: new Date().toISOString(),
    planFile: PLAN_FILE,
    summary: {
      total: pending.length,
      successful: successCount,
      failed: errorCount
    },
    renames: progress.completed
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(readyData, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  console.log(`
  Successful: ${successCount}
  Failed:     ${errorCount}

  Output: ${OUTPUT_FILE}
`);

  if (errorCount === 0 && successCount > 0) {
    console.log('Next steps:');
    console.log(`  1. Copy ${OUTPUT_FILE} to Google VM`);
    console.log(`  2. Run: node scripts/rename-workflow/4-update-mongodb.js --input ${OUTPUT_FILE}\n`);
  }
}

main().catch(err => {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
});
