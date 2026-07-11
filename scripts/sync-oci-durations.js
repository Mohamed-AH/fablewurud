#!/usr/bin/env node
/**
 * Sync Audio Durations from OCI to MongoDB
 *
 * This script fetches all lectures with audio files, downloads them temporarily,
 * extracts duration metadata, and updates the MongoDB records.
 *
 * Usage:
 *   node scripts/sync-oci-durations.js [--dry-run] [--limit N] [--env FILE]
 *
 * Options:
 *   --dry-run   Show what would be updated without making changes
 *   --limit N   Process only N lectures (for testing)
 *   --force     Update even if duration already exists
 *   --env FILE  Path to .env file (default: .env)
 *
 * Examples:
 *   node scripts/sync-oci-durations.js --dry-run --limit 5
 *   node scripts/sync-oci-durations.js --env /path/to/.env
 */

// Parse --env argument first
const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

// Verify required environment variables
if (!process.env.MONGODB_URI) {
  console.error('\n❌ Error: MONGODB_URI environment variable is not set.');
  console.error('\nUsage:');
  console.error('  node scripts/sync-oci-durations.js --env /path/to/.env');
  console.error('  MONGODB_URI="mongodb://..." node scripts/sync-oci-durations.js');
  console.error('\nExample with env file:');
  console.error('  node scripts/sync-oci-durations.js --env .env.production --dry-run --limit 5\n');
  process.exit(1);
}

const mongoose = require('mongoose');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseFile } = require('music-metadata');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const limitIndex = args.indexOf('--limit');
const LIMIT = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : null;

// Import models after dotenv
const Lecture = require('../models/Lecture');

// Temp directory for downloads
const TEMP_DIR = path.join(os.tmpdir(), 'wurud-audio-sync');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Download a file from URL to local path
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const file = fs.createWriteStream(destPath);

    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });

      file.on('error', (err) => {
        fs.unlinkSync(destPath);
        reject(err);
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      reject(err);
    });
  });
}

/**
 * Extract audio duration from file
 */
async function extractDuration(filePath) {
  try {
    const metadata = await parseFile(filePath);
    return {
      duration: Math.round(metadata.format.duration || 0),
      bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : null,
      codec: metadata.format.codec || null,
      container: metadata.format.container || null
    };
  } catch (error) {
    throw new Error(`Failed to parse audio: ${error.message}`);
  }
}

/**
 * Format duration in seconds to HH:MM:SS
 */
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '00:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Clean up temporary files
 */
function cleanup(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn(`  ⚠️  Could not delete temp file: ${filePath}`);
  }
}

/**
 * Main sync function
 */
async function syncDurations() {
  console.log('\n🎵 OCI Audio Duration Sync Script');
  console.log('='.repeat(50));

  if (DRY_RUN) {
    console.log('📋 DRY RUN MODE - No changes will be made\n');
  }
  if (FORCE) {
    console.log('🔄 FORCE MODE - Will update existing durations\n');
  }
  if (LIMIT) {
    console.log(`📊 LIMIT: Processing only ${LIMIT} lectures\n`);
  }

  // Connect to MongoDB
  console.log('🔌 Connecting to MongoDB...');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');
  } catch (err) {
    console.error('✗ MongoDB connection failed:', err.message);
    process.exit(1);
  }

  // Build query
  const query = { audioUrl: { $exists: true, $ne: null, $ne: '' } };

  // If not forcing, only get lectures without duration
  if (!FORCE) {
    query.$or = [
      { duration: { $exists: false } },
      { duration: null },
      { duration: 0 }
    ];
  }

  // Fetch lectures
  console.log('📚 Fetching lectures with audio files...');
  let lecturesQuery = Lecture.find(query)
    .select('_id titleArabic audioUrl audioFileName duration fileSize')
    .sort({ createdAt: -1 });

  if (LIMIT) {
    lecturesQuery = lecturesQuery.limit(LIMIT);
  }

  const lectures = await lecturesQuery.exec();
  console.log(`✓ Found ${lectures.length} lectures to process\n`);

  if (lectures.length === 0) {
    console.log('✓ No lectures need duration updates. All done!');
    await mongoose.disconnect();
    return;
  }

  // Stats
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // Process each lecture
  for (const lecture of lectures) {
    processed++;
    const title = lecture.titleArabic.substring(0, 40);
    console.log(`[${processed}/${lectures.length}] ${title}...`);

    // Generate temp filename
    const ext = path.extname(lecture.audioFileName || '.m4a') || '.m4a';
    const tempFile = path.join(TEMP_DIR, `temp-${lecture._id}${ext}`);

    try {
      // Download audio file
      process.stdout.write('  ⬇️  Downloading... ');
      await downloadFile(lecture.audioUrl, tempFile);

      const stats = fs.statSync(tempFile);
      console.log(`${(stats.size / (1024 * 1024)).toFixed(2)} MB`);

      // Extract duration
      process.stdout.write('  🎵 Extracting metadata... ');
      const audioInfo = await extractDuration(tempFile);
      console.log(`${formatDuration(audioInfo.duration)}`);

      // Update lecture
      if (!DRY_RUN) {
        await Lecture.updateOne(
          { _id: lecture._id },
          {
            $set: {
              duration: audioInfo.duration,
              fileSize: stats.size
            }
          }
        );
        console.log(`  ✓ Updated: duration=${audioInfo.duration}s, size=${stats.size}`);
      } else {
        console.log(`  📋 Would update: duration=${audioInfo.duration}s, size=${stats.size}`);
      }

      updated++;

    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      errors++;
    } finally {
      // Clean up temp file
      cleanup(tempFile);
    }

    console.log('');
  }

  // Summary
  console.log('='.repeat(50));
  console.log('📊 Summary:');
  console.log(`   Total processed: ${processed}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Errors: ${errors}`);

  if (DRY_RUN) {
    console.log('\n📋 This was a dry run. Run without --dry-run to apply changes.');
  }

  // Cleanup temp directory
  try {
    fs.rmdirSync(TEMP_DIR);
  } catch (err) {
    // Directory might not be empty or already deleted
  }

  await mongoose.disconnect();
  console.log('\n✓ Done!\n');
}

// Run the script
syncDurations().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
