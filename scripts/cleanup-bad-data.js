#!/usr/bin/env node

/**
 * Cleanup Script - Remove incorrectly imported data from MongoDB
 *
 * This script removes all lectures and series that were imported with the buggy
 * import-excel.js script, which had the following issues:
 * - Used Serial as title instead of SeriesName
 * - Set audioFileName even though files don't exist
 * - Only created series for Type === 'Series'
 *
 * Run this before re-importing with import-excel-fixed.js
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import models
const Lecture = require('../models/Lecture');
const Series = require('../models/Series');
const Sheikh = require('../models/Sheikh');

async function cleanupBadData() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get current counts
    const lectureCount = await Lecture.countDocuments();
    const seriesCount = await Series.countDocuments();
    const sheikhCount = await Sheikh.countDocuments();

    console.log('📊 Current database state:');
    console.log(`   Lectures: ${lectureCount}`);
    console.log(`   Series: ${seriesCount}`);
    console.log(`   Sheikhs: ${sheikhCount}\n`);

    // Show sample of current data issues
    console.log('🔍 Sample of current lecture data (first 5):');
    const sampleLectures = await Lecture.find().limit(5).populate('seriesId');
    sampleLectures.forEach((lecture, index) => {
      console.log(`\n${index + 1}. ${lecture.titleArabic}`);
      console.log(`   ID: ${lecture._id}`);
      console.log(`   audioFileName: ${lecture.audioFileName || 'null'}`);
      console.log(`   Series: ${lecture.seriesId ? lecture.seriesId.titleArabic : 'none'}`);
      console.log(`   Duration: ${lecture.duration || 0} seconds`);
    });

    console.log('\n⚠️  WARNING: This will delete ALL lectures and series!');
    console.log('    Sheikhs will be preserved as they are correct.\n');

    // Ask for confirmation (in non-interactive mode, we'll use an environment variable)
    const confirmDelete = process.env.CONFIRM_DELETE === 'yes';

    if (!confirmDelete) {
      console.log('ℹ️  To run this script, set CONFIRM_DELETE=yes environment variable:');
      console.log('   CONFIRM_DELETE=yes node scripts/cleanup-bad-data.js\n');
      process.exit(0);
    }

    console.log('🗑️  Deleting all lectures...');
    const deletedLectures = await Lecture.deleteMany({});
    console.log(`✅ Deleted ${deletedLectures.deletedCount} lectures\n`);

    console.log('🗑️  Deleting all series...');
    const deletedSeries = await Series.deleteMany({});
    console.log(`✅ Deleted ${deletedSeries.deletedCount} series\n`);

    // Verify cleanup
    const remainingLectures = await Lecture.countDocuments();
    const remainingSeries = await Series.countDocuments();
    const remainingSheikhs = await Sheikh.countDocuments();

    console.log('📊 Final database state:');
    console.log(`   Lectures: ${remainingLectures}`);
    console.log(`   Series: ${remainingSeries}`);
    console.log(`   Sheikhs: ${remainingSheikhs}\n`);

    if (remainingLectures === 0 && remainingSeries === 0) {
      console.log('✅ Cleanup successful! Database is ready for re-import.');
      console.log('\nNext steps:');
      console.log('1. Run: node scripts/import-excel-fixed.js');
      console.log('2. Verify data structure is correct');
      console.log('3. Use bulk upload to add audio files\n');
    } else {
      console.log('⚠️  Warning: Some records remain. Please check manually.\n');
    }

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run cleanup
cleanupBadData();
