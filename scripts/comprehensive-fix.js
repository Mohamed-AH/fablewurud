const XLSX = require('xlsx');
const mongoose = require('mongoose');
const { Lecture, Series } = require('../models');
require('dotenv').config();

// Arabic numbers mapping - CRITICAL: Longer/compound phrases MUST come first!
const arabicNumbers = {
  // 21-50 (compound forms)
  'الحادي والعشرون': 21, 'الواحد والعشرون': 21,
  'الثاني والعشرون': 22, 'الثالث والعشرون': 23,
  'الرابع والعشرون': 24, 'الخامس والعشرون': 25, 'السادس والعشرون': 26,
  'السابع والعشرون': 27, 'الثامن والعشرون': 28, 'التاسع والعشرون': 29,
  'واحد و الثلاثون': 31, 'الواحد والثلاثون': 31,
  'الثاني والثلاثون': 32, 'الثالث والثلاثون': 33, 'الرابع والثلاثون': 34,
  'الخامس والثلاثون': 35, 'السادس والثلاثون': 36, 'السابع والثلاثون': 37,
  'الثامن والثلاثون': 38, 'التاسع والثلاثون': 39,
  'الحادي والأربعون': 41, 'الواحد والأربعون': 41,
  'الثاني والأربعون': 42, 'الثالث والأربعون': 43,
  'الرابع والأربعون': 44, 'الخامس والأربعون': 45, 'السادس والأربعون': 46,
  'السابع والأربعون': 47, 'الثامن والأربعون': 48, 'التاسع والأربعون': 49,
  // 11-20
  'الحادي عشر': 11, 'الثاني عشر': 12, 'الثالث عشر': 13, 'الرابع عشر': 14,
  'الخامس عشر': 15, 'السادس عشر': 16, 'السابع عشر': 17, 'الثامن عشر': 18,
  'التاسع عشر': 19,
  // Standalone decades (AFTER compounds!)
  'العشرون': 20, 'الثلاثون': 30, 'الأربعون': 40, 'الخمسون': 50,
  // 1-10 (LAST!)
  'الأول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4, 'الخامس': 5,
  'السادس': 6, 'السابع': 7, 'الثامن': 8, 'التاسع': 9, 'العاشر': 10
};

function extractLectureNumber(serialText) {
  if (!serialText) return null;
  const text = String(serialText).trim();

  for (const [word, num] of Object.entries(arabicNumbers)) {
    if (text.includes(word)) {
      return num;
    }
  }

  const match = text.match(/\d+/);
  if (match) {
    return parseInt(match[0], 10);
  }

  return null;
}

