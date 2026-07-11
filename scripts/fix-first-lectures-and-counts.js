const mongoose = require('mongoose');
const { Lecture, Series } = require('../models');
require('dotenv').config();

async function fixFirstLecturesAndCounts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const stats = {
      firstLecturesFixed: 0,
      seriesCountsFixed: 0
    };

    // ========================================
    // PART 1: FIX FIRST LECTURES TO HAVE lectureNumber = 1
    // ========================================
    console.log('='.repeat(60));
    console.log('PART 1: FIXING FIRST LECTURE NUMBERS');
    console.log('='.repeat(60) + '\n');

    // Target series that have issues with first lecture
    const targetSeries = [
      'التحفة النجمية بشرح الأربعين النووية',
      'التفسير الميسر',
      'تنبيه الانام على ما في كتاب سبل السلام من الفوائد والأحكام',
      'مختصر السيرة النبوية'
    ];

    for (const seriesName of targetSeries) {
      const series = await Series.findOne({ titleArabic: seriesName });

      if (series) {
        // Get all lectures, sorted by creation date (earliest first)
        const lectures = await Lecture.find({ seriesId: series._id })
          .sort({ createdAt: 1 });

        if (lectures.length > 0) {
          const firstLecture = lectures[0];

          // Check if first lecture has lectureNumber set
          if (!firstLecture.lectureNumber || firstLecture.lectureNumber !== 1) {
            await Lecture.findByIdAndUpdate(firstLecture._id, {
              lectureNumber: 1
            });

            console.log(`✅ Fixed first lecture: ${seriesName}`);
            console.log(`   Title: ${firstLecture.titleArabic}`);
            console.log(`   Old number: ${firstLecture.lectureNumber} → New: 1\n`);
            stats.firstLecturesFixed++;
          } else {
            console.log(`✓ Already correct: ${seriesName} (lectureNumber = 1)\n`);
          }
        }
      } else {
        console.log(`⚠️  Series not found: ${seriesName}\n`);
      }
    }

    // ========================================
    // PART 2: VERIFY AND FIX SERIES LECTURE COUNTS
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('PART 2: VERIFYING SERIES COUNTS');
    console.log('='.repeat(60) + '\n');

    // Check specific series with count issues
    const seriesToCheck = [
      'الملخص شرح كتاب التوحيد',
      'الملخص الفقهي'
    ];

    for (const seriesName of seriesToCheck) {
      const series = await Series.findOne({ titleArabic: seriesName });

      if (series) {
        const actualCount = await Lecture.countDocuments({
          seriesId: series._id,
          published: true
        });

        console.log(`📊 ${seriesName}`);
        console.log(`   Database lectureCount field: ${series.lectureCount}`);
        console.log(`   Actual published lectures: ${actualCount}`);

        if (series.lectureCount !== actualCount) {
          await Series.findByIdAndUpdate(series._id, {
            lectureCount: actualCount
          });

          console.log(`   ✅ Updated lectureCount: ${series.lectureCount} → ${actualCount}\n`);
          stats.seriesCountsFixed++;
        } else {
          console.log(`   ✓ Count is correct\n`);
        }
      } else {
        console.log(`⚠️  Series not found: ${seriesName}\n`);
      }
    }

    // ========================================
    // PART 3: SHOW ALL SERIES COUNTS FOR VERIFICATION
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('PART 3: ALL SERIES LECTURE COUNTS');
    console.log('='.repeat(60) + '\n');

    const allSeries = await Series.find({}).sort({ titleArabic: 1 });

    for (const series of allSeries) {
      const actualCount = await Lecture.countDocuments({
        seriesId: series._id,
        published: true
      });

      const status = series.lectureCount === actualCount ? '✓' : '✗';
      console.log(`${status} ${series.titleArabic}: ${actualCount} lectures (stored: ${series.lectureCount})`);
    }

    // ========================================
    // FINAL SUMMARY
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 FIX COMPLETE!');
    console.log('='.repeat(60));
    console.log(`✅ First lectures fixed: ${stats.firstLecturesFixed}`);
    console.log(`✅ Series counts corrected: ${stats.seriesCountsFixed}`);
    console.log('='.repeat(60));

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixFirstLecturesAndCounts();
