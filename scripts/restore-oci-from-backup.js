#!/usr/bin/env node
/**
 * Restore OCI Bucket from Local Backup Files
 *
 * This script restores audio files to OCI Object Storage from local backups.
 * It matches filenames from MongoDB records against local files and re-uploads.
 *
 * Usage:
 *   node scripts/restore-oci-from-backup.js --backup-dir /path/to/backups [options]
 *
 * Options:
 *   --backup-dir DIR   Path to directory containing backup audio files (required)
 *   --env FILE         Path to .env file (default: .env)
 *   --dry-run          Show what would be uploaded without making changes
 *   --limit N          Process only N files (for testing)
 *   --verbose          Show detailed progress
 *
 * Examples:
 *   # Dry run to see matches
 *   node scripts/restore-oci-from-backup.js --backup-dir ./backups --dry-run
 *
 *   # Restore all matched files
 *   node scripts/restore-oci-from-backup.js --backup-dir ./backups --env .env.production
 */

// Parse --env argument first
const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const limitIndex = args.indexOf('--limit');
const LIMIT = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : null;
const backupDirIndex = args.indexOf('--backup-dir');
const BACKUP_DIR = backupDirIndex !== -1 ? args[backupDirIndex + 1] : null;

if (!BACKUP_DIR) {
  console.error('\n❌ Error: --backup-dir is required');
  console.error('\nUsage:');
  console.error('  node scripts/restore-oci-from-backup.js --backup-dir /path/to/backups [--dry-run]');
  process.exit(1);
}

if (!fs.existsSync(BACKUP_DIR)) {
  console.error(`\n❌ Error: Backup directory not found: ${BACKUP_DIR}`);
  process.exit(1);
}

// Stats
const stats = {
  totalDbRecords: 0,
  totalBackupFiles: 0,
  matched: 0,
  uploaded: 0,
  skipped: 0,
  errors: 0,
  unmatched: [],
  unmatchedBackups: []
};

/**
 * Get Content-Disposition header with RFC 5987 encoding for non-ASCII
 */