async function comprehensiveFix() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Read Excel file
    console.log('📊 Reading Excel file...\n');
    const workbook = XLSX.readFile('./updatedData.xlsx');
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const excelMap = new Map();
    data.forEach(row => {
      if (row.TelegramFileName) {
        excelMap.set(String(row.TelegramFileName).trim(), row);
      }
    });

    console.log(`Found ${excelMap.size} lectures in Excel\n`);

    const stats = {
      updated: 0,
      taaSeesFixed: 0,
      singleLectureSeriesMoved: 0,
      errors: []
    };

    // ========================================
    // PART 1: FIX تأسيس الأحكام SEQUENTIAL NUMBERING
    // ========================================
    console.log('='.repeat(60));
    console.log('PART 1: FIXING تأسيس الأحكام SEQUENTIAL NUMBERING');
    console.log('='.repeat(60) + '\n');

    const taaseesSeries = await Series.findOne({
      titleArabic: 'تأسيس الأحكام شرح عمدة الأحكام'
    });

    if (taaseesSeries) {
      const taaseesLectures = await Lecture.find({
        seriesId: taaseesSeries._id
      }).sort({ createdAt: 1 });

      console.log(`Found ${taaseesLectures.length} lectures in تأسيس الأحكام\n`);

      // Renumber sequentially based on creation date (which follows Excel order)
      for (let i = 0; i < taaseesLectures.length; i++) {
        const lecture = taaseesLectures[i];
        const newNumber = i + 1;

        if (lecture.lectureNumber !== newNumber) {
          await Lecture.findByIdAndUpdate(lecture._id, {
            lectureNumber: newNumber
          });

          console.log(`✅ Updated: ${lecture.titleArabic}`);
          console.log(`   Old number: ${lecture.lectureNumber} → New: ${newNumber}\n`);
          stats.taaSeesFixed++;
        }
      }
    }

    // ========================================
    // PART 2: FIX OTHER LECTURES WITH WRONG NUMBERS
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('PART 2: FIXING OTHER LECTURE NUMBERS');
    console.log('='.repeat(60) + '\n');

    const allLectures = await Lecture.find({}).populate('seriesId');

    for (const lecture of allLectures) {
      try {
        // Skip تأسيس الأحكام (already fixed)
        if (lecture.seriesId?.titleArabic === 'تأسيس الأحكام شرح عمدة الأحكام') {
          continue;
        }

        const excelFilename = lecture.metadata?.excelFilename;
        if (!excelFilename) continue;

        const excelRow = excelMap.get(excelFilename);
        if (!excelRow) continue;

        const correctLectureNumber = extractLectureNumber(excelRow.Serial);
        const serialText = excelRow.Serial && excelRow.Serial !== 'Not Available'
          ? String(excelRow.Serial).trim()
          : null;

        const seriesName = excelRow.SeriesName && excelRow.SeriesName !== 'Not Available'
          ? excelRow.SeriesName
          : null;

        let correctTitle = seriesName || 'محاضرة';
        if (serialText && excelRow.Type === 'Series') {
          correctTitle = `${correctTitle} - ${serialText}`;
        }

        let needsUpdate = false;
        const updates = {};

        if (lecture.lectureNumber !== correctLectureNumber) {
          updates.lectureNumber = correctLectureNumber;
          needsUpdate = true;
        }

        if (lecture.titleArabic !== correctTitle) {
          updates.titleArabic = correctTitle;
          updates.titleEnglish = correctTitle;
          needsUpdate = true;
        }

        if (needsUpdate) {
          await Lecture.findByIdAndUpdate(lecture._id, updates);
          console.log(`✅ Updated: ${excelFilename}`);
          console.log(`   Old: "${lecture.titleArabic}" (Num: ${lecture.lectureNumber})`);
          console.log(`   New: "${correctTitle}" (Num: ${correctLectureNumber})\n`);
          stats.updated++;
        }

      } catch (error) {
        console.error(`❌ Error: ${lecture._id}:`, error.message);
        stats.errors.push({ lectureId: lecture._id, error: error.message });
      }
    }

    // ========================================
    // PART 3: MOVE SINGLE-LECTURE SERIES TO محاضرات متفرقة
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('PART 3: MOVING SINGLE-LECTURE SERIES');
    console.log('='.repeat(60) + '\n');

    const singleLectureSeriesNames = [
      'الرسالة المفيدة المهمة الجليلة',
      'غنية السائل بما في لامية شيخ الإسلام من مسائل',
      'فضل_العلم_ومنزلة_أهله',
      'كلمة_لابن_عقيل_عن_النجمي_رحمه_الله',
      'من أساليب الإخوان المسلمين في استغلال المرأة'
    ];

    for (const seriesName of singleLectureSeriesNames) {
      const series = await Series.findOne({ titleArabic: seriesName }).populate('sheikhId');

      if (series) {
        const sheikhId = series.sheikhId._id;
        const sheikhName = series.sheikhId.nameArabic;

        // Find or create محاضرات متفرقة
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

        // Move lectures
        const lectures = await Lecture.find({ seriesId: series._id });

        for (const lecture of lectures) {
          await Lecture.findByIdAndUpdate(lecture._id, {
            seriesId: miscSeries._id,
            titleArabic: seriesName, // Keep original title
            titleEnglish: seriesName,
            lectureNumber: null // No numbering for misc lectures
          });

          console.log(`✅ Moved: ${seriesName} → محاضرات متفرقة`);
          stats.singleLectureSeriesMoved++;
        }

        // Update counts
        await Series.findByIdAndUpdate(miscSeries._id, {
          $inc: { lectureCount: lectures.length }
        });

        // Delete old series
        await Series.findByIdAndDelete(series._id);
        console.log(`✅ Deleted series: ${seriesName}\n`);
      }
    }

    // ========================================
    // FINAL SUMMARY
    // ========================================
    console.log('='.repeat(60));
    console.log('📊 COMPREHENSIVE FIX COMPLETE!');
    console.log('='.repeat(60));
    console.log(`✅ تأسيس الأحكام lectures renumbered: ${stats.taaSeesFixed}`);
    console.log(`✅ Other lectures updated: ${stats.updated}`);
    console.log(`✅ Single-lecture series moved: ${stats.singleLectureSeriesMoved}`);
    console.log(`❌ Errors: ${stats.errors.length}`);
    console.log('='.repeat(60));

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

comprehensiveFix();
