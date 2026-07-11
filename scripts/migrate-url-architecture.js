/**
 * URL Architecture Migration Script
 *
 * This script migrates existing lectures, series, and sheikhs to the new URL architecture:
 * - Assigns unique numeric shortIds to all documents
 * - Generates slug_en (English transliterated slug)
 * - Generates slug_ar (Arabic kebab-case slug)
 * - Migrates existing 'slug' values to 'slug_en'
 *
 * Run with: node scripts/migrate-url-architecture.js
 *
 * IMPORTANT: Run this script in a maintenance window or during low traffic.
 * The script uses atomic operations for counter increments to prevent race conditions.
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import models
const { Lecture, Series, Sheikh, Counter } = require('../models');
const { generateSlugEn, generateSlugAr } = require('../utils/slugify');

// Configuration
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

function log(message, force = false) {
  if (VERBOSE || force) {
    console.log(message);
  }
}

/**
 * Initialize counters for each entity type
 */
async function initializeCounters() {
  console.log('\n📊 Initializing counters...');

  // Find the maximum existing shortId for each type (if any)
  const maxLecture = await Lecture.findOne({ shortId: { $exists: true } })
    .sort({ shortId: -1 })
    .select('shortId')
    .lean();

  const maxSeries = await Series.findOne({ shortId: { $exists: true } })
    .sort({ shortId: -1 })
    .select('shortId')
    .lean();

  const maxSheikh = await Sheikh.findOne({ shortId: { $exists: true } })
    .sort({ shortId: -1 })
    .select('shortId')
    .lean();

  // Initialize or update counters
  const counters = [
    { _id: 'lecture', seq: maxLecture?.shortId || 0 },
    { _id: 'series', seq: maxSeries?.shortId || 0 },
    { _id: 'sheikh', seq: maxSheikh?.shortId || 0 }
  ];

  for (const counter of counters) {
    if (!DRY_RUN) {
      await Counter.findOneAndUpdate(
        { _id: counter._id },
        { $setOnInsert: { seq: counter.seq } },
        { upsert: true }
      );
    }
    console.log(`  ✓ ${counter._id} counter initialized at ${counter.seq}`);
  }
}

/**
 * Migrate lectures
 */
async function migrateLectures() {
  console.log('\n📚 Migrating Lectures...');

  const lectures = await Lecture.find({
    $or: [
      { shortId: { $exists: false } },
      { slug_en: { $exists: false } },
      { slug_ar: { $exists: false } }
    ]
  }).sort({ createdAt: 1 });

  console.log(`  Found ${lectures.length} lectures to migrate`);

  let migrated = 0;
  let errors = 0;

  for (const lecture of lectures) {
    try {
      const updates = {};

      // Assign shortId if missing
      if (!lecture.shortId) {
        if (DRY_RUN) {
          updates.shortId = '[NEW]';
        } else {
          updates.shortId = await Counter.getNextSequence('lecture');
        }
      }

      // Generate slug_en if missing
      if (!lecture.slug_en) {
        // Migrate existing slug to slug_en if available
        if (lecture.slug) {
          updates.slug_en = lecture.slug;
        } else if (lecture.titleEnglish) {
          updates.slug_en = generateSlugEn(lecture.titleEnglish);
        } else if (lecture.titleArabic) {
          updates.slug_en = generateSlugEn(lecture.titleArabic);
        } else {
          updates.slug_en = `lecture-${updates.shortId || lecture.shortId}`;
        }
      }

      // Generate slug_ar if missing
      if (!lecture.slug_ar && lecture.titleArabic) {
        updates.slug_ar = generateSlugAr(lecture.titleArabic);
      }

      if (Object.keys(updates).length > 0) {
        log(`  - Lecture "${lecture.titleArabic?.substring(0, 40)}..." => shortId: ${updates.shortId || lecture.shortId}`);

        if (!DRY_RUN) {
          await Lecture.updateOne({ _id: lecture._id }, { $set: updates });
        }
        migrated++;
      }
    } catch (error) {
      console.error(`  ✗ Error migrating lecture ${lecture._id}: ${error.message}`);
      errors++;
    }
  }

  console.log(`  ✓ Migrated: ${migrated}, Errors: ${errors}`);
  return { migrated, errors };
}

