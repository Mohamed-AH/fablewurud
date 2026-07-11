#!/usr/bin/env node
/**
 * Audit MongoDB <-> OCI Object Storage Sync
 *
 * READ-ONLY audit script that compares:
 * - Lectures in MongoDB with audioFileName/audioUrl
 * - Objects in OCI Object Storage bucket
 *
 * Reports:
 * - Lectures in MongoDB missing from OCI (orphaned DB records)
 * - Objects in OCI missing from MongoDB (orphaned OCI files)
 * - Summary statistics
 *
 * Production-Ready Features:
 * - Uses MongoDB cursors for memory-efficient streaming (no OOM risk)
 * - Normalizes filenames to handle encoding/whitespace differences
 * - Graceful error handling with guaranteed DB disconnection
 * - Clean text-based logging (no emojis for log aggregation compatibility)
 *
 * Usage:
 *   node scripts/audit-mongodb-oci-sync.js
 *   node scripts/audit-mongodb-oci-sync.js --verbose
 *   node scripts/audit-mongodb-oci-sync.js --output report.json
 *
 * Options:
 *   --verbose    Show all details (not just mismatches)
 *   --output     Save report to JSON file
 *   --limit N    Limit OCI objects to fetch (for testing)
 */

require('dotenv').config();

const path = require('path');
const mongoose = require('mongoose');
const fs = require('fs');

// Use __dirname for paths relative to script location
const { Lecture } = require(path.join(__dirname, '..', 'models'));
const oci = require(path.join(__dirname, '..', 'config', 'oci'));

// Parse arguments
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const outputIndex = args.indexOf('--output');
const OUTPUT_FILE = outputIndex !== -1 ? args[outputIndex + 1] : null;
const limitIndex = args.indexOf('--limit');
const LIMIT = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : null;

/**
 * Normalize filename for consistent comparison
 * Handles: URL encoding, leading/trailing whitespace, leading slashes
 */
function normalizeFilename(filename) {
  if (!filename) return '';

  let normalized = filename;

  // Decode URL-encoded characters (e.g., %20 -> space)
  try {
    normalized = decodeURIComponent(normalized);
  } catch (e) {
    // If decoding fails, keep original (may already be decoded)
  }

  // Trim whitespace
  normalized = normalized.trim();

  // Remove leading slashes
  normalized = normalized.replace(/^\/+/, '');

  // Normalize multiple spaces to single space
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized;
}

/**
 * List all objects in OCI bucket with pagination
 */
