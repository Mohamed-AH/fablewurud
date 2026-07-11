const XLSX = require('xlsx');
const mongoose = require('mongoose');
const { Lecture, Series } = require('../models');
require('dotenv').config();

async function consolidateKhutbaSeries() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all series that are Juma Khutbas (individual sermon series)
    const khutbaSeries = await Series.find({
      $or: [
        { titleArabic: /خطبة_الجمعة/i },
        { titleArabic: /خطبة الجمعة/i },
        { titleArabic: /خطبة_الاستسقاء/i }
      ]
    }).populate('sheikhId');

    console.log(`📋 Found ${khutbaSeries.length} Juma Khutba series:\n`);
    khutbaSeries.forEach(s => {
      console.log(`  - ${s.titleArabic} (ID: ${s._id})`);
    });

    if (khutbaSeries.length === 0) {
      console.log('\n✅ No Juma Khutba series found to consolidate.');
      process.exit(0);
    }

    // Get the sheikh (should be the same for all)
    const sheikhId = khutbaSeries[0].sheikhId._id;
    const sheikhName = khutbaSeries[0].sheikhId.nameArabic;

    console.log(`\n👤 Sheikh: ${sheikhName}\n`);

    // Find or create the consolidated "Juma Khutba" series
    let consolidatedSeries = await Series.findOne({
      titleArabic: 'خطب الجمعة',
      sheikhId: sheikhId
    });

    if (!consolidatedSeries) {
      console.log('📝 Creating new consolidated series: "خطب الجمعة"\n');

      consolidatedSeries = await Series.create({
        titleArabic: 'خطب الجمعة',
        titleEnglish: 'Friday Sermons',
        descriptionArabic: 'مجموعة من خطب الجمعة للشيخ ' + sheikhName,
        descriptionEnglish: 'Collection of Friday sermons by Sheikh ' + sheikhName,
        sheikhId: sheikhId,
        category: 'Other',
        lectureCount: 0
      });

      console.log(`✅ Created consolidated series: ${consolidatedSeries.titleArabic} (ID: ${consolidatedSeries._id})\n`);
    } else {
      console.log(`✅ Using existing consolidated series: ${consolidatedSeries.titleArabic} (ID: ${consolidatedSeries._id})\n`);
    }

    // Move all lectures from individual Khutba series to the consolidated series
    const seriesIds = khutbaSeries.map(s => s._id);

    console.log('🔄 Moving lectures to consolidated series...\n');

    // Get all lectures from these series
    const lectures = await Lecture.find({
      seriesId: { $in: seriesIds }
    });

    console.log(`Found ${lectures.length} lectures to move\n`);

    let moved = 0;
    for (const lecture of lectures) {
      // Update the lecture's title to include the original Khutba topic
      const oldSeries = khutbaSeries.find(s => s._id.equals(lecture.seriesId));

      if (oldSeries) {
        // Extract the topic from the old series title
        // e.g., "خطبة_الجمعة  -  أهمية النزاهة والأمانة" → "أهمية النزاهة والأمانة"
        let topic = oldSeries.titleArabic
          .replace(/خطبة_الجمعة\s*-?\s*/i, '')
          .replace(/خطبة الجمعة\s*-?\s*/i, '')
          .replace(/خطبة_الاستسقاء/i, 'الاستسقاء')
          .trim();

        // Update lecture
        const newTitle = topic ? `خطب الجمعة - ${topic}` : 'خطب الجمعة';

        await Lecture.findByIdAndUpdate(lecture._id, {
          seriesId: consolidatedSeries._id,
          titleArabic: newTitle,
          titleEnglish: newTitle,
          lectureNumber: null // Remove lecture numbers for Khutbas
        });

        console.log(`✅ Moved: ${newTitle}`);
        moved++;
      }
    }

    // Update lecture counts
    await Series.findByIdAndUpdate(consolidatedSeries._id, {
      lectureCount: moved
    });

    // Delete the old individual Khutba series
    console.log(`\n🗑️  Deleting ${khutbaSeries.length} old Khutba series...\n`);

    for (const series of khutbaSeries) {
      await Series.findByIdAndDelete(series._id);
      console.log(`✅ Deleted: ${series.titleArabic}`);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Consolidation Complete!');
    console.log('='.repeat(60));
    console.log(`✅ Moved ${moved} lectures to consolidated series`);
    console.log(`✅ Deleted ${khutbaSeries.length} old series`);
    console.log(`📚 Consolidated series: "خطب الجمعة" (${moved} lectures)`);
    console.log('='.repeat(60));

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

consolidateKhutbaSeries();
