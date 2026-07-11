#!/usr/bin/env node
/**
 * Fix Lecture Order for الأفنان الندية Series
 *
 * Assigns sequential lectureNumber based on book section order:
 * 1. كتاب الطهارة (1-17)
 * 2. كتاب الصلاة (1-61)
 * 3. كتاب الصلاة (الجنائز) (62-67)
 * 4. كتاب الزكاة (1-10)
 * 5. كتاب الحج (1-18)
 * 6. كتاب الجهاد (1-19)
 * 7. كتاب البيوع (1-31)
 * 8. كتاب الفرائض (1-9)
 * 9. كتاب النكاح (1-14)
 *
 * Usage:
 *   node scripts/fix-afnan-lecture-order.js           # Dry run
 *   node scripts/fix-afnan-lecture-order.js --apply   # Apply changes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Lecture, Series } = require('../models');

const DRY_RUN = !process.argv.includes('--apply');

// Book sections in correct order
const BOOK_ORDER = [
  'كتاب الطهارة',
  'كتاب الصلاة',
  'كتاب الصلاة (الجنائز)',
  'كتاب الزكاة',
  'كتاب الحج',
  'كتاب الجهاد',
  'كتاب البيوع',
  'كتاب الفرائض',
  'كتاب النكاح'
];

function parseTitle(title) {
  // Title format: "الأفنان الندية - كتاب الطهارة 1"
  const match = title.match(/^الأفنان الندية - (.+?) (\d+)$/);
  if (match) {
    return { book: match[1], num: parseInt(match[2], 10) };
  }
  return null;
}

function sortLectures(lectures) {
  return lectures.sort((a, b) => {
    const parsedA = parseTitle(a.titleArabic);
    const parsedB = parseTitle(b.titleArabic);

    if (!parsedA || !parsedB) return 0;

    const orderA = BOOK_ORDER.indexOf(parsedA.book);
    const orderB = BOOK_ORDER.indexOf(parsedB.book);

    // Sort by book order first
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    // Then by number within book
    return parsedA.num - parsedB.num;
  });
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  FIX LECTURE ORDER: الأفنان الندية');
  console.log('═'.repeat(60));
  console.log(`\n  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to database\n');

  // Find the series
  const series = await Series.findOne({ titleArabic: 'الأفنان الندية' });
  if (!series) {
    console.error('❌ Series "الأفنان الندية" not found');
    process.exit(1);
  }
  console.log(`📚 Found series: ${series.titleArabic} (${series._id})`);

  // Get all lectures in this series
  const lectures = await Lecture.find({ seriesId: series._id }).lean();
  console.log(`📖 Found ${lectures.length} lectures\n`);

  if (lectures.length === 0) {
    console.log('No lectures to fix.');
    process.exit(0);
  }

  // Sort lectures in correct order
  const sorted = sortLectures([...lectures]);

  // Preview order
  console.log('📋 Correct order:\n');
  console.log('  #   | Current # | Title');
  console.log('  ' + '-'.repeat(55));

  const updates = [];
  sorted.forEach((lecture, index) => {
    const newNum = index + 1;
    const changed = lecture.lectureNumber !== newNum;
    const marker = changed ? '→' : ' ';
    console.log(`  ${String(newNum).padStart(3)} | ${String(lecture.lectureNumber || '-').padStart(9)} ${marker} | ${lecture.titleArabic.substring(0, 45)}`);

    if (changed) {
      updates.push({
        _id: lecture._id,
        oldNum: lecture.lectureNumber,
        newNum: newNum,
        title: lecture.titleArabic
      });
    }
  });

  console.log(`\n📊 Summary: ${updates.length} lectures need updating\n`);

  if (updates.length === 0) {
    console.log('✅ All lectures already in correct order!');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('🔍 DRY RUN - No changes made');
    console.log('   Run with --apply to update the database\n');
  } else {
    console.log('📝 Applying updates...\n');

    const bulkOps = updates.map(u => ({
      updateOne: {
        filter: { _id: u._id },
        update: { $set: { lectureNumber: u.newNum } }
      }
    }));

    const result = await Lecture.bulkWrite(bulkOps);
    console.log(`✅ Updated ${result.modifiedCount} lectures\n`);
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
