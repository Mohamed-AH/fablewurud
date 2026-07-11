const mongoose = require('mongoose');
const { Series, Lecture } = require('../models');
require('dotenv').config();

async function listSeriesLectures() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // The two series IDs from the output
    const seriesIds = [
      '6975b90abc30f3df706f3325', // الملخص شرح كتاب التوحيد
      '6975b90fbc30f3df706f33bd'  // الملخص الفقهي
    ];

    for (const seriesId of seriesIds) {
      const series = await Series.findById(seriesId).lean();

      if (!series) {
        console.log(`❌ Series not found: ${seriesId}\n`);
        continue;
      }

      console.log('='.repeat(70));
      console.log(`📚 ${series.titleArabic}`);
      console.log(`   ID: ${series._id}`);
      console.log('='.repeat(70));
      console.log('');

      // Get all lectures sorted by lecture number
      const lectures = await Lecture.find({
        seriesId: series._id
      })
        .sort({ lectureNumber: 1, createdAt: 1 })
        .lean();

      console.log(`Total lectures: ${lectures.length}\n`);

      // Group by lecture number to find duplicates
      const byNumber = {};
      lectures.forEach(lecture => {
        const num = lecture.lectureNumber || 'N/A';
        if (!byNumber[num]) {
          byNumber[num] = [];
        }
        byNumber[num].push(lecture);
      });

      // List all lectures
      console.log('Lecture List:\n');

      lectures.forEach((lecture, index) => {
        const num = lecture.lectureNumber || 'N/A';
        const status = lecture.published ? '✅' : '❌';
        const duplicate = byNumber[num] && byNumber[num].length > 1 ? '⚠️  DUPLICATE' : '';

        console.log(`${index + 1}. [#${num}] ${status} ${lecture.titleArabic} ${duplicate}`);
      });

      console.log('\n');

      // Check for duplicate lecture numbers
      const duplicates = Object.entries(byNumber).filter(([num, lecs]) => lecs.length > 1);

      if (duplicates.length > 0) {
        console.log('⚠️  DUPLICATE LECTURE NUMBERS FOUND:\n');
        duplicates.forEach(([num, lecs]) => {
          console.log(`Lecture #${num} appears ${lecs.length} times:`);
          lecs.forEach(lec => {
            console.log(`  - ${lec.titleArabic}`);
            console.log(`    ID: ${lec._id}`);
            console.log(`    Published: ${lec.published}`);
          });
          console.log('');
        });
      }

      // Check for missing lecture numbers
      const numbers = lectures
        .map(l => l.lectureNumber)
        .filter(n => n !== null && n !== undefined)
        .sort((a, b) => a - b);

      if (numbers.length > 0) {
        const min = numbers[0];
        const max = numbers[numbers.length - 1];
        const missing = [];

        for (let i = min; i <= max; i++) {
          if (!numbers.includes(i)) {
            missing.push(i);
          }
        }

        if (missing.length > 0) {
          console.log(`⚠️  MISSING LECTURE NUMBERS: ${missing.join(', ')}\n`);
        } else {
          console.log(`✅ Lecture numbers are sequential from ${min} to ${max}\n`);
        }
      }

      console.log('\n');
    }

    await mongoose.disconnect();
    console.log('✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

listSeriesLectures();
