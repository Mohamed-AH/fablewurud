#!/usr/bin/env node
/**
 * Script to update lecture sortOrder to match lectureNumber in a series
 *
 * Usage:
 *   node scripts/update-lecture-order.js --series <seriesId>
 *   node scripts/update-lecture-order.js --series <seriesId> --dry-run
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Parse command line arguments
const args = process.argv.slice(2);
let seriesId = null;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--series') {
    seriesId = args[++i];
  } else if (args[i] === '--dry-run') {
    dryRun = true;
  }
}

if (!seriesId) {
  console.log(`
📚 Update Lecture Order Script
===============================

Usage:
  node scripts/update-lecture-order.js --series <seriesId> [--dry-run]

Options:
  --series <seriesId>  The series ID to update
  --dry-run            Preview changes without saving

Example:
  node scripts/update-lecture-order.js --series 697604301c69c76d98f8e65d
`);
  process.exit(1);
}

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected\n');

    const { Lecture, Series } = require('../models');

    // Get series info
    const series = await Series.findById(seriesId);
    if (!series) {
      console.error(`❌ Series not found: ${seriesId}`);
      process.exit(1);
    }

    console.log(`📂 Series: ${series.titleArabic}`);
    console.log(`   ${series.titleEnglish || ''}\n`);

    // Get all lectures in the series, sorted by lectureNumber
    const lectures = await Lecture.find({ seriesId })
      .sort({ lectureNumber: 1 });

    if (lectures.length === 0) {
      console.log('ℹ️  No lectures found in this series.\n');
      process.exit(0);
    }

    console.log(`Found ${lectures.length} lectures:\n`);
    console.log('─'.repeat(70));
    console.log('  #  | Lecture# | Old Sort | New Sort | Title');
    console.log('─'.repeat(70));

    let updatedCount = 0;

    for (let i = 0; i < lectures.length; i++) {
      const lecture = lectures[i];
      const newSortOrder = lecture.lectureNumber || (i + 1);
      const needsUpdate = lecture.sortOrder !== newSortOrder;

      const marker = needsUpdate ? '→' : ' ';
      const title = lecture.titleArabic.length > 35
        ? lecture.titleArabic.substring(0, 35) + '...'
        : lecture.titleArabic;

      console.log(
        `${(i + 1).toString().padStart(3)} | ` +
        `${(lecture.lectureNumber || '-').toString().padStart(8)} | ` +
        `${(lecture.sortOrder || 0).toString().padStart(8)} | ` +
        `${newSortOrder.toString().padStart(8)} ${marker}| ` +
        `${title}`
      );

      if (needsUpdate) {
        updatedCount++;
        if (!dryRun) {
          lecture.sortOrder = newSortOrder;
          await lecture.save();
        }
      }
    }

    console.log('─'.repeat(70));

    if (dryRun) {
      console.log(`\n🔍 DRY RUN - No changes made.`);
      console.log(`   Would update ${updatedCount} lecture(s).\n`);
    } else {
      console.log(`\n✅ Updated ${updatedCount} lecture(s).\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
