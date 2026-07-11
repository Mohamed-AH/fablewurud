#!/usr/bin/env node
/**
 * Migrate OCI Objects to Include Content-Disposition Header
 *
 * This script updates audio objects in OCI to include the
 * Content-Disposition: attachment header, enabling direct PAR downloads
 * with proper "Save As" dialog behavior.
 *
 * Usage:
 *   node scripts/migrate-oci-content-disposition.js [options]
 *
 * Options:
 *   --dry-run      Show what would be updated without making changes
 *   --limit N      Process only N objects (for testing)
 *   --env FILE     Path to .env file (default: .env)
 *   --verbose      Show detailed progress
 *   --from-file F  Process only files listed in F (one per line)
 *   --from-stdin   Read file list from stdin (for piping from audit)
 *
 * Examples:
 *   # Process all files
 *   node scripts/migrate-oci-content-disposition.js --dry-run --limit 5
 *
 *   # Process specific files from a list
 *   node scripts/migrate-oci-content-disposition.js --from-file missing-files.txt
 *
 *   # Pipe from audit script
 *   node scripts/audit-oci-content-disposition.js --format list | \
 *     node scripts/migrate-oci-content-disposition.js --from-stdin
 */

// Parse --env argument first
const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

// Verify required environment variables
const requiredEnvVars = ['OCI_NAMESPACE', 'OCI_BUCKET'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  console.error('\n❌ Error: Missing required environment variables:', missingVars.join(', '));
  console.error('\nRequired variables:');
  console.error('  OCI_NAMESPACE  - OCI Object Storage namespace');
  console.error('  OCI_BUCKET     - OCI bucket name');
  console.error('  OCI_PRIVATE_KEY or OCI_CONFIG_FILE - Authentication');
  console.error('\nUsage:');
  console.error('  node scripts/migrate-oci-content-disposition.js --env .env.production --dry-run\n');
  process.exit(1);
}

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const oci = require('../config/oci');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const FROM_STDIN = args.includes('--from-stdin');
const limitIndex = args.indexOf('--limit');
const LIMIT = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : null;
const fromFileIndex = args.indexOf('--from-file');
const FROM_FILE = fromFileIndex !== -1 ? args[fromFileIndex + 1] : null;

// Stats
const stats = {
  total: 0,
  updated: 0,
  skipped: 0,
  errors: 0
};

/**
 * Get content disposition header value for a filename
 * Uses RFC 5987 encoding for non-ASCII characters (e.g., Arabic)
 */
function getContentDisposition(objectName) {
  // Extract just the filename without path
  const filename = path.basename(objectName);

  // Check if filename contains non-ASCII characters
  const hasNonAscii = /[^\x00-\x7F]/.test(filename);

  if (hasNonAscii) {
    // Use RFC 5987 encoding for non-ASCII filenames
    // Format: filename*=UTF-8''encoded_filename
    return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }

  // Simple format for ASCII-only filenames
  return `attachment; filename="${filename}"`;
}

/**
 * Check if object already has content-disposition set
 */
async function hasContentDisposition(client, namespace, bucketName, objectName) {
  try {
    const response = await client.headObject({
      namespaceName: namespace,
      bucketName: bucketName,
      objectName: objectName
    });

    // Check if content-disposition is already set
    return !!response.contentDisposition;
  } catch (error) {
    if (error.statusCode === 404) {
      return null; // Object doesn't exist
    }
    throw error;
  }
}


/**
 * Alternative: Update using putObject with streaming copy
 * Some OCI operations require downloading and re-uploading
 */
async function updateObjectWithReupload(client, namespace, bucketName, objectName) {
  const contentDisposition = getContentDisposition(objectName);

  // Get the object
  const getResponse = await client.getObject({
    namespaceName: namespace,
    bucketName: bucketName,
    objectName: objectName
  });

  // Re-upload with new headers
  const putResponse = await client.putObject({
    namespaceName: namespace,
    bucketName: bucketName,
    objectName: objectName,
    putObjectBody: getResponse.value,
    contentLength: getResponse.contentLength,
    contentType: getResponse.contentType,
    contentDisposition: contentDisposition,
    cacheControl: 'public, max-age=31536000',
    opcMeta: getResponse.opcMeta
  });

  return {
    success: true,
    etag: putResponse.eTag
  };
}

/**
 * List all objects in the bucket with pagination
 */