async function listAllOCIObjects() {
  const client = oci.client;
  if (!client) {
    throw new Error('OCI client not initialized. Check OCI environment variables.');
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  if (!namespace || !bucketName) {
    throw new Error('OCI_NAMESPACE or OCI_BUCKET not configured');
  }

  const objects = [];
  let nextStartWith = null;
  let pageCount = 0;
  const pageSize = 1000;

  console.log(`   Bucket: ${bucketName}`);
  console.log(`   Namespace: ${namespace}`);

  do {
    pageCount++;
    const request = {
      namespaceName: namespace,
      bucketName: bucketName,
      limit: LIMIT ? Math.min(LIMIT - objects.length, pageSize) : pageSize,
      fields: 'name,size,timeCreated'
    };

    if (nextStartWith) {
      request.start = nextStartWith;
    }

    const response = await client.listObjects(request);
    const pageObjects = response.listObjects.objects || [];

    for (const obj of pageObjects) {
      if (obj && obj.name) {
        objects.push({
          name: obj.name,
          normalizedName: normalizeFilename(obj.name),
          size: obj.size,
          timeCreated: obj.timeCreated
        });
      }
    }

    nextStartWith = response.listObjects.nextStartWith;

    if (VERBOSE || pageCount % 5 === 0) {
      process.stdout.write(`\r   Fetched ${objects.length} objects (page ${pageCount})...`);
    }

    // Check limit
    if (LIMIT && objects.length >= LIMIT) {
      break;
    }

  } while (nextStartWith);

  console.log(`\r   Fetched ${objects.length} objects total                    `);

  return objects;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Main audit function
 */
async function audit() {
  console.log('='.repeat(70));
  console.log('  AUDIT: MongoDB <-> OCI Object Storage Sync');
  console.log('='.repeat(70));
  console.log('\n  [WARN] READ-ONLY AUDIT - No changes will be made\n');

  const report = {
    timestamp: new Date().toISOString(),
    summary: {},
    mongoDbOrphans: [],      // In MongoDB but not in OCI
    ociOrphans: [],          // In OCI but not in MongoDB
    matched: [],             // In both
    mongoDbNoAudio: []       // MongoDB records with no audioFileName
  };

  // Connect to MongoDB
  console.log('[INFO] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[INFO] Connected\n');

  // Use cursor for memory-efficient streaming
  console.log('[INFO] Streaming lectures from MongoDB (cursor-based)...');

  const mongoFileMap = new Map();  // normalizedFilename -> lecture info
  const rawFilenameMap = new Map(); // normalizedFilename -> original filename
  let totalLectures = 0;
  let lecturesWithAudio = 0;
  let lecturesWithoutAudio = 0;

  // Stream lectures using cursor to avoid loading all into memory
  const cursor = Lecture.find({}, {
    _id: 1,
    audioFileName: 1,
    audioUrl: 1,
    titleArabic: 1,
    seriesId: 1,
    lectureNumber: 1
  }).lean().cursor();

  for await (const lecture of cursor) {
    totalLectures++;

    if (VERBOSE && totalLectures % 1000 === 0) {
      process.stdout.write(`\r   Processed ${totalLectures} lectures...`);
    }

    if (!lecture.audioFileName) {
      lecturesWithoutAudio++;
      report.mongoDbNoAudio.push({
        _id: lecture._id.toString(),
        title: lecture.titleArabic,
        hasUrl: !!lecture.audioUrl
      });
      continue;
    }

    lecturesWithAudio++;
    const normalizedFilename = normalizeFilename(lecture.audioFileName);

    // Check for duplicates (same normalized filename)
    if (mongoFileMap.has(normalizedFilename)) {
      if (!report.duplicateFilenames) report.duplicateFilenames = [];
      report.duplicateFilenames.push({
        filename: lecture.audioFileName,
        normalizedFilename,
        lectureIds: [mongoFileMap.get(normalizedFilename)._id.toString(), lecture._id.toString()]
      });
    }

    mongoFileMap.set(normalizedFilename, lecture);
    rawFilenameMap.set(normalizedFilename, lecture.audioFileName);
  }

  console.log(`\r   Processed ${totalLectures} lectures total                    `);
  console.log(`   ${lecturesWithAudio} lectures have audioFileName`);
  console.log(`   ${lecturesWithoutAudio} lectures have NO audioFileName\n`);

  if (report.duplicateFilenames?.length) {
    console.log(`   [WARN] ${report.duplicateFilenames.length} duplicate audioFileNames in MongoDB\n`);
  }

  // Fetch all OCI objects
  console.log('[INFO] Fetching objects from OCI Object Storage...');
  const ociObjects = await listAllOCIObjects();

  // Create lookup set of normalized OCI filenames
  const ociFileSet = new Set(ociObjects.map(obj => obj.normalizedName));
  const ociFileMap = new Map(ociObjects.map(obj => [obj.normalizedName, obj]));

  // Compare: Find MongoDB records missing from OCI
  console.log('\n[INFO] Comparing records...\n');

  for (const [normalizedFilename, lecture] of mongoFileMap) {
    if (ociFileSet.has(normalizedFilename)) {
      // Matched
      report.matched.push({
        filename: rawFilenameMap.get(normalizedFilename),
        normalizedFilename,
        mongoId: lecture._id.toString(),
        title: lecture.titleArabic?.substring(0, 50),
        ociSize: ociFileMap.get(normalizedFilename).size
      });
    } else {
      // In MongoDB but not in OCI
      report.mongoDbOrphans.push({
        filename: rawFilenameMap.get(normalizedFilename),
        normalizedFilename,
        mongoId: lecture._id.toString(),
        title: lecture.titleArabic,
        audioUrl: lecture.audioUrl,
        seriesId: lecture.seriesId?.toString()
      });
    }
  }

  // Find OCI objects missing from MongoDB
  for (const obj of ociObjects) {
    if (!mongoFileMap.has(obj.normalizedName)) {
      report.ociOrphans.push({
        filename: obj.name,
        normalizedFilename: obj.normalizedName,
        size: obj.size,
        sizeHuman: formatBytes(obj.size),
        timeCreated: obj.timeCreated
      });
    }
  }

  // Calculate summary
  report.summary = {
    totalMongoLectures: totalLectures,
    lecturesWithAudio: lecturesWithAudio,
    lecturesWithoutAudio: lecturesWithoutAudio,
    totalOciObjects: ociObjects.length,
    matched: report.matched.length,
    mongoDbOrphans: report.mongoDbOrphans.length,
    ociOrphans: report.ociOrphans.length,
    duplicateFilenames: report.duplicateFilenames?.length || 0,
    ociTotalSize: ociObjects.reduce((sum, obj) => sum + (obj.size || 0), 0),
    ociOrphanSize: report.ociOrphans.reduce((sum, obj) => sum + (obj.size || 0), 0)
  };

  // Print summary
  console.log('='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`
  MongoDB:
    Total lectures:           ${report.summary.totalMongoLectures}
    With audioFileName:       ${report.summary.lecturesWithAudio}
    Without audioFileName:    ${report.summary.lecturesWithoutAudio}
    Duplicate filenames:      ${report.summary.duplicateFilenames}

  OCI Object Storage:
    Total objects:            ${report.summary.totalOciObjects}
    Total size:               ${formatBytes(report.summary.ociTotalSize)}

  Sync Status:
    [OK]   Matched (in both):     ${report.summary.matched}
    [WARN] MongoDB orphans:       ${report.summary.mongoDbOrphans} (in DB, not in OCI)
    [WARN] OCI orphans:           ${report.summary.ociOrphans} (in OCI, not in DB)
    [INFO] OCI orphan size:       ${formatBytes(report.summary.ociOrphanSize)}
`);

  // Show details for orphans
  if (report.mongoDbOrphans.length > 0) {
    console.log('-'.repeat(70));
    console.log('  MongoDB Orphans (lectures with audioFileName but not in OCI):');
    console.log('-'.repeat(70));
    const showLimit = VERBOSE ? report.mongoDbOrphans.length : Math.min(10, report.mongoDbOrphans.length);
    for (let i = 0; i < showLimit; i++) {
      const orphan = report.mongoDbOrphans[i];
      console.log(`  ${i + 1}. ${orphan.filename}`);
      console.log(`     Title: ${orphan.title?.substring(0, 50)}...`);
      console.log(`     ID: ${orphan.mongoId}`);
    }
    if (!VERBOSE && report.mongoDbOrphans.length > 10) {
      console.log(`  ... and ${report.mongoDbOrphans.length - 10} more (use --verbose to see all)`);
    }
    console.log('');
  }

  if (report.ociOrphans.length > 0) {
    console.log('-'.repeat(70));
    console.log('  OCI Orphans (objects in bucket but not in MongoDB):');
    console.log('-'.repeat(70));
    const showLimit = VERBOSE ? report.ociOrphans.length : Math.min(10, report.ociOrphans.length);
    for (let i = 0; i < showLimit; i++) {
      const orphan = report.ociOrphans[i];
      console.log(`  ${i + 1}. ${orphan.filename}`);
      console.log(`     Size: ${orphan.sizeHuman}`);
    }
    if (!VERBOSE && report.ociOrphans.length > 10) {
      console.log(`  ... and ${report.ociOrphans.length - 10} more (use --verbose to see all)`);
    }
    console.log('');
  }

  // Save report to file if requested
  if (OUTPUT_FILE) {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
    console.log(`[INFO] Full report saved to: ${OUTPUT_FILE}\n`);
  }

  // Recommendations
  console.log('='.repeat(70));
  console.log('  RECOMMENDATIONS');
  console.log('='.repeat(70));

  if (report.mongoDbOrphans.length > 0) {
    console.log(`
  [ACTION] MongoDB Orphans (${report.mongoDbOrphans.length}):
     These lectures have audioFileName but the file doesn't exist in OCI.
     Options:
     a) Upload the missing audio files to OCI
     b) Clear audioFileName/audioUrl for these lectures
     c) Delete the lecture records if no longer needed`);
  }

  if (report.ociOrphans.length > 0) {
    console.log(`
  [ACTION] OCI Orphans (${report.ociOrphans.length}, ${formatBytes(report.summary.ociOrphanSize)}):
     These files exist in OCI but have no matching MongoDB record.
     Options:
     a) Create MongoDB records for these files
     b) Delete these files from OCI to free space
     c) Keep as backup/archive`);
  }

  if (report.summary.lecturesWithoutAudio > 0) {
    console.log(`
  [INFO] Lectures Without Audio (${report.summary.lecturesWithoutAudio}):
     These lectures have no audioFileName set.
     This may be intentional for placeholder records.`);
  }

  if (report.mongoDbOrphans.length === 0 && report.ociOrphans.length === 0) {
    console.log('\n  [SUCCESS] Perfect sync! All MongoDB records match OCI objects.\n');
  }

  console.log('');

  return report;
}

/**
 * Main entry point with graceful error handling
 */
async function main() {
  try {
    await audit();
  } catch (err) {
    console.error(`\n[ERROR] Audit failed: ${err.message}`);
    if (VERBOSE) {
      console.error(err.stack);
    }
    process.exitCode = 1;
  } finally {
    // Always disconnect from MongoDB, even on error
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('[INFO] MongoDB connection closed');
    }
  }
}

// Run
main();
