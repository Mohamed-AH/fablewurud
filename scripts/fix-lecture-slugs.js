#!/usr/bin/env node
/**
 * Fix Lecture Slugs Script
 *
 * Regenerates slugs using series name + lecture number format.
 * This prevents duplicate slugs across different series variants
 * (e.g., "عن بعد", "أرشيف رمضان").
 *
 * Usage:
 *   node scripts/fix-lecture-slugs.js [--dry-run] [--series SERIES_ID] [--env FILE] [--output FILE]
 *
 * Options:
 *   --dry-run      Show what would be updated without making changes
 *   --series ID    Only fix lectures in this series
 *   --env FILE     Path to .env file (default: .env)
 *   --output FILE  Write output to file (works on Windows)
 */

const fs = require('fs');

// Parse --env argument first
const args = process.argv.slice(2);
const envIndex = args.indexOf('--env');
const envPath = envIndex !== -1 ? args[envIndex + 1] : '.env';

// Parse --output argument
const outputIndex = args.indexOf('--output');
const outputFile = outputIndex !== -1 ? args[outputIndex + 1] : null;

// Create output stream
let output = [];
function log(msg = '') {
  console.log(msg);
  output.push(msg);
}

// Write output to file at the end
function saveOutput() {
  if (outputFile) {
    fs.writeFileSync(outputFile, output.join('\n'), 'utf8');
    console.log(`\n📄 Output saved to: ${outputFile}`);
  }
}

require('dotenv').config({ path: envPath });

if (!process.env.MONGODB_URI) {
  console.error('\n❌ Error: MONGODB_URI environment variable is not set.');
  console.error('Usage: node scripts/fix-lecture-slugs.js --env /path/to/.env\n');
  process.exit(1);
}

const mongoose = require('mongoose');
const Lecture = require('../models/Lecture');
const Series = require('../models/Series');
const { generateSlug, generateLectureSlug } = require('../utils/slugify');

// Parse arguments
const DRY_RUN = args.includes('--dry-run');
const seriesIndex = args.indexOf('--series');
const SERIES_ID = seriesIndex !== -1 ? args[seriesIndex + 1] : null;

