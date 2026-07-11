/**
 * Phase 4: Fix Lecture Records - English translations
 *
 * Fixes:
 * - titleEnglish: Generate from Series titleEnglish + lecture number
 * - slug_en: Generate Latin slug from lecture number and series slug
 *
 * Run: node scripts/fix-en-translations-phase4.js [--dry-run]
 * Requires: .env file with MONGODB_URI
 *           Phase 3 must be run first (Series need English titles)
 */

const mongoose = require('mongoose');
const { Lecture, Series } = require('../models');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = process.argv.includes('--dry-run');

// Arabic ordinal numbers mapping
const ARABIC_ORDINALS = {
  'الأول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4, 'الخامس': 5,
  'السادس': 6, 'السابع': 7, 'الثامن': 8, 'التاسع': 9, 'العاشر': 10,
  'الحادي عشر': 11, 'الثاني عشر': 12, 'الثالث عشر': 13, 'الرابع عشر': 14,
  'الخامس عشر': 15, 'السادس عشر': 16, 'السابع عشر': 17, 'الثامن عشر': 18,
  'التاسع عشر': 19, 'العشرون': 20
};

// Check if a string contains Arabic characters
function hasArabic(str) {
  return /[\u0600-\u06FF]/.test(str || '');
}

// Generate English ordinal suffix
function getOrdinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Generate English lecture title
function generateEnglishTitle(seriesTitleEN, lectureNumber) {
  if (!seriesTitleEN || hasArabic(seriesTitleEN)) {
    return null; // Can't generate without English series title
  }
  return `${seriesTitleEN} - Lesson ${lectureNumber}`;
}

// Generate English slug
function generateEnglishSlug(seriesSlugEN, lectureNumber) {
  if (!seriesSlugEN || hasArabic(seriesSlugEN)) {
    return null;
  }
  return `${seriesSlugEN}-lesson-${lectureNumber}`;
}

