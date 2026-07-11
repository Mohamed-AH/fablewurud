#!/usr/bin/env node
/**
 * Delete empty OCI orphans from full-oci-audit report
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const oci = require(path.join(__dirname, '..', 'config', 'oci'));

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const REPORT_FILE = args.find(a => a.endsWith('.json'));

if (!REPORT_FILE) {
  console.log('Usage: node scripts/delete-empty-orphans.js <oci-audit.json> [--apply]');
  process.exit(1);
}

async function main() {
  console.log('='.repeat(60));
  console.log('  DELETE EMPTY OCI ORPHANS');
  console.log('='.repeat(60));
  console.log(`\n  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  const report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
  const orphans = report.categories?.emptyOrphans || [];

  if (orphans.length === 0) {
    console.log('[INFO] No empty orphans to delete.');
    process.exit(0);
  }

  console.log(`[INFO] Found ${orphans.length} empty orphans to delete\n`);

  const client = oci.client;
  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  let deleted = 0, errors = 0;

  for (let i = 0; i < orphans.length; i++) {
    const filename = orphans[i].filename;
    const progress = `[${i + 1}/${orphans.length}]`;

    if (DRY_RUN) {
      console.log(`${progress} [DRY-RUN] Would delete: ${filename}`);
      deleted++;
      continue;
    }

    try {
      await client.deleteObject({
        namespaceName: namespace,
        bucketName: bucketName,
        objectName: filename
      });
      console.log(`${progress} [DELETED] ${filename}`);
      deleted++;
    } catch (error) {
      if (error.statusCode === 404) {
        console.log(`${progress} [ALREADY GONE] ${filename}`);
        deleted++;
      } else {
        console.log(`${progress} [ERROR] ${filename}: ${error.message}`);
        errors++;
      }
    }
  }

  console.log(`\n  Deleted: ${deleted}`);
  console.log(`  Errors:  ${errors}\n`);

  if (DRY_RUN) {
    console.log('[INFO] DRY RUN - use --apply to delete.\n');
  }
}

main().catch(err => {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
});
