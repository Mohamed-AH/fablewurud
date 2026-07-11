#!/usr/bin/env node

/**
 * Fix audioFileName Index - Drop and Recreate as Sparse
 *
 * This script drops the old audioFileName_1 index and recreates it as sparse,
 * allowing multiple null values while maintaining uniqueness for non-null values.
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function fixIndex() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const Lecture = require('../models/Lecture');

    console.log('📋 Listing current indexes...');
    const indexes = await Lecture.collection.getIndexes();
    console.log('Current indexes:', Object.keys(indexes).join(', '));

    // Check if audioFileName_1 index exists
    if (indexes.audioFileName_1) {
      console.log('\n🗑️  Dropping old audioFileName_1 index...');
      await Lecture.collection.dropIndex('audioFileName_1');
      console.log('✅ Old index dropped');
    } else {
      console.log('\nℹ️  audioFileName_1 index not found (may have been already dropped)');
    }

    console.log('\n🔨 Creating new sparse index for audioFileName...');
    await Lecture.collection.createIndex(
      { audioFileName: 1 },
      { unique: true, sparse: true }
    );
    console.log('✅ New sparse index created');

    console.log('\n📋 Final indexes:');
    const finalIndexes = await Lecture.collection.getIndexes();
    console.log(Object.keys(finalIndexes).join(', '));

    console.log('\n✅ Index fix complete!');
    console.log('   You can now run the import script:\n');
    console.log('   TEST_MODE=yes node scripts/import-excel-fixed.js');
    console.log('   or');
    console.log('   node scripts/import-excel-fixed.js\n');

  } catch (error) {
    console.error('❌ Error fixing index:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the fix
fixIndex();