async function fixSlugs() {
  log('\n🔧 Fix Lecture Slugs Script');
  log('='.repeat(50));

  if (DRY_RUN) {
    log('📋 DRY RUN MODE - No changes will be made\n');
  }

  if (SERIES_ID) {
    log(`📚 Filtering by series: ${SERIES_ID}\n`);
  }

  if (outputFile) {
    log(`📄 Output will be saved to: ${outputFile}\n`);
  }

  // Connect to MongoDB
  log('🔌 Connecting to MongoDB...');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    log('✓ Connected to MongoDB\n');
  } catch (err) {
    log('✗ MongoDB connection failed: ' + err.message);
    saveOutput();
    process.exit(1);
  }

  // Build query
  const query = {};
  if (SERIES_ID) {
    query.seriesId = SERIES_ID;
  }

  // Fetch all lectures with series data
  const lectures = await Lecture.find(query)
    .populate('seriesId', 'titleArabic')
    .sort({ seriesId: 1, lectureNumber: 1 })
    .lean();

  log(`📚 Found ${lectures.length} lectures to check\n`);

  // ========== DUPLICATE DETECTION ==========
  log('🔍 Checking for duplicate titles...\n');

  const titleMap = new Map();
  for (const lecture of lectures) {
    const title = lecture.titleArabic;
    if (!titleMap.has(title)) {
      titleMap.set(title, []);
    }
    titleMap.get(title).push(lecture);
  }

  const duplicates = [];
  for (const [title, lectureList] of titleMap.entries()) {
    if (lectureList.length > 1) {
      duplicates.push({ title, lectures: lectureList });
    }
  }

  if (duplicates.length > 0) {
    log('⚠️  DUPLICATE TITLES FOUND:');
    log('='.repeat(50));
    for (const dup of duplicates) {
      log(`\n📋 "${dup.title.substring(0, 60)}..."`);
      log(`   Found ${dup.lectures.length} lectures with this title:`);
      for (const lec of dup.lectures) {
        const seriesTitle = lec.seriesId?.titleArabic || null;
        const seriesInfo = seriesTitle ? `Series: ${seriesTitle}` : 'No series';
        const audioInfo = lec.audioFileName ? '✓ Has audio' : '✗ No audio';
        log(`   - ID: ${lec._id}`);
        log(`     Slug: ${lec.slug}`);
        log(`     ${seriesInfo} | ${audioInfo}`);
      }
    }
    log('\n' + '='.repeat(50));
    log(`⚠️  Total: ${duplicates.length} duplicate title groups found`);
    log('   Review these before running without --dry-run!\n');
  } else {
    log('✓ No duplicate titles found\n');
  }

  // ========== SLUG FIXING ==========
  log('🔧 Processing slug fixes...\n');

  // First pass: compute all new slugs and check for uniqueness among them
  // This avoids false positive "duplicates" where the new slug matches an old
  // record that will also be updated
  const slugUpdates = [];
  const newSlugMap = new Map(); // Track new slugs to detect actual duplicates

  for (const lecture of lectures) {
    const title = lecture.titleArabic;
    const currentSlug = lecture.slug;
    const series = lecture.seriesId; // Already populated with titleArabic

    // Generate new slug including series name to avoid duplicates
    let newSlug = generateLectureSlug(lecture, series);

    // Check if slug matches
    if (currentSlug === newSlug) {
      slugUpdates.push({ lecture, newSlug: null, skipped: true });
      continue;
    }

    // Track this new slug for duplicate detection within the batch
    if (!newSlugMap.has(newSlug)) {
      newSlugMap.set(newSlug, []);
    }
    newSlugMap.get(newSlug).push(lecture._id.toString());

    slugUpdates.push({ lecture, newSlug, series, skipped: false });
  }

  // Second pass: resolve duplicates within the new slugs only
  // (not against old database slugs that will be replaced)
  for (const update of slugUpdates) {
    if (update.skipped || !update.newSlug) continue;

    const duplicateIds = newSlugMap.get(update.newSlug);
    if (duplicateIds.length > 1) {
      // Multiple lectures want the same new slug - add suffix based on position
      const position = duplicateIds.indexOf(update.lecture._id.toString());
      if (position > 0) {
        update.newSlug = `${update.newSlug}-${position + 1}`;
      }
    }
  }

  // Check for any remaining conflicts with lectures NOT in our update batch
  // (only relevant when using --series filter)
  if (SERIES_ID) {
    const lectureIds = lectures.map(l => l._id);
    for (const update of slugUpdates) {
      if (update.skipped || !update.newSlug) continue;

      let suffix = 1;
      let uniqueSlug = update.newSlug;
      while (await Lecture.exists({ slug: uniqueSlug, _id: { $nin: lectureIds } })) {
        suffix++;
        uniqueSlug = `${update.newSlug}-${suffix}`;
      }
      update.newSlug = uniqueSlug;
    }
  }

  // Third pass: apply updates
  let fixed = 0;
  let skipped = 0;
  let errors = 0;

  for (const update of slugUpdates) {
    if (update.skipped) {
      skipped++;
      continue;
    }

    const { lecture, newSlug, series } = update;
    const title = lecture.titleArabic;
    const currentSlug = lecture.slug;

    const seriesName = series?.titleArabic ? ` [${series.titleArabic.substring(0, 30)}]` : '';
    log(`📝 ${title.substring(0, 50)}...${seriesName}`);
    log(`   Old: ${currentSlug}`);
    log(`   New: ${newSlug}`);

    if (!DRY_RUN) {
      try {
        await Lecture.updateOne(
          { _id: lecture._id },
          { $set: { slug: newSlug } }
        );
        log(`   ✓ Updated\n`);
        fixed++;
      } catch (err) {
        log(`   ✗ Error: ${err.message}\n`);
        errors++;
      }
    } else {
      log(`   📋 Would update\n`);
      fixed++;
    }
  }

  // Summary
  log('='.repeat(50));
  log('📊 Summary:');
  log(`   Total checked: ${lectures.length}`);
  log(`   Fixed: ${fixed}`);
  log(`   Skipped (already correct): ${skipped}`);
  log(`   Errors: ${errors}`);

  if (DRY_RUN && fixed > 0) {
    log('\n📋 This was a dry run. Run without --dry-run to apply changes.');
  }

  await mongoose.disconnect();
  log('\n✓ Done!\n');

  // Save output to file if specified
  saveOutput();
}

fixSlugs().catch(err => {
  log('Fatal error: ' + err.message);
  saveOutput();
  process.exit(1);
});
