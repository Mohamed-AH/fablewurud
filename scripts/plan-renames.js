#!/usr/bin/env node
/**
 * Phase 1: Rename Plan Generator (READ-ONLY)
 *
 * Analyzes MongoDB, OCI, and local files to generate a rename plan.
 * Does NOT modify any data - only reads and outputs a plan JSON.
 *
 * Usage:
 *   node scripts/plan-renames.js --output rename-plan.json
 *   node scripts/plan-renames.js --output rename-plan.json --local-dir /path/to/audio
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { Lecture } = require(path.join(__dirname, '..', 'models'));
const oci = require(path.join(__dirname, '..', 'config', 'oci'));

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')
    ? args[idx + 1]
    : null;
}

const OUTPUT_FILE = getArg('--output');
const LOCAL_DIR = getArg('--local-dir');
const VERBOSE = args.includes('--verbose');

if (!OUTPUT_FILE) {
  console.log(`
Usage: node scripts/plan-renames.js --output <plan.json> [options]

Options:
  --output <file>       Output JSON file for rename plan (required)
  --local-dir <path>    Local audio directory to check for files
  --verbose             Show detailed progress

This script is READ-ONLY. It does not modify any data.
`);
  process.exit(1);
}

/**
 * Apply rename rules to a filename
 * Returns null if no changes needed
 */
function applyRenameRules(filename) {
  let newName = filename;

  // Rule 1: Remove [AudioTrimmer.com] suffix
  newName = newName.replace(/\[AudioTrimmer\.com\]/g, '');

  // Rule 2: Remove duplicate markers (1), (2), (3), (4), etc.
  newName = newName.replace(/\s*\(\d+\)/g, '');

  // Rule 3: Replace "Mp3 Editor_" with "Mp3-Editor_" (remove space)
  newName = newName.replace(/Mp3 Editor_/g, 'Mp3-Editor_');

  // Rule 4: Clean up resulting issues
  // Remove consecutive dashes before extension
  newName = newName.replace(/-+\.m4a$/i, '.m4a');
  // Remove trailing dash before extension
  newName = newName.replace(/-\.m4a$/i, '.m4a');
  // Remove leading/trailing whitespace
  newName = newName.trim();
  // Remove consecutive spaces
  newName = newName.replace(/\s+/g, ' ');
  // Remove space before extension
  newName = newName.replace(/\s+\.m4a$/i, '.m4a');

  // Return null if no changes
  if (newName === filename) {
    return null;
  }

  return newName;
}

