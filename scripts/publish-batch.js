#!/usr/bin/env node
/**
 * Publish Import Batch
 *
 * Sets published=true for all lectures in a specific import batch.
 * Only publishes lectures that have audio files uploaded (audioUrl set).
 *
 * Usage:
 *   node scripts/publish-batch.js --batch <name> [options]
 *
 * Options:
 *   --batch <name>      Import batch to publish (required)
 *   --dry-run           Preview without updating
 *   --force             Publish even without audioUrl
 *   --env <path>        Path to .env file (default: .env)
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const mongoose = require('mongoose');
const Lecture = require('../models/Lecture');

// Parse args
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--') ? args[idx + 1] : null;
}

const BATCH_NAME = getArg('--batch');
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');

if (!BATCH_NAME) {
  console.log(`
Usage: node scripts/publish-batch.js --batch <name> [options]

Options:
  --batch <name>   Import batch to publish (required)
  --dry-run        Preview without updating
  --force          Publish even without audioUrl
  --env <path>     Path to .env file

Example:
  node scripts/publish-batch.js --batch june2026 --dry-run
`);
  process.exit(1);
}

async function main() {
  console.log('═'.repeat(60));
  console.log('  PUBLISH IMPORT BATCH');
  console.log('═'.repeat(60));
  console.log(`\n  Batch: ${BATCH_NAME}`);
  console.log(`  Mode:  ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Force: ${FORCE ? 'Yes' : 'No'}`);

  // Connect
  console.log('\n📊 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('   Connected');

  // Find lectures
  const query = {
    'metadata.importBatch': BATCH_NAME,
    published: false
  };

  if (!FORCE) {
    query.audioUrl = { $exists: true, $ne: '' };
  }

  const lectures = await Lecture.find(query).select('titleArabic audioFileName audioUrl');

  console.log(`\n📚 Found ${lectures.length} unpublished lectures in batch "${BATCH_NAME}"`);

  if (lectures.length === 0) {
    // Check if any exist at all
    const total = await Lecture.countDocuments({ 'metadata.importBatch': BATCH_NAME });
    const published = await Lecture.countDocuments({ 'metadata.importBatch': BATCH_NAME, published: true });
    const noAudio = await Lecture.countDocuments({
      'metadata.importBatch': BATCH_NAME,
      published: false,
      $or: [{ audioUrl: { $exists: false } }, { audioUrl: '' }]
    });

    console.log(`\n  Stats for batch "${BATCH_NAME}":`);
    console.log(`    Total lectures:     ${total}`);
    console.log(`    Already published:  ${published}`);
    console.log(`    Missing audio:      ${noAudio}`);

    if (noAudio > 0 && !FORCE) {
      console.log('\n  💡 Use --force to publish lectures without audio.');
    }

    await mongoose.connection.close();
    return;
  }

  // Preview
  console.log('\n  Lectures to publish:');
  lectures.slice(0, 10).forEach(l => {
    const hasAudio = l.audioUrl ? '✅' : '⚠️';
    console.log(`    ${hasAudio} ${l.titleArabic || l.audioFileName}`);
  });
  if (lectures.length > 10) {
    console.log(`    ... and ${lectures.length - 10} more`);
  }

  if (DRY_RUN) {
    console.log(`\n  ⚠️  DRY RUN - Would publish ${lectures.length} lectures.`);
  } else {
    const result = await Lecture.updateMany(
      { _id: { $in: lectures.map(l => l._id) } },
      { $set: { published: true } }
    );

    console.log(`\n  ✅ Published ${result.modifiedCount} lectures.`);
  }

  // Final stats
  const stats = {
    total: await Lecture.countDocuments({ 'metadata.importBatch': BATCH_NAME }),
    published: await Lecture.countDocuments({ 'metadata.importBatch': BATCH_NAME, published: true })
  };

  console.log('\n' + '═'.repeat(60));
  console.log('  BATCH STATUS');
  console.log('═'.repeat(60));
  console.log(`  Total:     ${stats.total}`);
  console.log(`  Published: ${stats.published}`);
  console.log(`  Remaining: ${stats.total - stats.published}`);
  console.log('═'.repeat(60));

  await mongoose.connection.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
