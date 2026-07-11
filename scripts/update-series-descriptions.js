/**
 * Update Series Descriptions
 *
 * Updates descriptionArabic and bookAuthor fields for all series
 * from the series-descriptions-draft.json file.
 *
 * Usage:
 *   node scripts/update-series-descriptions.js [--dry-run]
 *
 * Options:
 *   --dry-run    Preview changes without updating database
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Load Series model
const Series = require('../models/Series');

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('UPDATE SERIES DESCRIPTIONS');
  console.log('='.repeat(60));

  if (isDryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made\n');
  }

  // Load descriptions from JSON
  const jsonPath = path.join(__dirname, 'series-descriptions-draft.json');

  if (!fs.existsSync(jsonPath)) {
    console.error('❌ File not found:', jsonPath);
    console.error('   Please create series-descriptions-draft.json first');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const descriptions = data.series_descriptions;

  console.log(`📄 Loaded ${descriptions.length} series descriptions\n`);

  // Connect to MongoDB
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const item of descriptions) {
    try {
      const series = await Series.findById(item.id);

      if (!series) {
        console.log(`❌ NOT FOUND: ${item.id} - ${item.titleArabic}`);
        notFound++;
        continue;
      }

      // Check if update is needed
      const needsUpdate =
        series.descriptionArabic !== item.descriptionArabic ||
        series.bookAuthor !== item.bookAuthor;

      if (!needsUpdate) {
        console.log(`⏭️  SKIPPED (no change): ${series.titleArabic.substring(0, 40)}...`);
        skipped++;
        continue;
      }

      if (isDryRun) {
        console.log(`📝 WOULD UPDATE: ${series.titleArabic.substring(0, 40)}...`);
        console.log(`   Description: ${item.descriptionArabic.substring(0, 60)}...`);
        if (item.bookAuthor) {
          console.log(`   Book Author: ${item.bookAuthor}`);
        }
        updated++;
      } else {
        await Series.findByIdAndUpdate(item.id, {
          descriptionArabic: item.descriptionArabic,
          bookAuthor: item.bookAuthor || undefined
        });
        console.log(`✅ UPDATED: ${series.titleArabic.substring(0, 40)}...`);
        updated++;
      }
    } catch (err) {
      console.error(`❌ ERROR updating ${item.id}:`, err.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total in file:  ${descriptions.length}`);
  console.log(`Updated:        ${updated}`);
  console.log(`Skipped:        ${skipped}`);
  console.log(`Not found:      ${notFound}`);

  if (isDryRun) {
    console.log('\n💡 Run without --dry-run to apply changes');
  } else {
    console.log('\n✅ All descriptions updated successfully!');
  }

  await mongoose.disconnect();
  console.log('\n👋 Disconnected from MongoDB');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
