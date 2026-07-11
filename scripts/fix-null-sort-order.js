/**
 * Migration script to fix null/missing sortOrder values in lectures collection.
 * This ensures all lectures have a sortOrder value (defaults to 0) so the
 * compound index can be used efficiently without in-memory blocking sort.
 *
 * Run this script BEFORE deploying the code changes:
 *   node scripts/fix-null-sort-order.js
 *
 * Or run directly in mongosh:
 *   db.lectures.updateMany(
 *     { $or: [{ sortOrder: null }, { sortOrder: { $exists: false } }] },
 *     { $set: { sortOrder: 0 } }
 *   );
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function fixNullSortOrder() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wurud';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const lecturesCollection = db.collection('lectures');

    // Count affected documents first
    const countBefore = await lecturesCollection.countDocuments({
      $or: [
        { sortOrder: null },
        { sortOrder: { $exists: false } }
      ]
    });

    console.log(`Found ${countBefore} lectures with null/missing sortOrder`);

    if (countBefore === 0) {
      console.log('No documents need updating. All lectures already have sortOrder values.');
      await mongoose.disconnect();
      return;
    }

    // Update all documents with null or missing sortOrder to 0
    const result = await lecturesCollection.updateMany(
      {
        $or: [
          { sortOrder: null },
          { sortOrder: { $exists: false } }
        ]
      },
      { $set: { sortOrder: 0 } }
    );

    console.log(`Updated ${result.modifiedCount} lectures`);

    // Verify the fix
    const countAfter = await lecturesCollection.countDocuments({
      $or: [
        { sortOrder: null },
        { sortOrder: { $exists: false } }
      ]
    });

    console.log(`Remaining lectures with null/missing sortOrder: ${countAfter}`);

    if (countAfter === 0) {
      console.log('SUCCESS: All lectures now have valid sortOrder values');
    } else {
      console.log('WARNING: Some lectures still have null/missing sortOrder');
    }

    await mongoose.disconnect();
    console.log('Done');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixNullSortOrder();
