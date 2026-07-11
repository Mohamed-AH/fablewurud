#!/usr/bin/env node
/**
 * Compare Audio Filenames: MongoDB vs OCI (Standalone)
 * Dry-run to verify matching filenames across both databases
 *
 * Note: OCI filenames are URL-encoded, MongoDB are plain text
 *
 * Usage: node scripts/compare-filenames.js [--env .env] [--limit N]
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const mongoose = require('mongoose');
const common = require('oci-common');
const os = require('oci-objectstorage');

// Parse arguments
const args = process.argv.slice(2);
const limitIndex = args.indexOf('--limit');
const LIMIT = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : null;

// Stats
const stats = {
  mongoCount: 0,
  ociCount: 0,
  matched: 0,
  inMongoOnly: [],
  inOciOnly: [],
  zeroByteFiles: []
};

/**
 * Fetch all audioFileNames from MongoDB
 */
async function fetchMongoFilenames() {
  console.log('📊 Fetching from MongoDB...');

  await mongoose.connect(process.env.MONGODB_URI);

  const lectureSchema = new mongoose.Schema({
    audioFileName: String,
    titleArabic: String
  }, { collection: 'lectures', strict: false });

  const Lecture = mongoose.model('Lecture', lectureSchema);

  const lectures = await Lecture.find(
    { audioFileName: { $exists: true, $ne: null, $ne: '' } },
    'audioFileName titleArabic'
  ).lean();

  await mongoose.disconnect();

  // Create a Map with filename as key
  const filenames = new Map();
  lectures.forEach(l => {
    filenames.set(l.audioFileName, { title: l.titleArabic || '' });
  });

  console.log(`   Found ${filenames.size} records\n`);
  return filenames;
}

/**
 * Fetch all objects from OCI bucket with pagination
 */
async function fetchOciObjects() {
  console.log('☁️  Fetching from OCI...');

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

  const client = new os.ObjectStorageClient({ authenticationDetailsProvider: provider });
  const namespace = process.env.OCI_NAMESPACE;
  const bucketName = process.env.OCI_BUCKET || 'wurud-audio';

  console.log(`   Bucket: ${bucketName}`);
  console.log(`   Region: ${process.env.OCI_REGION || 'us-ashburn-1'}`);

  // Paginate through all objects
  const objects = new Map();
  let nextStartWith = null;

  do {
    const response = await client.listObjects({
      namespaceName: namespace,
      bucketName: bucketName,
      limit: 1000,
      start: nextStartWith
    });

    const items = response.listObjects.objects || [];
    items.forEach(obj => {
      if (obj && obj.name) {
        // Decode URL-encoded filename for comparison
        const decodedName = decodeURIComponent(obj.name);
        objects.set(decodedName, {
          originalName: obj.name,
          size: obj.size || 0
        });
      }
    });

    nextStartWith = response.listObjects.nextStartWith;
    process.stdout.write(`\r   Fetched ${objects.size} objects...`);
  } while (nextStartWith);

  console.log(`\n   Total: ${objects.size} objects\n`);
  return objects;
}

/**
 * Compare filenames
 */
function compareFilenames(mongoFiles, ociFiles) {
  console.log('🔍 Comparing filenames...\n');

  stats.mongoCount = mongoFiles.size;
  stats.ociCount = ociFiles.size;

  const matchedFiles = [];

  // Check each MongoDB filename
  for (const [filename, data] of mongoFiles) {
    if (ociFiles.has(filename)) {
      const ociData = ociFiles.get(filename);
      stats.matched++;

      matchedFiles.push({
        filename,
        title: data.title,
        ociSize: ociData.size,
        isZeroByte: ociData.size === 0
      });

      // Check for zero-byte files
      if (ociData.size === 0) {
        stats.zeroByteFiles.push({ filename, title: data.title });
      }
    } else {
      stats.inMongoOnly.push({ filename, title: data.title });
    }
  }

  // Check for OCI files not in MongoDB
  for (const [filename] of ociFiles) {
    if (!mongoFiles.has(filename)) {
      stats.inOciOnly.push(filename);
    }
  }

  return matchedFiles;
}

