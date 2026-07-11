#!/usr/bin/env node
/**
 * Step 2: Upload Matched Files to OCI
 * Run this on local PC where Oracle and backup files are accessible
 *
 * Usage: node scripts/restore-step2-oci.js --filenames audio-filenames.json --backup-dir /path/to/backups [options]
 *
 * Options:
 *   --filenames FILE   JSON file from Step 1 (required)
 *   --backup-dir DIR   Path to backup audio files (required)
 *   --env FILE         Path to .env file (default: .env)
 *   --dry-run          Show matches without uploading
 *   --limit N          Process only N files
 *   --verbose          Show detailed progress
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
const VERBOSE = args.includes('--verbose');

const limitIndex = args.indexOf('--limit');
const LIMIT = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : null;

const filenamesIndex = args.indexOf('--filenames');
const FILENAMES_FILE = filenamesIndex !== -1 ? args[filenamesIndex + 1] : null;

const backupDirIndex = args.indexOf('--backup-dir');
const BACKUP_DIR = backupDirIndex !== -1 ? args[backupDirIndex + 1] : null;

// Validate required args
if (!FILENAMES_FILE || !BACKUP_DIR) {
  console.error('\n❌ Error: --filenames and --backup-dir are required');
  console.error('\nUsage:');
  console.error('  node scripts/restore-step2-oci.js --filenames audio-filenames.json --backup-dir /path/to/backups [--dry-run]');
  process.exit(1);
}

if (!fs.existsSync(FILENAMES_FILE)) {
  console.error(`\n❌ Error: Filenames file not found: ${FILENAMES_FILE}`);
  process.exit(1);
}

if (!fs.existsSync(BACKUP_DIR)) {
  console.error(`\n❌ Error: Backup directory not found: ${BACKUP_DIR}`);
  process.exit(1);
}

// Stats
const stats = {
  totalRecords: 0,
  totalBackupFiles: 0,
  matched: 0,
  uploaded: 0,
  errors: 0,
  unmatched: [],
  unmatchedBackups: [],
  successfulUploads: []
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
 * Normalize filename for matching
 */
function normalizeFilename(filename) {
  return filename.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Find best match for a filename in backup files
 */
function findBackupMatch(targetFilename, backupFiles) {
  // Exact match
  if (backupFiles.has(targetFilename)) {
    return { match: targetFilename, path: backupFiles.get(targetFilename), type: 'exact' };
  }

  // Normalized match
  const normalizedTarget = normalizeFilename(targetFilename);
  for (const [backupName, backupPath] of backupFiles) {
    if (normalizeFilename(backupName) === normalizedTarget) {
      return { match: backupName, path: backupPath, type: 'normalized' };
    }
  }

  // Basename match (without extension)
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
 * Initialize OCI client
 */
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
    throw new Error('OCI credentials not configured');
  }

  return new os.ObjectStorageClient({ authenticationDetailsProvider: provider });
}

/**
 * Upload file to OCI
 */
async function uploadToOCI(client, namespace, bucketName, objectName, localPath) {
  const fileStats = fs.statSync(localPath);
  const fileStream = fs.createReadStream(localPath);
  const contentDisposition = getContentDisposition(path.basename(objectName));
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

  return { success: true, etag: response.eTag, size: fileStats.size };
}

/**
 * Main restore function
 */
