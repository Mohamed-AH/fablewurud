#!/usr/bin/env node
/**
 * Sync Lecture Descriptions from Series (Arabic)
 *
 * Updates the descriptionArabic field in lectures from their respective series.
 * Only updates lectures that belong to a series and have a different or empty description.
 *
 * Usage:
 *   node scripts/sync-lecture-descriptions-from-series.js --dry-run    # Preview changes
 *   node scripts/sync-lecture-descriptions-from-series.js              # Apply changes
 *   node scripts/sync-lecture-descriptions-from-series.js --force      # Update all, even if same
 *   node scripts/sync-lecture-descriptions-from-series.js --env .env.production
 */

const args = process.argv.slice(2);

// Parse command-line arguments
const envIndex = args.indexOf('--env');
const envPath = envIndex !== -1 ? args[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

// Validate environment
if (!process.env.MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is not set');
  console.error('   Set it in your .env file or use --env <path>');
  process.exit(1);
}

const mongoose = require('mongoose');
const Lecture = require('../models/Lecture');
const Series = require('../models/Series');

// Parse flags
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

async function main() {
  console.log('🔧 Sync Lecture Descriptions from Series (Arabic)');
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('📋 DRY RUN MODE - No changes will be made\n');
  }

  if (FORCE) {
    console.log('⚠️  FORCE MODE - Will update all lectures, even if descriptions match\n');
  }

  // Connect to MongoDB
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');
  } catch (err) {
    console.error('✗ Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }

  let updated = 0;
  let skipped = 0;
  let noSeries = 0;
  let noSeriesDescription = 0;
  let errors = 0;

  try {
    // Fetch all lectures that belong to a series
    const lectures = await Lecture.find({ seriesId: { $exists: true, $ne: null } })
      .populate('seriesId', 'titleArabic descriptionArabic')
      .sort({ titleArabic: 1 })
      .lean();

    console.log(`📊 Found ${lectures.length} lectures with a series\n`);

    for (const lecture of lectures) {
      const series = lecture.seriesId;

      // Check if series was populated correctly
      if (!series || !series._id) {
        console.log(`⚠️  Lecture "${lecture.titleArabic}" - Series not found (orphaned reference)`);
        noSeries++;
        continue;
      }

      // Check if series has a description
      if (!series.descriptionArabic || series.descriptionArabic.trim() === '') {
        // Silent skip - series has no description to copy
        noSeriesDescription++;
        continue;
      }

      const currentDesc = lecture.descriptionArabic || '';
      const newDesc = series.descriptionArabic;

      // Check if update is needed
      if (!FORCE && currentDesc.trim() === newDesc.trim()) {
        skipped++;
        continue;
      }

      // Show what would change
      const truncate = (str, len = 50) => {
        if (!str) return '(empty)';
        return str.length > len ? str.substring(0, len) + '...' : str;
      };

      console.log(`📝 Lecture: "${truncate(lecture.titleArabic, 40)}"`);
      console.log(`   Series: "${truncate(series.titleArabic, 40)}"`);
      console.log(`   Current: ${truncate(currentDesc)}`);
      console.log(`   New:     ${truncate(newDesc)}`);

      if (DRY_RUN) {
        console.log(`   ➡️  Would update\n`);
        updated++;
      } else {
        try {
          await Lecture.updateOne(
            { _id: lecture._id },
            { $set: { descriptionArabic: newDesc } }
          );
          console.log(`   ✓ Updated\n`);
          updated++;
        } catch (err) {
          console.error(`   ✗ Error: ${err.message}\n`);
          errors++;
        }
      }
    }

    // Print summary
    console.log('='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   Lectures with series:      ${lectures.length}`);
    console.log(`   Updated:                   ${updated}`);
    console.log(`   Skipped (same):            ${skipped}`);
    console.log(`   Series not found:          ${noSeries}`);
    console.log(`   Series has no description: ${noSeriesDescription}`);
    console.log(`   Errors:                    ${errors}`);

    if (DRY_RUN && updated > 0) {
      console.log('\n📋 Run without --dry-run to apply changes');
    }

  } catch (err) {
    console.error('✗ Fatal error:', err.message);
    errors++;
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
    console.log('✓ Done!\n');
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
