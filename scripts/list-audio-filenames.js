#!/usr/bin/env node
/**
 * List all audio filenames from the database
 *
 * Outputs one filename per line for easy comparison with local files.
 *
 * Usage:
 *   node scripts/list-audio-filenames.js [options]
 *
 * Options:
 *   --env FILE        Path to .env file (default: .env)
 *   --output FILE     Write to file instead of stdout
 *   --batch NAME      Filter by import batch
 *   --published       Only published lectures
 *   --unpublished     Only unpublished lectures
 *   --no-url          Only lectures without audioUrl (not yet uploaded)
 *   --has-url         Only lectures with audioUrl (already uploaded)
 *   --series NAME     Filter by series title (partial match)
 *   --count           Just show the count, don't list files
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const fs = require('fs');
const mongoose = require('mongoose');

const args = process.argv.slice(2);

function getArg(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

const OUTPUT = getArg('--output');
const BATCH = getArg('--batch');
const SERIES = getArg('--series');
const PUBLISHED_ONLY = args.includes('--published');
const UNPUBLISHED_ONLY = args.includes('--unpublished');
const NO_URL = args.includes('--no-url');
const HAS_URL = args.includes('--has-url');
const COUNT_ONLY = args.includes('--count');

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const lectureSchema = new mongoose.Schema({
    audioFileName: String,
    audioUrl: String,
    published: Boolean,
    seriesId: mongoose.Schema.Types.ObjectId,
    metadata: Object
  }, { collection: 'lectures', strict: false });

  const Lecture = mongoose.model('Lecture', lectureSchema);

  const query = { audioFileName: { $exists: true, $ne: null, $ne: '' } };

  if (PUBLISHED_ONLY) query.published = true;
  if (UNPUBLISHED_ONLY) query.published = { $ne: true };
  if (NO_URL) query.$or = [{ audioUrl: { $exists: false } }, { audioUrl: null }, { audioUrl: '' }];
  if (HAS_URL) query.audioUrl = { $exists: true, $ne: null, $ne: '' };
  if (BATCH) query['metadata.importBatch'] = BATCH;

  if (SERIES) {
    const seriesSchema = new mongoose.Schema({ titleArabic: String }, { collection: 'series', strict: false });
    const Series = mongoose.model('Series', seriesSchema);
    const matchingSeries = await Series.find({ titleArabic: { $regex: SERIES, $options: 'i' } }).select('_id').lean();
    if (matchingSeries.length === 0) {
      console.error(`No series matching "${SERIES}"`);
      await mongoose.disconnect();
      process.exit(1);
    }
    query.seriesId = { $in: matchingSeries.map(s => s._id) };
  }

  const lectures = await Lecture.find(query).select('audioFileName').lean();
  const filenames = lectures.map(l => l.audioFileName).filter(Boolean).sort();

  await mongoose.disconnect();

  if (COUNT_ONLY) {
    console.log(filenames.length);
    return;
  }

  const output = filenames.join('\n') + '\n';

  if (OUTPUT) {
    fs.writeFileSync(OUTPUT, output);
    console.error(`Wrote ${filenames.length} filenames to ${OUTPUT}`);
  } else {
    process.stdout.write(output);
    console.error(`\nTotal: ${filenames.length} files`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
