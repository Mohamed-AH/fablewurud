#!/usr/bin/env node
/**
 * Fix Lecture Numbers in a Series
 *
 * Parses Arabic ordinals from titles and assigns correct lecture numbers.
 *
 * Usage:
 *   node scripts/fix-series-lecture-numbers.js --series SERIES_ID --env .env [--dry-run] [--output FILE]
 */

const fs = require('fs');

// Parse arguments
const args = process.argv.slice(2);
const envIndex = args.indexOf('--env');
const envPath = envIndex !== -1 ? args[envIndex + 1] : '.env';
const outputIndex = args.indexOf('--output');
const outputFile = outputIndex !== -1 ? args[outputIndex + 1] : null;
const seriesIndex = args.indexOf('--series');
const SERIES_ID = seriesIndex !== -1 ? args[seriesIndex + 1] : null;
const DRY_RUN = args.includes('--dry-run');

// Output handling
let output = [];
function log(msg = '') {
  console.log(msg);
  output.push(msg);
}

function saveOutput() {
  if (outputFile) {
    fs.writeFileSync(outputFile, output.join('\n'), 'utf8');
    console.log(`\n📄 Output saved to: ${outputFile}`);
  }
}

if (!SERIES_ID) {
  console.error('❌ Error: --series SERIES_ID is required');
  console.error('Usage: node scripts/fix-series-lecture-numbers.js --series SERIES_ID --env .env [--dry-run]');
  process.exit(1);
}

require('dotenv').config({ path: envPath });

if (!process.env.MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is not set.');
  process.exit(1);
}

const mongoose = require('mongoose');
const Lecture = require('../models/Lecture');
const Series = require('../models/Series');
const { generateSlug } = require('../utils/slugify');

// Arabic ordinal mappings
const arabicOrdinals = {
  'الأول': 1, 'الاول': 1,
  'الثاني': 2,
  'الثالث': 3,
  'الرابع': 4,
  'الخامس': 5,
  'السادس': 6,
  'السابع': 7,
  'الثامن': 8,
  'التاسع': 9,
  'العاشر': 10,
  'الحادي عشر': 11, 'الحادي-عشر': 11,
  'الثاني عشر': 12, 'الثاني-عشر': 12,
  'الثالث عشر': 13, 'الثالث-عشر': 13,
  'الرابع عشر': 14, 'الرابع-عشر': 14,
  'الخامس عشر': 15, 'الخامس-عشر': 15,
  'السادس عشر': 16, 'السادس-عشر': 16,
  'السابع عشر': 17, 'السابع-عشر': 17,
  'الثامن عشر': 18, 'الثامن-عشر': 18,
  'التاسع عشر': 19, 'التاسع-عشر': 19,
  'العشرون': 20, 'العشرين': 20,
  'الحادي والعشرون': 21, 'الحادي والعشرين': 21,
  'الثاني والعشرون': 22, 'الثاني والعشرين': 22,
  'الثالث والعشرون': 23, 'الثالث والعشرين': 23,
  'الرابع والعشرون': 24, 'الرابع والعشرين': 24,
  'الخامس والعشرون': 25, 'الخامس والعشرين': 25,
};

function extractLectureNumber(title) {
  if (!title) return null;

  // First try to find "الدرس N" pattern
  const darsMatch = title.match(/الدرس\s*(\d+)/);
  if (darsMatch) {
    return parseInt(darsMatch[1]);
  }

  // Try compound ordinals first (longer matches)
  for (const [ordinal, num] of Object.entries(arabicOrdinals).sort((a, b) => b[0].length - a[0].length)) {
    if (title.includes(ordinal)) {
      return num;
    }
  }

  return null;
}