/**
 * Migrate series
 */
async function migrateSeries() {
  console.log('\n📖 Migrating Series...');

  const seriesList = await Series.find({
    $or: [
      { shortId: { $exists: false } },
      { slug_en: { $exists: false } },
      { slug_ar: { $exists: false } }
    ]
  }).sort({ createdAt: 1 });

  console.log(`  Found ${seriesList.length} series to migrate`);

  let migrated = 0;
  let errors = 0;

  for (const series of seriesList) {
    try {
      const updates = {};

      // Assign shortId if missing
      if (!series.shortId) {
        if (DRY_RUN) {
          updates.shortId = '[NEW]';
        } else {
          updates.shortId = await Counter.getNextSequence('series');
        }
      }

      // Generate slug_en if missing
      if (!series.slug_en) {
        if (series.slug) {
          updates.slug_en = series.slug;
        } else if (series.titleEnglish) {
          updates.slug_en = generateSlugEn(series.titleEnglish);
        } else if (series.titleArabic) {
          updates.slug_en = generateSlugEn(series.titleArabic);
        } else {
          updates.slug_en = `series-${updates.shortId || series.shortId}`;
        }
      }

      // Generate slug_ar if missing
      if (!series.slug_ar && series.titleArabic) {
        updates.slug_ar = generateSlugAr(series.titleArabic);
      }

      if (Object.keys(updates).length > 0) {
        log(`  - Series "${series.titleArabic?.substring(0, 40)}..." => shortId: ${updates.shortId || series.shortId}`);

        if (!DRY_RUN) {
          await Series.updateOne({ _id: series._id }, { $set: updates });
        }
        migrated++;
      }
    } catch (error) {
      console.error(`  ✗ Error migrating series ${series._id}: ${error.message}`);
      errors++;
    }
  }

  console.log(`  ✓ Migrated: ${migrated}, Errors: ${errors}`);
  return { migrated, errors };
}

/**
 * Migrate sheikhs
 */
async function migrateSheikhs() {
  console.log('\n👤 Migrating Sheikhs...');

  const sheikhs = await Sheikh.find({
    $or: [
      { shortId: { $exists: false } },
      { slug_en: { $exists: false } },
      { slug_ar: { $exists: false } }
    ]
  }).sort({ createdAt: 1 });

  console.log(`  Found ${sheikhs.length} sheikhs to migrate`);

  let migrated = 0;
  let errors = 0;

  for (const sheikh of sheikhs) {
    try {
      const updates = {};

      // Assign shortId if missing
      if (!sheikh.shortId) {
        if (DRY_RUN) {
          updates.shortId = '[NEW]';
        } else {
          updates.shortId = await Counter.getNextSequence('sheikh');
        }
      }

      // Clean name for slug generation (remove honorifics)
      const cleanName = (sheikh.nameEnglish || sheikh.nameArabic || '')
        .replace(/الشيخ\s*/g, '')
        .replace(/حفظه الله/g, '')
        .replace(/رحمه الله/g, '')
        .trim();

      const cleanNameAr = (sheikh.nameArabic || '')
        .replace(/الشيخ\s*/g, '')
        .replace(/حفظه الله/g, '')
        .replace(/رحمه الله/g, '')
        .trim();

      // Generate slug_en if missing
      if (!sheikh.slug_en) {
        if (sheikh.slug) {
          updates.slug_en = sheikh.slug;
        } else if (cleanName) {
          updates.slug_en = generateSlugEn(cleanName);
        } else {
          updates.slug_en = `sheikh-${updates.shortId || sheikh.shortId}`;
        }
      }

      // Generate slug_ar if missing
      if (!sheikh.slug_ar && cleanNameAr) {
        updates.slug_ar = generateSlugAr(cleanNameAr);
      }

      if (Object.keys(updates).length > 0) {
        log(`  - Sheikh "${sheikh.nameArabic}" => shortId: ${updates.shortId || sheikh.shortId}`);

        if (!DRY_RUN) {
          await Sheikh.updateOne({ _id: sheikh._id }, { $set: updates });
        }
        migrated++;
      }
    } catch (error) {
      console.error(`  ✗ Error migrating sheikh ${sheikh._id}: ${error.message}`);
      errors++;
    }
  }

  console.log(`  ✓ Migrated: ${migrated}, Errors: ${errors}`);
  return { migrated, errors };
}

