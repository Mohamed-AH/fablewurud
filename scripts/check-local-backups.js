#!/usr/bin/env node
/**
 * Check Local Backup Files Against Matched List
 * Run this on local PC where backup files are stored
 *
 * Usage: node scripts/check-local-backups.js --matched matched-files.json --backup-dir /path/to/backups
 *
 * Input: matched-files.json from compare-filenames.js (run on Cloud VM)
 */

const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);

const matchedIndex = args.indexOf('--matched');
const MATCHED_FILE = matchedIndex !== -1 ? args[matchedIndex + 1] : 'matched-files.json';

const backupDirIndex = args.indexOf('--backup-dir');
const BACKUP_DIR = backupDirIndex !== -1 ? args[backupDirIndex + 1] : null;

if (!BACKUP_DIR) {
  console.error('\n❌ Error: --backup-dir is required');
  console.error('\nUsage:');
  console.error('  node scripts/check-local-backups.js --matched matched-files.json --backup-dir /path/to/backups');
  process.exit(1);
}

if (!fs.existsSync(MATCHED_FILE)) {
  console.error(`\n❌ Error: Matched files list not found: ${MATCHED_FILE}`);
  console.error('Run compare-filenames.js on Cloud VM first to generate this file.');
  process.exit(1);
}

if (!fs.existsSync(BACKUP_DIR)) {
  console.error(`\n❌ Error: Backup directory not found: ${BACKUP_DIR}`);
  process.exit(1);
}

// Stats
const stats = {
  totalMatched: 0,
  zeroByteFiles: 0,
  foundLocally: 0,
  missingLocally: [],
  readyToRestore: [],
  potentialMatches: []  // For manual review
};

/**
 * Scan backup directory for audio files
 */
function scanBackupDirectory(dir) {
  const audioExtensions = ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac'];
  const files = new Map();

  function scanDir(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (audioExtensions.includes(ext)) {
            files.set(entry.name, {
              path: fullPath,
              size: fs.statSync(fullPath).size
            });
          }
        }
      }
    } catch (err) {
      console.error(`Warning: Could not scan ${currentDir}: ${err.message}`);
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
 * Extract core identifier from filename (remove suffixes, normalize separators)
 * Example: 'Mp3-Editor-251013152911-1769324610319-341315626.m4a' -> 'mp3editor251013152911'
 */
function extractCoreId(filename) {
  const base = path.basename(filename, path.extname(filename));
  return base
    .toLowerCase()
    .replace(/[-_\s]+/g, '')  // Remove separators
    .replace(/\d{10,}/g, (match, offset, str) => {
      // Keep first long number sequence (likely original ID), remove later ones (upload suffixes)
      const before = str.slice(0, offset).replace(/\d{10,}/g, '');
      return before.includes(match.slice(0, 6)) ? '' : match;
    });
}

/**
 * Calculate similarity score between two strings (0-1)
 */
function similarityScore(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
  }

  // Count matching characters in sequence
  let matches = 0;
  const shorter = s1.length < s2.length ? s1 : s2;
  const longer = s1.length < s2.length ? s2 : s1;

  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }

  return matches / longer.length;
}

/**
 * Find backup match (exact, normalized, or potential)
 */
function findBackupMatch(targetFilename, backupFiles) {
  // Exact match
  if (backupFiles.has(targetFilename)) {
    return { match: targetFilename, ...backupFiles.get(targetFilename), type: 'exact', confidence: 1 };
  }

  // Normalized match
  const normalizedTarget = normalizeFilename(targetFilename);
  for (const [backupName, data] of backupFiles) {
    if (normalizeFilename(backupName) === normalizedTarget) {
      return { match: backupName, ...data, type: 'normalized', confidence: 1 };
    }
  }

  // Basename match
  const targetBase = path.basename(targetFilename, path.extname(targetFilename));
  for (const [backupName, data] of backupFiles) {
    const backupBase = path.basename(backupName, path.extname(backupName));
    if (normalizeFilename(backupBase) === normalizeFilename(targetBase)) {
      return { match: backupName, ...data, type: 'basename', confidence: 1 };
    }
  }

  return null;
}

/**
 * Find potential matches using partial/fuzzy matching
 */
