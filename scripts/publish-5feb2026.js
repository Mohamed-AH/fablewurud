#!/usr/bin/env node
/**
 * Publish Script for updatedData5Feb2026.xlsx Import
 *
 * Sets published=true for all lectures from the 5feb2026 import batch
 * that have their audio uploaded (audioUrl is set).
 *
 * Usage:
 *   node scripts/publish-5feb2026.js [options]
 *
 * Options:
 *   --dry-run     Preview changes without updating
 *   --force       Publish even if audioUrl is not set (not recommended)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Lecture } = require('../models');

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

async function publishLectures() {
  console.log('='.repeat(70));
  console.log('  Publish Script for 5feb2026 Import Batch');
  console.log('='.repeat(70));

  if (DRY_RUN) {
    console.log('\n*** DRY-RUN MODE - No changes will be made ***\n');
  }

  // Connect to MongoDB
  console.log('\nConnecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Build query
  const query = {
    'metadata.importBatch': '5feb2026',
    published: false
  };

  if (!FORCE) {
    query.audioUrl = { $ne: null, $exists: true };
  }

  // Count matching lectures
  const count = await Lecture.countDocuments(query);
  console.log(`\nLectures to publish: ${count}`);

  if (count === 0) {
    console.log('\nNo unpublished lectures with audio found.');

    // Check if any are still missing audio
    const noAudio = await Lecture.countDocuments({
      'metadata.importBatch': '5feb2026',
      published: false,
      $or: [{ audioUrl: null }, { audioUrl: { $exists: false } }]
    });

    if (noAudio > 0) {
      console.log(`${noAudio} lectures are still waiting for audio upload.`);
    }

    await mongoose.disconnect();
    return;
  }

  // Get preview of what will be published
  console.log('\nPreview of lectures to publish:');
  const preview = await Lecture.find(query)
    .select('titleArabic audioFileName metadata.serialNo')
    .limit(10)
    .lean();

  preview.forEach(l => {
    console.log(`  S.No ${l.metadata?.serialNo}: ${l.titleArabic}`);
  });

  if (count > 10) {
    console.log(`  ... and ${count - 10} more`);
  }

  // Perform update
  if (!DRY_RUN) {
    console.log('\nUpdating lectures...');

    const result = await Lecture.updateMany(query, {
      $set: { published: true }
    });

    console.log(`Updated ${result.modifiedCount} lectures`);
  } else {
    console.log('\n[DRY-RUN] Would update', count, 'lectures');
  }

  // Show final stats
  console.log('\n=== Final Statistics ===');

  const published = await Lecture.countDocuments({
    'metadata.importBatch': '5feb2026',
    published: true
  });

  const unpublished = await Lecture.countDocuments({
    'metadata.importBatch': '5feb2026',
    published: false
  });

  console.log(`Published: ${published}`);
  console.log(`Unpublished: ${unpublished}`);

  // Disconnect
  await mongoose.disconnect();
  console.log('\nDatabase connection closed');
}

publishLectures().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
