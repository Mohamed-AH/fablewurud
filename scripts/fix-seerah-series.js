const mongoose = require('mongoose');
const { Series, Lecture } = require('../models');
require('dotenv').config();

async function fixSeerahSeries() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('='.repeat(60));
    console.log('FIXING SEERAH KHUTBA SERIES');
    console.log('='.repeat(60) + '\n');

    // Step 1: Find the Seerah series
    const seerahSeries = await Series.findOne({
      titleArabic: /مختصر.*السيرة/i
    });

    if (!seerahSeries) {
      console.log('❌ Seerah series not found');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log('Step 1: Found series');
    console.log(`   Current name: ${seerahSeries.titleArabic}`);
    console.log(`   ID: ${seerahSeries._id}`);
    console.log('');

    // Step 2: Rename the series to include "خطبة الجمعة -" prefix
    const newName = 'خطبة الجمعة - مختصر السيرة النبوية';
    console.log('Step 2: Renaming series');
    console.log(`   New name: ${newName}`);

    await Series.findByIdAndUpdate(seerahSeries._id, {
      titleArabic: newName
    });
    console.log('   ✅ Series renamed');
    console.log('');

    // Step 3: Find current lectures in this series
    const currentLectures = await Lecture.find({
      seriesId: seerahSeries._id,
      published: true
    }).sort({ lectureNumber: 1 });

    console.log('Step 3: Current lectures in series');
    console.log(`   Found ${currentLectures.length} lectures:`);
    currentLectures.forEach(lecture => {
      console.log(`   - [${lecture.lectureNumber || 'N/A'}] ${lecture.titleArabic}`);
    });
    console.log('');

    // Step 4: Find the consolidated Khutba series
    const consolidatedSeries = await Series.findOne({
      titleArabic: 'خطب الجمعة'
    });

    if (!consolidatedSeries) {
      console.log('⚠️  Consolidated "خطب الجمعة" series not found');
      console.log('   Cannot move missing lectures');
    } else {
      console.log('Step 4: Finding missing lectures in consolidated series');
      console.log(`   Consolidated series ID: ${consolidatedSeries._id}`);

      // Find lectures that belong to Seerah series but are in consolidated
      // They should have "مختصر السيرة" or lecture numbers in title
      const seerahLectures = await Lecture.find({
        seriesId: consolidatedSeries._id,
        published: true,
        titleArabic: /مختصر.*السيرة/i
      });

      console.log(`   Found ${seerahLectures.length} Seerah lectures in consolidated series:`);
      seerahLectures.forEach(lecture => {
        console.log(`   - ${lecture.titleArabic}`);
      });
      console.log('');

      // Step 5: Move these lectures to the correct series
      if (seerahLectures.length > 0) {
        console.log('Step 5: Moving lectures to correct series');

        for (const lecture of seerahLectures) {
          await Lecture.findByIdAndUpdate(lecture._id, {
            seriesId: seerahSeries._id
          });
          console.log(`   ✅ Moved: ${lecture.titleArabic}`);
        }
        console.log('');
      }
    }

    // Step 6: Get final count and verify
    const finalLectures = await Lecture.find({
      seriesId: seerahSeries._id,
      published: true
    }).sort({ lectureNumber: 1 });

    console.log('Step 6: Final verification');
    console.log(`   Total lectures in series: ${finalLectures.length}`);
    console.log('');
    console.log('   Lecture list:');
    finalLectures.forEach((lecture, index) => {
      console.log(`   ${index + 1}. [#${lecture.lectureNumber || 'N/A'}] ${lecture.titleArabic}`);
    });
    console.log('');

    // Update series lecture count
    await Series.findByIdAndUpdate(seerahSeries._id, {
      lectureCount: finalLectures.length
    });

    console.log('='.repeat(60));
    if (finalLectures.length === 9) {
      console.log('✅ SUCCESS! Series now has 9 lectures as expected');
    } else {
      console.log(`⚠️  Series has ${finalLectures.length} lectures, expected 9`);
      console.log('   You may need to check if some lectures were not imported');
    }
    console.log('='.repeat(60));

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixSeerahSeries();