async function fixLectureNumbers() {
  log('\n🔧 Fix Series Lecture Numbers Script');
  log('='.repeat(50));

  if (DRY_RUN) {
    log('📋 DRY RUN MODE - No changes will be made\n');
  }

  // Connect to MongoDB
  log('🔌 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  log('✓ Connected\n');

  // Fetch series
  const series = await Series.findById(SERIES_ID).lean();
  if (!series) {
    log(`❌ Series not found: ${SERIES_ID}`);
    await mongoose.disconnect();
    saveOutput();
    process.exit(1);
  }

  log(`📚 Series: ${series.titleArabic}`);
  log(`   ID: ${series._id}\n`);

  // Fetch all lectures in this series
  const lectures = await Lecture.find({ seriesId: SERIES_ID })
    .sort({ lectureNumber: 1 })
    .lean();

  log(`📖 Found ${lectures.length} lectures\n`);

  // Parse and sort by extracted number
  const parsedLectures = lectures.map(lecture => {
    const extractedNum = extractLectureNumber(lecture.titleArabic);
    return {
      ...lecture,
      extractedNumber: extractedNum,
      currentNumber: lecture.lectureNumber
    };
  });

  // Show current state
  log('Current state:');
  log('-'.repeat(80));
  for (const lec of parsedLectures) {
    const extracted = lec.extractedNumber !== null ? lec.extractedNumber : '?';
    log(`  #${lec.currentNumber || '?'} → Extracted: ${extracted} | ${lec.titleArabic.substring(0, 50)}...`);
  }
  log('');

  // Sort by extracted number
  const sortedLectures = parsedLectures
    .filter(l => l.extractedNumber !== null)
    .sort((a, b) => a.extractedNumber - b.extractedNumber);

  const unknownLectures = parsedLectures.filter(l => l.extractedNumber === null);

  if (unknownLectures.length > 0) {
    log('⚠️  Lectures with unknown order (could not parse number):');
    for (const lec of unknownLectures) {
      log(`   - ID: ${lec._id} | ${lec.titleArabic}`);
    }
    log('');
  }

  // Check for duplicates
  const numberCounts = {};
  for (const lec of sortedLectures) {
    numberCounts[lec.extractedNumber] = (numberCounts[lec.extractedNumber] || 0) + 1;
  }

  const duplicates = Object.entries(numberCounts).filter(([_, count]) => count > 1);
  if (duplicates.length > 0) {
    log('⚠️  DUPLICATE NUMBERS DETECTED:');
    for (const [num, count] of duplicates) {
      log(`   Number ${num} appears ${count} times:`);
      const dupes = sortedLectures.filter(l => l.extractedNumber === parseInt(num));
      for (const d of dupes) {
        log(`     - ID: ${d._id}`);
        log(`       Title: ${d.titleArabic}`);
        log(`       Audio: ${d.audioFileName || 'No audio'}`);
      }
    }
    log('');
    log('⚠️  Please resolve duplicates before running without --dry-run');
    log('   You can delete duplicates via /admin/lectures\n');
  }

  // Show proposed changes
  log('Proposed changes:');
  log('-'.repeat(80));

  let changesNeeded = 0;
  for (let i = 0; i < sortedLectures.length; i++) {
    const lec = sortedLectures[i];
    const newNumber = i + 1;
    const needsChange = lec.currentNumber !== newNumber;

    if (needsChange) {
      changesNeeded++;
      log(`  ${lec.currentNumber || '?'} → ${newNumber} | ${lec.titleArabic.substring(0, 50)}...`);
    }
  }

  if (changesNeeded === 0) {
    log('  ✓ All lecture numbers are already correct!\n');
  } else {
    log(`\n📊 ${changesNeeded} lectures need renumbering\n`);
  }

  // Apply changes if not dry run and no duplicates
  if (!DRY_RUN && duplicates.length === 0 && changesNeeded > 0) {
    log('Applying changes...\n');

    let updated = 0;
    let errors = 0;

    for (let i = 0; i < sortedLectures.length; i++) {
      const lec = sortedLectures[i];
      const newNumber = i + 1;

      if (lec.currentNumber !== newNumber) {
        try {
          // Also update slug to match new number
          const newSlug = generateSlug(`${series.titleArabic}-الدرس-${newNumber}`);
          let uniqueSlug = newSlug;
          let suffix = 1;
          while (await Lecture.exists({ slug: uniqueSlug, _id: { $ne: lec._id } })) {
            suffix++;
            uniqueSlug = `${newSlug}-${suffix}`;
          }

          await Lecture.updateOne(
            { _id: lec._id },
            {
              $set: {
                lectureNumber: newNumber,
                slug: uniqueSlug
              }
            }
          );
          log(`  ✓ Updated #${lec.currentNumber} → #${newNumber} (slug: ${uniqueSlug})`);
          updated++;
        } catch (err) {
          log(`  ✗ Error updating ${lec._id}: ${err.message}`);
          errors++;
        }
      }
    }

    log(`\n📊 Summary: ${updated} updated, ${errors} errors`);
  } else if (DRY_RUN && changesNeeded > 0) {
    log('📋 Run without --dry-run to apply these changes.');
  }

  await mongoose.disconnect();
  log('\n✓ Done!\n');
  saveOutput();
}

fixLectureNumbers().catch(err => {
  log('Fatal error: ' + err.message);
  saveOutput();
  process.exit(1);
});
