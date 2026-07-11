#!/usr/bin/env node
/**
 * Delete OCI Orphan Files (0-byte junk files)
 *
 * Deletes orphan files from OCI that have no MongoDB record.
 * Use this when orphans are empty/corrupt and not worth archiving.
 *
 * Usage:
 *   node scripts/delete-oci-orphans.js --report audit-report.json
 *   node scripts/delete-oci-orphans.js --report audit-report.json --apply
 *   node scripts/delete-oci-orphans.js --report audit-report.json --apply --limit 10
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const oci = require(path.join(__dirname, '..', 'config', 'oci'));

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')
    ? args[idx + 1]
    : null;
}

const REPORT_FILE = getArg('--report');
const LIMIT = getArg('--limit') ? parseInt(getArg('--limit')) : null;

if (!REPORT_FILE) {
  console.log(`
Usage: node scripts/delete-oci-orphans.js --report <audit-report.json> [options]

Options:
  --apply       Actually delete files (default is dry-run)
  --limit N     Process only first N files
`);
  process.exit(1);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function deleteObject(client, namespace, bucketName, objectName, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await client.deleteObject({
        namespaceName: namespace,
        bucketName: bucketName,
        objectName: objectName
      });
      return { success: true };
    } catch (error) {
      if (error.statusCode === 404) {
        return { success: true, note: 'Already deleted' };
      }
      if (attempt < retries && (error.statusCode === 429 || error.statusCode >= 500)) {
        await sleep(Math.pow(2, attempt) * 1000);
      } else {
        throw error;
      }
    }
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('  DELETE OCI ORPHAN FILES');
  console.log('='.repeat(60));
  console.log(`
  Mode:    ${DRY_RUN ? 'DRY RUN (use --apply to delete)' : 'LIVE - DELETING'}
  Report:  ${REPORT_FILE}
  Limit:   ${LIMIT || 'None'}
`);

  if (!fs.existsSync(REPORT_FILE)) {
    console.error(`[ERROR] Report file not found: ${REPORT_FILE}`);
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
  const orphans = report.ociOrphans || [];

  if (orphans.length === 0) {
    console.log('[INFO] No orphans to delete.');
    process.exit(0);
  }

  console.log(`[INFO] Found ${orphans.length} orphan files\n`);

  const filesToProcess = LIMIT ? orphans.slice(0, LIMIT) : orphans;

  const client = oci.client;
  if (!client) {
    console.error('[ERROR] OCI client not initialized');
    process.exit(1);
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  console.log(`[INFO] Bucket: ${bucketName}\n`);
  console.log('-'.repeat(60));

  const stats = { deleted: 0, errors: 0 };

  for (let i = 0; i < filesToProcess.length; i++) {
    const orphan = filesToProcess[i];
    const filename = orphan.filename;
    const progress = `[${i + 1}/${filesToProcess.length}]`;

    if (DRY_RUN) {
      console.log(`${progress} [DRY-RUN] Would delete: ${filename}`);
      stats.deleted++;
      continue;
    }

    try {
      await deleteObject(client, namespace, bucketName, filename);
      console.log(`${progress} [DELETED] ${filename}`);
      stats.deleted++;
    } catch (error) {
      console.log(`${progress} [ERROR] ${filename}: ${error.message}`);
      stats.errors++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  console.log(`
  Total:    ${filesToProcess.length}
  Deleted:  ${stats.deleted}
  Errors:   ${stats.errors}
`);

  if (DRY_RUN) {
    console.log('[INFO] DRY RUN - no files deleted. Use --apply to delete.\n');
  } else {
    console.log('[SUCCESS] Deletion complete.\n');
  }
}

main().catch(err => {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
});
