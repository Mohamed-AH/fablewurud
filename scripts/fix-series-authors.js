const XLSX = require('xlsx');
const mongoose = require('mongoose');
const { Series } = require('../models');
require('dotenv').config();

// Mapping of series names to their original authors from Excel data
const seriesAuthors = {
  'تأسيس الأحكام شرح عمدة الأحكام': 'الشيخ أحمد بن يحيى النجمي',
  'الملخص شرح كتاب التوحيد': 'الشيخ  صالح الفوزان',
  'الملخص الفقهي': 'الشيخ  صالح الفوزان',
  'التفسير الميسر': 'مجموعة من العلماء',
  'صحيح البخاري': 'الإمام البخاري',
  'إرشاد الساري شرح السنة للبربهاري': 'الإمام البربهاري',
  'التحفة النجمية بشرح الأربعين النووية': 'الإمام النووي',
  'التعليقات البهية على الرسائل العقدية': '',
  'المورد العذب الزلال': '',
  'تنبيه الانام على ما في كتاب سبل السلام من الفوائد والأحكام': 'الصنعاني',
  'غنية السائل بما في لامية شيخ الإسلام من مسائل': 'شيخ الإسلام ابن تيمية',
  'مختصر السيرة النبوية': '',
  'الرسالة المفيدة المهمة الجليلة': ''
};

async function fixSeriesAuthors() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Read Excel file to extract series-author mapping
    console.log('📊 Reading Excel file...');
    const workbook = XLSX.readFile('./updatedData.xlsx');
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    // Build a map of series to their original authors
    const seriesMap = {};
    data.forEach(row => {
      if (row.SeriesName && row.OriginalAuthor) {
        seriesMap[row.SeriesName.trim()] = row.OriginalAuthor.trim();
      }
    });

    console.log(`Found ${Object.keys(seriesMap).length} unique series with authors:\n`);
    Object.entries(seriesMap).forEach(([series, author]) => {
      console.log(`  - ${series}: ${author}`);
    });

    // Update each series in the database
    console.log('\n📝 Updating series in database...\n');

    let updated = 0;
    let notFound = 0;

    for (const [seriesName, author] of Object.entries(seriesMap)) {
      const series = await Series.findOne({
        titleArabic: seriesName
      });

      if (series) {
        series.bookAuthor = author;
        await series.save();
        console.log(`✅ Updated: ${seriesName}`);
        console.log(`   Author: ${author}\n`);
        updated++;
      } else {
        console.log(`❌ Not found in DB: ${seriesName}\n`);
        notFound++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Successfully updated ${updated} series`);
    if (notFound > 0) {
      console.log(`⚠️  ${notFound} series not found in database`);
    }
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixSeriesAuthors();
