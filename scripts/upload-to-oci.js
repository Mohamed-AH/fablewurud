#!/usr/bin/env node
/**
 * Upload Audio Files to OCI Object Storage
 *
 * Uploads all audio files from a directory to Oracle Cloud Infrastructure
 * Object Storage bucket. Also updates MongoDB lecture records with OCI URLs.
 *
 * Usage:
 *   node scripts/upload-to-oci.js /path/to/audio-files --update-db --skip-existing
 *
 * Environment Variables Required:
 *   OCI_NAMESPACE - OCI tenancy namespace
 *   OCI_BUCKET - Bucket name (default: wurud-audio)
 *   OCI_REGION - OCI region (default: us-ashburn-1)
 *   OCI_TENANCY - Tenancy OCID
 *   OCI_USER - User OCID
 *   OCI_FINGERPRINT - API key fingerprint
 *   OCI_PRIVATE_KEY - Private key content (PEM format)
 *
 * Options:
 *   --dry-run     Show what would be uploaded without uploading
 *   --update-db   Update MongoDB lecture records with OCI URLs
 *   --skip-existing  Skip files that already exist in OCI
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { uploadToOCI, objectExists, getPublicUrl, isConfigured } = require('../utils/ociStorage');

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  dryRun: args.includes('--dry-run'),
  updateDb: args.includes('--update-db'),
  skipExisting: args.includes('--skip-existing')
};
const audioDir = args.find(arg => !arg.startsWith('--'));

// Supported audio formats
const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac'];

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get all audio files in directory
 */
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
      const stats = fs.statSync(filePath);
      return {
        name: file,
        path: filePath,
        size: stats.size
      };
    });

  return files;
}

/**
 * Upload all files to OCI
 */
async function uploadFiles(files) {
  console.log(`\n📤 Starting upload of ${files.length} files...\n`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let totalSize = 0;
  const results = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const progress = `[${i + 1}/${files.length}]`;

    if (flags.dryRun) {
      console.log(`${progress} Would upload: ${file.name} (${formatBytes(file.size)})`);
      results.push({ name: file.name, status: 'dry-run', url: getPublicUrl(file.name) });
      continue;
    }

    // Check if file already exists
    if (flags.skipExisting) {
      try {
        const exists = await objectExists(file.name);
        if (exists) {
          console.log(`${progress} ⏭️  Skipping (exists): ${file.name}`);
          skipped++;
          results.push({ name: file.name, status: 'skipped', url: getPublicUrl(file.name) });
          continue;
        }
      } catch (error) {
        // Ignore check errors, proceed with upload
      }
    }

    try {
      process.stdout.write(`${progress} Uploading: ${file.name} (${formatBytes(file.size)})... `);

      const result = await uploadToOCI(file.path, file.name);

      console.log('✅');
      uploaded++;
      totalSize += file.size;
      results.push({ name: file.name, status: 'uploaded', url: result.url });
    } catch (error) {
      console.log(`❌ ${error.message}`);
      failed++;
      results.push({ name: file.name, status: 'failed', error: error.message });
    }
  }

  return { uploaded, skipped, failed, totalSize, results };
}

/**
 * Update MongoDB with OCI URLs
 */
