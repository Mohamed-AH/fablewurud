#!/usr/bin/env node
/**
 * Delete specific files from OCI Object Storage
 *
 * Usage:
 *   node scripts/delete-from-oci.js file1.m4a file2.m4a ...
 *   node scripts/delete-from-oci.js --list files.txt
 *   node scripts/delete-from-oci.js --dry-run file1.m4a file2.m4a
 *
 * Options:
 *   --env FILE    Path to .env file (default: .env)
 *   --dry-run     Show what would be deleted without deleting
 *   --list FILE   Read filenames from a text file (one per line)
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const fs = require('fs');
const common = require('oci-common');
const os = require('oci-objectstorage');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const listIndex = args.indexOf('--list');
let files = [];

if (listIndex !== -1) {
  const listFile = args[listIndex + 1];
  if (!fs.existsSync(listFile)) {
    console.error(`File not found: ${listFile}`);
    process.exit(1);
  }
  files = fs.readFileSync(listFile, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
} else {
  files = args.filter(a => !a.startsWith('--') && a !== envPath && args[args.indexOf(a) - 1] !== '--env');
}

if (files.length === 0) {
  console.log('Usage: node scripts/delete-from-oci.js [--dry-run] file1.m4a file2.m4a ...');
  console.log('       node scripts/delete-from-oci.js [--dry-run] --list files.txt');
  process.exit(1);
}

function initClient() {
  if (process.env.OCI_PRIVATE_KEY && process.env.OCI_TENANCY) {
    const privateKey = process.env.OCI_PRIVATE_KEY.replace(/\\n/g, '\n');
    const provider = new common.SimpleAuthenticationDetailsProvider(
      process.env.OCI_TENANCY,
      process.env.OCI_USER,
      process.env.OCI_FINGERPRINT,
      privateKey,
      null,
      common.Region.fromRegionId(process.env.OCI_REGION || 'us-ashburn-1')
    );
    return new os.ObjectStorageClient({ authenticationDetailsProvider: provider });
  }
  if (process.env.OCI_CONFIG_FILE) {
    const provider = new common.ConfigFileAuthenticationDetailsProvider(
      process.env.OCI_CONFIG_FILE,
      process.env.OCI_PROFILE || 'DEFAULT'
    );
    return new os.ObjectStorageClient({ authenticationDetailsProvider: provider });
  }
  throw new Error('OCI credentials not configured');
}

async function main() {
  console.log(`\nDelete ${files.length} files from OCI Object Storage`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  const namespace = process.env.OCI_NAMESPACE;
  const bucketName = process.env.OCI_BUCKET || 'wurud-audio';

  if (!namespace) {
    console.error('OCI_NAMESPACE not set');
    process.exit(1);
  }

  let client;
  if (!DRY_RUN) {
    client = initClient();
    console.log(`Bucket: ${bucketName}\n`);
  }

  let deleted = 0, notFound = 0, failed = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const progress = `[${i + 1}/${files.length}]`;

    if (DRY_RUN) {
      console.log(`${progress} Would delete: ${file}`);
      deleted++;
      continue;
    }

    try {
      await client.deleteObject({
        namespaceName: namespace,
        bucketName: bucketName,
        objectName: file
      });
      console.log(`${progress} Deleted: ${file}`);
      deleted++;
    } catch (error) {
      if (error.statusCode === 404) {
        console.log(`${progress} Not found (already deleted): ${file}`);
        notFound++;
      } else {
        console.log(`${progress} FAILED: ${file} - ${error.message}`);
        failed++;
      }
    }
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Deleted:   ${deleted}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Failed:    ${failed}`);
  console.log('='.repeat(40));

  if (DRY_RUN) console.log('\nDry run — no files were deleted.');
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