async function restore() {
  console.log('\n☁️  Step 2: Upload Matched Files to OCI');
  console.log('========================================');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '⚡ LIVE'}`);
  console.log(`Filenames: ${FILENAMES_FILE}`);
  console.log(`Backup Dir: ${BACKUP_DIR}`);
  if (LIMIT) console.log(`Limit: ${LIMIT}`);
  console.log('');

  // Load filenames from JSON
  console.log('📋 Loading filenames from JSON...');
  const data = JSON.parse(fs.readFileSync(FILENAMES_FILE, 'utf-8'));
  let records = data.records || data.files || [];

  // Handle direct array format
  if (Array.isArray(data)) {
    records = data;
  }

  stats.totalRecords = records.length;
  console.log(`   Found ${records.length} records\n`);

  // Scan backup directory
  console.log('📁 Scanning backup directory...');
  const backupFiles = scanBackupDirectory(BACKUP_DIR);
  stats.totalBackupFiles = backupFiles.size;
  console.log(`   Found ${backupFiles.size} audio files\n`);

  // Initialize OCI
  let client, namespace, bucketName;

  if (!DRY_RUN) {
    console.log('☁️  Initializing OCI client...');
    client = initOciClient();
    namespace = process.env.OCI_NAMESPACE;
    bucketName = process.env.OCI_BUCKET || 'wurud-audio';
    console.log(`   Bucket: ${bucketName}`);
    console.log(`   Region: ${process.env.OCI_REGION || 'us-ashburn-1'}\n`);
  }

  // Apply limit
  if (LIMIT) {
    records = records.slice(0, LIMIT);
    console.log(`Processing first ${LIMIT} records\n`);
  }

  // Track used backup files
  const usedBackupFiles = new Set();

  console.log('🔄 Processing...\n');

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const progress = `[${i + 1}/${records.length}]`;
    const filename = record.audioFileName || record.filename;
    const title = record.titleArabic || record.titleEnglish || record.title;

    // Check if localPath is already provided (from ready-to-restore.json)
    let localPath = record.localPath;
    let matchType = 'direct';

    if (!localPath) {
      // Fall back to backup directory matching
      const match = findBackupMatch(filename, backupFiles);

      if (!match) {
        stats.unmatched.push({ filename, title });
        if (VERBOSE) console.log(`${progress} ❌ No match: ${filename}`);
        continue;
      }

      localPath = match.path;
      matchType = match.type;
      usedBackupFiles.add(match.match);
    } else {
      // Verify localPath exists
      if (!fs.existsSync(localPath)) {
        stats.unmatched.push({ filename, title, error: 'localPath not found' });
        if (VERBOSE) console.log(`${progress} ❌ File not found: ${localPath}`);
        continue;
      }
    }

    stats.matched++;

    if (DRY_RUN) {
      const info = matchType === 'direct' ? '' : ` (${matchType})`;
      console.log(`${progress} 🔍 Would upload: ${filename}${info}`);
      stats.uploaded++;
      stats.successfulUploads.push({
        filename,
        title,
        localPath,
        status: 'dry-run'
      });
    } else {
      try {
        if (VERBOSE) console.log(`${progress} ⬆️  Uploading: ${filename}`);

        const result = await uploadToOCI(client, namespace, bucketName, filename, localPath);
        stats.uploaded++;
        stats.successfulUploads.push({
          filename,
          title,
          localPath,
          size: result.size,
          etag: result.etag,
          uploadedAt: new Date().toISOString()
        });

        if (!VERBOSE) {
          process.stdout.write(`\r${progress} Uploaded ${stats.uploaded} files...`);
        } else {
          console.log(`${progress} ✅ Done`);
        }
      } catch (error) {
        console.error(`\n${progress} ❌ Error: ${filename} - ${error.message}`);
        stats.errors++;
      }
    }
  }

  if (!VERBOSE && !DRY_RUN) console.log('');

  // Find unused backups
  for (const [name] of backupFiles) {
    if (!usedBackupFiles.has(name)) {
      stats.unmatchedBackups.push(name);
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('📊 Summary');
  console.log('========================================');
  console.log(`DB Records:         ${stats.totalRecords}`);
  console.log(`Backup Files:       ${stats.totalBackupFiles}`);
  console.log(`Matched:            ${stats.matched}`);
  console.log(`Uploaded:           ${stats.uploaded}`);
  console.log(`Errors:             ${stats.errors}`);
  console.log(`Unmatched Records:  ${stats.unmatched.length}`);
  console.log(`Unused Backups:     ${stats.unmatchedBackups.length}`);

  // Save unmatched reports
  if (stats.unmatched.length > 0) {
    const report = stats.unmatched.map(u => `${u.filename}\t${u.title}`).join('\n');
    fs.writeFileSync('unmatched-records.txt', report);
    console.log('\n📄 Unmatched records saved to: unmatched-records.txt');
  }

  if (stats.unmatchedBackups.length > 0) {
    fs.writeFileSync('unused-backups.txt', stats.unmatchedBackups.join('\n'));
    console.log('📄 Unused backups saved to: unused-backups.txt');
  }

  // Save successful uploads log
  if (stats.successfulUploads.length > 0) {
    const logData = {
      completedAt: new Date().toISOString(),
      mode: DRY_RUN ? 'dry-run' : 'live',
      totalUploaded: stats.successfulUploads.length,
      bucket: process.env.OCI_BUCKET || 'wurud-audio',
      region: process.env.OCI_REGION || 'us-ashburn-1',
      files: stats.successfulUploads
    };
    fs.writeFileSync('upload-log.json', JSON.stringify(logData, null, 2));

    // Also create simple text log
    let textLog = `UPLOAD LOG - ${logData.completedAt}\n`;
    textLog += `Mode: ${logData.mode}\n`;
    textLog += `Total: ${logData.totalUploaded} files\n`;
    textLog += `Bucket: ${logData.bucket}\n`;
    textLog += '='.repeat(60) + '\n\n';
    stats.successfulUploads.forEach((f, i) => {
      textLog += `${i + 1}. ${f.filename}\n`;
      if (f.title) textLog += `   Title: ${f.title}\n`;
      if (f.size) textLog += `   Size: ${(f.size / 1024).toFixed(1)} KB\n`;
      if (f.uploadedAt) textLog += `   Uploaded: ${f.uploadedAt}\n`;
      textLog += '\n';
    });
    fs.writeFileSync('upload-log.txt', textLog);

    console.log(`\n✅ Upload log saved:`);
    console.log(`   upload-log.json (${stats.successfulUploads.length} files)`);
    console.log(`   upload-log.txt`);
  }

  if (DRY_RUN) {
    console.log('\n💡 Dry run complete. Remove --dry-run to upload.');
  }

  console.log('');
}

restore().catch(err => {
  console.error('\n❌ Failed:', err.message);
  process.exit(1);
});