async function fixLectureRecords() {
  try {
    if (!MONGODB_URI) {
      console.log('❌ MONGODB_URI not found in environment.');
      console.log('   Please create a .env file with your MongoDB connection string.');
      console.log('   Example: MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/duroos\n');
      process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    console.log('═'.repeat(80));
    console.log('PHASE 4: FIX LECTURE RECORDS - ENGLISH TRANSLATIONS' + (DRY_RUN ? ' [DRY RUN]' : ''));
    console.log('═'.repeat(80));
    if (DRY_RUN) console.log('⚠️  DRY RUN MODE - No changes will be made\n');
    console.log();

    // First, get all series with their English titles
    const allSeries = await Series.find({}).lean();
    const seriesMap = new Map();
    allSeries.forEach(s => {
      seriesMap.set(s._id.toString(), {
        titleEnglish: s.titleEnglish,
        slug_en: s.slug_en,
        titleArabic: s.titleArabic
      });
    });

    console.log(`Loaded ${allSeries.length} series for reference.\n`);

    // Check if series have English titles
    let seriesWithArabicEN = 0;
    for (const s of allSeries) {
      if (hasArabic(s.titleEnglish)) seriesWithArabicEN++;
    }

    if (seriesWithArabicEN > 0) {
      console.log(`⚠️  WARNING: ${seriesWithArabicEN} series still have Arabic in titleEnglish.`);
      console.log('   Run Phase 3 first to fix series translations.\n');
    }

    // Get all lectures
    const allLectures = await Lecture.find({}).sort({ seriesId: 1, lectureNumber: 1 });
    console.log(`Found ${allLectures.length} lecture records.\n`);

    // Build a set of existing slugs for duplicate detection
    const existingSlugs = new Set();
    for (const lec of allLectures) {
      if (lec.slug_en && !hasArabic(lec.slug_en)) {
        existingSlugs.add(lec.slug_en);
      }
    }

    // Track slugs we're assigning in this run to avoid duplicates
    const assignedSlugs = new Set();

    // Helper to get a unique slug
    function getUniqueSlug(baseSlug, shortId) {
      if (!existingSlugs.has(baseSlug) && !assignedSlugs.has(baseSlug)) {
        assignedSlugs.add(baseSlug);
        return baseSlug;
      }
      // Slug already exists, append shortId to make it unique
      const uniqueSlug = `${baseSlug}-${shortId}`;
      assignedSlugs.add(uniqueSlug);
      return uniqueSlug;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let noSeriesCount = 0;
    let duplicatesFixed = 0;

    // Process in batches
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < allLectures.length; i += BATCH_SIZE) {
      batches.push(allLectures.slice(i, i + BATCH_SIZE));
    }

    console.log(`Processing ${batches.length} batches of ${BATCH_SIZE} lectures each...\n`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const bulkOps = [];

      for (const lecture of batch) {
        const updates = {};

        // Get series info
        const seriesInfo = lecture.seriesId ? seriesMap.get(lecture.seriesId.toString()) : null;

        // Determine lecture number (use lectureNumber field, sortOrder+1, or extract from title)
        let lectureNum = lecture.lectureNumber || (lecture.sortOrder + 1) || 1;

        if (seriesInfo) {
          // Check titleEnglish
          if (hasArabic(lecture.titleEnglish) || !lecture.titleEnglish || lecture.titleEnglish === '-') {
            const newTitle = generateEnglishTitle(seriesInfo.titleEnglish, lectureNum);
            if (newTitle) {
              updates.titleEnglish = newTitle;
            }
          }

          // Check slug_en
          if (hasArabic(lecture.slug_en) || !lecture.slug_en) {
            const baseSlug = generateEnglishSlug(seriesInfo.slug_en, lectureNum);
            if (baseSlug) {
              updates.slug_en = getUniqueSlug(baseSlug, lecture.shortId);
              if (updates.slug_en !== baseSlug) {
                duplicatesFixed++;
              }
            }
          } else {
            // Existing slug - check if it's a duplicate and needs fixing
            const currentSlug = lecture.slug_en;
            if (assignedSlugs.has(currentSlug)) {
              // This slug was already assigned to another lecture - fix it
              const baseSlug = generateEnglishSlug(seriesInfo.slug_en, lectureNum);
              if (baseSlug) {
                updates.slug_en = `${baseSlug}-${lecture.shortId}`;
                assignedSlugs.add(updates.slug_en);
                duplicatesFixed++;
              }
            } else {
              // Mark this slug as used
              assignedSlugs.add(currentSlug);
            }
          }
        } else {
          // Standalone lecture - generate generic slug
          if (hasArabic(lecture.slug_en) || !lecture.slug_en) {
            updates.slug_en = `lecture-${lecture.shortId || lecture._id.toString().slice(-6)}`;
          }
          if (hasArabic(lecture.titleEnglish) || !lecture.titleEnglish) {
            // For standalone, use a generic format
            updates.titleEnglish = `Lecture ${lecture.shortId || lectureNum}`;
          }
          noSeriesCount++;
        }

        if (Object.keys(updates).length > 0) {
          bulkOps.push({
            updateOne: {
              filter: { _id: lecture._id },
              update: { $set: updates }
            }
          });
          updatedCount++;
        } else {
          skippedCount++;
        }
      }

      if (bulkOps.length > 0) {
        try {
          if (!DRY_RUN) {
            await Lecture.bulkWrite(bulkOps);
          }
          process.stdout.write(`\r   Processed batch ${batchIndex + 1}/${batches.length} (${updatedCount} ${DRY_RUN ? 'to update' : 'updated'}, ${skippedCount} skipped, ${duplicatesFixed} duplicates fixed)`);
        } catch (err) {
          console.log(`\n❌ Error in batch ${batchIndex + 1}: ${err.message}`);
          errorCount += bulkOps.length;
        }
      } else {
        process.stdout.write(`\r   Processed batch ${batchIndex + 1}/${batches.length} (${updatedCount} ${DRY_RUN ? 'to update' : 'updated'}, ${skippedCount} skipped, ${duplicatesFixed} duplicates fixed)`);
      }
    }

    console.log('\n');
    console.log('═'.repeat(80));
    console.log('PHASE 4 SUMMARY' + (DRY_RUN ? ' [DRY RUN]' : ''));
    console.log('═'.repeat(80));
    console.log(`   Total lectures:     ${allLectures.length}`);
    console.log(`   ${DRY_RUN ? 'Would update' : 'Updated'}:       ${updatedCount}`);
    console.log(`   Skipped (correct):  ${skippedCount}`);
    console.log(`   Duplicates fixed:   ${duplicatesFixed}`);
    console.log(`   Standalone:         ${noSeriesCount}`);
    console.log(`   Errors:             ${errorCount}`);
    console.log();

    if (!DRY_RUN) {
      // Verify a sample
      console.log('Sample verification (first 5 updated lectures):');
      console.log('─'.repeat(60));
      const sampleLectures = await Lecture.find({}).limit(5).populate('seriesId').lean();
      for (const lec of sampleLectures) {
        console.log(`   #${lec.shortId} "${lec.titleEnglish}"`);
        console.log(`   slug_en: ${lec.slug_en}`);
        console.log();
      }
    } else {
      console.log('Run without --dry-run to apply changes.\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

fixLectureRecords();