function getContentDisposition(filename) {
  const hasNonAscii = /[^\x00-\x7F]/.test(filename);
  if (hasNonAscii) {
    return `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }
  return `attachment; filename="${filename}"`;
}

/**
 * Get mime type from file extension
 */
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

/**
 * Scan backup directory for audio files
 */
function scanBackupDirectory(dir) {
  const audioExtensions = ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac'];
  const files = new Map();

  function scanDir(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (audioExtensions.includes(ext)) {
          // Store by filename (without path) for matching
          const filename = entry.name;
          if (!files.has(filename)) {
            files.set(filename, fullPath);
          }
        }
      }
    }
  }

  scanDir(dir);
  return files;
}

/**
 * Normalize filename for matching (handle minor variations)
 */
function normalizeFilename(filename) {
  return filename
    .trim()
    .replace(/\s+/g, ' ')  // Normalize spaces
    .toLowerCase();
}

/**
 * Find best match for a filename in backup files
 */
function findBackupMatch(targetFilename, backupFiles) {
  // Exact match first
  if (backupFiles.has(targetFilename)) {
    return { match: targetFilename, path: backupFiles.get(targetFilename), type: 'exact' };
  }

  // Try normalized match
  const normalizedTarget = normalizeFilename(targetFilename);
  for (const [backupName, backupPath] of backupFiles) {
    if (normalizeFilename(backupName) === normalizedTarget) {
      return { match: backupName, path: backupPath, type: 'normalized' };
    }
  }

  // Try matching without extension
  const targetBase = path.basename(targetFilename, path.extname(targetFilename));
  for (const [backupName, backupPath] of backupFiles) {
    const backupBase = path.basename(backupName, path.extname(backupName));
    if (normalizeFilename(backupBase) === normalizeFilename(targetBase)) {
      return { match: backupName, path: backupPath, type: 'basename' };
    }
  }

  return null;
}

/**
 * Upload file to OCI with proper headers
 */
async function uploadToOCI(client, namespace, bucketName, objectName, localPath) {
  const fileStats = fs.statSync(localPath);
  const fileStream = fs.createReadStream(localPath);
  const contentDisposition = getContentDisposition(path.basename(objectName));
  const contentType = getMimeType(objectName);

  const putObjectRequest = {
    namespaceName: namespace,
    bucketName: bucketName,
    objectName: objectName,
    putObjectBody: fileStream,
    contentLength: fileStats.size,
    contentType: contentType,
    contentDisposition: contentDisposition,
    cacheControl: 'public, max-age=31536000'
  };

  const response = await client.putObject(putObjectRequest);
  return {
    success: true,
    etag: response.eTag,
    size: fileStats.size
  };
}

/**
 * Main restore function
 */
async function restore() {
  console.log('\n🔄 OCI Bucket Restoration from Backup');
  console.log('======================================');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '⚡ LIVE'}`);
  console.log(`Backup Directory: ${BACKUP_DIR}`);
  if (LIMIT) console.log(`Limit: ${LIMIT} files`);
  console.log('');

  // Connect to MongoDB
  console.log('📊 Connecting to MongoDB...');
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('   Connected\n');

  // Get Lecture model
  const { Lecture } = require('../models');

  // Fetch all lectures with audioFileName
  console.log('📋 Fetching lecture records from database...');
  const lectures = await Lecture.find(
    { audioFileName: { $exists: true, $ne: null, $ne: '' } },
    'audioFileName titleArabic titleEnglish'
  ).lean();

  stats.totalDbRecords = lectures.length;
  console.log(`   Found ${lectures.length} lectures with audio files\n`);

  // Scan backup directory
  console.log('📁 Scanning backup directory...');
  const backupFiles = scanBackupDirectory(BACKUP_DIR);
  stats.totalBackupFiles = backupFiles.size;
  console.log(`   Found ${backupFiles.size} audio files\n`);

  // Initialize OCI client
  const oci = require('../config/oci');
  const client = oci.client;

  if (!client && !DRY_RUN) {
    console.error('❌ Failed to initialize OCI client');
    process.exit(1);
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  console.log(`📦 Bucket: ${bucketName}`);
  console.log(`🌍 Region: ${oci.getRegion()}\n`);

  // Track which backup files were used
  const usedBackupFiles = new Set();

  // Process lectures
  let toProcess = lectures;
  if (LIMIT) {
    toProcess = lectures.slice(0, LIMIT);
    console.log(`   Processing first ${LIMIT} lectures\n`);
  }

  console.log('🔍 Matching and uploading...\n');

  for (let i = 0; i < toProcess.length; i++) {
    const lecture = toProcess[i];
    const progress = `[${i + 1}/${toProcess.length}]`;
    const filename = lecture.audioFileName;

    // Find matching backup file
    const match = findBackupMatch(filename, backupFiles);

    if (!match) {
      stats.unmatched.push({
        filename,
        title: lecture.titleArabic || lecture.titleEnglish
      });
      if (VERBOSE) {
        console.log(`${progress} ❌ No match: ${filename}`);
      }
      continue;
    }

    stats.matched++;
    usedBackupFiles.add(match.match);

    if (DRY_RUN) {
      const matchInfo = match.type === 'exact' ? '' : ` (${match.type} match: ${match.match})`;
      console.log(`${progress} 🔍 Would upload: ${filename}${matchInfo}`);
      stats.uploaded++;
    } else {
      try {
        if (VERBOSE || match.type !== 'exact') {
          console.log(`${progress} ⬆️  Uploading: ${filename}`);
          if (match.type !== 'exact') {
            console.log(`       Matched with: ${match.match} (${match.type})`);
          }
        }

        await uploadToOCI(client, namespace, bucketName, filename, match.path);

        if (VERBOSE) {
          console.log(`${progress} ✅ Uploaded: ${filename}`);
        } else {
          process.stdout.write(`\r${progress} Uploaded ${stats.uploaded + 1} files...`);
        }

        stats.uploaded++;
      } catch (error) {
        console.error(`${progress} ❌ Error: ${filename} - ${error.message}`);
        stats.errors++;
      }
    }
  }

  if (!VERBOSE && !DRY_RUN) {
    console.log(''); // New line after progress
  }

  // Find unused backup files
  for (const [backupName, backupPath] of backupFiles) {
    if (!usedBackupFiles.has(backupName)) {
      stats.unmatchedBackups.push({ filename: backupName, path: backupPath });
    }
  }

  // Print summary
  console.log('\n======================================');
  console.log('📊 Restoration Summary');
  console.log('======================================');
  console.log(`Database records:     ${stats.totalDbRecords}`);
  console.log(`Backup files found:   ${stats.totalBackupFiles}`);
  console.log(`Matched:              ${stats.matched}`);
  console.log(`Uploaded:             ${stats.uploaded}`);
  console.log(`Errors:               ${stats.errors}`);
  console.log(`Unmatched DB records: ${stats.unmatched.length}`);
  console.log(`Unused backup files:  ${stats.unmatchedBackups.length}`);

  // Write unmatched files report
  if (stats.unmatched.length > 0) {
    console.log('\n❌ Unmatched Database Records (need manual resolution):');
    console.log('---------------------------------------------------');
    const unmatchedReport = stats.unmatched.map(u => `${u.filename}\t${u.title}`).join('\n');

    if (stats.unmatched.length <= 20) {
      stats.unmatched.forEach(u => {
        console.log(`  ${u.filename}`);
        if (u.title) console.log(`    Title: ${u.title}`);
      });
    } else {
      console.log(`  (${stats.unmatched.length} files - see unmatched-db-records.txt)`);
    }

    fs.writeFileSync('unmatched-db-records.txt', unmatchedReport);
    console.log('\n   Saved to: unmatched-db-records.txt');
  }

  if (stats.unmatchedBackups.length > 0) {
    console.log('\n⚠️  Unused Backup Files (no matching DB record):');
    console.log('------------------------------------------------');
    const unusedReport = stats.unmatchedBackups.map(u => u.filename).join('\n');

    if (stats.unmatchedBackups.length <= 20) {
      stats.unmatchedBackups.forEach(u => {
        console.log(`  ${u.filename}`);
      });
    } else {
      console.log(`  (${stats.unmatchedBackups.length} files - see unused-backup-files.txt)`);
    }

    fs.writeFileSync('unused-backup-files.txt', unusedReport);
    console.log('\n   Saved to: unused-backup-files.txt');
  }

  if (DRY_RUN) {
    console.log('\n💡 This was a dry run. Run without --dry-run to upload files.');
  }

  console.log('');

  // Close MongoDB connection
  await mongoose.disconnect();
}

// Run restore
restore()
  .then(() => {
    process.exit(stats.errors > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('\n❌ Restoration failed:', error);
    process.exit(1);
  });