async function listAllObjects(client, namespace, bucketName) {
  const allObjects = [];
  let nextStartWith = null;

  do {
    const response = await client.listObjects({
      namespaceName: namespace,
      bucketName: bucketName,
      limit: 1000,
      start: nextStartWith
    });

    const objects = response.listObjects.objects || [];
    allObjects.push(...objects.filter(obj => obj && obj.name));

    nextStartWith = response.listObjects.nextStartWith;
  } while (nextStartWith);

  return allObjects;
}

/**
 * Read file list from stdin
 */
async function readFromStdin() {
  return new Promise((resolve) => {
    const lines = [];
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        lines.push(trimmed);
      }
    });

    rl.on('close', () => {
      resolve(lines);
    });
  });
}

/**
 * Read file list from a file
 */
function readFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

/**
 * Main migration function
 */
async function migrate() {
  console.log('\n🚀 OCI Content-Disposition Migration');
  console.log('=====================================');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '⚡ LIVE'}`);
  if (FROM_STDIN) console.log('Source: stdin (targeted mode)');
  if (FROM_FILE) console.log(`Source: ${FROM_FILE} (targeted mode)`);
  if (LIMIT) console.log(`Limit: ${LIMIT} objects`);
  console.log('');

  // Initialize OCI client
  const client = oci.client;
  if (!client) {
    console.error('❌ Failed to initialize OCI client');
    process.exit(1);
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  console.log(`📦 Bucket: ${bucketName}`);
  console.log(`🌍 Region: ${oci.getRegion()}`);
  console.log('');

  let objects;

  // Determine source of file list
  if (FROM_STDIN) {
    console.log('📋 Reading file list from stdin...');
    const fileNames = await readFromStdin();
    objects = fileNames.map(name => ({ name }));
    console.log(`   Received ${objects.length} files\n`);
  } else if (FROM_FILE) {
    console.log(`📋 Reading file list from ${FROM_FILE}...`);
    if (!fs.existsSync(FROM_FILE)) {
      console.error(`❌ File not found: ${FROM_FILE}`);
      process.exit(1);
    }
    const fileNames = readFromFile(FROM_FILE);
    objects = fileNames.map(name => ({ name }));
    console.log(`   Loaded ${objects.length} files\n`);
  } else {
    // List all objects from bucket
    console.log('📋 Listing all objects in bucket...');
    try {
      objects = await listAllObjects(client, namespace, bucketName);
    } catch (error) {
      console.error('❌ Failed to list objects:', error.message);
      process.exit(1);
    }
    console.log(`   Found ${objects.length} objects\n`);
  }

  // Apply limit if specified
  if (LIMIT && objects.length > LIMIT) {
    objects = objects.slice(0, LIMIT);
    console.log(`   Processing first ${LIMIT} objects\n`);
  }

  if (objects.length === 0) {
    console.log('⚠️  No objects to process\n');
    return;
  }

  stats.total = objects.length;

  // Process each object
  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const progress = `[${i + 1}/${objects.length}]`;

    try {
      // Check if already has content-disposition
      const hasHeader = await hasContentDisposition(client, namespace, bucketName, obj.name);

      if (hasHeader === null) {
        console.log(`${progress} ⏭️  ${obj.name} - Object not found, skipping`);
        stats.skipped++;
        continue;
      }

      if (hasHeader) {
        if (VERBOSE) {
          console.log(`${progress} ✅ ${obj.name} - Already has content-disposition`);
        }
        stats.skipped++;
        continue;
      }

      // Update the object
      if (DRY_RUN) {
        console.log(`${progress} 🔍 ${obj.name} - Would set: ${getContentDisposition(obj.name)}`);
        stats.updated++;
      } else {
        console.log(`${progress} ⬆️  ${obj.name} - Updating...`);

        // Use re-upload method (copyObject doesn't support contentDisposition header)
        await updateObjectWithReupload(client, namespace, bucketName, obj.name);
        console.log(`${progress} ✅ ${obj.name} - Updated`);

        stats.updated++;
      }
    } catch (error) {
      console.error(`${progress} ❌ ${obj.name} - Error: ${error.message}`);
      stats.errors++;
    }
  }

  // Print summary
  console.log('\n=====================================');
  console.log('📊 Migration Summary');
  console.log('=====================================');
  console.log(`Total objects:  ${stats.total}`);
  console.log(`Updated:        ${stats.updated}`);
  console.log(`Skipped:        ${stats.skipped}`);
  console.log(`Errors:         ${stats.errors}`);

  if (DRY_RUN) {
    console.log('\n💡 This was a dry run. Run without --dry-run to apply changes.');
  }

  console.log('');
}

// Run migration
migrate()
  .then(() => {
    process.exit(stats.errors > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
