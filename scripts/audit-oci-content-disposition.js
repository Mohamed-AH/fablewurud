#!/usr/bin/env node
/**
 * Audit OCI Objects for Content-Disposition Headers
 *
 * This script checks all audio objects in OCI and identifies those
 * with missing or incorrect Content-Disposition headers.
 *
 * Usage:
 *   node scripts/audit-oci-content-disposition.js [--env FILE] [--output FILE] [--format FORMAT]
 *
 * Options:
 *   --env FILE      Path to .env file (default: .env)
 *   --output FILE   Write results to file (default: stdout)
 *   --format FORMAT Output format: json, list, or report (default: report)
 *   --quiet         Only output the file list (for piping to migration)
 *
 * Examples:
 *   # Generate report
 *   node scripts/audit-oci-content-disposition.js --env .env.production
 *
 *   # Output list for migration script
 *   node scripts/audit-oci-content-disposition.js --env .env.production --format list > missing-files.txt
 *
 *   # Pipe directly to migration
 *   node scripts/audit-oci-content-disposition.js --env .env.production --quiet | \
 *     node scripts/migrate-oci-content-disposition.js --env .env.production --from-stdin
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
  process.exit(1);
}

const fs = require('fs');
const path = require('path');
const oci = require('../config/oci');

// Parse command line arguments
const args = process.argv.slice(2);
const QUIET = args.includes('--quiet');
const outputIndex = args.indexOf('--output');
const OUTPUT_FILE = outputIndex !== -1 ? args[outputIndex + 1] : null;
const formatIndex = args.indexOf('--format');
const FORMAT = formatIndex !== -1 ? args[formatIndex + 1] : 'report';

// Results storage
const results = {
  total: 0,
  valid: [],
  missing: [],
  incorrect: [],
  errors: []
};

/**
 * Expected content-disposition format
 */
function getExpectedDisposition(objectName) {
  const filename = path.basename(objectName);
  return `attachment; filename="${filename}"`;
}

/**
 * Check if content-disposition is valid
 */
function isValidDisposition(disposition, objectName) {
  if (!disposition) return { valid: false, reason: 'missing' };

  // Must start with 'attachment'
  if (!disposition.toLowerCase().startsWith('attachment')) {
    return { valid: false, reason: 'not-attachment', actual: disposition };
  }

  return { valid: true };
}

/**
 * Get object metadata including content-disposition
 */
