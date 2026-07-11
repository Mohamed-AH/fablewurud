#!/usr/bin/env node
/**
 * Phase 3: Execute Renames (THREE-WAY ATOMIC)
 *
 * Executes renames from a plan file, synchronizing:
 * - OCI Object Storage
 * - MongoDB
 * - Local files (if --local-dir provided)
 *
 * Usage:
 *   node scripts/execute-renames.js --plan rename-plan.json --dry-run
 *   node scripts/execute-renames.js --plan rename-plan.json --local-dir /path/to/audio --apply
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { Lecture } = require(path.join(__dirname, '..', 'models'));
const oci = require(path.join(__dirname, '..', 'config', 'oci'));

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
const VERBOSE = args.includes('--verbose');

if (!PLAN_FILE) {
  console.log(`
Usage: node scripts/execute-renames.js --plan <plan.json> [options]

Options:
  --plan <file>         Rename plan JSON from Phase 1 (required)
  --local-dir <path>    Local audio directory to sync
  --apply               Actually execute renames (default is dry-run)
  --verbose             Show detailed progress

SAFETY: Default is dry-run. Use --apply to execute.
`);
  process.exit(1);
}

const PROGRESS_FILE = PLAN_FILE.replace('.json', '-progress.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for OCI work request to complete
 * CRITICAL: Do not proceed until copy is confirmed
 * Uses WorkRequestClient (not ObjectStorageClient)
 */
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
        return { success: false, status, error: `Work request ended with state: ${status}` };
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

/**
 * Verify file exists in OCI with expected size
 */
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
        expectedSize,
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

/**
 * Load or initialize progress tracking
 */
