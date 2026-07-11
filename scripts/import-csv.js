/**
 * CSV Import Script for Duroos Platform
 * Imports lecture metadata from lectures_with_series2.csv
 *
 * CSV Columns:
 * - post_date: Date of lecture
 * - sheikh: Sheikh name (Arabic)
 * - series_name: Series/course name (Arabic)
 * - khutbah_title: Individual lecture title (Arabic)
 * - audio_length: Duration (e.g., "45:32")
 * - location_or_online: Physical location or "Online"
 * - series_part: Lecture number in series
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const moment = require('moment-hijri');
const connectDB = require('../config/database');
const { Lecture, Sheikh, Series } = require('../models');

// Stats tracking
const stats = {
  totalRows: 0,
  sheikhsCreated: 0,
  seriesCreated: 0,
  lecturesCreated: 0,
  errors: []
};

/**
 * Parse duration string (e.g., "45:32" or "1:23:45") to seconds
 */
function parseDuration(durationStr) {
  if (!durationStr || durationStr.trim() === '') return 0;

  const parts = durationStr.trim().split(':').map(p => parseInt(p, 10));

  if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts;
    return (minutes * 60) + seconds;
  } else if (parts.length === 3) {
    // HH:MM:SS format
    const [hours, minutes, seconds] = parts;
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  return 0;
}

/**
 * Format duration as human-readable string
 */
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Convert date string to both Gregorian and Hijri dates
 * Returns { gregorian: Date, hijri: String }
 */
function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return { gregorian: null, hijri: null };

  try {
    let gregorianDate = null;

    // Try parsing as DD/MM/YYYY first
    const parsedDate = moment(dateStr, 'DD/MM/YYYY', true);
    if (parsedDate.isValid()) {
      gregorianDate = parsedDate.toDate();
    } else {
      // Try standard date parsing
      gregorianDate = new Date(dateStr);
      if (isNaN(gregorianDate.getTime())) {
        gregorianDate = null;
      }
    }

    if (!gregorianDate) {
      return { gregorian: null, hijri: null };
    }

    // Convert Gregorian to Hijri using moment-hijri
    const hijriMoment = moment(gregorianDate);
    const hijriDate = hijriMoment.format('iYYYY/iMM/iDD'); // Format: 1445/06/15

    return {
      gregorian: gregorianDate,
      hijri: hijriDate
    };
  } catch (error) {
    console.warn(`Could not parse date: ${dateStr}`);
    return { gregorian: null, hijri: null };
  }
}

/**
 * Determine category from series name (basic heuristic)
 */
function determineCategory(seriesName, lectureTitle) {
  const text = (seriesName + ' ' + lectureTitle).toLowerCase();

  if (text.includes('عقيدة') || text.includes('توحيد')) return 'Aqeedah';
  if (text.includes('فقه')) return 'Fiqh';
  if (text.includes('تفسير') || text.includes('قرآن')) return 'Tafsir';
  if (text.includes('حديث')) return 'Hadith';
  if (text.includes('سيرة')) return 'Seerah';

  return 'General';
}

/**
 * Find or create sheikh by name
 */
async function findOrCreateSheikh(sheikhName) {
  if (!sheikhName || sheikhName.trim() === '') {
    throw new Error('Sheikh name is required');
  }

  const cleanName = sheikhName.trim();

  // Try to find existing sheikh
  let sheikh = await Sheikh.findOne({ nameArabic: cleanName });

  if (!sheikh) {
    // Create new sheikh
    sheikh = await Sheikh.create({
      nameArabic: cleanName,
      nameEnglish: '', // Will be added manually later
      honorific: 'حفظه الله', // Default honorific
      bioArabic: '',
      bioEnglish: '',
      lectureCount: 0
    });
    stats.sheikhsCreated++;
    console.log(`  ✓ Created sheikh: ${cleanName}`);
  }

  return sheikh;
}

/**
 * Find or create series by name and sheikh
 */
async function findOrCreateSeries(seriesName, sheikhId, category) {
  if (!seriesName || seriesName.trim() === '') {
    return null; // Some lectures may not have a series
  }

  const cleanName = seriesName.trim();

  // Try to find existing series
  let series = await Series.findOne({
    titleArabic: cleanName,
    sheikhId: sheikhId
  });

  if (!series) {
    // Create new series
    series = await Series.create({
      titleArabic: cleanName,
      titleEnglish: '', // Will be added manually later
      descriptionArabic: '',
      descriptionEnglish: '',
      sheikhId: sheikhId,
      category: category,
      lectureCount: 0
    });
    stats.seriesCreated++;
    console.log(`  ✓ Created series: ${cleanName}`);
  }

  return series;
}

/**
 * Process a single CSV row
 */