async function getObjectHeaders(client, namespace, bucketName, objectName) {
  try {
    const response = await client.headObject({
      namespaceName: namespace,
      bucketName: bucketName,
      objectName: objectName
    });

    return {
      exists: true,
      contentDisposition: response.contentDisposition,
      contentType: response.contentType,
      size: response.contentLength,
      etag: response.eTag
    };
  } catch (error) {
    if (error.statusCode === 404) {
      return { exists: false };
    }
    throw error;
  }
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
 * Format file size for display
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Output results in requested format
 */
function outputResults() {
  const needsFix = [...results.missing, ...results.incorrect];

  let output = '';

  switch (FORMAT) {
    case 'json':
      output = JSON.stringify({
        summary: {
          total: results.total,
          valid: results.valid.length,
          missing: results.missing.length,
          incorrect: results.incorrect.length,
          errors: results.errors.length
        },
        needsFix: needsFix.map(r => r.name),
        details: {
          missing: results.missing,
          incorrect: results.incorrect,
          errors: results.errors
        }
      }, null, 2);
      break;

    case 'list':
      // Just the filenames, one per line
      output = needsFix.map(r => r.name).join('\n');
      break;

    case 'report':
    default:
      if (!QUIET) {
        output += '\n📊 OCI Content-Disposition Audit Report\n';
        output += '========================================\n\n';
        output += `📦 Bucket: ${oci.getBucketName()}\n`;
        output += `🌍 Region: ${oci.getRegion()}\n`;
        output += `📅 Date: ${new Date().toISOString()}\n\n`;

        output += '📈 Summary\n';
        output += '----------\n';
        output += `Total objects:     ${results.total}\n`;
        output += `Valid headers:     ${results.valid.length} ✅\n`;
        output += `Missing headers:   ${results.missing.length} ❌\n`;
        output += `Incorrect headers: ${results.incorrect.length} ⚠️\n`;
        output += `Errors:            ${results.errors.length} 💥\n\n`;

        if (results.missing.length > 0) {
          output += '❌ Missing Content-Disposition\n';
          output += '------------------------------\n';
          results.missing.forEach(r => {
            output += `  ${r.name} (${formatSize(r.size)})\n`;
          });
          output += '\n';
        }

        if (results.incorrect.length > 0) {
          output += '⚠️ Incorrect Content-Disposition\n';
          output += '---------------------------------\n';
          results.incorrect.forEach(r => {
            output += `  ${r.name}\n`;
            output += `    Current:  ${r.actual}\n`;
            output += `    Expected: ${r.expected}\n`;
          });
          output += '\n';
        }

        if (results.errors.length > 0) {
          output += '💥 Errors\n';
          output += '---------\n';
          results.errors.forEach(r => {
            output += `  ${r.name}: ${r.error}\n`;
          });
          output += '\n';
        }

        if (needsFix.length > 0) {
          output += '🔧 To fix these files, run:\n';
          output += '   node scripts/audit-oci-content-disposition.js --format list | \\\n';
          output += '     node scripts/migrate-oci-content-disposition.js --from-stdin\n\n';
        } else {
          output += '✅ All objects have valid Content-Disposition headers!\n\n';
        }
      } else {
        // Quiet mode - just output file list
        output = needsFix.map(r => r.name).join('\n');
      }
      break;
  }

  if (OUTPUT_FILE) {
    fs.writeFileSync(OUTPUT_FILE, output);
    if (!QUIET) {
      console.log(`Results written to ${OUTPUT_FILE}`);
    }
  } else {
    console.log(output);
  }
}

/**
 * Main audit function
 */
async function audit() {
  if (!QUIET) {
    console.log('\n🔍 OCI Content-Disposition Audit');
    console.log('=================================\n');
  }

  // Initialize OCI client
  const client = oci.client;
  if (!client) {
    console.error('❌ Failed to initialize OCI client');
    process.exit(1);
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  if (!QUIET) {
    console.log(`📦 Bucket: ${bucketName}`);
    console.log(`🌍 Region: ${oci.getRegion()}\n`);
    console.log('📋 Listing objects...');
  }

  // List all objects
  let objects;
  try {
    objects = await listAllObjects(client, namespace, bucketName);
  } catch (error) {
    console.error('❌ Failed to list objects:', error.message);
    process.exit(1);
  }

  if (!QUIET) {
    console.log(`   Found ${objects.length} objects\n`);
    console.log('🔍 Checking headers...\n');
  }

  results.total = objects.length;

  // Check if stdout is interactive (TTY)
  const isInteractive = process.stdout.isTTY;

  // Check each object
  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];

    // Only show progress updates in interactive mode
    if (!QUIET && FORMAT === 'report' && isInteractive) {
      process.stdout.write(`\r   Checking ${i + 1}/${objects.length}...`);
    }

    try {
      const headers = await getObjectHeaders(client, namespace, bucketName, obj.name);

      if (!headers.exists) {
        results.errors.push({ name: obj.name, error: 'Object not found' });
        continue;
      }

      const check = isValidDisposition(headers.contentDisposition, obj.name);

      if (check.valid) {
        results.valid.push({
          name: obj.name,
          disposition: headers.contentDisposition
        });
      } else if (check.reason === 'missing') {
        results.missing.push({
          name: obj.name,
          size: headers.size,
          contentType: headers.contentType
        });
      } else {
        results.incorrect.push({
          name: obj.name,
          actual: headers.contentDisposition,
          expected: getExpectedDisposition(obj.name),
          reason: check.reason
        });
      }
    } catch (error) {
      results.errors.push({ name: obj.name, error: error.message });
    }
  }

  if (!QUIET && FORMAT === 'report') {
    if (isInteractive) {
      console.log('\r   Done!                              \n');
    } else {
      console.log('   Done!\n');
    }
  }

  outputResults();
}

// Run audit
audit()
  .then(() => {
    const needsFix = results.missing.length + results.incorrect.length;
    process.exit(needsFix > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('\n❌ Audit failed:', error);
    process.exit(1);
  });
