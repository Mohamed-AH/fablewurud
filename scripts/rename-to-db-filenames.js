#!/usr/bin/env node
/**
 * Rename Local Files to Match Database Filenames
 *
 * Reads confirmed-matches.json and renames local files to match dbFilename
 * so they can be used with the restore script.
 *
 * Usage: node scripts/rename-to-db-filenames.js --confirmed confirmed-matches.json [--dry-run]
 *
 * Options:
 *   --confirmed FILE   Path to confirmed-matches.json (required)
 *   --dry-run          Show what would be renamed without making changes
 *   --output-dir DIR   Move renamed files to this directory (optional)
 */

const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const confirmedIndex = args.indexOf('--confirmed');
const CONFIRMED_FILE = confirmedIndex !== -1 ? args[confirmedIndex + 1] : 'confirmed-matches.json';

const outputDirIndex = args.indexOf('--output-dir');
const OUTPUT_DIR = outputDirIndex !== -1 ? args[outputDirIndex + 1] : null;

if (!fs.existsSync(CONFIRMED_FILE)) {
  console.error(`\n❌ Error: Confirmed matches file not found: ${CONFIRMED_FILE}`);
  process.exit(1);
}

if (OUTPUT_DIR && !fs.existsSync(OUTPUT_DIR)) {
  if (!DRY_RUN) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 Created output directory: ${OUTPUT_DIR}`);
  }
}

// Stats
const stats = {
  total: 0,
  renamed: 0,
  skipped: 0,
  errors: []
};

function main() {
  console.log('\n📝 Rename Local Files to Match Database Filenames');
  console.log('══════════════════════════════════════════════════');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '⚡ LIVE'}`);
  console.log(`Input: ${CONFIRMED_FILE}`);
  if (OUTPUT_DIR) console.log(`Output Dir: ${OUTPUT_DIR}`);
  console.log('');

  // Load confirmed matches
  const data = JSON.parse(fs.readFileSync(CONFIRMED_FILE, 'utf-8'));
  const matches = Array.isArray(data) ? data : data.files || [];
  stats.total = matches.length;

  console.log(`📋 Found ${matches.length} confirmed matches\n`);

  if (matches.length === 0) {
    console.log('No matches to process.');
    return;
  }

  // Process each match
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const progress = `[${i + 1}/${matches.length}]`;

    // Get source path and target filename
    const sourcePath = match.candidates?.[0]?.localPath || match.localPath;
    const targetFilename = match.dbFilename;

    if (!sourcePath || !targetFilename) {
      console.log(`${progress} ⚠️  Skipping: Missing source or target`);
      stats.skipped++;
      continue;
    }

    // Check if source exists
    if (!fs.existsSync(sourcePath)) {
      console.log(`${progress} ⚠️  Source not found: ${sourcePath}`);
      stats.errors.push({ source: sourcePath, error: 'Source file not found' });
      continue;
    }

    // Determine target path
    const sourceDir = path.dirname(sourcePath);
    const targetDir = OUTPUT_DIR || sourceDir;
    const targetPath = path.join(targetDir, targetFilename);

    // Check if target already exists
    if (fs.existsSync(targetPath)) {
      console.log(`${progress} ⚠️  Target exists: ${targetFilename}`);
      stats.skipped++;
      continue;
    }

    // Rename/move file
    if (DRY_RUN) {
      console.log(`${progress} 🔍 Would rename:`);
      console.log(`       From: ${path.basename(sourcePath)}`);
      console.log(`       To:   ${targetFilename}`);
      stats.renamed++;
    } else {
      try {
        if (OUTPUT_DIR) {
          // Copy to output directory with new name
          fs.copyFileSync(sourcePath, targetPath);
        } else {
          // Rename in place
          fs.renameSync(sourcePath, targetPath);
        }
        console.log(`${progress} ✅ ${path.basename(sourcePath)}`);
        console.log(`       → ${targetFilename}`);
        stats.renamed++;
      } catch (error) {
        console.log(`${progress} ❌ Error: ${error.message}`);
        stats.errors.push({ source: sourcePath, target: targetPath, error: error.message });
      }
    }
  }

  // Summary
  console.log('\n══════════════════════════════════════════════════');
  console.log('📊 Summary');
  console.log('══════════════════════════════════════════════════');
  console.log(`Total records:    ${stats.total}`);
  console.log(`Renamed:          ${stats.renamed}`);
  console.log(`Skipped:          ${stats.skipped}`);
  console.log(`Errors:           ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log('\n❌ Errors:');
    stats.errors.forEach(e => {
      console.log(`   ${e.source}: ${e.error}`);
    });
  }

  if (DRY_RUN) {
    console.log('\n💡 Dry run complete. Remove --dry-run to rename files.');
  } else if (stats.renamed > 0) {
    const dir = OUTPUT_DIR || 'the source directory';
    console.log(`\n✅ Files renamed! You can now run restore-step2-oci.js with --backup-dir pointing to ${dir}`);
  }

  console.log('');
}

main();
