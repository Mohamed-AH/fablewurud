const mongoose = require('mongoose');
const { Series, Lecture } = require('../models');
require('dotenv').config();

async function checkSeerahSeries() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check for the multi-lecture Khutba series
    const seerahSeries = await Series.findOne({
      titleArabic: /مختصر.*السيرة/i
    });

    console.log('='.repeat(60));
    console.log('CHECKING FOR MULTI-LECTURE KHUTBA SERIES');
    console.log('='.repeat(60) + '\n');

    if (seerahSeries) {
      console.log('✅ Found series: خطبة الجمعة - مختصر السيرة النبوية');
      console.log(`   ID: ${seerahSeries._id}`);
      console.log(`   Full name: ${seerahSeries.titleArabic}`);
      console.log(`   Stored lecture count: ${seerahSeries.lectureCount}`);

      // Get actual lecture count
      const actualCount = await Lecture.countDocuments({
        seriesId: seerahSeries._id,
        published: true
      });

      console.log(`   Actual published lectures: ${actualCount}`);
      console.log('');

      if (actualCount === 9) {
        console.log('✅ CORRECT: Series has 9 lectures as expected from Excel');
      } else {
        console.log(`⚠️  MISMATCH: Expected 9 lectures, found ${actualCount}`);
      }
    } else {
      console.log('❌ Series NOT found: خطبة الجمعة - مختصر السيرة النبوية');
      console.log('   This series should exist with 9 lectures!');
      console.log('');
      console.log('Possible causes:');
      console.log('1. Import script failed to create this series');
      console.log('2. organize-content.js incorrectly consolidated it');
      console.log('3. Series was manually deleted');
    }

    console.log('\n' + '='.repeat(60));
    console.log('CHECKING ALL SERIES WITH "خطبة" IN NAME');
    console.log('='.repeat(60) + '\n');

    const allKhutbaSeries = await Series.find({
      titleArabic: /خطبة/i
    }).sort({ titleArabic: 1 });

    console.log(`Found ${allKhutbaSeries.length} series with "خطبة" in name:\n`);

    for (const series of allKhutbaSeries) {
      const count = await Lecture.countDocuments({
        seriesId: series._id,
        published: true
      });

      console.log(`📚 ${series.titleArabic}`);
      console.log(`   ID: ${series._id}`);
      console.log(`   Lectures: ${count}`);
      console.log('');
    }

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkSeerahSeries();
