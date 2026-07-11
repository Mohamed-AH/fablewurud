const mongoose = require('mongoose');
const { Series, Lecture } = require('../models');
require('dotenv').config();

async function debugKhutbaStructure() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('='.repeat(60));
    console.log('CHECKING KHUTBA STRUCTURE IN DATABASE');
    console.log('='.repeat(60) + '\n');

    // Find all series with "خطبة" or "خطب" in the name
    const khutbaSeries = await Series.find({
      titleArabic: /خطبة|خطب/i
    }).sort({ titleArabic: 1 });

    console.log(`Found ${khutbaSeries.length} Khutba-related series:\n`);

    for (const series of khutbaSeries) {
      const lectureCount = await Lecture.countDocuments({
        seriesId: series._id,
        published: true
      });

      console.log(`📚 ${series.titleArabic}`);
      console.log(`   ID: ${series._id}`);
      console.log(`   Lectures: ${lectureCount}`);
      console.log(`   Category: ${series.category}`);
      console.log('');
    }

    // Check if consolidated "خطب الجمعة" exists
    console.log('='.repeat(60));
    console.log('CHECKING FOR CONSOLIDATED SERIES');
    console.log('='.repeat(60) + '\n');

    const consolidated = await Series.findOne({ titleArabic: 'خطب الجمعة' });

    if (consolidated) {
      console.log('✅ Consolidated "خطب الجمعة" series EXISTS');
      console.log(`   ID: ${consolidated._id}`);

      const consolidatedLectures = await Lecture.countDocuments({
        seriesId: consolidated._id,
        published: true
      });

      console.log(`   Published Lectures: ${consolidatedLectures}`);
    } else {
      console.log('❌ Consolidated "خطب الجمعة" series DOES NOT EXIST');
      console.log('   → Need to run organize-content.js script');
    }

    console.log('\n' + '='.repeat(60));
    console.log('RECOMMENDATION');
    console.log('='.repeat(60) + '\n');

    if (!consolidated) {
      console.log('Run: node scripts/organize-content.js');
      console.log('This will consolidate standalone Khutbas into one series');
    } else {
      console.log('Structure looks good!');
      console.log('Multi-lecture Khutba series should appear in hierarchical view');
    }

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

debugKhutbaStructure();
