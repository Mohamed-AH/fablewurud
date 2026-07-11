#!/usr/bin/env node
/**
 * Part 1: Upload Audio Files to OCI (Run on Local PC)
 *
 * Uploads audio files from a local directory to OCI Object Storage.
 * Outputs a JSON manifest file for Part 2 (database update on Cloud VM).
 *
 * Usage:
 *   node scripts/upload-to-oci-local.js /path/to/audio-files [options]
 *
 * Options:
 *   --env FILE        Path to .env file (default: .env)
 *   --dry-run         Show what would be uploaded without uploading
 *   --skip-existing   Skip files that already exist in OCI
 *   --output FILE     Output manifest file (default: upload-manifest.json)
 *   --limit N         Process only first N files
 *   --verbose         Show detailed progress
 *
 * Environment Variables Required (in .env):
 *   OCI_NAMESPACE, OCI_TENANCY, OCI_USER, OCI_FINGERPRINT, OCI_PRIVATE_KEY, OCI_REGION
 *
 * Output:
 *   Creates upload-manifest.json with all uploaded file info.
 *   Transfer this file to Cloud VM and run upload-to-oci-verify.js
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const fs = require('fs');
const path = require('path');
const common = require('oci-common');
const os = require('oci-objectstorage');

// Parse arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_EXISTING = args.includes('--skip-existing');
const VERBOSE = args.includes('--verbose');

const outputIndex = args.indexOf('--output');
const OUTPUT_FILE = outputIndex !== -1 ? args[outputIndex + 1] : 'upload-manifest.json';

const limitIndex = args.indexOf('--limit');
const LIMIT = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : null;

const audioDir = args.find(arg => !arg.startsWith('--') && arg !== envPath && args[args.indexOf(arg) - 1] !== '--env' && args[args.indexOf(arg) - 1] !== '--output' && args[args.indexOf(arg) - 1] !== '--limit');

// Supported audio formats
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac'];

// Stats
const stats = {
  total: 0,
  uploaded: 0,
  skipped: 0,
  failed: 0,
  totalBytes: 0
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac'
  };
  return mimeTypes[ext] || 'audio/mp4';
}

function getContentDisposition(filename) {
  const hasNonAscii = /[^\x00-\x7F]/.test(filename);
  if (hasNonAscii) {
    return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }
  return `attachment; filename="${filename}"`;
}

function getAudioFiles(directory) {
  if (!fs.existsSync(directory)) {
    throw new Error(`Directory not found: ${directory}`);
  }

  const files = fs.readdirSync(directory)
    .filter(file => {
      const ext = path.extname(file).toLowerCase();
      return AUDIO_EXTENSIONS.includes(ext);
    })
    .map(file => {
      const filePath = path.join(directory, file);
      const fileStats = fs.statSync(filePath);
      return {
        name: file,
        path: filePath,
        size: fileStats.size
      };
    });

  return files;
}

function initOciClient() {
  let provider;

  if (process.env.OCI_PRIVATE_KEY && process.env.OCI_TENANCY) {
    const privateKey = process.env.OCI_PRIVATE_KEY.replace(/\\n/g, '\n');
    provider = new common.SimpleAuthenticationDetailsProvider(
      process.env.OCI_TENANCY,
      process.env.OCI_USER,
      process.env.OCI_FINGERPRINT,
      privateKey,
      null,
      common.Region.fromRegionId(process.env.OCI_REGION || 'us-ashburn-1')
    );
  } else if (process.env.OCI_CONFIG_FILE) {
    provider = new common.ConfigFileAuthenticationDetailsProvider(
      process.env.OCI_CONFIG_FILE,
      process.env.OCI_PROFILE || 'DEFAULT'
    );
  } else {
    throw new Error('OCI credentials not configured. Set OCI_PRIVATE_KEY + OCI_TENANCY or OCI_CONFIG_FILE');
  }

  return new os.ObjectStorageClient({ authenticationDetailsProvider: provider });
}

async function objectExists(client, namespace, bucketName, objectName) {
  try {
    await client.headObject({
      namespaceName: namespace,
      bucketName: bucketName,
      objectName: objectName
    });
    return true;
  } catch (error) {
    if (error.statusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function uploadFile(client, namespace, bucketName, localPath, objectName) {
  const fileStats = fs.statSync(localPath);
  const fileStream = fs.createReadStream(localPath);
  const contentDisposition = getContentDisposition(objectName);
  const contentType = getMimeType(objectName);

  const response = await client.putObject({
    namespaceName: namespace,
    bucketName: bucketName,
    objectName: objectName,
    putObjectBody: fileStream,
    contentLength: fileStats.size,
    contentType: contentType,
    contentDisposition: contentDisposition,
    cacheControl: 'public, max-age=31536000'
  });

  return {
    success: true,
    etag: response.eTag,
    size: fileStats.size
  };
}

function getPublicUrl(namespace, region, bucketName, objectName) {
  const encodedName = encodeURIComponent(objectName);
  return `https://objectstorage.${region}.oraclecloud.com/n/${namespace}/b/${bucketName}/o/${encodedName}`;
}

async function main() {
  console.log('\n☁️  Part 1: Upload Audio Files to OCI (Local PC)');
  console.log('='.repeat(55));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '⚡ LIVE'}`);

  if (!audioDir) {
    console.log('\nUsage: node scripts/upload-to-oci-local.js <audio-directory> [options]');
    console.log('\nOptions:');
    console.log('  --env FILE        Path to .env file (default: .env)');
    console.log('  --dry-run         Show what would be uploaded');
    console.log('  --skip-existing   Skip files already in OCI');
    console.log('  --output FILE     Output manifest (default: upload-manifest.json)');
    console.log('  --limit N         Process only first N files');
    console.log('  --verbose         Show detailed progress');
    console.log('\nExample:');
    console.log('  node scripts/upload-to-oci-local.js ./audio-files --skip-existing');
    process.exit(1);
  }

  const directory = path.resolve(audioDir);
  console.log(`📁 Audio directory: ${directory}`);
  console.log(`📄 Output manifest: ${OUTPUT_FILE}`);
  if (LIMIT) console.log(`🔢 Limit: ${LIMIT} files`);
  console.log('');

  // Get audio files
  let files;
  try {
    files = getAudioFiles(directory);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log('⚠️  No audio files found in directory');
    process.exit(0);
  }

  // Apply limit
  if (LIMIT && LIMIT < files.length) {
    files = files.slice(0, LIMIT);
    console.log(`Processing first ${LIMIT} of ${files.length} files\n`);
  }

  stats.total = files.length;
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  console.log(`📊 Found ${files.length} audio files (${formatBytes(totalSize)} total)\n`);

  // Initialize OCI
  let client, namespace, bucketName, region;

  if (!DRY_RUN) {
    console.log('☁️  Initializing OCI client...');
    try {
      client = initOciClient();
      namespace = process.env.OCI_NAMESPACE;
      bucketName = process.env.OCI_BUCKET || 'wurud-audio';
      region = process.env.OCI_REGION || 'us-ashburn-1';

      if (!namespace) {
        throw new Error('OCI_NAMESPACE environment variable is required');
      }

      console.log(`   Namespace: ${namespace}`);
      console.log(`   Bucket: ${bucketName}`);
      console.log(`   Region: ${region}\n`);
    } catch (error) {
      console.error(`❌ OCI initialization failed: ${error.message}`);
      process.exit(1);
    }
  } else {
    namespace = process.env.OCI_NAMESPACE || 'example-namespace';
    bucketName = process.env.OCI_BUCKET || 'wurud-audio';
    region = process.env.OCI_REGION || 'us-ashburn-1';
  }

  // Upload files
  console.log('📤 Starting upload...\n');
  const manifest = {
    createdAt: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'live',
    source: directory,
    ociConfig: {
      namespace,
      bucket: bucketName,
      region
    },
    files: []
  };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const progress = `[${i + 1}/${files.length}]`;

    if (DRY_RUN) {
      const url = getPublicUrl(namespace, region, bucketName, file.name);
      console.log(`${progress} 🔍 Would upload: ${file.name} (${formatBytes(file.size)})`);
      manifest.files.push({
        filename: file.name,
        size: file.size,
        url: url,
        status: 'dry-run'
      });
      stats.uploaded++;
      continue;
    }

    // Check if exists
    if (SKIP_EXISTING) {
      try {
        const exists = await objectExists(client, namespace, bucketName, file.name);
        if (exists) {
          const url = getPublicUrl(namespace, region, bucketName, file.name);
          if (VERBOSE) console.log(`${progress} ⏭️  Skipped (exists): ${file.name}`);
          manifest.files.push({
            filename: file.name,
            size: file.size,
            url: url,
            status: 'skipped-exists'
          });
          stats.skipped++;
          continue;
        }
      } catch (error) {
        // Ignore check errors
      }
    }

    // Upload
    try {
      if (VERBOSE) {
        console.log(`${progress} ⬆️  Uploading: ${file.name} (${formatBytes(file.size)})`);
      } else {
        process.stdout.write(`\r${progress} Uploading: ${file.name.substring(0, 40)}...`);
      }

      const result = await uploadFile(client, namespace, bucketName, file.path, file.name);
      const url = getPublicUrl(namespace, region, bucketName, file.name);

      manifest.files.push({
        filename: file.name,
        size: result.size,
        url: url,
        etag: result.etag,
        status: 'uploaded',
        uploadedAt: new Date().toISOString()
      });

      stats.uploaded++;
      stats.totalBytes += result.size;

      if (VERBOSE) {
        console.log(`${progress} ✅ Done`);
      }
    } catch (error) {
      console.log(`\n${progress} ❌ Failed: ${file.name} - ${error.message}`);
      manifest.files.push({
        filename: file.name,
        size: file.size,
        status: 'failed',
        error: error.message
      });
      stats.failed++;
    }
  }

  if (!VERBOSE && !DRY_RUN) console.log('\n');

  // Save manifest
  manifest.summary = {
    total: stats.total,
    uploaded: stats.uploaded,
    skipped: stats.skipped,
    failed: stats.failed,
    totalBytes: stats.totalBytes
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));

  // Summary
  console.log('\n' + '='.repeat(55));
  console.log('📊 SUMMARY');
  console.log('='.repeat(55));
  console.log(`  Total files:    ${stats.total}`);
  console.log(`  Uploaded:       ${stats.uploaded}`);
  console.log(`  Skipped:        ${stats.skipped}`);
  console.log(`  Failed:         ${stats.failed}`);
  if (!DRY_RUN) {
    console.log(`  Total uploaded: ${formatBytes(stats.totalBytes)}`);
  }
  console.log('='.repeat(55));

  console.log(`\n📄 Manifest saved: ${OUTPUT_FILE}`);
  console.log(`   Contains ${manifest.files.length} file records`);

  console.log('\n📋 NEXT STEPS:');
  console.log('   1. Transfer the manifest file to your Cloud VM');
  console.log('   2. Run: node scripts/upload-to-oci-verify.js --manifest upload-manifest.json');

  if (DRY_RUN) {
    console.log('\n💡 This was a dry run. Remove --dry-run to actually upload files.');
  }

  console.log('');

  if (stats.failed > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
