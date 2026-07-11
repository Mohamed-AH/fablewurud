#!/usr/bin/env node
/**
 * Sync Lecture Counts
 *
 * Updates lectureCount on all Series and Sheikh documents to match
 * the actual number of published lectures in the database.
 *
 * For parent series (with child mini-series), the count includes
 * both own lectures AND all child series lectures.
 *
 * Usage:
 *   node scripts/sync-lecture-counts.js [options]
 *
 * Options:
 *   --dry-run        Preview changes without updating
 *   --env <path>     Path to .env file (default: .env)
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const mongoose = require('mongoose');
const Lecture = require('../models/Lecture');
const Series = require('../models/Series');
const Sheikh = require('../models/Sheikh');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('═'.repeat(60));
  console.log('  SYNC LECTURE COUNTS');
  console.log('═'.repeat(60));
  console.log(`\n  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('  Connected to MongoDB\n');

  // Get actual counts per series (own lectures only)
  const seriesCounts = await Lecture.aggregate([
    { $match: { published: true } },
    { $group: { _id: '$seriesId', count: { $sum: 1 } } }
  ]);

  const ownCountMap = new Map(seriesCounts.map(s => [s._id?.toString(), s.count]));

  // Get all series with parent info
  const allSeries = await Series.find({}).select('_id titleArabic lectureCount parentSeriesId').lean();

  // Build parent -> children map
  const childrenMap = new Map();
  for (const series of allSeries) {
    if (series.parentSeriesId) {
      const parentId = series.parentSeriesId.toString();
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId).push(series._id.toString());
    }
  }

  let seriesUpdated = 0;
  console.log('  Series updates:');

  for (const series of allSeries) {
    const seriesId = series._id.toString();
    let ownCount = ownCountMap.get(seriesId) || 0;

    // For parent series, add children's lecture counts
    let childCount = 0;
    const children = childrenMap.get(seriesId) || [];
    for (const childId of children) {
      childCount += ownCountMap.get(childId) || 0;
    }

    const totalCount = ownCount + childCount;
    const currentCount = series.lectureCount || 0;

    if (totalCount !== currentCount) {
      const suffix = children.length > 0 ? ` (own: ${ownCount}, children: ${childCount})` : '';
      console.log(`    ${series.titleArabic}: ${currentCount} → ${totalCount}${suffix}`);
      if (!DRY_RUN) {
        await Series.findByIdAndUpdate(series._id, { lectureCount: totalCount });
      }
      seriesUpdated++;
    }
  }

  if (seriesUpdated === 0) {
    console.log('    All series counts are correct.');
  }

  // Get actual counts per sheikh
  const sheikhCounts = await Lecture.aggregate([
    { $match: { published: true } },
    { $group: { _id: '$sheikhId', count: { $sum: 1 } } }
  ]);

  const sheikhCountMap = new Map(sheikhCounts.map(s => [s._id?.toString(), s.count]));

  // Get all sheikhs
  const allSheikhs = await Sheikh.find({}).select('_id nameArabic lectureCount');

  let sheikhUpdated = 0;
  console.log('\n  Sheikh updates:');

  for (const sheikh of allSheikhs) {
    const actualCount = sheikhCountMap.get(sheikh._id.toString()) || 0;
    const currentCount = sheikh.lectureCount || 0;

    if (actualCount !== currentCount) {
      console.log(`    ${sheikh.nameArabic}: ${currentCount} → ${actualCount}`);
      if (!DRY_RUN) {
        await Sheikh.findByIdAndUpdate(sheikh._id, { lectureCount: actualCount });
      }
      sheikhUpdated++;
    }
  }

  if (sheikhUpdated === 0) {
    console.log('    All sheikh counts are correct.');
  }

  // Summary: show parent series with children
  const parentSeries = allSeries.filter(s => childrenMap.has(s._id.toString()));
  if (parentSeries.length > 0) {
    console.log('\n  Parent series with children:');
    for (const ps of parentSeries) {
      const children = childrenMap.get(ps._id.toString()) || [];
      console.log(`    ${ps.titleArabic}: ${children.length} child series`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  Series updated:  ${seriesUpdated}`);
  console.log(`  Sheikhs updated: ${sheikhUpdated}`);
  console.log(`  Parent series:   ${parentSeries.length}`);

  if (DRY_RUN) {
    console.log('\n  ⚠️  DRY RUN - No changes made.');
  }

  console.log('═'.repeat(60));
  await mongoose.connection.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
