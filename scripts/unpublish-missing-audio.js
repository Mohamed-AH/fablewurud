#!/usr/bin/env node
/**
 * Unpublish Lectures with Missing Audio
 * Sets published=false for records in missing-locally.json
 *
 * Usage: node scripts/unpublish-missing-audio.js --missing missing-locally.json --env .env [--dry-run]
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const fs = require('fs');
const mongoose = require('mongoose');

// Parse arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const missingIndex = args.indexOf('--missing');
const MISSING_FILE = missingIndex !== -1 ? args[missingIndex + 1] : 'missing-locally.json';

if (!fs.existsSync(MISSING_FILE)) {
  console.error(`\n❌ File not found: ${MISSING_FILE}`);
  process.exit(1);
}

// Stats
const stats = {
  total: 0,
  unpublished: 0,
  notFound: 0,
  alreadyUnpublished: 0,
  errors: []
};

async function main() {
  console.log('\n📝 Unpublish Lectures with Missing Audio');
  console.log('═════════════════════════════════════════');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '⚡ LIVE'}`);
  console.log(`Input: ${MISSING_FILE}`);
  console.log('');

  // Load missing files
  const data = JSON.parse(fs.readFileSync(MISSING_FILE, 'utf-8'));
  const missing = Array.isArray(data) ? data : data.files || [];
  stats.total = missing.length;

  console.log(`📋 Found ${missing.length} records to unpublish\n`);

  if (missing.length === 0) {
    console.log('No records to process.');
    return;
  }

  // Connect to MongoDB
  console.log('📊 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('   Connected\n');

  // Define schema
  const lectureSchema = new mongoose.Schema({
    audioFileName: String,
    titleArabic: String,
    titleEnglish: String,
    published: Boolean
  }, { collection: 'lectures', strict: false });

  const Lecture = mongoose.model('Lecture', lectureSchema);

  // Process each record
  const unpublishedList = [];

  for (let i = 0; i < missing.length; i++) {
    const item = missing[i];
    const progress = `[${i + 1}/${missing.length}]`;
    const filename = item.filename;

    try {
      // Find lecture by audioFileName
      const lecture = await Lecture.findOne({ audioFileName: filename });

      if (!lecture) {
        console.log(`${progress} ⚠️  Not found: ${filename}`);
        stats.notFound++;
        continue;
      }

      if (lecture.published === false) {
        console.log(`${progress} ⏭️  Already unpublished: ${filename}`);
        stats.alreadyUnpublished++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`${progress} 🔍 Would unpublish: ${item.title || filename}`);
        stats.unpublished++;
        unpublishedList.push({
          filename,
          title: item.title,
          _id: lecture._id
        });
      } else {
        await Lecture.updateOne(
          { _id: lecture._id },
          { $set: { published: false } }
        );
        console.log(`${progress} ✅ Unpublished: ${item.title || filename}`);
        stats.unpublished++;
        unpublishedList.push({
          filename,
          title: item.title,
          _id: lecture._id
        });
      }
    } catch (error) {
      console.log(`${progress} ❌ Error: ${error.message}`);
      stats.errors.push({ filename, error: error.message });
    }
  }

  // Save list of unpublished lectures (for re-publishing later)
  if (unpublishedList.length > 0) {
    fs.writeFileSync('unpublished-lectures.json', JSON.stringify({
      unpublishedAt: new Date().toISOString(),
      reason: 'Missing audio files',
      total: unpublishedList.length,
      lectures: unpublishedList
    }, null, 2));
  }

  // Summary
  console.log('\n═════════════════════════════════════════');
  console.log('📊 Summary');
  console.log('═════════════════════════════════════════');
  console.log(`Total records:        ${stats.total}`);
  console.log(`Unpublished:          ${stats.unpublished}`);
  console.log(`Already unpublished:  ${stats.alreadyUnpublished}`);
  console.log(`Not found in DB:      ${stats.notFound}`);
  console.log(`Errors:               ${stats.errors.length}`);

  if (unpublishedList.length > 0) {
    console.log(`\n📄 Saved: unpublished-lectures.json`);
    console.log(`   (Keep this to re-publish later once audio is restored)`);
  }

  if (DRY_RUN) {
    console.log('\n💡 Dry run complete. Remove --dry-run to unpublish.');
  }

  console.log('');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