async function updateDatabase(results) {
  console.log('\n📝 Updating MongoDB lecture records...\n');

  const mongoose = require('mongoose');
  const { Lecture } = require('../models');

  // Connect to MongoDB
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  let updated = 0;
  let notFound = 0;

  for (const result of results) {
    if (result.status !== 'uploaded' && result.status !== 'skipped' && result.status !== 'dry-run') {
      continue;
    }

    // Find lecture by audioFileName (match by base name to handle .mp3 -> .m4a conversion)
    const baseName = path.basename(result.name, path.extname(result.name));

    // First try exact match, then try matching base name with any extension
    let lecture = await Lecture.findOne({
      $or: [
        { audioFileName: result.name },
        { audioFileName: baseName }
      ]
    });

    // If not found, try matching base name (DB might have .mp3, file is .m4a)
    if (!lecture) {
      lecture = await Lecture.findOne({
        audioFileName: { $regex: `^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.[a-zA-Z0-9]+$` }
      });
    }

    if (lecture) {
      lecture.audioFileName = result.name;
      lecture.audioUrl = result.url;
      await lecture.save();
      console.log(`  ✅ Updated: ${lecture.titleArabic || lecture.titleEnglish}`);
      updated++;
    } else {
      console.log(`  ⚠️  No lecture found for: ${result.name}`);
      notFound++;
    }
  }

  await mongoose.disconnect();
  console.log('\n✅ Disconnected from MongoDB');

  return { updated, notFound };
}

/**
 * Main function
 */
async function main() {
  console.log('☁️  OCI Object Storage Upload Tool');
  console.log('===================================\n');

  // Check configuration
  if (!isConfigured()) {
    console.error('❌ OCI is not configured. Required environment variables:');
    console.error('   OCI_NAMESPACE, OCI_TENANCY, OCI_USER, OCI_FINGERPRINT, OCI_PRIVATE_KEY, OCI_REGION');
    console.error('\nOr set OCI_CONFIG_FILE to use a config file.');
    process.exit(1);
  }

  // Check audio directory
  if (!audioDir) {
    console.log('Usage: node scripts/upload-to-oci.js <audio-directory> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run        Show what would be uploaded without uploading');
    console.log('  --update-db      Update MongoDB lecture records with OCI URLs');
    console.log('  --skip-existing  Skip files that already exist in OCI');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/upload-to-oci.js /path/to/audio-files --update-db --skip-existing');
    process.exit(1);
  }

  const directory = path.resolve(audioDir);
  console.log(`📁 Audio directory: ${directory}`);

  if (flags.dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be uploaded\n');
  }

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

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  console.log(`📊 Found ${files.length} audio files (${formatBytes(totalSize)} total)\n`);

  // Show OCI configuration
  const oci = require('../config/oci');
  console.log('OCI Configuration:');
  console.log(`  Namespace: ${oci.getNamespace()}`);
  console.log(`  Bucket: ${oci.getBucketName()}`);
  console.log(`  Region: ${oci.getRegion()}`);
  console.log('');

  // Upload files
  const uploadResult = await uploadFiles(files);

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 UPLOAD SUMMARY');
  console.log('='.repeat(50));

  if (flags.dryRun) {
    console.log(`  Would upload: ${files.length} files`);
  } else {
    console.log(`  Uploaded: ${uploadResult.uploaded}`);
    console.log(`  Skipped: ${uploadResult.skipped}`);
    console.log(`  Failed: ${uploadResult.failed}`);
    console.log(`  Total size: ${formatBytes(uploadResult.totalSize)}`);
  }

  // Update database if requested
  if (flags.updateDb && !flags.dryRun && uploadResult.results.length > 0) {
    try {
      const dbResult = await updateDatabase(uploadResult.results);
      console.log('\n📊 DATABASE SUMMARY');
      console.log('='.repeat(50));
      console.log(`  Updated: ${dbResult.updated}`);
      console.log(`  Not found: ${dbResult.notFound}`);
    } catch (error) {
      console.error(`\n❌ Database update failed: ${error.message}`);
    }
  }

  console.log('='.repeat(50));

  if (uploadResult.uploaded > 0 || flags.dryRun) {
    console.log('\n✅ Upload complete!');

    if (!flags.updateDb && !flags.dryRun) {
      console.log('\n💡 Tip: Run with --update-db to update MongoDB records:');
      console.log(`   node scripts/upload-to-oci.js /path/to/audio-files --update-db --skip-existing`);
    }
  }

  if (uploadResult.failed > 0) {
    process.exit(1);
  }
}

// Run
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
