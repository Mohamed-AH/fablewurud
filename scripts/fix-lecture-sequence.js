#!/usr/bin/env node
/**
 * Fix Lecture Sequence Script
 *
 * Adds a sortOrder field based on the Excel import order (metadata.serialNo)
 * within each series, so lectures appear in the same order as the Excel.
 *
 * For S.No 1-33 (current continuations): Interleaved with existing lectures by date
 * For S.No 34-99 (archive) and 100-151 (online): Ordered by Excel S.No
 *
 * Usage:
 *   node scripts/fix-lecture-sequence.js --dry-run    # Preview changes
 *   node scripts/fix-lecture-sequence.js              # Apply changes
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Lecture = require('../models/Lecture');
const Series = require('../models/Series');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('======================================================================');
  console.log('  Fix Lecture Sequence for 5feb2026 Import');
  console.log('======================================================================');
  console.log(`\nMode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);

  // Connect to MongoDB
  console.log('\nConnecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Get all series that have lectures from the 5feb2026 batch
  const seriesWithImportedLectures = await Lecture.distinct('seriesId', {
    'metadata.importBatch': '5feb2026'
  });

  console.log(`\nFound ${seriesWithImportedLectures.length} series with imported lectures\n`);

  const stats = {
    seriesProcessed: 0,
    lecturesUpdated: 0,
    errors: []
  };

  for (const seriesId of seriesWithImportedLectures) {
    const series = await Series.findById(seriesId).lean();
    if (!series) continue;

    console.log(`\n--- Series: ${series.titleArabic} ---`);

    // Get batch lectures for this series
    const batchLectures = await Lecture.find({
      seriesId: seriesId,
      'metadata.importBatch': '5feb2026'
    }).lean();

    if (batchLectures.length === 0) continue;

    // Check if this is a "current continuation" series (S.No 1-33, group: masjid/khutba/online from phase 3)
    // These should be interleaved with existing lectures by date
    const hasCurrentContinuations = batchLectures.some(l =>
      l.metadata?.serialNo >= 1 && l.metadata?.serialNo <= 33
    );

    // Get existing (non-batch) lectures
    const existingLectures = await Lecture.find({
      seriesId: seriesId,
      $or: [
        { 'metadata.importBatch': { $ne: '5feb2026' } },
        { 'metadata.importBatch': { $exists: false } }
      ]
    }).lean();

    console.log(`  Existing lectures: ${existingLectures.length}`);
    console.log(`  Batch lectures: ${batchLectures.length}`);
    console.log(`  Mode: ${hasCurrentContinuations && existingLectures.length > 0 ? 'INTERLEAVE BY DATE' : 'APPEND BY S.No'}`);

    if (hasCurrentContinuations && existingLectures.length > 0) {
      // INTERLEAVE MODE: Sort ALL lectures by dateRecorded
      const allLectures = [...existingLectures, ...batchLectures];

      // Sort by dateRecorded (oldest first), then by createdAt as fallback
      allLectures.sort((a, b) => {
        const dateA = a.dateRecorded ? new Date(a.dateRecorded).getTime() : 0;
        const dateB = b.dateRecorded ? new Date(b.dateRecorded).getTime() : 0;

        if (dateA !== dateB) return dateA - dateB;

        // Fallback to createdAt
        const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return createdA - createdB;
      });

      // Assign sortOrder based on date-sorted position
      for (let i = 0; i < allLectures.length; i++) {
        const lecture = allLectures[i];
        const newSortOrder = i;
        const oldSortOrder = lecture.sortOrder;

        if (oldSortOrder !== newSortOrder) {
          const isBatch = lecture.metadata?.importBatch === '5feb2026';
          const dateStr = lecture.dateRecorded ? new Date(lecture.dateRecorded).toISOString().split('T')[0] : 'no-date';
          console.log(`    [${i}] ${isBatch ? 'NEW' : 'OLD'} ${dateStr} | #${lecture.lectureNumber || '-'} "${lecture.titleArabic.substring(0, 30)}..."`);

          if (!DRY_RUN) {
            try {
              await Lecture.updateOne(
                { _id: lecture._id },
                { $set: { sortOrder: newSortOrder } }
              );
              stats.lecturesUpdated++;
            } catch (error) {
              console.error(`      ERROR: ${error.message}`);
              stats.errors.push({ lectureId: lecture._id, error: error.message });
            }
          } else {
            stats.lecturesUpdated++;
          }
        }
      }
    } else {
      // APPEND MODE: Existing lectures first (by sortOrder/lectureNumber), then batch by S.No

      // Sort existing lectures
      existingLectures.sort((a, b) => {
        if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
          return a.sortOrder - b.sortOrder;
        }
        const numA = a.lectureNumber || 999;
        const numB = b.lectureNumber || 999;
        if (numA !== numB) return numA - numB;
        const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return createdA - createdB;
      });

      // Update existing lectures to have sortOrder
      for (let i = 0; i < existingLectures.length; i++) {
        const lecture = existingLectures[i];
        if (lecture.sortOrder !== i) {
          if (!DRY_RUN) {
            await Lecture.updateOne(
              { _id: lecture._id },
              { $set: { sortOrder: i } }
            );
          }
        }
      }

      let nextSortOrder = existingLectures.length;

      // Sort batch lectures by S.No
      batchLectures.sort((a, b) => {
        const snoA = a.metadata?.serialNo || 999;
        const snoB = b.metadata?.serialNo || 999;
        return snoA - snoB;
      });

      console.log(`  Starting sortOrder at: ${nextSortOrder}`);

      // Update each batch lecture with sortOrder based on S.No order
      for (let i = 0; i < batchLectures.length; i++) {
        const lecture = batchLectures[i];
        const newSortOrder = nextSortOrder + i;
        const oldSortOrder = lecture.sortOrder;

        if (oldSortOrder !== newSortOrder) {
          console.log(`    S.No ${lecture.metadata?.serialNo}: sortOrder ${oldSortOrder ?? 'null'} → ${newSortOrder} | #${lecture.lectureNumber || '-'} "${lecture.titleArabic.substring(0, 35)}..."`);

          if (!DRY_RUN) {
            try {
              await Lecture.updateOne(
                { _id: lecture._id },
                { $set: { sortOrder: newSortOrder } }
              );
              stats.lecturesUpdated++;
            } catch (error) {
              console.error(`      ERROR: ${error.message}`);
              stats.errors.push({ lectureId: lecture._id, error: error.message });
            }
          } else {
            stats.lecturesUpdated++;
          }
        }
      }
    }

    stats.seriesProcessed++;
  }

  console.log('\n======================================================================');
  console.log('  SUMMARY');
  console.log('======================================================================');
  console.log(`  Series processed: ${stats.seriesProcessed}`);
  console.log(`  Lectures updated: ${stats.lecturesUpdated}`);
  console.log(`  Errors: ${stats.errors.length}`);

  if (DRY_RUN) {
    console.log('\n  DRY RUN - No changes were made.');
    console.log('  Run without --dry-run to apply changes.');
  }

  await mongoose.connection.close();
  console.log('\nDatabase connection closed');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
