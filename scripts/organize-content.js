const mongoose = require('mongoose');
const { Lecture, Series } = require('../models');
require('dotenv').config();

async function organizeContent() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const stats = {
      khutbasConsolidated: 0,
      lecturesGrouped: 0,
      seriesKept: 0
    };

    // ========================================
    // PART 1: ORGANIZE KHUTBAS
    // ========================================
    console.log('=' .repeat(60));
    console.log('PART 1: ORGANIZING KHUTBAS');
    console.log('='.repeat(60) + '\n');

    // Find all Khutba-related series
    const allKhutbaSeries = await Series.find({
      $or: [
        { titleArabic: /خطبة/i }
      ]
    }).populate('sheikhId');

    console.log(`📋 Found ${allKhutbaSeries.length} Khutba-related series\n`);

    // Separate multi-lecture series from standalone Khutbas
    const multiLectureKhutbaSeries = [];
    const standaloneKhutbaSeries = [];

    for (const series of allKhutbaSeries) {
      const lectureCount = await Lecture.countDocuments({ seriesId: series._id });

      if (lectureCount > 1) {
        // Multi-lecture series - keep it
        multiLectureKhutbaSeries.push(series);
        console.log(`📚 KEEP: ${series.titleArabic} (${lectureCount} lectures)`);
      } else {
        // Standalone Khutba - consolidate it
        standaloneKhutbaSeries.push(series);
        console.log(`📄 CONSOLIDATE: ${series.titleArabic} (${lectureCount} lecture)`);
      }
    }

    stats.seriesKept = multiLectureKhutbaSeries.length;

    if (standaloneKhutbaSeries.length > 0) {
      console.log(`\n📝 Consolidating ${standaloneKhutbaSeries.length} standalone Khutbas...\n`);

      // Get the sheikh (should be the same for all)
      const sheikhId = standaloneKhutbaSeries[0].sheikhId._id;
      const sheikhName = standaloneKhutbaSeries[0].sheikhId.nameArabic;

      // Find or create consolidated "خطب الجمعة" series
      let consolidatedKhutbaSeries = await Series.findOne({
        titleArabic: 'خطب الجمعة',
        sheikhId: sheikhId
      });

      if (!consolidatedKhutbaSeries) {
        consolidatedKhutbaSeries = await Series.create({
          titleArabic: 'خطب الجمعة',
          titleEnglish: 'Friday Sermons',
          descriptionArabic: 'مجموعة من خطب الجمعة للشيخ ' + sheikhName,
          descriptionEnglish: 'Collection of Friday sermons by Sheikh ' + sheikhName,
          sheikhId: sheikhId,
          category: 'Other',
          lectureCount: 0
        });
        console.log(`✅ Created: خطب الجمعة\n`);
      }

      // Move lectures from standalone series to consolidated series
      for (const series of standaloneKhutbaSeries) {
        const lectures = await Lecture.find({ seriesId: series._id });

        for (const lecture of lectures) {
          // Extract topic from series title
          let topic = series.titleArabic
            .replace(/خطبة_الجمعة\s*-?\s*/i, '')
            .replace(/خطبة الجمعة\s*-?\s*/i, '')
            .replace(/خطبة_الاستسقاء/i, 'الاستسقاء')
            .trim();

          const newTitle = topic ? `خطب الجمعة - ${topic}` : 'خطب الجمعة';

          await Lecture.findByIdAndUpdate(lecture._id, {
            seriesId: consolidatedKhutbaSeries._id,
            titleArabic: newTitle,
            titleEnglish: newTitle,
            lectureNumber: null // No numbering for standalone Khutbas
          });

          console.log(`✅ Moved: ${newTitle}`);
          stats.khutbasConsolidated++;
        }

        // Delete old series
        await Series.findByIdAndDelete(series._id);
      }

      // Update lecture count
      await Series.findByIdAndUpdate(consolidatedKhutbaSeries._id, {
        lectureCount: stats.khutbasConsolidated
      });
    }

    // ========================================
    // PART 2: GROUP STANDALONE LECTURES
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('PART 2: GROUPING STANDALONE LECTURES');
    console.log('='.repeat(60) + '\n');

    // Find lectures with no series
    const standaloneLectures = await Lecture.find({
      seriesId: null
    }).populate('sheikhId');

    console.log(`📋 Found ${standaloneLectures.length} standalone lectures\n`);

    if (standaloneLectures.length > 0) {
      // Group by sheikh
      const lecturesBySheikh = {};

      standaloneLectures.forEach(lecture => {
        const sheikhId = lecture.sheikhId._id.toString();
        if (!lecturesBySheikh[sheikhId]) {
          lecturesBySheikh[sheikhId] = {
            sheikh: lecture.sheikhId,
            lectures: []
          };
        }
        lecturesBySheikh[sheikhId].lectures.push(lecture);
      });

      // Create "محاضرات متفرقة" (Miscellaneous Lectures) series for each sheikh
      for (const [sheikhId, data] of Object.entries(lecturesBySheikh)) {
        const sheikhName = data.sheikh.nameArabic;

        console.log(`👤 Sheikh: ${sheikhName} (${data.lectures.length} lectures)`);

        // Find or create "محاضرات متفرقة" series
        let miscSeries = await Series.findOne({
          titleArabic: 'محاضرات متفرقة',
          sheikhId: sheikhId
        });

        if (!miscSeries) {
          miscSeries = await Series.create({
            titleArabic: 'محاضرات متفرقة',
            titleEnglish: 'Miscellaneous Lectures',
            descriptionArabic: 'محاضرات متنوعة للشيخ ' + sheikhName,
            descriptionEnglish: 'Various lectures by Sheikh ' + sheikhName,
            sheikhId: sheikhId,
            category: 'Other',
            lectureCount: 0
          });
          console.log(`✅ Created: محاضرات متفرقة\n`);
        }

        // Move lectures to this series
        for (const lecture of data.lectures) {
          await Lecture.findByIdAndUpdate(lecture._id, {
            seriesId: miscSeries._id,
            lectureNumber: null // No numbering for miscellaneous lectures
          });

          console.log(`✅ Grouped: ${lecture.titleArabic}`);
          stats.lecturesGrouped++;
        }

        // Update lecture count
        await Series.findByIdAndUpdate(miscSeries._id, {
          lectureCount: data.lectures.length
        });

        console.log('');
      }
    }

    // ========================================
    // FINAL SUMMARY
    // ========================================
    console.log('='.repeat(60));
    console.log('📊 ORGANIZATION COMPLETE!');
    console.log('='.repeat(60));
    console.log(`✅ Multi-lecture Khutba series kept: ${stats.seriesKept}`);
    console.log(`✅ Standalone Khutbas consolidated: ${stats.khutbasConsolidated}`);
    console.log(`✅ Standalone lectures grouped: ${stats.lecturesGrouped}`);
    console.log('='.repeat(60));

    console.log('\n📋 Series Structure Now:');
    console.log('  - Regular series (e.g., تأسيس الأحكام، الملخص الفقهي)');
    console.log('  - Multi-lecture Khutba series (e.g., خطبة الجمعة - مختصر السيرة)');
    console.log('  - خطب الجمعة (consolidated standalone Khutbas)');
    console.log('  - محاضرات متفرقة (grouped standalone lectures)');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

organizeContent();