async function main() {
  // Validate required environment variables
  if (!process.env.MONGODB_URI) {
    console.error('[ERROR] MONGODB_URI environment variable is missing.');
    process.exit(1);
  }

  if (!oci.isConfigured()) {
    console.error('[ERROR] OCI credentials not configured.');
    console.error('[INFO] Set OCI_PRIVATE_KEY + OCI_TENANCY or OCI_CONFIG_FILE.');
    process.exit(1);
  }

  console.log('='.repeat(70));
  console.log('  PHASE 1: RENAME PLAN GENERATOR (READ-ONLY)');
  console.log('='.repeat(70));
  console.log(`
  Output:    ${OUTPUT_FILE}
  Local Dir: ${LOCAL_DIR || '(not specified)'}

  [INFO] This script does NOT modify any data.
`);

  // Connect to MongoDB
  console.log('[INFO] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[INFO] Connected\n');

  // Load all lectures with audioFileName
  console.log('[INFO] Loading lectures from MongoDB...');
  const lectures = await Lecture.find(
    { audioFileName: { $ne: null } },
    { audioFileName: 1, _id: 1, titleArabic: 1 }
  ).lean();

  console.log(`[INFO] Found ${lectures.length} lectures with audio files\n`);

  // Initialize OCI client
  const client = oci.client;
  if (!client) {
    console.error('[ERROR] OCI client not initialized');
    await mongoose.disconnect();
    process.exit(1);
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  // Fetch all OCI objects for existence check
  console.log('[INFO] Fetching OCI object list...');
  const ociObjects = new Map();
  let nextStart = null;

  do {
    const request = {
      namespaceName: namespace,
      bucketName: bucketName,
      limit: 1000,
      fields: 'name,size'
    };
    if (nextStart) request.start = nextStart;

    const response = await client.listObjects(request);
    const objects = response.listObjects.objects || [];

    for (const obj of objects) {
      ociObjects.set(obj.name, { size: obj.size || 0 });
    }

    nextStart = response.listObjects.nextStartWith;
    process.stdout.write(`\r   Loaded ${ociObjects.size} OCI objects...`);
  } while (nextStart);

  console.log(`\r   Loaded ${ociObjects.size} OCI objects total      \n`);

  // Build local file index if directory provided
  let localFiles = new Map();
  if (LOCAL_DIR) {
    console.log(`[INFO] Scanning local directory: ${LOCAL_DIR}`);
    try {
      const files = fs.readdirSync(LOCAL_DIR);
      for (const file of files) {
        const fullPath = path.join(LOCAL_DIR, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            localFiles.set(file, { path: fullPath, size: stat.size });
          }
        } catch (e) {
          // Skip files we can't stat
        }
      }
      console.log(`[INFO] Found ${localFiles.size} local files\n`);
    } catch (err) {
      console.error(`[ERROR] Cannot read local directory: ${err.message}`);
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  // Analyze each lecture and build rename plan
  console.log('[INFO] Analyzing files and applying rename rules...\n');

  const plan = {
    timestamp: new Date().toISOString(),
    config: {
      localDir: LOCAL_DIR || null,
      ociBucket: bucketName,
      ociNamespace: namespace
    },
    summary: {
      totalLectures: lectures.length,
      requiresRename: 0,
      noChangeNeeded: 0,
      collisions: 0,
      missingInOci: 0,
      missingLocally: 0
    },
    renameRules: [
      'Remove [AudioTrimmer.com] suffix',
      'Remove duplicate markers (1), (2), etc.',
      'Replace "Mp3 Editor_" with "Mp3-Editor_"',
      'Clean up trailing dashes and spaces'
    ],
    collisions: [],
    renames: [],
    skipped: []
  };

  // Track new names to detect collisions
  const newNameMap = new Map(); // newName -> array of original filenames

  for (const lecture of lectures) {
    const filename = lecture.audioFileName;
    const newFilename = applyRenameRules(filename);

    const ociData = ociObjects.get(filename);
    const localData = LOCAL_DIR ? localFiles.get(filename) : null;

    const entry = {
      mongoId: lecture._id.toString(),
      title: lecture.titleArabic,
      filename: filename,
      newFilename: newFilename,
      ociExists: ociData !== undefined,
      ociSize: ociData ? ociData.size : null,
      localFileExists: localData !== undefined,
      localFilePath: localData ? localData.path : null,
      localFileSize: localData ? localData.size : null
    };

    if (!ociData) {
      plan.summary.missingInOci++;
    }

    if (LOCAL_DIR && !localData) {
      plan.summary.missingLocally++;
    }

    if (newFilename === null) {
      // No rename needed
      plan.summary.noChangeNeeded++;
      plan.skipped.push({
        mongoId: entry.mongoId,
        filename: entry.filename,
        reason: 'No rename needed'
      });
      continue;
    }

    // Track for collision detection
    if (!newNameMap.has(newFilename)) {
      newNameMap.set(newFilename, []);
    }
    newNameMap.get(newFilename).push(filename);

    entry.hasCollision = false; // Will be updated after full scan
    plan.renames.push(entry);
    plan.summary.requiresRename++;
  }

  // Detect collisions
  console.log('[INFO] Checking for collisions...\n');

  for (const [newName, originals] of newNameMap.entries()) {
    if (originals.length > 1) {
      plan.summary.collisions++;

      // Mark all affected entries
      const collisionGroup = {
        proposedName: newName,
        conflictingFiles: originals,
        resolution: 'MANUAL_REQUIRED'
      };
      plan.collisions.push(collisionGroup);

      // Update hasCollision flag on each rename entry
      for (const rename of plan.renames) {
        if (originals.includes(rename.filename)) {
          rename.hasCollision = true;
          rename.collidesWith = originals.filter(f => f !== rename.filename);
        }
      }
    }
  }

  // Also check if new name already exists in OCI (would overwrite)
  for (const rename of plan.renames) {
    if (!rename.hasCollision && ociObjects.has(rename.newFilename)) {
      // New name already exists as a different file
      if (rename.newFilename !== rename.filename) {
        rename.hasCollision = true;
        rename.collidesWith = [`[EXISTING IN OCI: ${rename.newFilename}]`];
        plan.summary.collisions++;
        plan.collisions.push({
          proposedName: rename.newFilename,
          conflictingFiles: [rename.filename, `[EXISTING: ${rename.newFilename}]`],
          resolution: 'MANUAL_REQUIRED'
        });
      }
    }
  }

  // Print summary
  console.log('='.repeat(70));
  console.log('  PLAN SUMMARY');
  console.log('='.repeat(70));
  console.log(`
  Total lectures:       ${plan.summary.totalLectures}
  Requires rename:      ${plan.summary.requiresRename}
  No change needed:     ${plan.summary.noChangeNeeded}

  WARNINGS:
    Collisions:         ${plan.summary.collisions} ${plan.summary.collisions > 0 ? '[BLOCKING - must resolve first]' : '[OK]'}
    Missing in OCI:     ${plan.summary.missingInOci} ${plan.summary.missingInOci > 0 ? '[WARNING]' : '[OK]'}
    Missing locally:    ${plan.summary.missingLocally} ${LOCAL_DIR ? (plan.summary.missingLocally > 0 ? '[WARNING]' : '[OK]') : '[N/A - no local dir]'}
`);

  // Show collisions if any
  if (plan.collisions.length > 0) {
    console.log('-'.repeat(70));
    console.log('  [BLOCKING] COLLISIONS DETECTED:');
    console.log('-'.repeat(70));
    for (const collision of plan.collisions) {
      console.log(`\n  Proposed name: ${collision.proposedName}`);
      console.log('  Conflicting files:');
      for (const f of collision.conflictingFiles) {
        console.log(`    - ${f}`);
      }
    }
    console.log('\n  [ACTION] Resolve collisions manually before running Phase 3.\n');
  }

  // Show sample renames
  if (plan.renames.length > 0) {
    console.log('-'.repeat(70));
    console.log('  SAMPLE RENAMES (first 10):');
    console.log('-'.repeat(70));
    for (const r of plan.renames.slice(0, 10)) {
      const collision = r.hasCollision ? ' [COLLISION]' : '';
      console.log(`\n  FROM: ${r.filename}`);
      console.log(`  TO:   ${r.newFilename}${collision}`);
    }
    if (plan.renames.length > 10) {
      console.log(`\n  ... and ${plan.renames.length - 10} more in ${OUTPUT_FILE}`);
    }
    console.log('');
  }

  // Write plan to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(plan, null, 2));
  console.log(`[INFO] Full plan saved to: ${OUTPUT_FILE}\n`);

  // Final status
  if (plan.summary.collisions > 0) {
    console.log('[BLOCKED] Cannot proceed to Phase 3 until collisions are resolved.\n');
  } else if (plan.summary.requiresRename === 0) {
    console.log('[INFO] No renames required. All filenames are clean.\n');
  } else {
    console.log('[READY] Plan generated. Review before proceeding to Phase 3.\n');
    console.log('Next steps:');
    console.log('  1. Review the plan file carefully');
    console.log('  2. Backup affected MongoDB records');
    console.log('  3. Run: node scripts/execute-renames.js --plan rename-plan.json --dry-run');
    console.log('  4. If dry-run passes: node scripts/execute-renames.js --plan rename-plan.json --apply\n');
  }

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(`[ERROR] ${err.message}`);
  console.error(err.stack);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exit(1);
});
