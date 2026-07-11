#!/usr/bin/env node
/**
 * Step 2: Plan Renames (runs locally)
 *
 * Reads MongoDB export, scans OCI and local files, generates rename plan.
 * Does NOT require MongoDB connection - uses exported data.
 *
 * Usage:
 *   node scripts/rename-workflow/2-plan-renames.js --mongo-export mongo-export.json --output rename-plan.json
 *   node scripts/rename-workflow/2-plan-renames.js --mongo-export mongo-export.json --output rename-plan.json --local-dir /path/to/audio
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const oci = require(path.join(__dirname, '..', '..', 'config', 'oci'));

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')
    ? args[idx + 1]
    : null;
}

const MONGO_EXPORT = getArg('--mongo-export');
const OUTPUT_FILE = getArg('--output') || 'rename-plan.json';
const LOCAL_DIR = getArg('--local-dir');

if (!MONGO_EXPORT) {
  console.log(`
Usage: node scripts/rename-workflow/2-plan-renames.js --mongo-export <file> [options]

Options:
  --mongo-export <file>   MongoDB export from Step 1 (required)
  --output <file>         Output plan file (default: rename-plan.json)
  --local-dir <path>      Local audio directory to check

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
  newName = newName.replace(/-+\.m4a$/i, '.m4a');
  newName = newName.replace(/-\.m4a$/i, '.m4a');
  newName = newName.trim();
  newName = newName.replace(/\s+/g, ' ');
  newName = newName.replace(/\s+\.m4a$/i, '.m4a');

  if (newName === filename) {
    return null;
  }

  return newName;
}

async function main() {
  if (!oci.isConfigured()) {
    console.error('[ERROR] OCI credentials not configured.');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('  STEP 2: PLAN RENAMES (READ-ONLY)');
  console.log('='.repeat(60));
  console.log(`
  MongoDB Export: ${MONGO_EXPORT}
  Output:         ${OUTPUT_FILE}
  Local Dir:      ${LOCAL_DIR || '(not specified)'}
`);

  // Load MongoDB export
  if (!fs.existsSync(MONGO_EXPORT)) {
    console.error(`[ERROR] MongoDB export not found: ${MONGO_EXPORT}`);
    process.exit(1);
  }

  const mongoData = JSON.parse(fs.readFileSync(MONGO_EXPORT, 'utf8'));
  console.log(`[INFO] Loaded ${mongoData.records.length} MongoDB records\n`);

  // Initialize OCI client
  const client = oci.client;
  if (!client) {
    console.error('[ERROR] OCI client not initialized');
    process.exit(1);
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  // Fetch all OCI objects
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

  // Build local file index
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
          // Skip
        }
      }
      console.log(`[INFO] Found ${localFiles.size} local files\n`);
    } catch (err) {
      console.error(`[ERROR] Cannot read local directory: ${err.message}`);
      process.exit(1);
    }
  }

  // Analyze and build plan
  console.log('[INFO] Analyzing files...\n');

  const plan = {
    timestamp: new Date().toISOString(),
    mongoExportFile: MONGO_EXPORT,
    config: {
      localDir: LOCAL_DIR || null,
      ociBucket: bucketName,
      ociNamespace: namespace
    },
    summary: {
      totalRecords: mongoData.records.length,
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

  const newNameMap = new Map();

  for (const record of mongoData.records) {
    const filename = record.audioFileName;
    const newFilename = applyRenameRules(filename);

    const ociData = ociObjects.get(filename);
    const localData = LOCAL_DIR ? localFiles.get(filename) : null;

    const entry = {
      mongoId: record.mongoId,
      title: record.title,
      filename: filename,
      newFilename: newFilename,
      ociExists: ociData !== undefined,
      ociSize: ociData ? ociData.size : null,
      localFileExists: localData !== undefined,
      localFilePath: localData ? localData.path : null
    };

    if (!ociData) plan.summary.missingInOci++;
    if (LOCAL_DIR && !localData) plan.summary.missingLocally++;

    if (newFilename === null) {
      plan.summary.noChangeNeeded++;
      plan.skipped.push({
        mongoId: entry.mongoId,
        filename: entry.filename,
        reason: 'No rename needed'
      });
      continue;
    }

    if (!newNameMap.has(newFilename)) {
      newNameMap.set(newFilename, []);
    }
    newNameMap.get(newFilename).push(filename);

    entry.hasCollision = false;
    plan.renames.push(entry);
    plan.summary.requiresRename++;
  }

  // Detect collisions
  console.log('[INFO] Checking for collisions...\n');

  for (const [newName, originals] of newNameMap.entries()) {
    if (originals.length > 1) {
      plan.summary.collisions++;
      plan.collisions.push({
        proposedName: newName,
        conflictingFiles: originals,
        resolution: 'MANUAL_REQUIRED'
      });

      for (const rename of plan.renames) {
        if (originals.includes(rename.filename)) {
          rename.hasCollision = true;
          rename.collidesWith = originals.filter(f => f !== rename.filename);
        }
      }
    }
  }

  // Check if new name already exists in OCI
  for (const rename of plan.renames) {
    if (!rename.hasCollision && ociObjects.has(rename.newFilename)) {
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
  console.log('='.repeat(60));
  console.log('  PLAN SUMMARY');
  console.log('='.repeat(60));
  console.log(`
  Total records:        ${plan.summary.totalRecords}
  Requires rename:      ${plan.summary.requiresRename}
  No change needed:     ${plan.summary.noChangeNeeded}

  WARNINGS:
    Collisions:         ${plan.summary.collisions} ${plan.summary.collisions > 0 ? '[BLOCKING]' : '[OK]'}
    Missing in OCI:     ${plan.summary.missingInOci} ${plan.summary.missingInOci > 0 ? '[WARNING]' : '[OK]'}
    Missing locally:    ${plan.summary.missingLocally} ${LOCAL_DIR ? (plan.summary.missingLocally > 0 ? '[WARNING]' : '[OK]') : '[N/A]'}
`);

  if (plan.collisions.length > 0) {
    console.log('-'.repeat(60));
    console.log('  [BLOCKING] COLLISIONS:');
    console.log('-'.repeat(60));
    for (const c of plan.collisions) {
      console.log(`\n  ${c.proposedName}`);
      for (const f of c.conflictingFiles) {
        console.log(`    - ${f}`);
      }
    }
    console.log('');
  }

  if (plan.renames.length > 0) {
    console.log('-'.repeat(60));
    console.log('  SAMPLE RENAMES (first 10):');
    console.log('-'.repeat(60));
    for (const r of plan.renames.slice(0, 10)) {
      console.log(`\n  FROM: ${r.filename}`);
      console.log(`  TO:   ${r.newFilename}`);
    }
    if (plan.renames.length > 10) {
      console.log(`\n  ... and ${plan.renames.length - 10} more`);
    }
    console.log('');
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(plan, null, 2));
  console.log(`[SUCCESS] Plan saved to: ${OUTPUT_FILE}\n`);

  if (plan.summary.collisions > 0) {
    console.log('[BLOCKED] Resolve collisions before proceeding.\n');
  } else if (plan.summary.requiresRename === 0) {
    console.log('[INFO] No renames needed.\n');
  } else {
    console.log('Next step:');
    console.log(`  node scripts/rename-workflow/3-execute-local.js --plan ${OUTPUT_FILE} --dry-run`);
    console.log(`  node scripts/rename-workflow/3-execute-local.js --plan ${OUTPUT_FILE} --apply\n`);
  }
}

main().catch(err => {
  console.error(`[ERROR] ${err.message}`);
  process.exit(1);
});
