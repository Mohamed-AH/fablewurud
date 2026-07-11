#!/usr/bin/env node
/**
 * Fix Series Slugs Script
 *
 * Regenerates slugs for all series to ensure they are SEO-friendly
 * and consistent with the slugify utility.
 *
 * Usage:
 *   node scripts/fix-series-slugs.js [--dry-run] [--force] [--env FILE]
 *
 * Options:
 *   --dry-run   Show what would be updated without making changes
 *   --force     Regenerate all slugs, even if they already exist
 *   --env FILE  Path to .env file (default: .env)
 */

const fs = require('fs');

// Parse --env argument first
const args = process.argv.slice(2);
const envIndex = args.indexOf('--env');
const envPath = envIndex !== -1 ? args[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

if (!process.env.MONGODB_URI) {
  console.error('\n❌ Error: MONGODB_URI environment variable is not set.');
  console.error('Usage: node scripts/fix-series-slugs.js --env /path/to/.env\n');
  process.exit(1);
}

const mongoose = require('mongoose');
const Series = require('../models/Series');
const { generateSeriesSlug, generateUniqueSlug } = require('../utils/slugify');

// Parse arguments
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

async function fixSeriesSlugs() {
  console.log('\n🔧 Fix Series Slugs Script');
  console.log('='.repeat(50));

  if (DRY_RUN) {
    console.log('📋 DRY RUN MODE - No changes will be made\n');
  }

  if (FORCE) {
    console.log('⚠️  FORCE MODE - All slugs will be regenerated\n');
  }

  // Connect to MongoDB
  console.log('🔌 Connecting to MongoDB...');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');
  } catch (err) {
    console.log('✗ MongoDB connection failed: ' + err.message);
    process.exit(1);
  }

  // Track existing slugs to ensure uniqueness
  const existingSlugs = new Set();

  // Fetch all series
  const allSeries = await Series.find({}).sort({ titleArabic: 1 }).lean();
  console.log(`📚 Found ${allSeries.length} series to check\n`);

  // First pass: collect existing slugs we want to keep
  if (!FORCE) {
    for (const series of allSeries) {
      if (series.slug) {
        existingSlugs.add(series.slug);
      }
    }
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  console.log('🔧 Processing series...\n');

  for (const series of allSeries) {
    const currentSlug = series.slug;

    // Skip if already has a slug and not in force mode
    if (currentSlug && !FORCE) {
      skipped++;
      continue;
    }

    // Generate new slug
    const baseSlug = generateSeriesSlug(series);

    // Check for uniqueness
    const newSlug = await generateUniqueSlug(baseSlug, async (s) => {
      if (existingSlugs.has(s)) return true;
      const existing = await Series.findOne({ slug: s, _id: { $ne: series._id } });
      return !!existing;
    });

    // Check if slug changed
    if (currentSlug === newSlug) {
      skipped++;
      continue;
    }

    console.log(`📝 ${series.titleArabic.substring(0, 50)}`);
    if (currentSlug) {
      console.log(`   Old: ${currentSlug}`);
    } else {
      console.log(`   Old: (none)`);
    }
    console.log(`   New: ${newSlug}`);

    if (!DRY_RUN) {
      try {
        await Series.updateOne(
          { _id: series._id },
          { $set: { slug: newSlug } }
        );
        existingSlugs.add(newSlug);
        console.log(`   ✓ Updated\n`);
        updated++;
      } catch (err) {
        console.log(`   ✗ Error: ${err.message}\n`);
        errors++;
      }
    } else {
      existingSlugs.add(newSlug);
      console.log(`   📋 Would update\n`);
      updated++;
    }
  }

  // Summary
  console.log('='.repeat(50));
  console.log('📊 Summary:');
  console.log(`   Total series: ${allSeries.length}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped (already has slug): ${skipped}`);
  console.log(`   Errors: ${errors}`);

  if (DRY_RUN && updated > 0) {
    console.log('\n📋 This was a dry run. Run without --dry-run to apply changes.');
  }

  // Show sample of current slugs
  console.log('\n📋 Sample of series slugs:');
  const sampleSeries = await Series.find({}).limit(10).lean();
  for (const s of sampleSeries) {
    console.log(`   ${s.titleArabic.substring(0, 40)} → ${s.slug || '(no slug)'}`);
  }

  await mongoose.disconnect();
  console.log('\n✓ Done!\n');
}

fixSeriesSlugs().catch(err => {
  console.log('Fatal error: ' + err.message);
  process.exit(1);
});
