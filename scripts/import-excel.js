/**
 * Excel Import Script
 *
 * MEMORY NOTE: This script uses XLSX.readFile() which loads the entire file into memory.
 * For large files (>20MB), consider using the streaming alternative:
 *
 *   const { streamExcel } = require('../utils/excelStreamer');
 *   await streamExcel(filePath, async (row) => {
 *     // Process row-by-row, ~5MB RAM instead of 100MB+
 *   });
 *
 * See utils/excelStreamer.js for the streaming implementation.
 */
require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const mongoose = require('mongoose');
const { Lecture, Sheikh, Series } = require('../models');

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
  if (!serialText) return null;

  // Arabic numbers mapping
  const arabicNumbers = {
    'الأول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4, 'الخامس': 5,
    'السادس': 6, 'السابع': 7, 'الثامن': 8, 'التاسع': 9, 'العاشر': 10,
    'الحادي عشر': 11, 'الثاني عشر': 12, 'الثالث عشر': 13, 'الرابع عشر': 14,
    'الخامس عشر': 15, 'السادس عشر': 16, 'السابع عشر': 17, 'الثامن عشر': 18,
    'التاسع عشر': 19, 'العشرون': 20, 'الحادي والعشرون': 21, 'الثاني والعشرون': 22,
    'الثالث والعشرون': 23, 'الرابع والعشرون': 24, 'الخامس والعشرون': 25,
    'السادس والعشرون': 26, 'السابع والعشرون': 27, 'الثامن والعشرون': 28,
    'التاسع والعشرون': 29, 'الثلاثون': 30
  };

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

// Map Excel category names to valid enum values
function mapCategory(excelCategory) {
  if (!excelCategory) return 'Other';

  // Map alternate spellings to canonical enum values
  const categoryMap = {
    'Tafseer': 'Tafsir',
    'Hadeeth': 'Hadith',
    'Khutba': 'Khutbah'
  };

  const normalized = String(excelCategory).trim();
  // Return mapped value, or original if it's a valid category, or 'Other'
  const validCategories = ['Aqeedah', 'Fiqh', 'Tafsir', 'Hadith', 'Seerah', 'Akhlaq', 'Khutbah', 'Other'];
  return categoryMap[normalized] || (validCategories.includes(normalized) ? normalized : 'Other');
}

