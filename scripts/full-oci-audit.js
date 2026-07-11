#!/usr/bin/env node
/**
 * Full OCI Bucket Audit
 *
 * Lists ALL files in OCI bucket with:
 * - File size (identifies empty files)
 * - MongoDB link status (linked / orphan)
 * - Filename analysis for cleanup planning
 *
 * Usage:
 *   node scripts/full-oci-audit.js
 *   node scripts/full-oci-audit.js --output oci-audit.json
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { Lecture } = require(path.join(__dirname, '..', 'models'));
const oci = require(path.join(__dirname, '..', 'config', 'oci'));

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
const OUTPUT_FILE = outputIndex !== -1 ? args[outputIndex + 1] : null;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function main() {
  console.log('='.repeat(70));
  console.log('  FULL OCI BUCKET AUDIT');
  console.log('='.repeat(70));
  console.log('\n[INFO] This will list ALL files in the bucket with sizes and status.\n');

  // Connect to MongoDB
  console.log('[INFO] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);

  // Get all audioFileNames from MongoDB
  console.log('[INFO] Loading MongoDB audioFileNames...');
  const cursor = Lecture.find(
    { audioFileName: { $ne: null } },
    { audioFileName: 1, _id: 1, titleArabic: 1 }
  ).lean().cursor();

  const mongoFiles = new Map(); // filename -> lecture info
  let mongoCount = 0;

  for await (const lecture of cursor) {
    mongoFiles.set(lecture.audioFileName, {
      _id: lecture._id.toString(),
      title: lecture.titleArabic
    });
    mongoCount++;
  }

  console.log(`[INFO] Loaded ${mongoCount} MongoDB records\n`);

  // Initialize OCI
  const client = oci.client;
  if (!client) {
    console.error('[ERROR] OCI client not initialized');
    await mongoose.disconnect();
    process.exit(1);
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  console.log(`[INFO] Bucket: ${bucketName}`);
  console.log('[INFO] Fetching all OCI objects...\n');

  // List all OCI objects with pagination
  const allObjects = [];
  let nextStart = null;

  do {
    const request = {
      namespaceName: namespace,
      bucketName: bucketName,
      limit: 1000,
      fields: 'name,size,timeCreated'
    };
    if (nextStart) request.start = nextStart;

    const response = await client.listObjects(request);
    const objects = response.listObjects.objects || [];
    allObjects.push(...objects);
    nextStart = response.listObjects.nextStartWith;

    process.stdout.write(`\r   Fetched ${allObjects.length} objects...`);
  } while (nextStart);

  console.log(`\r   Fetched ${allObjects.length} objects total      \n`);

  // Analyze each object
  const report = {
    timestamp: new Date().toISOString(),
    bucket: bucketName,
    summary: {
      totalObjects: allObjects.length,
      totalSize: 0,
      linkedToMongo: 0,
      orphans: 0,
      emptyFiles: 0,
      emptyLinked: 0,
      emptyOrphans: 0
    },
    categories: {
      emptyLinked: [],      // 0-byte but has MongoDB record (BAD)
      emptyOrphans: [],     // 0-byte and no MongoDB record (safe to delete)
      healthyLinked: [],    // Has content and MongoDB record (GOOD)
      contentOrphans: []    // Has content but no MongoDB record (review)
    }
  };

  for (const obj of allObjects) {
    const filename = obj.name;
    const size = obj.size || 0;
    const isLinked = mongoFiles.has(filename);
    const isEmpty = size === 0;

    report.summary.totalSize += size;

    const fileInfo = {
      filename,
      size,
      sizeHuman: formatBytes(size),
      timeCreated: obj.timeCreated
    };

    if (isLinked) {
      fileInfo.mongoId = mongoFiles.get(filename)._id;
      fileInfo.title = mongoFiles.get(filename).title;
      report.summary.linkedToMongo++;

      if (isEmpty) {
        report.summary.emptyFiles++;
        report.summary.emptyLinked++;
        report.categories.emptyLinked.push(fileInfo);
      } else {
        report.categories.healthyLinked.push(fileInfo);
      }
    } else {
      report.summary.orphans++;

      if (isEmpty) {
        report.summary.emptyFiles++;
        report.summary.emptyOrphans++;
        report.categories.emptyOrphans.push(fileInfo);
      } else {
        report.categories.contentOrphans.push(fileInfo);
      }
    }
  }

  // Print summary
  console.log('='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`
  Total OCI objects:        ${report.summary.totalObjects}
  Total size:               ${formatBytes(report.summary.totalSize)}

  Linked to MongoDB:        ${report.summary.linkedToMongo}
  Orphans (no MongoDB):     ${report.summary.orphans}

  Empty files (0 bytes):    ${report.summary.emptyFiles}
    - Empty + Linked:       ${report.summary.emptyLinked} [CRITICAL - broken audio]
    - Empty + Orphan:       ${report.summary.emptyOrphans} [safe to delete]

  Healthy linked:           ${report.categories.healthyLinked.length} [OK]
  Content orphans:          ${report.categories.contentOrphans.length} [review needed]
`);

  // Show critical issues (empty but linked to MongoDB)
  if (report.categories.emptyLinked.length > 0) {
    console.log('-'.repeat(70));
    console.log('  [CRITICAL] EMPTY FILES LINKED TO MONGODB (broken audio):');
    console.log('-'.repeat(70));
    for (const f of report.categories.emptyLinked.slice(0, 20)) {
      console.log(`  ${f.filename.substring(0, 50)}`);
      console.log(`    MongoDB: ${f.mongoId} | ${f.title?.substring(0, 30)}`);
    }
    if (report.categories.emptyLinked.length > 20) {
      console.log(`  ... and ${report.categories.emptyLinked.length - 20} more`);
    }
    console.log('');
  }

  // Show content orphans
  if (report.categories.contentOrphans.length > 0) {
    console.log('-'.repeat(70));
    console.log('  CONTENT ORPHANS (has data, no MongoDB record):');
    console.log('-'.repeat(70));
    for (const f of report.categories.contentOrphans.slice(0, 10)) {
      console.log(`  ${f.sizeHuman.padStart(10)} | ${f.filename.substring(0, 50)}`);
    }
    if (report.categories.contentOrphans.length > 10) {
      console.log(`  ... and ${report.categories.contentOrphans.length - 10} more`);
    }
    console.log('');
  }

  // Save full report
  if (OUTPUT_FILE) {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
    console.log(`[INFO] Full report saved to: ${OUTPUT_FILE}\n`);
  }

  console.log('='.repeat(70));

  await mongoose.disconnect();
  return report;
}

main().catch(async err => {
  console.error(`[ERROR] ${err.message}`);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exit(1);
});
