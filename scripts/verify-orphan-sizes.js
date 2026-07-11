#!/usr/bin/env node
/**
 * Verify sizes of all OCI orphan files
 * Checks each file to confirm they are 0-bytes before deletion
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const oci = require(path.join(__dirname, '..', 'config', 'oci'));

const REPORT_FILE = process.argv[2];

if (!REPORT_FILE) {
  console.log('Usage: node scripts/verify-orphan-sizes.js <audit-report.json>');
  process.exit(1);
}

async function main() {
  console.log('='.repeat(60));
  console.log('  VERIFY ORPHAN FILE SIZES');
  console.log('='.repeat(60));

  if (!fs.existsSync(REPORT_FILE)) {
    console.error(`[ERROR] Report not found: ${REPORT_FILE}`);
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
  const orphans = report.ociOrphans || [];

  console.log(`\n[INFO] Checking ${orphans.length} orphan files...\n`);

  const client = oci.client;
  if (!client) {
    console.error('[ERROR] OCI client not initialized');
    process.exit(1);
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  const stats = {
    zeroBytes: 0,
    hasContent: 0,
    missing: 0,
    errors: 0,
    totalSize: 0
  };

  const filesWithContent = [];

  for (let i = 0; i < orphans.length; i++) {
    const filename = orphans[i].filename;

    if ((i + 1) % 25 === 0) {
      process.stdout.write(`\r   Checked ${i + 1}/${orphans.length}...`);
    }

    try {
      const response = await client.headObject({
        namespaceName: namespace,
        bucketName: bucketName,
        objectName: filename
      });

      const size = response.contentLength || 0;
      stats.totalSize += size;

      if (size === 0) {
        stats.zeroBytes++;
      } else {
        stats.hasContent++;
        filesWithContent.push({ filename, size });
      }

    } catch (error) {
      if (error.statusCode === 404) {
        stats.missing++;
      } else {
        stats.errors++;
      }
    }
  }

  console.log(`\r   Checked ${orphans.length}/${orphans.length}      \n`);

  console.log('='.repeat(60));
  console.log('  RESULTS');
  console.log('='.repeat(60));
  console.log(`
  Total orphans:     ${orphans.length}
  Zero-byte files:   ${stats.zeroBytes}
  Files with data:   ${stats.hasContent}
  Already missing:   ${stats.missing}
  Errors:            ${stats.errors}
  Total size:        ${formatBytes(stats.totalSize)}
`);

  if (filesWithContent.length > 0) {
    console.log('-'.repeat(60));
    console.log('  FILES WITH CONTENT (not safe to delete):');
    console.log('-'.repeat(60));
    for (const f of filesWithContent) {
      console.log(`  ${formatBytes(f.size).padStart(10)} | ${f.filename.substring(0, 45)}`);
    }
    console.log('');
  }

  if (stats.hasContent === 0 && stats.zeroBytes > 0) {
    console.log('[OK] All orphan files are 0-bytes. Safe to delete.\n');
  } else if (stats.hasContent > 0) {
    console.log(`[WARN] ${stats.hasContent} files have content! Review before deleting.\n`);
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

main().catch(err => {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
});
