/**
 * Backfill lecture `duration` from imported transcripts (SEPARATE, owner-run).
 *
 * The transcript's max(endTimeMs) is the true audio length. Many lectures have
 * duration:0 / durationVerified:false; this fills them from the transcripts.
 *
 * Kept out of the importer on purpose (owner's call) so writes to the prod
 * `lectures` collection are an explicit, standalone, reviewable step.
 *
 * By default only fills lectures whose duration is missing/0 and leaves verified
 * durations alone. --overwrite updates every lecture that has transcripts.
 *
 * Usage:
 *   node scripts/update-lecture-durations-from-transcripts.js            # DRY RUN
 *   node scripts/update-lecture-durations-from-transcripts.js --apply    # write (fill only)
 *   node scripts/update-lecture-durations-from-transcripts.js --apply --overwrite
 *
 * Writes to the MAIN DB lectures collection (guarded by --apply).
 */
require('dotenv').config();
const mongoose = require('mongoose');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const OVERWRITE = args.includes('--overwrite');

(async () => {
  const mainUri = process.env.MONGODB_URI;
  const searchUri = process.env.SEARCH_MONGODB_URI;
  if (!mainUri || !searchUri) { console.error('❌ MONGODB_URI and SEARCH_MONGODB_URI must be set'); process.exit(1); }

  const mainConn = await mongoose.createConnection(mainUri).asPromise();
  const searchConn = await mongoose.createConnection(searchUri).asPromise();
  console.log(`✅ main DB:   ${mainConn.name}`);
  console.log(`✅ search DB: ${searchConn.name}`);
  console.log(APPLY ? '\n⚠️  APPLY — will WRITE lecture durations.\n' : '\n🧪 DRY RUN — no writes.\n');

  const lectures = mainConn.db.collection('lectures');
  const transcripts = searchConn.db.collection('transcripts');

  // Max endTimeMs per lecture from the transcripts.
  const maxByLecture = new Map();
  for await (const g of transcripts.aggregate([
    { $group: { _id: '$lectureId', maxEndMs: { $max: '$endTimeMs' } } }
  ])) {
    if (g._id && g.maxEndMs) maxByLecture.set(String(g._id), g.maxEndMs);
  }
  console.log(`lectures with transcripts: ${maxByLecture.size}`);

  let updated = 0, skipped = 0, missing = 0;
  for (const [lectureId, maxEndMs] of maxByLecture) {
    const durationSec = Math.round(maxEndMs / 1000);
    if (!durationSec) { missing++; continue; }
    const lecture = await lectures.findOne(
      { _id: new mongoose.Types.ObjectId(lectureId) },
      { projection: { _id: 1, duration: 1, durationVerified: 1 } }
    );
    if (!lecture) { missing++; continue; }
    const hasGood = lecture.duration > 0 && lecture.durationVerified === true;
    if (hasGood && !OVERWRITE) { skipped++; continue; }

    updated++;
    if (APPLY) {
      await lectures.updateOne(
        { _id: lecture._id },
        { $set: { duration: durationSec, durationVerified: true, updatedAt: new Date() } }
      );
    }
  }

  console.log('\n──────── REPORT ────────');
  console.log(`would update : ${updated}${APPLY ? ' (written)' : ' (dry-run)'}`);
  console.log(`left as-is   : ${skipped} (already verified; use --overwrite to force)`);
  console.log(`no lecture   : ${missing}`);
  if (!APPLY) console.log('\n🧪 DRY RUN complete — re-run with --apply to write.');

  await mainConn.close();
  await searchConn.close();
})().catch(e => { console.error(e); process.exit(1); });
