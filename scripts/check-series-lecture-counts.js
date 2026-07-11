const mongoose = require('mongoose');
const { Series, Lecture } = require('../models');
require('dotenv').config();

async function checkSeriesLectureCounts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('='.repeat(60));
    console.log('CHECKING SERIES LECTURE COUNTS');
    console.log('='.repeat(60) + '\n');

    // Find all series and check their lecture counts
    const allSeries = await Series.find().sort({ titleArabic: 1 }).lean();

    console.log(`Found ${allSeries.length} series in database\n`);

    for (const series of allSeries) {
      // Count all lectures (published and unpublished)
      const totalLectures = await Lecture.countDocuments({
        seriesId: series._id
      });

      // Count only published lectures
      const publishedLectures = await Lecture.countDocuments({
        seriesId: series._id,
        published: true
      });

      // Count unpublished lectures
      const unpublishedLectures = totalLectures - publishedLectures;

      // Only show series with mismatches or many lectures
      if (unpublishedLectures > 0 || publishedLectures >= 20) {
        console.log('━'.repeat(60));
        console.log(`📚 ${series.titleArabic}`);
        console.log(`   Series ID: ${series._id}`);
        console.log(`   Stored lectureCount: ${series.lectureCount || 0}`);
        console.log(`   Total lectures in DB: ${totalLectures}`);
        console.log(`   Published lectures: ${publishedLectures}`);

        if (unpublishedLectures > 0) {
          console.log(`   ⚠️  Unpublished lectures: ${unpublishedLectures}`);

          // Show which lectures are unpublished
          const unpublishedDocs = await Lecture.find({
            seriesId: series._id,
            published: false
          }).select('titleArabic lectureNumber').lean();

          console.log('   Unpublished lectures:');
          unpublishedDocs.forEach(lecture => {
            console.log(`     - [#${lecture.lectureNumber || 'N/A'}] ${lecture.titleArabic}`);
          });
        }

        if (publishedLectures !== totalLectures) {
          console.log(`   ℹ️  Display shows: ${publishedLectures} (only published)`);
        }
        console.log('');
      }
    }

    console.log('='.repeat(60));
    console.log('SPECIFIC CHECK: Series with 29-32 lectures');
    console.log('='.repeat(60) + '\n');

    // Find series with around 30 lectures
    const largeSeries = await Series.find().lean();

    for (const series of largeSeries) {
      const publishedCount = await Lecture.countDocuments({
        seriesId: series._id,
        published: true
      });

      if (publishedCount >= 25 && publishedCount <= 35) {
        const totalCount = await Lecture.countDocuments({
          seriesId: series._id
        });

        console.log(`📚 ${series.titleArabic}`);
        console.log(`   Published: ${publishedCount}`);
        console.log(`   Total: ${totalCount}`);
        console.log(`   Difference: ${totalCount - publishedCount} unpublished`);
        console.log('');
      }
    }

    console.log('='.repeat(60));
    console.log('SOLUTION');
    console.log('='.repeat(60) + '\n');
    console.log('If lectures are unpublished:');
    console.log('1. Check why they are unpublished (quality issue, incomplete, etc.)');
    console.log('2. If they should be published, run:');
    console.log('   db.lectures.updateMany({ seriesId: ObjectId("..."), published: false }, { $set: { published: true } })');
    console.log('3. Or create a script to publish all lectures in those series');
    console.log('');

    await mongoose.disconnect();
    console.log('✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkSeriesLectureCounts();