function findPotentialMatches(targetFilename, backupFiles) {
  const potentials = [];
  const targetBase = path.basename(targetFilename, path.extname(targetFilename));
  const targetExt = path.extname(targetFilename).toLowerCase();

  // Normalize target: remove separators and extra suffixes
  const targetNorm = targetBase.toLowerCase().replace(/[-_\s]+/g, '');

  for (const [backupName, data] of backupFiles) {
    const backupBase = path.basename(backupName, path.extname(backupName));
    const backupExt = path.extname(backupName).toLowerCase();

    // Skip if extensions don't match (or are compatible audio formats)
    const audioExts = ['.mp3', '.m4a', '.aac', '.wav'];
    if (targetExt !== backupExt && !(audioExts.includes(targetExt) && audioExts.includes(backupExt))) {
      continue;
    }

    // Normalize backup filename
    const backupNorm = backupBase.toLowerCase().replace(/[-_\s]+/g, '');

    // Check if backup filename is contained in target (common pattern: local name + suffix)
    // Example: 'mp3editor251013152911' is in 'mp3editor2510131529111769324610319341315626'
    if (targetNorm.includes(backupNorm) || backupNorm.includes(targetNorm.slice(0, Math.min(20, targetNorm.length)))) {
      const score = similarityScore(backupNorm, targetNorm);
      if (score > 0.3) {  // At least 30% similarity
        potentials.push({
          localFile: backupName,
          localPath: data.path,
          localSize: data.size,
          score: Math.round(score * 100),
          reason: backupNorm.length < targetNorm.length ? 'local_is_shorter' : 'local_is_longer'
        });
      }
    }
  }

  // Sort by score descending
  return potentials.sort((a, b) => b.score - a.score);
}

/**
 * Main
 */
