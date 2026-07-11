const XLSX = require('xlsx');
const mongoose = require('mongoose');
const { Lecture } = require('../models');
require('dotenv').config();

// Arabic numbers mapping - CRITICAL: Longer/compound phrases MUST come first!
const arabicNumbers = {
  // 21-50 (compound forms with والعشرون, والثلاثون, والأربعون)
  'الحادي والعشرون': 21, 'الواحد والعشرون': 21, // Two variants for 21
  'الثاني والعشرون': 22, 'الثالث والعشرون': 23,
  'الرابع والعشرون': 24, 'الخامس والعشرون': 25, 'السادس والعشرون': 26,
  'السابع والعشرون': 27, 'الثامن والعشرون': 28, 'التاسع والعشرون': 29,
  'واحد و الثلاثون': 31, 'الواحد والثلاثون': 31, // Two variants for 31
  'الثاني والثلاثون': 32, 'الثالث والثلاثون': 33, 'الرابع والثلاثون': 34,
  'الخامس والثلاثون': 35, 'السادس والثلاثون': 36, 'السابع والثلاثون': 37,
  'الثامن والثلاثون': 38, 'التاسع والثلاثون': 39,
  'الحادي والأربعون': 41, 'الواحد والأربعون': 41,
  'الثاني والأربعون': 42, 'الثالث والأربعون': 43,
  'الرابع والأربعون': 44, 'الخامس والأربعون': 45, 'السادس والأربعون': 46,
  'السابع والأربعون': 47, 'الثامن والأربعون': 48, 'التاسع والأربعون': 49,
  // 11-20 (compound with عشر)
  'الحادي عشر': 11, 'الثاني عشر': 12, 'الثالث عشر': 13, 'الرابع عشر': 14,
  'الخامس عشر': 15, 'السادس عشر': 16, 'السابع عشر': 17, 'الثامن عشر': 18,
  'التاسع عشر': 19,
  // Standalone decades (must come AFTER compounds to avoid false matches)
  'العشرون': 20, 'الثلاثون': 30, 'الأربعون': 40, 'الخمسون': 50,
  // 1-10 (must come LAST to avoid matching parts of compounds)
  'الأول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4, 'الخامس': 5,
  'السادس': 6, 'السابع': 7, 'الثامن': 8, 'التاسع': 9, 'العاشر': 10
};

function extractLectureNumber(serialText) {
  if (!serialText) return null;

  const text = String(serialText).trim();

  // Check for Arabic ordinal numbers
  for (const [word, num] of Object.entries(arabicNumbers)) {
    if (text.includes(word)) {
      return num;
    }
  }

  // Check for English numerals
  const match = text.match(/\d+/);
  if (match) {
    return parseInt(match[0], 10);
  }

  return null;
}

async function fixLectureNumbers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Read Excel file to get correct data
    console.log('📊 Reading Excel file...\n');
    const workbook = XLSX.readFile('./updatedData.xlsx');
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Build a map: audioFileName -> row data
    const excelMap = new Map();
    data.forEach(row => {
      if (row.TelegramFileName) {
        const filename = String(row.TelegramFileName).trim();
        excelMap.set(filename, row);
      }
    });

    console.log(`Found ${excelMap.size} lectures in Excel file\n`);

    // Get all lectures from database
    const lectures = await Lecture.find({}).populate('seriesId');
    console.log(`Found ${lectures.length} lectures in database\n`);

    const stats = {
      updated: 0,
      notFound: 0,
      noChanges: 0,
      errors: []
    };

    console.log('🔄 Processing lectures...\n');

    for (const lecture of lectures) {
      try {
        // Try to match by the original filename stored in metadata
        const excelFilename = lecture.metadata?.excelFilename;

        if (!excelFilename) {
          console.log(`⚠️  Lecture ${lecture._id} has no metadata.excelFilename`);
          stats.notFound++;
          continue;
        }

        const excelRow = excelMap.get(excelFilename);

        if (!excelRow) {
          console.log(`⚠️  No Excel data for: ${excelFilename}`);
          stats.notFound++;
          continue;
        }

        // Extract correct lecture number from Serial text
        const correctLectureNumber = extractLectureNumber(excelRow.Serial);
        const serialText = excelRow.Serial && excelRow.Serial !== 'Not Available'
          ? String(excelRow.Serial).trim()
          : null;

        // Build correct title
        const seriesName = excelRow.SeriesName && excelRow.SeriesName !== 'Not Available'
          ? excelRow.SeriesName
          : null;

        let correctTitle = seriesName || 'محاضرة';
        if (serialText && excelRow.Type === 'Series') {
          correctTitle = `${correctTitle} - ${serialText}`;
        }

        // Check if update needed
        let needsUpdate = false;
        const updates = {};

        if (lecture.lectureNumber !== correctLectureNumber) {
          updates.lectureNumber = correctLectureNumber;
          needsUpdate = true;
        }

        if (lecture.titleArabic !== correctTitle) {
          updates.titleArabic = correctTitle;
          updates.titleEnglish = correctTitle; // Update English too
          needsUpdate = true;
        }

        if (needsUpdate) {
          await Lecture.findByIdAndUpdate(lecture._id, updates);

          console.log(`✅ Updated: ${excelFilename}`);
          console.log(`   Old: "${lecture.titleArabic}" (Num: ${lecture.lectureNumber})`);
          console.log(`   New: "${correctTitle}" (Num: ${correctLectureNumber})\n`);

          stats.updated++;
        } else {
          stats.noChanges++;
        }

      } catch (error) {
        console.error(`❌ Error processing lecture ${lecture._id}:`, error.message);
        stats.errors.push({
          lectureId: lecture._id,
          error: error.message
        });
      }
    }

    // Print final statistics
    console.log('\n' + '='.repeat(60));
    console.log('📊 Fix Complete!');
    console.log('='.repeat(60));
    console.log(`✅ Lectures updated: ${stats.updated}`);
    console.log(`⏭️  No changes needed: ${stats.noChanges}`);
    console.log(`⚠️  Not found in Excel: ${stats.notFound}`);
    console.log(`❌ Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      stats.errors.forEach(err => {
        console.log(`  Lecture ${err.lectureId}: ${err.error}`);
      });
    }

    console.log('='.repeat(60));

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixLectureNumbers();