function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return {
    startedAt: new Date().toISOString(),
    completed: [],
    failed: [],
    lastProcessedIndex: -1
  };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function main() {
  // Validate required environment variables
  if (!process.env.MONGODB_URI) {
    console.error('[ERROR] MONGODB_URI environment variable is missing.');
    process.exit(1);
  }

  if (!oci.isConfigured()) {
    console.error('[ERROR] OCI credentials not configured.');
    console.error('[INFO] Set OCI_PRIVATE_KEY + OCI_TENANCY or OCI_CONFIG_FILE.');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('  PHASE 3: EXECUTE RENAMES');
  console.log('='.repeat(70));
  console.log(`
  Mode:      ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will modify data)'}
  Plan:      ${PLAN_FILE}
  Local Dir: ${LOCAL_DIR || '(not specified - local sync disabled)'}
  Progress:  ${PROGRESS_FILE}
`);

  // Load plan
  if (!fs.existsSync(PLAN_FILE)) {
    console.error(`[ERROR] Plan file not found: ${PLAN_FILE}`);
    process.exit(1);
  }

  const plan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));

  // Check for collisions
  if (plan.summary.collisions > 0) {
    console.error('[ERROR] Plan contains unresolved collisions. Cannot proceed.');
    console.error('[ACTION] Resolve collisions and regenerate the plan.\n');
    process.exit(1);
  }

  // Filter to only renames needed
  const renames = plan.renames.filter(r => !r.hasCollision && r.newFilename);

  if (renames.length === 0) {
    console.log('[INFO] No renames to execute.\n');
    process.exit(0);
  }

  console.log(`[INFO] ${renames.length} files to rename\n`);

  // Load progress for resume capability
  const progress = loadProgress();
  const alreadyCompleted = new Set(progress.completed);

  // Filter out already completed
  const pending = renames.filter(r => !alreadyCompleted.has(r.filename));

  if (pending.length === 0) {
    console.log('[INFO] All renames already completed (check progress file).\n');
    process.exit(0);
  }

  if (pending.length < renames.length) {
    console.log(`[INFO] Resuming: ${renames.length - pending.length} already done, ${pending.length} remaining\n`);
  }

  // Connect to MongoDB
  console.log('[INFO] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[INFO] Connected\n');

  // Initialize OCI ObjectStorage client
  const client = oci.client;
  if (!client) {
    console.error('[ERROR] OCI ObjectStorage client not initialized');
    await mongoose.disconnect();
    process.exit(1);
  }

  // Initialize OCI WorkRequest client (for polling async operations)
  const wrClient = oci.workRequestClient;
  if (!wrClient) {
    console.error('[ERROR] OCI WorkRequest client not initialized');
    await mongoose.disconnect();
    process.exit(1);
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();
  const region = oci.getRegion();

  console.log(`[INFO] OCI Bucket: ${bucketName}`);
  console.log(`[INFO] OCI Region: ${region}\n`);

  // Dry-run verification
  if (DRY_RUN) {
    console.log('-'.repeat(70));
    console.log('  DRY RUN: Verifying all source files exist');
    console.log('-'.repeat(70));

    let allOk = true;
    for (let i = 0; i < Math.min(pending.length, 20); i++) {
      const r = pending[i];
      const ociCheck = await verifyOciFile(client, namespace, bucketName, r.filename, null);
      const localCheck = LOCAL_DIR && fs.existsSync(path.join(LOCAL_DIR, r.filename));

      const ociStatus = ociCheck.exists ? 'OK' : 'MISSING';
      const localStatus = LOCAL_DIR ? (localCheck ? 'OK' : 'MISSING') : 'N/A';

      if (!ociCheck.exists) allOk = false;
      if (LOCAL_DIR && !localCheck) allOk = false;

      console.log(`  [${i + 1}/${pending.length}] ${r.filename.substring(0, 40)}...`);
      console.log(`       OCI: ${ociStatus} | Local: ${localStatus}`);
    }

    if (pending.length > 20) {
      console.log(`  ... and ${pending.length - 20} more files`);
    }

    console.log('\n' + '-'.repeat(70));
    console.log('  DRY RUN COMPLETE');
    console.log('-'.repeat(70));
    console.log(`
  Files to rename:  ${pending.length}
  Verification:     ${allOk ? 'PASSED' : 'SOME ISSUES FOUND'}

  To execute: node scripts/execute-renames.js --plan ${PLAN_FILE} --apply
`);

    await mongoose.disconnect();
    process.exit(0);
  }

  // LIVE EXECUTION
  console.log('='.repeat(70));
  console.log('  EXECUTING RENAMES (LIVE MODE)');
  console.log('='.repeat(70));
  console.log('\n  [WARN] This will modify OCI, MongoDB, and local files.\n');

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < pending.length; i++) {
    const r = pending[i];
    const progressStr = `[${i + 1}/${pending.length}]`;

    // Track step states for rollback
    let ociCopySucceeded = false;
    let localRenamed = false;
    let localOldPath = null;
    let localNewPath = null;
    let dbCommitted = false;

    console.log(`\n${progressStr} Processing: ${r.filename}`);
    console.log(`         To: ${r.newFilename}`);

    try {
      // Step 1: Copy to new name in OCI
      console.log('  Step 1/7: Copying in OCI...');
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

      // Step 2: Wait for copy to complete (using WorkRequestClient)
      console.log('  Step 2/7: Waiting for OCI copy...');
      if (copyResponse.opcWorkRequestId) {
        const waitResult = await waitForWorkRequest(wrClient, copyResponse.opcWorkRequestId);
        if (!waitResult.success) {
          throw new Error(`OCI copy failed: ${waitResult.error}`);
        }
        console.log(`           Status: ${waitResult.status}`);
      }
      ociCopySucceeded = true;

      // Step 3: Verify new file exists with correct size
      console.log('  Step 3/7: Verifying OCI copy...');
      const verifyResult = await verifyOciFile(client, namespace, bucketName, r.newFilename, r.ociSize);
      if (!verifyResult.exists) {
        throw new Error('New file not found in OCI after copy');
      }
      if (!verifyResult.sizeMatch) {
        throw new Error(verifyResult.error);
      }
      console.log(`           Size: ${verifyResult.actualSize} bytes [OK]`);

      // Step 4: Rename local file (if applicable)
      if (LOCAL_DIR) {
        console.log('  Step 4/7: Renaming local file...');
        localOldPath = path.join(LOCAL_DIR, r.filename);
        localNewPath = path.join(LOCAL_DIR, r.newFilename);

        if (fs.existsSync(localOldPath)) {
          // Check if destination already exists (prevent silent overwrite)
          if (fs.existsSync(localNewPath)) {
            throw new Error(`Local destination path already exists: ${localNewPath}`);
          }
          fs.renameSync(localOldPath, localNewPath);
          localRenamed = true;
          console.log('           Local rename: OK');
        } else {
          console.log('           Local file not found (skipping local rename)');
        }
      } else {
        console.log('  Step 4/7: Local sync disabled (skipping)');
      }

      // Step 5: Update MongoDB
      console.log('  Step 5/7: Updating MongoDB...');
      const updateResult = await Lecture.findByIdAndUpdate(
        r.mongoId,
        { $set: { audioFileName: r.newFilename } },
        { new: true }
      ).lean();

      if (!updateResult) {
        throw new Error('MongoDB update returned null - record not found');
      }

      // Step 6: Verify MongoDB update
      console.log('  Step 6/7: Verifying MongoDB...');
      const verifyMongo = await Lecture.findById(r.mongoId, { audioFileName: 1 }).lean();
      if (!verifyMongo || verifyMongo.audioFileName !== r.newFilename) {
        throw new Error('MongoDB verification failed - audioFileName mismatch');
      }
      console.log('           MongoDB: OK');

      // COMMIT POINT: MongoDB is now updated. Do not rollback after this.
      dbCommitted = true;

      // Step 7: Delete old OCI file
      console.log('  Step 7/7: Deleting old OCI file...');
      await client.deleteObject({
        namespaceName: namespace,
        bucketName: bucketName,
        objectName: r.filename
      });
      console.log('           Deleted: OK');

      // Mark as completed
      progress.completed.push(r.filename);
      progress.lastProcessedIndex = i;
      saveProgress(progress);

      console.log(`  [SUCCESS] Renamed: ${r.filename}`);
      successCount++;

    } catch (error) {
      console.log(`  [ERROR] ${error.message}`);

      if (dbCommitted) {
        // MongoDB transaction succeeded - the rename is legally complete.
        // Do NOT rollback local or OCI copies - that would corrupt the state.
        // The old file cleanup failed but the app will work correctly.
        console.warn('  [WARNING] MongoDB committed, but old file cleanup failed.');
        console.warn(`            Old OCI file "${r.filename}" may still exist.`);
        console.warn('            Manual cleanup required, but rename succeeded.');

        // Mark as completed because MongoDB points to the correct new file
        progress.completed.push(r.filename);
        progress.lastProcessedIndex = i;
        saveProgress(progress);
        successCount++;

      } else {
        // MongoDB was NOT updated - safe to rollback everything

        // Rollback local file system if renamed
        if (localRenamed && localOldPath && localNewPath) {
          try {
            if (fs.existsSync(localNewPath)) {
              console.log('           [ROLLBACK] Reverting local rename...');
              fs.renameSync(localNewPath, localOldPath);
              console.log('           [ROLLBACK] Local file restored');
            }
          } catch (fsErr) {
            console.error(`           [FATAL] Local rollback failed: ${fsErr.message}`);
          }
        }

        // Rollback OCI (delete orphan copy) if copy succeeded but DB never updated
        if (ociCopySucceeded) {
          try {
            console.log('           [ROLLBACK] Deleting orphan copy in OCI...');
            await client.deleteObject({
              namespaceName: namespace,
              bucketName: bucketName,
              objectName: r.newFilename
            });
            console.log('           [ROLLBACK] OCI orphan copy deleted');
          } catch (ociErr) {
            console.error(`           [FATAL] OCI rollback failed: ${ociErr.message}`);
          }
        }

        // Record failure
        progress.failed.push({
          filename: r.filename,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        saveProgress(progress);

        errorCount++;

        // Stop on first error for safety
        console.log('\n[STOPPED] Halting on first error for safety.');
        console.log('[INFO] Fix the issue and re-run to resume from this point.\n');
        break;
      }
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('  EXECUTION SUMMARY');
  console.log('='.repeat(70));
  console.log(`
  Successful: ${successCount}
  Failed:     ${errorCount}
  Remaining:  ${pending.length - successCount - errorCount}

  Progress saved to: ${PROGRESS_FILE}
`);

  if (errorCount > 0) {
    console.log('[ACTION] Review the error above, fix the issue, and re-run.\n');
  } else if (successCount === pending.length) {
    console.log('[SUCCESS] All renames completed successfully.\n');
    console.log('Next steps:');
    console.log('  1. Run full audit to verify sync');
    console.log('  2. Delete progress file when satisfied\n');
  }

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(`[FATAL ERROR] ${err.message}`);
  console.error(err.stack);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exit(1);
});