/**
 * Verify migration results
 */
async function verifyMigration() {
  console.log('\n🔍 Verifying migration...');

  const lecturesWithoutShortId = await Lecture.countDocuments({ shortId: { $exists: false } });
  const lecturesWithoutSlugEn = await Lecture.countDocuments({ slug_en: { $exists: false } });

  const seriesWithoutShortId = await Series.countDocuments({ shortId: { $exists: false } });
  const seriesWithoutSlugEn = await Series.countDocuments({ slug_en: { $exists: false } });

  const sheikhsWithoutShortId = await Sheikh.countDocuments({ shortId: { $exists: false } });
  const sheikhsWithoutSlugEn = await Sheikh.countDocuments({ slug_en: { $exists: false } });

  console.log(`  Lectures without shortId: ${lecturesWithoutShortId}`);
  console.log(`  Lectures without slug_en: ${lecturesWithoutSlugEn}`);
  console.log(`  Series without shortId: ${seriesWithoutShortId}`);
  console.log(`  Series without slug_en: ${seriesWithoutSlugEn}`);
  console.log(`  Sheikhs without shortId: ${sheikhsWithoutShortId}`);
  console.log(`  Sheikhs without slug_en: ${sheikhsWithoutSlugEn}`);

  const allGood = lecturesWithoutShortId === 0 &&
    lecturesWithoutSlugEn === 0 &&
    seriesWithoutShortId === 0 &&
    seriesWithoutSlugEn === 0 &&
    sheikhsWithoutShortId === 0 &&
    sheikhsWithoutSlugEn === 0;

  if (allGood) {
    console.log('\n✅ Migration verification PASSED - all documents have shortId and slug_en');
  } else {
    console.log('\n⚠️ Migration verification INCOMPLETE - some documents are missing fields');
  }

  return allGood;
}

/**
 * Main migration function
 */
async function main() {
  console.log('========================================');
  console.log('🚀 URL Architecture Migration');
  console.log('========================================');

  if (DRY_RUN) {
    console.log('⚠️  DRY RUN MODE - No changes will be made');
  }

  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/audio-library';
    console.log(`\n🔗 Connecting to MongoDB...`);
    await mongoose.connect(mongoUri);
    console.log('  ✓ Connected');

    // Run migration steps
    await initializeCounters();
    const lectureResults = await migrateLectures();
    const seriesResults = await migrateSeries();
    const sheikhResults = await migrateSheikhs();

    // Summary
    console.log('\n========================================');
    console.log('📊 Migration Summary');
    console.log('========================================');
    console.log(`  Lectures: ${lectureResults.migrated} migrated, ${lectureResults.errors} errors`);
    console.log(`  Series: ${seriesResults.migrated} migrated, ${seriesResults.errors} errors`);
    console.log(`  Sheikhs: ${sheikhResults.migrated} migrated, ${sheikhResults.errors} errors`);

    // Verify
    if (!DRY_RUN) {
      await verifyMigration();
    }

    console.log('\n✅ Migration complete!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main, migrateLectures, migrateSeries, migrateSheikhs };
