#!/usr/bin/env node
/**
 * Setup Khutba Hierarchy
 *
 * Sets up parent-child relationships for Khutba mini-series and configures
 * display options for the main Khutba series.
 *
 * Usage:
 *   node scripts/setup-khutba-hierarchy.js --dry-run    # Preview changes
 *   node scripts/setup-khutba-hierarchy.js              # Apply changes
 *   node scripts/setup-khutba-hierarchy.js --env .env.production
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const mongoose = require('mongoose');
const Series = require('../models/Series');
const Lecture = require('../models/Lecture');

const DRY_RUN = process.argv.includes('--dry-run');

// Main Khutba series ID (خطب الجمعة)
const MAIN_KHUTBA_ID = '697604301c69c76d98f8e65d';

// Patterns to identify mini-series (Arabic title patterns)
const MINI_SERIES_PATTERNS = [
  /^خطب الجمعة\s*[-–—:]\s*.+/,  // "خطب الجمعة - ..." or "خطب الجمعة: ..."
  /^خطبة.*جمعة/i,               // Legacy pattern
];

async function main() {
  console.log('═'.repeat(60));
  console.log('  SETUP KHUTBA HIERARCHY');
  console.log('═'.repeat(60));
  console.log(`\n  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('  Connected to MongoDB\n');

  // 1. Find main Khutba series
  const mainKhutba = await Series.findById(MAIN_KHUTBA_ID);
  if (!mainKhutba) {
    console.error('  ❌ Main Khutba series not found!');
    console.error(`     Expected ID: ${MAIN_KHUTBA_ID}`);
    await mongoose.connection.close();
    process.exit(1);
  }

  console.log(`  Main Khutba Series: ${mainKhutba.titleArabic}`);
  console.log(`  Current lectureCount: ${mainKhutba.lectureCount}`);
  console.log(`  Sheikh ID: ${mainKhutba.sheikhId}\n`);

  // 2. Find potential mini-series (same sheikh, matching title patterns)
  const allSeriesBySheikh = await Series.find({
    sheikhId: mainKhutba.sheikhId,
    _id: { $ne: mainKhutba._id }
  }).lean();

  console.log(`  Found ${allSeriesBySheikh.length} other series by same sheikh\n`);

  // Filter to mini-series based on title patterns
  const miniSeries = allSeriesBySheikh.filter(s => {
    return MINI_SERIES_PATTERNS.some(pattern => pattern.test(s.titleArabic));
  });

  console.log('  Mini-series to link:');
  console.log('  ' + '─'.repeat(56));

  if (miniSeries.length === 0) {
    console.log('    No mini-series found matching patterns.');
  } else {
    for (const ms of miniSeries) {
      const currentParent = ms.parentSeriesId ? ms.parentSeriesId.toString() : 'none';
      const lectureCount = await Lecture.countDocuments({
        seriesId: ms._id,
        published: true
      });

      console.log(`    ${ms.titleArabic}`);
      console.log(`      ID: ${ms._id}`);
      console.log(`      Lectures: ${lectureCount}`);
      console.log(`      Current parent: ${currentParent}`);
      console.log('');
    }
  }

  // 3. Calculate total lectures (main + all mini-series)
  const mainLectureCount = await Lecture.countDocuments({
    seriesId: mainKhutba._id,
    published: true
  });

  let miniSeriesLectureCount = 0;
  for (const ms of miniSeries) {
    const count = await Lecture.countDocuments({
      seriesId: ms._id,
      published: true
    });
    miniSeriesLectureCount += count;
  }

  const totalLectureCount = mainLectureCount + miniSeriesLectureCount;

  console.log('  ' + '─'.repeat(56));
  console.log(`  Main series lectures:      ${mainLectureCount}`);
  console.log(`  Mini-series lectures:      ${miniSeriesLectureCount}`);
  console.log(`  Combined total:            ${totalLectureCount}`);
  console.log('  ' + '─'.repeat(56));

  // 4. Apply changes
  if (!DRY_RUN) {
    console.log('\n  Applying changes...\n');

    // Set parentSeriesId on mini-series
    let linked = 0;
    for (const ms of miniSeries) {
      if (ms.parentSeriesId?.toString() !== MAIN_KHUTBA_ID) {
        await Series.findByIdAndUpdate(ms._id, {
          parentSeriesId: mainKhutba._id
        });
        console.log(`    ✓ Linked: ${ms.titleArabic}`);
        linked++;
      }
    }

    // Update main Khutba display options
    await Series.findByIdAndUpdate(MAIN_KHUTBA_ID, {
      'displayOptions.defaultSortOrder': 'newest',
      'displayOptions.showYearFilter': true,
      'displayOptions.showSearch': true
    });
    console.log(`    ✓ Set defaultSortOrder: 'newest' on main Khutba`);

    console.log(`\n  ✅ Linked ${linked} mini-series to main Khutba.`);
  } else {
    console.log('\n  ⚠️  DRY RUN - No changes made.');
    console.log('      Run without --dry-run to apply changes.');
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  Main Khutba:        ${mainKhutba.titleArabic}`);
  console.log(`  Mini-series found:  ${miniSeries.length}`);
  console.log(`  Total lectures:     ${totalLectureCount}`);
  console.log('═'.repeat(60));

  await mongoose.connection.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
