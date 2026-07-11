#!/usr/bin/env node
/**
 * Archive empty OCI orphans from full-oci-audit report
 * Copies to archive bucket, waits for completion, then deletes from source
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const oci = require(path.join(__dirname, '..', 'config', 'oci'));

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const REPORT_FILE = args.find(a => a.endsWith('.json'));

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')
    ? args[idx + 1]
    : null;
}

const ARCHIVE_BUCKET = getArg('--archive-bucket') || 'wurud-archive';

if (!REPORT_FILE) {
  console.log(`
Usage: node scripts/archive-empty-orphans.js <oci-audit.json> [options]

Options:
  --apply                  Actually archive files (default is dry-run)
  --archive-bucket <name>  Target bucket (default: wurud-archive)
`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForWorkRequest(client, workRequestId, maxWaitMs = 60000) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await client.getWorkRequest({ workRequestId });
      const status = response.workRequest.status;

      if (status === 'COMPLETED') {
        return { success: true };
      } else if (status === 'FAILED' || status === 'CANCELED') {
        throw new Error(`Work request ${status}`);
      }

      await sleep(1000);
    } catch (error) {
      if (error.statusCode === 404) {
        return { success: true };
      }
      throw error;
    }
  }

  throw new Error('Work request timeout');
}

async function main() {
  console.log('='.repeat(60));
  console.log('  ARCHIVE EMPTY OCI ORPHANS');
  console.log('='.repeat(60));
  console.log(`
  Mode:           ${DRY_RUN ? 'DRY RUN' : 'LIVE'}
  Archive Bucket: ${ARCHIVE_BUCKET}
`);

  const report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
  const orphans = report.categories?.emptyOrphans || [];

  if (orphans.length === 0) {
    console.log('[INFO] No empty orphans to archive.');
    process.exit(0);
  }

  console.log(`[INFO] Found ${orphans.length} empty orphans to archive\n`);

  const client = oci.client;
  const namespace = oci.getNamespace();
  const sourceBucket = oci.getBucketName();

  console.log(`[INFO] Source: ${sourceBucket}`);
  console.log(`[INFO] Archive: ${ARCHIVE_BUCKET}\n`);

  // Verify archive bucket exists
  if (!DRY_RUN) {
    try {
      await client.listObjects({
        namespaceName: namespace,
        bucketName: ARCHIVE_BUCKET,
        limit: 1
      });
      console.log('[INFO] Archive bucket verified\n');
    } catch (error) {
      if (error.statusCode === 404) {
        console.error(`[ERROR] Archive bucket "${ARCHIVE_BUCKET}" does not exist.`);
        process.exit(1);
      }
      throw error;
    }
  }

  console.log('-'.repeat(60));

  let archived = 0, errors = 0;

  for (let i = 0; i < orphans.length; i++) {
    const filename = orphans[i].filename;
    const progress = `[${i + 1}/${orphans.length}]`;

    if (DRY_RUN) {
      console.log(`${progress} [DRY-RUN] Would archive: ${filename}`);
      archived++;
      continue;
    }

    try {
      // Copy to archive bucket
      const copyResponse = await client.copyObject({
        namespaceName: namespace,
        bucketName: sourceBucket,
        copyObjectDetails: {
          sourceObjectName: filename,
          destinationRegion: oci.getRegion(),
          destinationNamespace: namespace,
          destinationBucket: ARCHIVE_BUCKET,
          destinationObjectName: filename
        }
      });

      // Wait for copy to complete
      if (copyResponse.opcWorkRequestId) {
        await waitForWorkRequest(client, copyResponse.opcWorkRequestId);
      }

      // Delete from source
      await client.deleteObject({
        namespaceName: namespace,
        bucketName: sourceBucket,
        objectName: filename
      });

      console.log(`${progress} [ARCHIVED] ${filename}`);
      archived++;

    } catch (error) {
      console.log(`${progress} [ERROR] ${filename}: ${error.message}`);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  console.log(`
  Total:    ${orphans.length}
  Archived: ${archived}
  Errors:   ${errors}
`);

  if (DRY_RUN) {
    console.log('[INFO] DRY RUN - use --apply to archive.\n');
  } else if (errors === 0) {
    console.log('[SUCCESS] All files archived.\n');
  }
}

main().catch(err => {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
});