/**
 * Print results and save matched files
 */
function printResults(matchedFiles) {
  console.log('═══════════════════════════════════════════');
  console.log('📊 Comparison Results');
  console.log('═══════════════════════════════════════════\n');

  console.log(`MongoDB records:      ${stats.mongoCount}`);
  console.log(`OCI objects:          ${stats.ociCount}`);
  console.log(`Matched:              ${stats.matched}`);
  console.log(`Zero-byte in OCI:     ${stats.zeroByteFiles.length}`);
  console.log(`In MongoDB only:      ${stats.inMongoOnly.length}`);
  console.log(`In OCI only:          ${stats.inOciOnly.length}`);

  // Save matched files list
  const fs = require('fs');

  // JSON with full details
  const matchedData = {
    exportedAt: new Date().toISOString(),
    totalMatched: matchedFiles.length,
    zeroByteCount: stats.zeroByteFiles.length,
    files: matchedFiles
  };
  fs.writeFileSync('matched-files.json', JSON.stringify(matchedData, null, 2));

  // Simple text list (filenames only)
  const textList = matchedFiles.map(f => f.filename).join('\n');
  fs.writeFileSync('matched-files.txt', textList);

  console.log(`\n📄 Saved matched files:`);
  console.log(`   matched-files.json (${matchedFiles.length} files with details)`);
  console.log(`   matched-files.txt (filenames only)`);

  // Zero-byte files (corrupted)
  if (stats.zeroByteFiles.length > 0) {
    console.log('\n⚠️  Zero-byte files (corrupted):');
    console.log('─────────────────────────────────');
    const show = LIMIT ? stats.zeroByteFiles.slice(0, LIMIT) : stats.zeroByteFiles.slice(0, 10);
    show.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.filename}`);
    });
    if (stats.zeroByteFiles.length > show.length) {
      console.log(`  ... and ${stats.zeroByteFiles.length - show.length} more`);
    }
  }

  // In MongoDB but not OCI
  if (stats.inMongoOnly.length > 0) {
    console.log('\n❌ In MongoDB but NOT in OCI:');
    console.log('─────────────────────────────────');
    const show = LIMIT ? stats.inMongoOnly.slice(0, LIMIT) : stats.inMongoOnly.slice(0, 10);
    show.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.filename}`);
    });
    if (stats.inMongoOnly.length > show.length) {
      console.log(`  ... and ${stats.inMongoOnly.length - show.length} more`);
    }
  }

  // In OCI but not MongoDB
  if (stats.inOciOnly.length > 0) {
    console.log('\n⚠️  In OCI but NOT in MongoDB:');
    console.log('─────────────────────────────────');
    const show = LIMIT ? stats.inOciOnly.slice(0, LIMIT) : stats.inOciOnly.slice(0, 10);
    show.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f}`);
    });
    if (stats.inOciOnly.length > show.length) {
      console.log(`  ... and ${stats.inOciOnly.length - show.length} more`);
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════');
  if (stats.zeroByteFiles.length > 0) {
    console.log(`🔴 ${stats.zeroByteFiles.length} files need restoration (0 bytes)`);
  }
  if (stats.matched === stats.mongoCount && stats.zeroByteFiles.length === 0) {
    console.log('✅ All MongoDB records have matching non-empty OCI objects');
  }
  console.log('═══════════════════════════════════════════\n');
}

/**
 * Main
 */
async function main() {
  console.log('\n🔍 Compare Filenames: MongoDB vs OCI');
  console.log('═══════════════════════════════════════════\n');

  try {
    const mongoFiles = await fetchMongoFilenames();
    const ociFiles = await fetchOciObjects();

    const matchedFiles = compareFilenames(mongoFiles, ociFiles);
    printResults(matchedFiles);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
