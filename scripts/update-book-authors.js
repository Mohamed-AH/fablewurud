/**
 * Update bookAuthor field in Series from Excel file
 *
 * Usage: node scripts/update-book-authors.js [--dry-run]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');

async function updateBookAuthors() {
  const isDryRun = process.argv.includes('--dry-run');

  if (isDryRun) {
    console.log('=== DRY RUN MODE - No changes will be made ===\n');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const Series = require('../models/Series');

  // Read Excel file
  const excelPath = path.join(__dirname, '..', 'updatedData5Feb2026.xlsx');
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);

  console.log('Total rows in Excel:', data.length);

  // Group by series name to get unique series with their authors
  const seriesAuthors = new Map();

  for (const row of data) {
    const seriesName = row.SeriesName?.trim();
    const author = row.OriginalAuthor?.trim();

    if (seriesName && author && author !== 'Not Available') {
      // Store the author for this series (use first occurrence)
      if (!seriesAuthors.has(seriesName)) {
        seriesAuthors.set(seriesName, author);
      }
    }
  }

  console.log('Unique series with authors:', seriesAuthors.size);
  console.log('\n--- Processing Series ---\n');

  let updated = 0;
  let notFound = 0;
  let alreadySet = 0;

  for (const [seriesName, author] of seriesAuthors) {
    // Try to find series with exact match or with suffixes
    const searchPatterns = [
      seriesName,
      seriesName + ' - عن بعد',
      seriesName + ' - أرشيف رمضان',
      seriesName + ' - أرشيف'
    ];

    let series = null;
    for (const pattern of searchPatterns) {
      series = await Series.findOne({ titleArabic: pattern });
      if (series) break;
    }

    // Also try partial match if exact match fails
    if (!series) {
      series = await Series.findOne({
        titleArabic: { $regex: seriesName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
      });
    }

    if (!series) {
      console.log('❌ Not found:', seriesName);
      notFound++;
      continue;
    }

    if (series.bookAuthor === author) {
      console.log('✓ Already set:', series.titleArabic, '→', author);
      alreadySet++;
      continue;
    }

    console.log('📝 Updating:', series.titleArabic);
    console.log('   Old author:', series.bookAuthor || '(empty)');
    console.log('   New author:', author);

    if (!isDryRun) {
      await Series.updateOne(
        { _id: series._id },
        { $set: { bookAuthor: author } }
      );
    }
    updated++;
  }

  console.log('\n--- Summary ---');
  console.log('Updated:', updated);
  console.log('Already set:', alreadySet);
  console.log('Not found:', notFound);

  if (isDryRun) {
    console.log('\n=== DRY RUN - Run without --dry-run to apply changes ===');
  }

  await mongoose.disconnect();
}

updateBookAuthors().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