async function importExcel() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const seriesIndex = args.findIndex(arg => arg === '--series');
    const seriesArg = seriesIndex !== -1 ? args[seriesIndex + 1] : null;
    const inputFile = args.find(arg => !arg.startsWith('--') && arg !== seriesArg) || 'updatedData.xlsx';
    const filePath = path.isAbsolute(inputFile) ? inputFile : path.join(__dirname, '..', inputFile);

    console.log('📖 Reading Excel file...');
    console.log(`   File: ${filePath}`);
    if (dryRun) {
      console.log('   🔍 DRY RUN MODE - No changes will be made\n');
    } else {
      console.log('');
    }

    if (!require('fs').existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      console.log('\nUsage: node scripts/import-excel.js [excel-file] [options]');
      console.log('\nOptions:');
      console.log('  --dry-run          Preview what would be imported without making changes');
      console.log('  --series <id>      Assign all lectures to this series (MongoDB ObjectId)');
      console.log('\nExamples:');
      console.log('  node scripts/import-excel.js khutba_archive.xlsx --dry-run');
      console.log('  node scripts/import-excel.js khutba_archive.xlsx --series 697604301c69c76d98f8e65d');
      process.exit(1);
    }

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    console.log(`📊 Found ${data.length} records in Excel file (sheet: ${sheetName})\n`);

    // Connect to MongoDB (needed for both dry run and actual import to check existing data)
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected\n');

    // Look up target series if specified
    let targetSeries = null;
    if (seriesArg) {
      targetSeries = await Series.findById(seriesArg);
      if (!targetSeries) {
        console.error(`❌ Series not found with ID: ${seriesArg}`);
        process.exit(1);
      }
      console.log(`📚 Target series: ${targetSeries.titleArabic} (${targetSeries._id})\n`);
    }

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
          if (dryRun) {
            // Track unique sheikhs that would be created
            if (!stats._seenSheikhs) stats._seenSheikhs = new Set();
            if (!stats._seenSheikhs.has(sheikhNameArabic)) {
              stats._seenSheikhs.add(sheikhNameArabic);
              stats.sheikhsCreated++;
              console.log(`🔍 Would create sheikh: ${sheikhNameArabic}`);
            }
          } else {
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
        }

        // Determine series: use target series if specified, otherwise find/create from Excel data
        let series = targetSeries;
        if (!targetSeries && row.Type === 'Series' && row.SeriesName && sheikh) {
          const seriesTitleArabic = String(row.SeriesName).trim();
          series = await Series.findOne({
            titleArabic: seriesTitleArabic,
            sheikhId: sheikh._id
          });

          if (!series) {
            if (dryRun) {
              // Track unique series that would be created
              if (!stats._seenSeries) stats._seenSeries = new Set();
              const seriesKey = `${sheikhNameArabic}:${seriesTitleArabic}`;
              if (!stats._seenSeries.has(seriesKey)) {
                stats._seenSeries.add(seriesKey);
                stats.seriesCreated++;
                console.log(`🔍 Would create series: ${seriesTitleArabic}`);
              }
            } else {
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
        if (!dryRun) {
          const existingLecture = await Lecture.findOne({
            audioFileName: audioFileName
          });

          if (existingLecture) {
            console.log(`⏭️  Skipping lecture (already in DB): ${audioFileName}`);
            stats.lecturesSkipped++;
            continue;
          }
        }

        // Parse duration and date
        const duration = parseDuration(row.ClipLength);
        const recordingDate = parseDate(row.DateInGreg);
        const lectureNumber = extractLectureNumber(row.Serial);

        // Estimate file size (approximate: 1MB per minute for typical MP3)
        // This will be updated when actual audio files are uploaded
        const estimatedFileSize = duration > 0 ? Math.round(duration / 60 * 1024 * 1024) : 1024 * 1024;

        // Create title
        const titleArabic = row.Serial || row.SeriesName || 'محاضرة';

        if (dryRun) {
          // Dry run - just count
          stats.lecturesCreated++;
          if (stats.lecturesCreated % 50 === 0) {
            console.log(`🔍 Would import ${stats.lecturesCreated} lectures...`);
          }
        } else {
          // Create Lecture
          const lecture = await Lecture.create({
            audioFileName: audioFileName,
            titleArabic: titleArabic,
            titleEnglish: titleArabic, // Can be updated later
            sheikhId: sheikh._id,
            seriesId: series ? series._id : null,
            lectureNumber: lectureNumber,
            duration: duration,
            fileSize: estimatedFileSize, // Estimated, will be updated when audio uploaded
            category: mapCategory(row.Category),
            location: row['Location/Online'] || undefined, // Let model use default
            dateRecorded: recordingDate,
            published: false, // Set to false until audio files are uploaded
            featured: false,
            descriptionArabic: row.OriginalAuthor ? `من كتاب: ${row.OriginalAuthor}` : '',
            descriptionEnglish: row.OriginalAuthor ? `From book: ${row.OriginalAuthor}` : ''
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
    console.log(dryRun ? '📊 Dry Run Summary' : '📊 Import Complete!');
    console.log('='.repeat(60));
    const prefix = dryRun ? '🔍 Would create' : '✅ Created';
    console.log(`${prefix} sheikhs: ${stats.sheikhsCreated}`);
    console.log(`${prefix} series: ${stats.seriesCreated}`);
    console.log(`${prefix} lectures: ${stats.lecturesCreated}`);
    console.log(`🔄 Duplicate filenames: ${stats.filenamesModified}`);
    if (!dryRun) {
      console.log(`⏭️  Lectures skipped: ${stats.lecturesSkipped}`);
    }
    console.log(`❌ Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      stats.errors.forEach(err => {
        console.log(`  Row ${err.row}: ${err.error}`);
      });
    }

    if (dryRun) {
      console.log('\n💡 To perform the actual import, run without --dry-run');
    } else {
      console.log('\n💡 Next steps:');
      console.log('1. Review imported data in MongoDB');
      console.log('2. Upload actual audio files using: node scripts/upload-to-oci.js <dir>');
      console.log('3. Update lectures to published: true once audio files are available');
    }

    // Close database connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('\n👋 Database connection closed');
    }

  } catch (error) {
    console.error('❌ Import failed:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  }
  process.exit(0);
}

// Run the import
importExcel();
