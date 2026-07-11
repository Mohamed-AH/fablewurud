require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { Lecture, Sheikh, Series } = require('../models');
const { uploadDir } = require('../config/storage');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

// Parse duration from MM:SS or HH:MM:SS format to seconds
function parseDuration(durationStr) {
  if (!durationStr || durationStr === '' || durationStr === null || durationStr === undefined) {
    return 1; // Default 1 second for missing durations
  }

  try {
    // Remove leading apostrophe (Excel text format marker) and trim
    let cleanStr = String(durationStr).trim();
    if (cleanStr.startsWith("'")) {
      cleanStr = cleanStr.substring(1);
    }

    const parts = cleanStr.split(':').map(p => {
      const num = parseInt(p, 10);
      return isNaN(num) ? 0 : num;
    });

    if (parts.length === 2) {
      // MM:SS format
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      // HH:MM:SS format
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    // If format is unexpected, return default
    return 1;
  } catch (error) {
    console.warn(`⚠️  Could not parse duration: ${durationStr}, using default`);
    return 1;
  }
}

// Parse date from DD.MM.YYYY format
function parseDate(dateStr) {
  if (!dateStr) return null;

  try {
    const parts = String(dateStr).split('.');
    if (parts.length === 3) {
      const [day, month, year] = parts.map(p => parseInt(p, 10));
      return new Date(year, month - 1, day);
    }
  } catch (error) {
    console.warn(`⚠️  Could not parse date: ${dateStr}`);
  }

  return null;
}

// Extract lecture number from Serial text
function extractLectureNumber(serialText) {
  if (!serialText || serialText === 'Not Available') return null;

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

  const text = String(serialText).trim();

  // Check for Arabic ordinal numbers - exact match or contains
  // Loop through in order (longer phrases checked first due to object key order)
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

// Map Excel category names to valid enum values
function mapCategory(excelCategory) {
  if (!excelCategory) return 'Other';

  const categoryMap = {
    'Tafseer': 'Tafsir',
    'Tafsir': 'Tafsir',
    'Hadeeth': 'Hadith',
    'Hadith': 'Hadith',
    'Fiqh': 'Fiqh',
    'Aqeedah': 'Aqeedah',
    'Seerah': 'Seerah',
    'Akhlaq': 'Akhlaq',
    'Khutba': 'Other', // Friday sermons
    'Khutbah': 'Other'
  };

  const normalized = String(excelCategory).trim();
  return categoryMap[normalized] || 'Other';
}

// Check if audio file physically exists
function fileExists(filename) {
  if (!filename) return false;
  const filePath = path.join(uploadDir, filename);
  return fs.existsSync(filePath);
}

async function importExcel() {
  try {
    console.log('📖 Reading Excel file...\n');

    const filePath = path.join(__dirname, '../updatedData.xlsx');
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    let data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Test mode - only import first 10 records
    const testMode = process.env.TEST_MODE === 'yes';
    if (testMode) {
      data = data.slice(0, 10);
      console.log('🧪 TEST MODE: Only importing first 10 records\n');
    }

    console.log(`📊 Found ${data.length} lectures in Excel file\n`);

    const stats = {
      sheikhsCreated: 0,
      seriesCreated: 0,
      lecturesCreated: 0,
      lecturesSkipped: 0,
      filenamesModified: 0,
      errors: []
    };

    // Track filenames we've seen to handle duplicates
    const seenFilenames = new Map(); // filename -> count

    for (const row of data) {
      try {
        // Validate required fields
        if (!row.Sheikh || !row.TelegramFileName) {
          console.log(`⏭️  Skipping row ${row['S.No']}: Missing sheikh or filename`);
          stats.lecturesSkipped++;
          continue;
        }

        // Find or create Sheikh
        const sheikhNameArabic = String(row.Sheikh).trim();
        let sheikh = await Sheikh.findOne({ nameArabic: sheikhNameArabic });

        if (!sheikh) {
          sheikh = await Sheikh.create({
            nameArabic: sheikhNameArabic,
            nameEnglish: sheikhNameArabic, // Can be updated later
            honorific: 'حفظه الله',
            bioArabic: `الشيخ ${sheikhNameArabic}`,
            bioEnglish: `Sheikh ${sheikhNameArabic}`
          });
          stats.sheikhsCreated++;
          console.log(`✅ Created sheikh: ${sheikhNameArabic}`);
        }

        // Find or create Series (if SeriesName exists and is not "Not Available")
        let series = null;
        if (row.SeriesName && row.SeriesName !== 'Not Available') {
          const seriesTitleArabic = String(row.SeriesName).trim();
          series = await Series.findOne({
            titleArabic: seriesTitleArabic,
            sheikhId: sheikh._id
          });

          if (!series) {
            series = await Series.create({
              titleArabic: seriesTitleArabic,
              titleEnglish: seriesTitleArabic, // Can be updated later
              sheikhId: sheikh._id,
              category: mapCategory(row.Category),
              descriptionArabic: `سلسلة ${seriesTitleArabic}`,
              descriptionEnglish: `Series: ${seriesTitleArabic}`,
              lectureCount: 0
            });
            stats.seriesCreated++;
            console.log(`✅ Created series: ${seriesTitleArabic}`);
          }
        }

        // Handle duplicate filenames by making them unique
        let audioFileName = String(row.TelegramFileName).trim();

        // Check if we've seen this filename before in this import
        if (seenFilenames.has(audioFileName)) {
          const count = seenFilenames.get(audioFileName);
          seenFilenames.set(audioFileName, count + 1);

          // Append counter before file extension
          const lastDotIndex = audioFileName.lastIndexOf('.');
          if (lastDotIndex > 0) {
            const nameWithoutExt = audioFileName.substring(0, lastDotIndex);
            const extension = audioFileName.substring(lastDotIndex);
            audioFileName = `${nameWithoutExt}_${count}${extension}`;
          } else {
            audioFileName = `${audioFileName}_${count}`;
          }

          stats.filenamesModified++;
          console.log(`🔄 Modified duplicate filename to: ${audioFileName}`);
        } else {
          seenFilenames.set(audioFileName, 1);
        }

        // Check if this modified filename already exists in database
        const existingLecture = await Lecture.findOne({
          audioFileName: audioFileName
        });

        if (existingLecture) {
          console.log(`⏭️  Skipping lecture (already in DB): ${audioFileName}`);
          stats.lecturesSkipped++;
          continue;
        }

        // Parse duration and date
        const duration = parseDuration(row.ClipLength);
        const recordingDate = parseDate(row.DateInGreg);
        const lectureNumber = extractLectureNumber(row.Serial);

        // Estimate file size (approximate: 1MB per minute for typical MP3)
        // This will be updated when actual audio files are uploaded
        const estimatedFileSize = duration > 0 ? Math.round(duration / 60 * 1024 * 1024) : 1024 * 1024;

        // *** CRITICAL FIX: Title should be SeriesName + Serial text (not number) ***
        const titleArabic = row.SeriesName && row.SeriesName !== 'Not Available'
          ? row.SeriesName
          : (row.Serial && row.Serial !== 'Not Available' ? row.Serial : 'محاضرة');

        // Build lecture title with serial text if available
        let fullTitleArabic = titleArabic;
        if (row.Serial && row.Serial !== 'Not Available' && row.Type === 'Series') {
          // Use the actual Serial text (e.g., "السابع والعشرون") not the number
          const serialText = String(row.Serial).trim();
          fullTitleArabic = `${titleArabic} - ${serialText}`;
        }

        // Check if audio file actually exists on disk
        const audioFileExists = fileExists(audioFileName);

        // Create Lecture
        // *** CRITICAL FIX: Don't set audioFileName unless file exists ***
        const lecture = await Lecture.create({
          audioFileName: audioFileExists ? audioFileName : null, // Only set if file exists
          titleArabic: fullTitleArabic,
          titleEnglish: fullTitleArabic, // Can be updated later
          sheikhId: sheikh._id,
          seriesId: series ? series._id : null,
          lectureNumber: lectureNumber,
          duration: duration,
          fileSize: estimatedFileSize, // Estimated, will be updated when audio uploaded
          category: mapCategory(row.Category),
          location: row['Location/Online'] || '',
          recordingDate: recordingDate,
          published: false, // Set to false until verified working
          featured: false,
          descriptionArabic: row.OriginalAuthor && row.OriginalAuthor !== 'Not Available'
            ? `من كتاب: ${row.OriginalAuthor}`
            : '',
          descriptionEnglish: row.OriginalAuthor && row.OriginalAuthor !== 'Not Available'
            ? `From book: ${row.OriginalAuthor}`
            : '',
          // Store metadata for matching files later
          metadata: {
            excelFilename: row.TelegramFileName,
            type: row.Type,
            serial: row.Serial
          }
        });

        // Update series lecture count
        if (series) {
          await Series.findByIdAndUpdate(series._id, {
            $inc: { lectureCount: 1 }
          });
        }

        stats.lecturesCreated++;

        if (stats.lecturesCreated % 10 === 0) {
          console.log(`📝 Imported ${stats.lecturesCreated} lectures...`);
        }

      } catch (error) {
        console.error(`❌ Error processing row ${row['S.No']}:`, error.message);
        stats.errors.push({
          row: row['S.No'],
          error: error.message
        });
      }
    }

    // Print final statistics
    console.log('\n' + '='.repeat(60));
    console.log('📊 Import Complete!');
    console.log('='.repeat(60));
    console.log(`✅ Sheikhs created: ${stats.sheikhsCreated}`);
    console.log(`✅ Series created: ${stats.seriesCreated}`);
    console.log(`✅ Lectures created: ${stats.lecturesCreated}`);
    console.log(`🔄 Duplicate filenames renamed: ${stats.filenamesModified}`);
    console.log(`⏭️  Lectures skipped: ${stats.lecturesSkipped}`);
    console.log(`❌ Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      stats.errors.forEach(err => {
        console.log(`  Row ${err.row}: ${err.error}`);
      });
    }

    console.log('\n💡 Next steps:');
    console.log('1. Upload audio files via admin panel (single or bulk upload)');
    console.log('2. Files will be matched by TelegramFileName');
    console.log('3. Once audio is uploaded and verified, set published=true');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run import
importExcel();
