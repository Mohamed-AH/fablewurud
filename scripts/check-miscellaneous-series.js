const mongoose = require('mongoose');
const { Series, Lecture } = require('../models');
require('dotenv').config();

async function checkMiscellaneousLectures() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('='.repeat(60));
    console.log('CHECKING محاضرات متفرقة SERIES');
    console.log('='.repeat(60) + '\n');

    // Find محاضرات متفرقة series
    const miscSeries = await Series.findOne({
      titleArabic: /محاضرات متفرقة/i
    }).lean();

    if (miscSeries) {
      console.log('✅ Found محاضرات متفرقة series:');
      console.log(`   ID: ${miscSeries._id}`);
      console.log(`   Title: ${miscSeries.titleArabic}`);
      console.log('');

      // Get lectures in this series
      const lectures = await Lecture.find({
        seriesId: miscSeries._id,
        published: true
      })
        .populate('sheikhId', 'nameArabic')
        .lean();

      console.log(`   Contains ${lectures.length} lectures:`);
      lectures.slice(0, 10).forEach((lec, i) => {
        console.log(`   ${i + 1}. ${lec.titleArabic}`);
      });

      if (lectures.length > 10) {
        console.log(`   ... and ${lectures.length - 10} more`);
      }
    } else {
      console.log('❌ No محاضرات متفرقة series found');
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('OPTIONS:');
    console.log('='.repeat(60));
    console.log('');
    console.log('Option 1: Show محاضرات متفرقة on Lectures tab (Recommended)');
    console.log('  - Keep lectures in the series');
    console.log('  - Update homepage route to show this series on Lectures tab');
    console.log('');
    console.log('Option 2: Move lectures back to standalone');
    console.log('  - Set seriesId = null for all lectures in this series');
    console.log('  - Delete محاضرات متفرقة series');
    console.log('  - Lectures will appear as truly standalone');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkMiscellaneousLectures();
