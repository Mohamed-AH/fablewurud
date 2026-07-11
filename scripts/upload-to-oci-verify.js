#!/usr/bin/env node
/**
 * Part 2: Verify OCI Uploads and Update MongoDB (Run on Cloud VM)
 *
 * Reads the manifest file from Part 1, verifies files exist in OCI,
 * and updates MongoDB lecture records with the OCI URLs.
 *
 * Usage:
 *   node scripts/upload-to-oci-verify.js --manifest upload-manifest.json [options]
 *
 * Options:
 *   --manifest FILE   Path to manifest from Part 1 (required)
 *   --env FILE        Path to .env file (default: .env)
 *   --dry-run         Show what would be updated without updating
 *   --skip-verify     Skip OCI verification (trust manifest)
 *   --verbose         Show detailed progress
 *
 * Environment Variables Required (in .env):
 *   MONGODB_URI - MongoDB connection string
 *   OCI_NAMESPACE, OCI_TENANCY, OCI_USER, OCI_FINGERPRINT, OCI_PRIVATE_KEY (for verification)
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Parse arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_VERIFY = args.includes('--skip-verify');
const VERBOSE = args.includes('--verbose');

const manifestIndex = args.indexOf('--manifest');
const MANIFEST_FILE = manifestIndex !== -1 ? args[manifestIndex + 1] : null;

// Stats
const stats = {
  total: 0,
  verified: 0,
  updated: 0,
  notFound: 0,
  alreadySet: 0,
  verifyFailed: 0,
  errors: []
};

async function initOciClient() {
  const common = require('oci-common');
  const os = require('oci-objectstorage');

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
    return null;
  }

  return new os.ObjectStorageClient({ authenticationDetailsProvider: provider });
}

async function verifyObject(client, namespace, bucketName, objectName) {
  try {
    const response = await client.headObject({
      namespaceName: namespace,
      bucketName: bucketName,
      objectName: objectName
    });
    return {
      exists: true,
      size: parseInt(response.contentLength),
      etag: response.eTag
    };
  } catch (error) {
    if (error.statusCode === 404) {
      return { exists: false };
    }
    throw error;
  }
}

async function main() {
  console.log('\n☁️  Part 2: Verify OCI Uploads and Update MongoDB (Cloud VM)');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '⚡ LIVE'}`);

  // Check manifest file
  if (!MANIFEST_FILE) {
    console.log('\nUsage: node scripts/upload-to-oci-verify.js --manifest <file> [options]');
    console.log('\nOptions:');
    console.log('  --manifest FILE   Path to manifest from Part 1 (required)');
    console.log('  --env FILE        Path to .env file (default: .env)');
    console.log('  --dry-run         Show what would be updated');
    console.log('  --skip-verify     Skip OCI verification (trust manifest)');
    console.log('  --verbose         Show detailed progress');
    console.log('\nExample:');
    console.log('  node scripts/upload-to-oci-verify.js --manifest upload-manifest.json');
    process.exit(1);
  }

  if (!fs.existsSync(MANIFEST_FILE)) {
    console.error(`\n❌ Manifest file not found: ${MANIFEST_FILE}`);
    process.exit(1);
  }

  // Load manifest
  console.log(`\n📄 Loading manifest: ${MANIFEST_FILE}`);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));

  const files = manifest.files.filter(f => f.status === 'uploaded' || f.status === 'skipped-exists' || f.status === 'dry-run');
  stats.total = files.length;

  console.log(`   Created: ${manifest.createdAt}`);
  console.log(`   Source: ${manifest.source}`);
  console.log(`   Files to process: ${files.length}`);
  console.log('');

  // Initialize OCI client for verification
  let ociClient = null;
  const namespace = manifest.ociConfig?.namespace || process.env.OCI_NAMESPACE;
  const bucketName = manifest.ociConfig?.bucket || process.env.OCI_BUCKET || 'wurud-audio';

  if (!SKIP_VERIFY) {
    console.log('☁️  Initializing OCI client for verification...');
    try {
      ociClient = await initOciClient();
      if (ociClient) {
        console.log('   ✅ OCI client ready\n');
      } else {
        console.log('   ⚠️  OCI not configured, skipping verification\n');
      }
    } catch (error) {
      console.log(`   ⚠️  OCI init failed: ${error.message}, skipping verification\n`);
    }
  } else {
    console.log('⏭️  Skipping OCI verification (--skip-verify)\n');
  }

  // Connect to MongoDB
  console.log('📊 Connecting to MongoDB...');
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is required');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('   ✅ Connected\n');

  // Define Lecture schema
  const lectureSchema = new mongoose.Schema({
    audioFileName: String,
    audioUrl: String,
    titleArabic: String,
    titleEnglish: String,
    fileSize: Number,
    published: Boolean
  }, { collection: 'lectures', strict: false });

  const Lecture = mongoose.model('Lecture', lectureSchema);

  // Process files
  console.log('🔄 Processing files...\n');
  const results = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const progress = `[${i + 1}/${files.length}]`;

    // Verify in OCI (if client available and not skipped)
    if (ociClient && !SKIP_VERIFY) {
      try {
        const verification = await verifyObject(ociClient, namespace, bucketName, file.filename);
        if (!verification.exists) {
          console.log(`${progress} ❌ Not in OCI: ${file.filename}`);
          stats.verifyFailed++;
          results.push({ ...file, dbStatus: 'verify-failed' });
          continue;
        }
        stats.verified++;
        if (VERBOSE) console.log(`${progress} ✅ Verified in OCI: ${file.filename}`);
      } catch (error) {
        console.log(`${progress} ⚠️  Verify error: ${file.filename} - ${error.message}`);
      }
    }

    // Find lecture in MongoDB
    const baseName = path.basename(file.filename, path.extname(file.filename));

    let lecture = await Lecture.findOne({
      $or: [
        { audioFileName: file.filename },
        { audioFileName: baseName }
      ]
    });

    // Try regex match for different extensions
    if (!lecture) {
      lecture = await Lecture.findOne({
        audioFileName: { $regex: `^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.[a-zA-Z0-9]+$` }
      });
    }

    if (!lecture) {
      if (VERBOSE) console.log(`${progress} ⚠️  No lecture found: ${file.filename}`);
      stats.notFound++;
      results.push({ ...file, dbStatus: 'not-found' });
      continue;
    }

    // Check if already set correctly
    if (lecture.audioUrl === file.url && lecture.audioFileName === file.filename) {
      if (VERBOSE) console.log(`${progress} ⏭️  Already set: ${file.filename}`);
      stats.alreadySet++;
      results.push({ ...file, dbStatus: 'already-set', lectureId: lecture._id });
      continue;
    }

    // Update lecture
    if (DRY_RUN) {
      console.log(`${progress} 🔍 Would update: ${lecture.titleArabic || lecture.titleEnglish || file.filename}`);
      stats.updated++;
      results.push({ ...file, dbStatus: 'dry-run', lectureId: lecture._id });
    } else {
      try {
        await Lecture.findByIdAndUpdate(lecture._id, {
          audioFileName: file.filename,
          audioUrl: file.url,
          fileSize: file.size
        });

        if (VERBOSE) {
          console.log(`${progress} ✅ Updated: ${lecture.titleArabic || lecture.titleEnglish}`);
        } else {
          process.stdout.write(`\r${progress} Updated ${stats.updated + 1} lectures...`);
        }

        stats.updated++;
        results.push({ ...file, dbStatus: 'updated', lectureId: lecture._id });
      } catch (error) {
        console.log(`\n${progress} ❌ Update failed: ${error.message}`);
        stats.errors.push({ filename: file.filename, error: error.message });
        results.push({ ...file, dbStatus: 'error', error: error.message });
      }
    }
  }

  if (!VERBOSE && !DRY_RUN && stats.updated > 0) console.log('\n');

  // Disconnect
  await mongoose.disconnect();
  console.log('\n✅ Disconnected from MongoDB');

  // Save results
  const resultsFile = MANIFEST_FILE.replace('.json', '-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify({
    processedAt: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'live',
    summary: stats,
    results: results
  }, null, 2));

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total files:       ${stats.total}`);
  if (!SKIP_VERIFY && ociClient) {
    console.log(`  Verified in OCI:   ${stats.verified}`);
    console.log(`  Verify failed:     ${stats.verifyFailed}`);
  }
  console.log(`  DB updated:        ${stats.updated}`);
  console.log(`  Already set:       ${stats.alreadySet}`);
  console.log(`  Not found in DB:   ${stats.notFound}`);
  console.log(`  Errors:            ${stats.errors.length}`);
  console.log('='.repeat(60));

  console.log(`\n📄 Results saved: ${resultsFile}`);

  if (stats.notFound > 0) {
    console.log(`\n⚠️  ${stats.notFound} files had no matching lecture in MongoDB.`);
    console.log('   These may be new files that need lectures created first.');
  }

  if (DRY_RUN) {
    console.log('\n💡 This was a dry run. Remove --dry-run to update the database.');
  }

  console.log('');

  if (stats.errors.length > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
