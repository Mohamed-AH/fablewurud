/**
 * Generate slugs for all existing Lectures, Series, and Sheikhs
 *
 * Usage: node scripts/generate-slugs.js [--dry-run]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const {
  generateSlug,
  generateUniqueSlug,
  generateLectureSlug,
  generateSeriesSlug,
  generateSheikhSlug
} = require('../utils/slugify');

async function generateSlugs() {
  const isDryRun = process.argv.includes('--dry-run');

  if (isDryRun) {
    console.log('=== DRY RUN MODE - No changes will be made ===\n');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const Lecture = require('../models/Lecture');
  const Series = require('../models/Series');
  const Sheikh = require('../models/Sheikh');

  // Track existing slugs to ensure uniqueness
  const existingSlugs = {
    lectures: new Set(),
    series: new Set(),
    sheikhs: new Set()
  };

  // ========== SHEIKHS ==========
  console.log('--- Processing Sheikhs ---\n');
  const sheikhs = await Sheikh.find({}).lean();
  let sheikhsUpdated = 0;
  let sheikhsSkipped = 0;

  for (const sheikh of sheikhs) {
    if (sheikh.slug) {
      existingSlugs.sheikhs.add(sheikh.slug);
      console.log('✓ Already has slug:', sheikh.nameArabic, '→', sheikh.slug);
      sheikhsSkipped++;
      continue;
    }

    const baseSlug = generateSheikhSlug(sheikh);
    const slug = await generateUniqueSlug(baseSlug, async (s) => {
      if (existingSlugs.sheikhs.has(s)) return true;
      const existing = await Sheikh.findOne({ slug: s, _id: { $ne: sheikh._id } });
      return !!existing;
    });

    existingSlugs.sheikhs.add(slug);
    console.log('📝 Generating:', sheikh.nameArabic, '→', slug);

    if (!isDryRun) {
      await Sheikh.updateOne({ _id: sheikh._id }, { $set: { slug } });
    }
    sheikhsUpdated++;
  }

  console.log('\nSheikhs: Updated', sheikhsUpdated, '| Skipped', sheikhsSkipped, '\n');

  // ========== SERIES ==========
  console.log('--- Processing Series ---\n');
  const allSeries = await Series.find({}).lean();
  let seriesUpdated = 0;
  let seriesSkipped = 0;

  for (const series of allSeries) {
    if (series.slug) {
      existingSlugs.series.add(series.slug);
      console.log('✓ Already has slug:', series.titleArabic.substring(0, 40), '→', series.slug);
      seriesSkipped++;
      continue;
    }

    const baseSlug = generateSeriesSlug(series);
    const slug = await generateUniqueSlug(baseSlug, async (s) => {
      if (existingSlugs.series.has(s)) return true;
      const existing = await Series.findOne({ slug: s, _id: { $ne: series._id } });
      return !!existing;
    });

    existingSlugs.series.add(slug);
    console.log('📝 Generating:', series.titleArabic.substring(0, 40), '→', slug);

    if (!isDryRun) {
      await Series.updateOne({ _id: series._id }, { $set: { slug } });
    }
    seriesUpdated++;
  }

  console.log('\nSeries: Updated', seriesUpdated, '| Skipped', seriesSkipped, '\n');

  // ========== LECTURES ==========
  console.log('--- Processing Lectures ---\n');

  // Build series lookup map
  const seriesMap = new Map();
  const seriesWithSlugs = await Series.find({}).lean();
  for (const s of seriesWithSlugs) {
    seriesMap.set(s._id.toString(), s);
  }

  const lectures = await Lecture.find({}).lean();
  let lecturesUpdated = 0;
  let lecturesSkipped = 0;

  for (const lecture of lectures) {
    if (lecture.slug) {
      existingSlugs.lectures.add(lecture.slug);
      lecturesSkipped++;
      continue;
    }

    const series = lecture.seriesId ? seriesMap.get(lecture.seriesId.toString()) : null;
    const baseSlug = generateLectureSlug(lecture, series);
    const slug = await generateUniqueSlug(baseSlug, async (s) => {
      if (existingSlugs.lectures.has(s)) return true;
      const existing = await Lecture.findOne({ slug: s, _id: { $ne: lecture._id } });
      return !!existing;
    });

    existingSlugs.lectures.add(slug);

    if (lecturesUpdated < 10) {
      console.log('📝 Generating:', lecture.titleArabic.substring(0, 30), '→', slug);
    } else if (lecturesUpdated === 10) {
      console.log('... (showing first 10 only)');
    }

    if (!isDryRun) {
      await Lecture.updateOne({ _id: lecture._id }, { $set: { slug } });
    }
    lecturesUpdated++;
  }

  console.log('\nLectures: Updated', lecturesUpdated, '| Skipped', lecturesSkipped, '\n');

  // ========== SUMMARY ==========
  console.log('=== SUMMARY ===');
  console.log('Sheikhs:', sheikhsUpdated, 'updated');
  console.log('Series:', seriesUpdated, 'updated');
  console.log('Lectures:', lecturesUpdated, 'updated');

  if (isDryRun) {
    console.log('\n=== DRY RUN - No changes made. Run without --dry-run to apply. ===');
  }

  await mongoose.disconnect();
  console.log('\nDone!');
}

generateSlugs().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
