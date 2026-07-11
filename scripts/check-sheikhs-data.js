const mongoose = require('mongoose');
const { Sheikh, Lecture, Series } = require('../models');
require('dotenv').config();

async function checkSheikhsData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    console.log('='.repeat(60));
    console.log('CHECKING SHEIKHS DATA');
    console.log('='.repeat(60) + '\n');

    const sheikhs = await Sheikh.find().lean();

    console.log(`Found ${sheikhs.length} sheikh(s) in database:\n`);

    if (sheikhs.length === 0) {
      console.log('❌ No sheikhs found in database!');
      console.log('   This is why the sheikhs page is empty.');
      console.log('   You need to import sheikh data or create sheikhs.');
    } else {
      for (const sheikh of sheikhs) {
        console.log('━'.repeat(60));
        console.log(`Sheikh ID: ${sheikh._id}`);
        console.log(`Name (Arabic): ${sheikh.nameArabic || '⚠️  MISSING'}`);
        console.log(`Name (English): ${sheikh.nameEnglish || 'N/A'}`);
        console.log(`Honorific: ${sheikh.honorific || 'N/A'}`);
        console.log(`Bio (Arabic): ${sheikh.bioArabic ? sheikh.bioArabic.substring(0, 50) + '...' : 'N/A'}`);
        console.log(`Bio (English): ${sheikh.bioEnglish ? sheikh.bioEnglish.substring(0, 50) + '...' : 'N/A'}`);

        // Count lectures and series
        const lectureCount = await Lecture.countDocuments({ sheikhId: sheikh._id });
        const seriesCount = await Series.countDocuments({ sheikhId: sheikh._id });

        console.log(`Lectures: ${lectureCount}`);
        console.log(`Series: ${seriesCount}`);
        console.log('');

        // Check for issues
        if (!sheikh.nameArabic) {
          console.log('⚠️  WARNING: This sheikh is missing nameArabic field!');
          console.log('   This is why the card appears empty on the sheikhs page.');
          console.log('');
        }
      }
    }

    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60) + '\n');

    const sheikhsWithoutName = sheikhs.filter(s => !s.nameArabic);
    if (sheikhsWithoutName.length > 0) {
      console.log(`❌ ${sheikhsWithoutName.length} sheikh(s) missing nameArabic field`);
      console.log('   Solution: Update sheikh documents to add nameArabic');
      console.log('');
    } else {
      console.log('✅ All sheikhs have nameArabic field');
      console.log('');
    }

    if (sheikhs.length === 0) {
      console.log('💡 Next step: Import sheikh data from Excel file');
      console.log('   Or create sheikh documents manually in database');
    } else {
      console.log('✅ Sheikh data looks good!');
      console.log('   The sheikhs page should display properly.');
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

checkSheikhsData();
