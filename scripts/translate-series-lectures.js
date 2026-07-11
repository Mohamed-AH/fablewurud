#!/usr/bin/env node
/**
 * Translate Individual Lecture Titles in a Series
 *
 * Usage:
 *   node scripts/translate-series-lectures.js <series-name-or-id> [options]
 *
 * Options:
 *   --dry-run         Preview changes without applying
 *   --list            Just list lectures needing translation
 *   --file <path>     JSON file with translations { shortId: "English Title", ... }
 *
 * Examples:
 *   node scripts/translate-series-lectures.js "محاضرات متفرقة" --list
 *   node scripts/translate-series-lectures.js 13 --dry-run
 *   node scripts/translate-series-lectures.js 12 --file translations.json
 *   node scripts/translate-series-lectures.js "خطب الجمعة" --file khutba-translations.json
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { Lecture, Series } = require('../models');
const { generateSlugEn } = require('../utils/slugify');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIST_ONLY = args.includes('--list');

// Get series identifier (first non-flag argument)
const seriesArg = args.find(arg => !arg.startsWith('--'));

// Get translations file path
const fileIndex = args.indexOf('--file');
const translationsFile = fileIndex !== -1 ? args[fileIndex + 1] : null;

// Check if string contains Arabic characters
function hasArabic(str) {
  return /[\u0600-\u06FF]/.test(str || '');
}

// Generate unique slug
async function generateUniqueSlug(baseSlug, lectureId) {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await Lecture.findOne({
      slug_en: slug,
      _id: { $ne: lectureId }
    });

    if (!existing) return slug;

    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

// Find series by name or ID
async function findSeries(identifier) {
  // Try as shortId (number)
  const shortId = parseInt(identifier);
  if (!isNaN(shortId)) {
    const series = await Series.findOne({ shortId });
    if (series) return series;
  }

  // Try as ObjectId
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    const series = await Series.findById(identifier);
    if (series) return series;
  }

  // Try as title (partial match)
  const series = await Series.findOne({
    $or: [
      { titleArabic: new RegExp(identifier, 'i') },
      { titleEnglish: new RegExp(identifier, 'i') }
    ]
  });

  return series;
}

// Load translations from JSON file
function loadTranslations(filePath) {
  try {
    const fullPath = path.resolve(filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`❌ Error loading translations file: ${err.message}`);
    return null;
  }
}

// Check if translation looks problematic
function needsReview(titleArabic, titleEnglish, slug_en) {
  if (!titleEnglish) return 'missing';
  if (hasArabic(titleEnglish)) return 'has Arabic';
  if (titleEnglish === titleArabic) return 'same as Arabic';
  if (hasArabic(slug_en)) return 'slug has Arabic';
  if (!slug_en) return 'slug missing';
  return null;
}

// List all lectures in series
async function listLectures(series) {
  console.log('═'.repeat(80));
  console.log(`LECTURES IN: ${series.titleArabic}`);
  console.log(`Series ID: ${series.shortId} | English: ${series.titleEnglish || '(none)'}`);
  console.log('═'.repeat(80));
  console.log();

  const lectures = await Lecture.find({ seriesId: series._id })
    .sort({ sortOrder: 1, lectureNumber: 1, createdAt: 1 });

  if (lectures.length === 0) {
    console.log('No lectures found in this series.');
    return;
  }

  const translationTemplate = {};
  let flaggedCount = 0;

  console.log('All lectures in this series:\n');

  for (const lecture of lectures) {
    const issue = needsReview(lecture.titleArabic, lecture.titleEnglish, lecture.slug_en);
    const flag = issue ? `⚠️  [${issue}]` : '✓';

    if (issue) flaggedCount++;

    console.log(`  ${lecture.shortId}. ${lecture.titleArabic}`);
    console.log(`     EN: ${lecture.titleEnglish || '(missing)'} ${flag}`);
    console.log(`     slug_en: ${lecture.slug_en || '(missing)'}`);
    console.log();

    // Include ALL lectures in template so user can review/fix any
    translationTemplate[lecture.shortId] = lecture.titleEnglish || `TRANSLATE: ${lecture.titleArabic}`;
  }

  console.log('-'.repeat(80));
  console.log(`Total: ${lectures.length} lectures, ${flaggedCount} flagged for review`);
  console.log();

  console.log('📋 JSON template (all lectures - edit the ones you want to fix):\n');
  console.log(JSON.stringify(translationTemplate, null, 2));
  console.log();
  console.log('Save to a file, edit translations, then run:');
  console.log(`  node scripts/translate-series-lectures.js ${series.shortId} --file translations.json --dry-run`);
}

// Apply translations
async function applyTranslations(series, translations) {
  console.log('═'.repeat(80));
  console.log(`TRANSLATING: ${series.titleArabic}` + (DRY_RUN ? ' [DRY RUN]' : ''));
  console.log('═'.repeat(80));
  if (DRY_RUN) console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  console.log();

  const lectures = await Lecture.find({ seriesId: series._id })
    .sort({ sortOrder: 1, lectureNumber: 1, createdAt: 1 });

  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const lecture of lectures) {
    // Look up translation by shortId or lectureNumber
    const englishTitle = translations[lecture.shortId] ||
                         translations[lecture.lectureNumber] ||
                         translations[String(lecture.shortId)] ||
                         translations[String(lecture.lectureNumber)];

    // Skip if no translation provided or still has TRANSLATE: prefix
    if (!englishTitle || englishTitle.startsWith('TRANSLATE:')) {
      skipped++;
      continue;
    }

    // Skip if translation is same as current (no change needed)
    if (englishTitle === lecture.titleEnglish) {
      skipped++;
      continue;
    }

    const updates = {};
    const changes = [];

    // Always update titleEnglish if translation differs from current
    updates.titleEnglish = englishTitle;
    changes.push(`titleEnglish: "${lecture.titleEnglish || '-'}" → "${englishTitle}"`);

    // Regenerate slug_en based on new English title
    const baseSlug = generateSlugEn(englishTitle);
    const uniqueSlug = await generateUniqueSlug(baseSlug, lecture._id);
    if (uniqueSlug !== lecture.slug_en) {
      updates.slug_en = uniqueSlug;
      changes.push(`slug_en: "${lecture.slug_en || '-'}" → "${uniqueSlug}"`);
    }

    if (Object.keys(updates).length > 0) {
      try {
        if (!DRY_RUN) {
          await Lecture.updateOne({ _id: lecture._id }, { $set: updates });
        }
        console.log(`${DRY_RUN ? '🔍' : '✅'} #${lecture.shortId} "${lecture.titleArabic}"`);
        changes.forEach(c => console.log(`   ${c}`));
        console.log();
        updated++;
      } catch (err) {
        console.log(`❌ Error #${lecture.shortId}: ${err.message}`);
        errors.push({ shortId: lecture.shortId, error: err.message });
      }
    } else {
      skipped++;
    }
  }

  // Summary
  console.log();
  console.log('═'.repeat(80));
  console.log('SUMMARY' + (DRY_RUN ? ' [DRY RUN]' : ''));
  console.log('═'.repeat(80));
  console.log(`   ${DRY_RUN ? 'Would update' : 'Updated'}: ${updated} lectures`);
  console.log(`   Skipped: ${skipped} lectures`);
  console.log(`   Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`   - #${e.shortId}: ${e.error}`));
  }

  if (DRY_RUN && updated > 0) {
    console.log('\nRun without --dry-run to apply changes.');
  }
}

// Main
async function main() {
  // Show usage if no arguments
  if (!seriesArg) {
    console.log(`
Usage: node scripts/translate-series-lectures.js <series-name-or-id> [options]

Options:
  --dry-run         Preview changes without applying
  --list            Just list lectures needing translation
  --file <path>     JSON file with translations { shortId: "English Title", ... }

Examples:
  node scripts/translate-series-lectures.js "محاضرات متفرقة" --list
  node scripts/translate-series-lectures.js 13 --dry-run --file translations.json
  node scripts/translate-series-lectures.js 12 --file khutba-translations.json
`);
    process.exit(1);
  }

  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not found. Create a .env file with your connection string.');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find the series
    const series = await findSeries(seriesArg);
    if (!series) {
      console.error(`❌ Series not found: "${seriesArg}"`);
      console.log('\nAvailable series:');
      const allSeries = await Series.find({}).sort({ shortId: 1 });
      allSeries.forEach(s => console.log(`  ${s.shortId}. ${s.titleArabic}`));
      process.exit(1);
    }

    if (LIST_ONLY) {
      await listLectures(series);
    } else {
      // Load translations
      if (!translationsFile) {
        console.error('❌ Please provide a translations file with --file <path>');
        console.log('   Or use --list to see lectures needing translation first.');
        process.exit(1);
      }

      const translations = loadTranslations(translationsFile);
      if (!translations) {
        process.exit(1);
      }

      await applyTranslations(series, translations);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
