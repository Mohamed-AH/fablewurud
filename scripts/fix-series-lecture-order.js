#!/usr/bin/env node
/**
 * Fix lecture sort order for a specific series
 * Sorts by dateRecorded (or createdAt as fallback) with latest at the end
 *
 * Usage:
 *   node scripts/fix-series-lecture-order.js --series <seriesId> --dry-run  # Preview changes
 *   node scripts/fix-series-lecture-order.js --series <seriesId>            # Apply changes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Lecture, Series } = require('../models');

const args = process.argv.slice(2);
const seriesIdIndex = args.indexOf('--series');
const seriesId = seriesIdIndex !== -1 ? args[seriesIdIndex + 1] : null;
const DRY_RUN = args.includes('--dry-run');

if (!seriesId) {
  console.error('Usage: node scripts/fix-series-lecture-order.js --series <seriesId> [--dry-run]');
  process.exit(1);
}

async function fixLectureOrder() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);

    // Verify series exists
    const series = await Series.findById(seriesId);
    if (!series) {
      console.error(`Series not found: ${seriesId}`);
      process.exit(1);
    }
    console.log(`\nSeries: ${series.titleArabic}`);

    // Get all lectures for this series
    const lectures = await Lecture.find({ seriesId: seriesId })
      .sort({ dateRecorded: 1, createdAt: 1 })
      .lean();

    console.log(`Found ${lectures.length} lectures\n`);

    if (lectures.length === 0) {
      console.log('No lectures to update');
      process.exit(0);
    }

    // Sort by dateRecorded (fallback to createdAt), oldest first (latest at end)
    lectures.sort((a, b) => {
      const dateA = a.dateRecorded || a.createdAt;
      const dateB = b.dateRecorded || b.createdAt;
      return new Date(dateA) - new Date(dateB);
    });

    // Update sortOrder for each lecture
    console.log(`${DRY_RUN ? 'Previewing' : 'Updating'} lecture order (oldest first, latest at end):\n`);

    for (let i = 0; i < lectures.length; i++) {
      const lecture = lectures[i];
      const newSortOrder = i + 1;
      const effectiveDate = lecture.dateRecorded || lecture.createdAt;

      if (!DRY_RUN) {
        await Lecture.updateOne(
          { _id: lecture._id },
          { $set: { sortOrder: newSortOrder, lectureNumber: newSortOrder } }
        );
      }

      console.log(`${newSortOrder}. ${lecture.titleArabic}`);
      console.log(`   Date: ${effectiveDate ? new Date(effectiveDate).toISOString().split('T')[0] : 'N/A'}`);
      console.log(`   (was sortOrder: ${lecture.sortOrder || 'unset'}, lectureNumber: ${lecture.lectureNumber || 'unset'})\n`);
    }

    // Show final order summary
    console.log('\n' + '='.repeat(80));
    console.log('FINAL ORDER (how the series will appear):');
    console.log('='.repeat(80));
    console.log(`${'#'.padEnd(4)} | ${'Date'.padEnd(12)} | Title`);
    console.log('-'.repeat(80));

    for (let i = 0; i < lectures.length; i++) {
      const lecture = lectures[i];
      const effectiveDate = lecture.dateRecorded || lecture.createdAt;
      const dateStr = effectiveDate ? new Date(effectiveDate).toISOString().split('T')[0] : 'N/A';
      console.log(`${String(i + 1).padEnd(4)} | ${dateStr.padEnd(12)} | ${lecture.titleArabic}`);
    }

    console.log('='.repeat(80));

    if (DRY_RUN) {
      console.log(`\nDRY RUN: Would update ${lectures.length} lectures. Run without --dry-run to apply.`);
    } else {
      console.log(`\nSuccessfully updated ${lectures.length} lectures`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

fixLectureOrder();
