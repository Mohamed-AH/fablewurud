#!/usr/bin/env node
/**
 * Migration script to update category 'Khutba' to 'Khutbah' in lectures
 *
 * Usage: node scripts/migrate-khutba-category.js [--dry-run]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Lecture = require('../models/Lecture');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/duroos';
const isDryRun = process.argv.includes('--dry-run');

async function migrate() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.\n');

    // Find all lectures with category 'Khutba'
    const lectures = await Lecture.find({ category: 'Khutba' }).select('_id titleArabic category');

    console.log(`Found ${lectures.length} lectures with category 'Khutba'\n`);

    if (lectures.length === 0) {
      console.log('No lectures to update.');
      return;
    }

    if (isDryRun) {
      console.log('DRY RUN - No changes will be made.\n');
      console.log('Lectures that would be updated:');
      lectures.forEach((lecture, i) => {
        console.log(`  ${i + 1}. ${lecture.titleArabic}`);
      });
    } else {
      console.log('Updating lectures...');
      const result = await Lecture.updateMany(
        { category: 'Khutba' },
        { $set: { category: 'Khutbah' } }
      );
      console.log(`Updated ${result.modifiedCount} lectures from 'Khutba' to 'Khutbah'`);
    }

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  }
}

migrate();