function main() {
  console.log('\n📁 Check Local Backups Against Matched Files');
  console.log('═══════════════════════════════════════════════\n');

  // Load matched files
  console.log(`📋 Loading matched files: ${MATCHED_FILE}`);
  const data = JSON.parse(fs.readFileSync(MATCHED_FILE, 'utf-8'));
  const matchedFiles = data.files || [];
  stats.totalMatched = matchedFiles.length;
  stats.zeroByteFiles = matchedFiles.filter(f => f.isZeroByte).length;
  console.log(`   Total: ${matchedFiles.length} files`);
  console.log(`   Zero-byte (need restore): ${stats.zeroByteFiles}\n`);

  // Scan backup directory
  console.log(`📁 Scanning backup directory: ${BACKUP_DIR}`);
  const backupFiles = scanBackupDirectory(BACKUP_DIR);
  console.log(`   Found: ${backupFiles.size} audio files\n`);

  // Check each matched file
  console.log('🔍 Checking for local backups...\n');

  for (const file of matchedFiles) {
    const match = findBackupMatch(file.filename, backupFiles);

    if (match) {
      stats.foundLocally++;

      if (file.isZeroByte) {
        stats.readyToRestore.push({
          filename: file.filename,
          localPath: match.path,
          localSize: match.size,
          matchType: match.type
        });
      }
    } else {
      // No exact match - try partial matching
      const potentials = findPotentialMatches(file.filename, backupFiles);

      if (potentials.length > 0) {
        stats.potentialMatches.push({
          dbFilename: file.filename,
          title: file.title,
          isZeroByte: file.isZeroByte,
          candidates: potentials.slice(0, 3)  // Top 3 candidates
        });
      } else {
        stats.missingLocally.push({
          filename: file.filename,
          title: file.title,
          isZeroByte: file.isZeroByte
        });
      }
    }
  }

  // Results
  console.log('═══════════════════════════════════════════════');
  console.log('📊 Results');
  console.log('═══════════════════════════════════════════════\n');

  console.log(`Files in MongoDB+OCI:     ${stats.totalMatched}`);
  console.log(`Zero-byte (corrupted):    ${stats.zeroByteFiles}`);
  console.log(`Exact matches:            ${stats.foundLocally}`);
  console.log(`Potential matches:        ${stats.potentialMatches.length} (need review)`);
  console.log(`No match found:           ${stats.missingLocally.length}`);
  console.log(`Ready to restore:         ${stats.readyToRestore.length}`);

  // Save potential matches for manual review
  if (stats.potentialMatches.length > 0) {
    fs.writeFileSync('potential-matches.json', JSON.stringify(stats.potentialMatches, null, 2));

    // Create a readable review file
    let reviewContent = 'POTENTIAL MATCHES - MANUAL REVIEW REQUIRED\n';
    reviewContent += '='.repeat(60) + '\n\n';
    reviewContent += 'Instructions: Review each match and add confirmed pairs to confirmed-matches.json\n\n';

    stats.potentialMatches.forEach((item, idx) => {
      reviewContent += `--- #${idx + 1} ---\n`;
      reviewContent += `DB Filename: ${item.dbFilename}\n`;
      reviewContent += `Title: ${item.title || 'N/A'}\n`;
      reviewContent += `Zero-byte: ${item.isZeroByte ? 'YES - NEEDS RESTORE' : 'No'}\n`;
      reviewContent += `Candidates:\n`;
      item.candidates.forEach((c, i) => {
        reviewContent += `  ${i + 1}. [${c.score}%] ${c.localFile}\n`;
        reviewContent += `     Path: ${c.localPath}\n`;
        reviewContent += `     Size: ${(c.localSize / 1024).toFixed(1)} KB\n`;
      });
      reviewContent += '\n';
    });

    fs.writeFileSync('potential-matches-review.txt', reviewContent);

    console.log(`\n🔍 Potential matches (need manual review):`);
    console.log(`   potential-matches.json (${stats.potentialMatches.length} files)`);
    console.log(`   potential-matches-review.txt (human readable)`);

    // Show sample
    const zeroByteP = stats.potentialMatches.filter(p => p.isZeroByte);
    if (zeroByteP.length > 0) {
      console.log(`\n   ⚠️  ${zeroByteP.length} zero-byte files have potential matches:`);
      zeroByteP.slice(0, 5).forEach(p => {
        console.log(`   - ${p.dbFilename}`);
        console.log(`     → ${p.candidates[0]?.localFile} (${p.candidates[0]?.score}%)`);
      });
      if (zeroByteP.length > 5) console.log(`   ... and ${zeroByteP.length - 5} more`);
    }
  }

  // Save ready-to-restore list
  if (stats.readyToRestore.length > 0) {
    const restoreData = {
      exportedAt: new Date().toISOString(),
      totalFiles: stats.readyToRestore.length,
      files: stats.readyToRestore
    };
    fs.writeFileSync('ready-to-restore.json', JSON.stringify(restoreData, null, 2));

    const textList = stats.readyToRestore.map(f => f.filename).join('\n');
    fs.writeFileSync('ready-to-restore.txt', textList);

    console.log(`\n✅ Ready to restore:`);
    console.log(`   ready-to-restore.json (${stats.readyToRestore.length} files)`);
    console.log(`   ready-to-restore.txt`);
  }

  // Save missing files
  if (stats.missingLocally.length > 0) {
    const missingZeroByte = stats.missingLocally.filter(f => f.isZeroByte);
    const missingOk = stats.missingLocally.filter(f => !f.isZeroByte);

    fs.writeFileSync('missing-locally.json', JSON.stringify(stats.missingLocally, null, 2));

    console.log(`\n⚠️  Missing locally:`);
    console.log(`   missing-locally.json (${stats.missingLocally.length} files)`);

    if (missingZeroByte.length > 0) {
      console.log(`\n🔴 CRITICAL: ${missingZeroByte.length} zero-byte files have NO local backup:`);
      missingZeroByte.slice(0, 10).forEach((f, i) => {
        console.log(`   ${i + 1}. ${f.filename}`);
      });
      if (missingZeroByte.length > 10) {
        console.log(`   ... and ${missingZeroByte.length - 10} more`);
      }
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════');
  if (stats.readyToRestore.length === stats.zeroByteFiles) {
    console.log('✅ All corrupted files have local backups - ready to restore!');
    console.log('   Run: node scripts/restore-step2-oci.js --filenames ready-to-restore.json --backup-dir ' + BACKUP_DIR);
  } else if (stats.readyToRestore.length > 0) {
    console.log(`⚠️  ${stats.readyToRestore.length}/${stats.zeroByteFiles} corrupted files can be restored`);
  } else {
    console.log('❌ No corrupted files found with local backups');
  }
  console.log('═══════════════════════════════════════════════\n');
}

main();
