const mongoose = require('mongoose');
const { Series, Lecture } = require('../models');
require('dotenv').config();

async function separateSeerahSeries() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('='.repeat(60));
    console.log('SEPARATING TWO SEERAH SERIES');
    console.log('='.repeat(60) + '\n');

    // Step 1: Find the current mixed series
    const mixedSeries = await Series.findOne({
      titleArabic: /خطبة الجمعة.*مختصر السيرة/i
    });

    if (!mixedSeries) {
      console.log('❌ Series not found');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log('Step 1: Found mixed series');
    console.log(`   Name: ${mixedSeries.titleArabic}`);
    console.log(`   ID: ${mixedSeries._id}`);
    console.log('');

    // Step 2: Get all lectures in this series
    const allLectures = await Lecture.find({
      seriesId: mixedSeries._id,
      published: true
    }).sort({ lectureNumber: 1 });

    console.log(`Step 2: Found ${allLectures.length} lectures in series\n`);

    // Step 3: Separate lectures into two groups
    const khutbaLectures = allLectures.filter(lecture =>
      lecture.titleArabic.includes('خطبة_الجمعة') ||
      lecture.titleArabic.includes('خطبة الجمعة')
    );

    const regularLectures = allLectures.filter(lecture =>
      !lecture.titleArabic.includes('خطبة_الجمعة') &&
      !lecture.titleArabic.includes('خطبة الجمعة')
    );

    console.log('Step 3: Separated lectures into two groups');
    console.log(`   Khutba lectures (with "خطبة"): ${khutbaLectures.length}`);
    console.log(`   Regular lectures (without "خطبة"): ${regularLectures.length}`);
    console.log('');

    // Step 4: Create or find the regular series
    let regularSeries = await Series.findOne({
      titleArabic: 'مختصر السيرة النبوية',
      sheikhId: mixedSeries.sheikhId
    });

    if (!regularSeries) {
      console.log('Step 4: Creating new regular series');
      regularSeries = await Series.create({
        titleArabic: 'مختصر السيرة النبوية',
        titleEnglish: 'Brief Biography of the Prophet',
        sheikhId: mixedSeries.sheikhId,
        category: mixedSeries.category || 'Other',
        lectureCount: regularLectures.length
      });
      console.log(`   ✅ Created series: ${regularSeries.titleArabic}`);
      console.log(`   ID: ${regularSeries._id}`);
    } else {
      console.log('Step 4: Found existing regular series');
      console.log(`   Name: ${regularSeries.titleArabic}`);
      console.log(`   ID: ${regularSeries._id}`);
    }
    console.log('');

    // Step 5: Move regular lectures to regular series
    console.log('Step 5: Moving regular lectures to regular series');
    console.log('   Regular lectures:');
    for (const lecture of regularLectures) {
      await Lecture.findByIdAndUpdate(lecture._id, {
        seriesId: regularSeries._id
      });
      console.log(`   ✅ [#${lecture.lectureNumber}] ${lecture.titleArabic}`);
    }
    console.log('');

    // Step 6: Keep Khutba lectures in Khutba series
    console.log('Step 6: Khutba lectures remaining in Khutba series:');
    for (const lecture of khutbaLectures) {
      console.log(`   ✅ [#${lecture.lectureNumber}] ${lecture.titleArabic}`);
    }
    console.log('');

    // Step 7: Update lecture counts
    await Series.findByIdAndUpdate(regularSeries._id, {
      lectureCount: regularLectures.length
    });

    await Series.findByIdAndUpdate(mixedSeries._id, {
      lectureCount: khutbaLectures.length
    });

    console.log('Step 7: Updated series lecture counts');
    console.log(`   Regular series: ${regularLectures.length} lectures`);
    console.log(`   Khutba series: ${khutbaLectures.length} lectures`);
    console.log('');

    console.log('='.repeat(60));
    console.log('FINAL RESULT');
    console.log('='.repeat(60));
    console.log('');
    console.log('📚 Series 1: مختصر السيرة النبوية (Regular lessons)');
    console.log(`   ID: ${regularSeries._id}`);
    console.log(`   Lectures: ${regularLectures.length}`);
    console.log('   Type: Regular lesson series (دروس)');
    console.log('   Will NOT appear in hierarchical Khutba view');
    console.log('');
    console.log('📚 Series 2: خطبة الجمعة - مختصر السيرة النبوية (Khutbas)');
    console.log(`   ID: ${mixedSeries._id}`);
    console.log(`   Lectures: ${khutbaLectures.length}`);
    console.log('   Type: Juma Khutba series');
    console.log('   ✅ WILL appear in hierarchical Khutba view');
    console.log('');
    console.log('='.repeat(60));

    if (regularLectures.length === 4 && khutbaLectures.length === 9) {
      console.log('✅ SUCCESS! Both series have correct lecture counts');
    } else {
      console.log('⚠️  Warning: Lecture counts may not match expected values');
      console.log(`   Expected: 4 regular + 9 Khutba`);
      console.log(`   Got: ${regularLectures.length} regular + ${khutbaLectures.length} Khutba`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

separateSeerahSeries();