async function processRow(row, rowNumber) {
  try {
    // Extract data from CSV row
    const sheikhName = row.sheikh || row.Sheikh;
    const seriesName = row.series_name || row['Series Name'];
    const lectureTitle = row.khutbah_title || row['Khutbah Title'];
    const durationStr = row.audio_length || row['Audio Length'];
    const location = row.location_or_online || row['Location or Online'] || 'غير محدد';
    const seriesPart = row.series_part || row['Series Part'];
    const postDate = row.post_date || row['Post Date'];

    // Validate required fields
    if (!sheikhName) {
      stats.errors.push(`Row ${rowNumber}: Missing sheikh name`);
      return;
    }
    if (!lectureTitle) {
      stats.errors.push(`Row ${rowNumber}: Missing lecture title`);
      return;
    }

    // Parse data
    const duration = parseDuration(durationStr);
    const parsedDate = parseDate(postDate);
    const lectureNumber = seriesPart ? parseInt(seriesPart, 10) : null;

    // Determine category
    const category = determineCategory(seriesName || '', lectureTitle);

    // Find or create sheikh
    const sheikh = await findOrCreateSheikh(sheikhName);

    // Find or create series (if specified)
    let series = null;
    if (seriesName && seriesName.trim() !== '') {
      series = await findOrCreateSeries(seriesName, sheikh._id, category);
    }

    // Check if lecture already exists (avoid duplicates)
    const existingLecture = await Lecture.findOne({
      titleArabic: lectureTitle.trim(),
      sheikhId: sheikh._id
    });

    if (existingLecture) {
      console.log(`  ⊘ Skipped duplicate: ${lectureTitle.substring(0, 50)}...`);
      return;
    }

    // Create lecture
    const lecture = await Lecture.create({
      audioFileName: '', // Will be set when admin uploads audio file
      titleArabic: lectureTitle.trim(),
      titleEnglish: '', // Will be added manually later
      descriptionArabic: '',
      descriptionEnglish: '',
      sheikhId: sheikh._id,
      seriesId: series ? series._id : null,
      lectureNumber: lectureNumber,
      duration: duration,
      fileSize: 0, // Will be set when audio file is uploaded
      location: location.trim(),
      category: category,
      dateRecorded: parsedDate.gregorian,
      dateRecordedHijri: parsedDate.hijri,
      published: false, // Don't publish until audio file is uploaded
      featured: false,
      playCount: 0,
      downloadCount: 0
    });

    // Update counts
    await Sheikh.findByIdAndUpdate(sheikh._id, {
      $inc: { lectureCount: 1 }
    });

    if (series) {
      await Series.findByIdAndUpdate(series._id, {
        $inc: { lectureCount: 1 }
      });
    }

    stats.lecturesCreated++;
    console.log(`  ✓ Created lecture: ${lectureTitle.substring(0, 50)}...`);

  } catch (error) {
    stats.errors.push(`Row ${rowNumber}: ${error.message}`);
    console.error(`  ✗ Error on row ${rowNumber}:`, error.message);
  }
}

/**
 * Main import function
 */
async function importCSV() {
  const csvPath = path.join(__dirname, '..', 'lectures_with_series2.csv');

  // Check if CSV file exists
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    console.log('\n📝 Please place the CSV file at the project root with the name:');
    console.log('   lectures_with_series2.csv\n');
    process.exit(1);
  }

  console.log('🚀 Starting CSV import...\n');
  console.log(`📂 Reading: ${csvPath}\n`);

  try {
    // Connect to database
    await connectDB();
    console.log('✓ Connected to database\n');

    // Read and process CSV
    const rows = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`📊 Found ${rows.length} rows in CSV\n`);
    console.log('⚙️  Processing rows...\n');

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      stats.totalRows++;
      await processRow(rows[i], i + 1);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total rows processed:   ${stats.totalRows}`);
    console.log(`Sheikhs created:        ${stats.sheikhsCreated}`);
    console.log(`Series created:         ${stats.seriesCreated}`);
    console.log(`Lectures created:       ${stats.lecturesCreated}`);
    console.log(`Errors:                 ${stats.errors.length}`);
    console.log('='.repeat(60));

    if (stats.errors.length > 0) {
      console.log('\n⚠️  ERRORS:\n');
      stats.errors.forEach(err => console.log(`  - ${err}`));
    }

    console.log('\n✅ Import completed!\n');
    console.log('📝 Next steps:');
    console.log('   1. Review created sheikhs and add English names/bios');
    console.log('   2. Review created series and add English titles/descriptions');
    console.log('   3. Upload audio files via admin panel');
    console.log('   4. Link audio files to lectures');
    console.log('   5. Publish lectures\n');

  } catch (error) {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  } finally {
    // Close database connection
    process.exit(0);
  }
}

// Run import
importCSV();
