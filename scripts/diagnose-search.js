/**
 * Read-only search diagnostic (cross-cluster).
 *
 * The transcripts live in the SEARCH cluster (SEARCH_MONGODB_URI); lecture/audio
 * metadata was moved to the MAIN cluster (MONGODB_URI). The app hydrates lecture
 * title/audio/link from the main DB after the transcript search
 * (routes/search.js → hydrateLectures). This script checks WHICH key still links
 * a transcript to a main-DB lecture — `_id` or the numeric `shortId` — so we know
 * how hydration must join.
 *
 * Usage:
 *   node scripts/diagnose-search.js "التوحيد ورود"
 *
 * Safe to run against production — it only reads.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const QUERY = process.argv[2] || 'الصلاة';

(async () => {
  const searchUri = process.env.SEARCH_MONGODB_URI;
  const mainUri = process.env.MONGODB_URI;
  if (!searchUri) { console.error('❌ SEARCH_MONGODB_URI not set'); process.exit(1); }
  if (!mainUri) { console.error('❌ MONGODB_URI not set'); process.exit(1); }

  const searchConn = await mongoose.createConnection(searchUri).asPromise();
  const mainConn = await mongoose.createConnection(mainUri).asPromise();
  console.log(`✅ search DB: ${searchConn.name} @ ${searchConn.host}`);
  console.log(`✅ main   DB: ${mainConn.name} @ ${mainConn.host}\n`);

  const transcripts = searchConn.db.collection('transcripts');
  const lectures = mainConn.db.collection('lectures');

  const tCount = await transcripts.countDocuments();
  const lCount = await lectures.countDocuments();
  console.log(`transcripts (search DB): ${tCount}`);
  console.log(`lectures    (main   DB): ${lCount}\n`);

  // Sample transcripts and test both possible join keys against the MAIN db.
  const sample = await transcripts.find({}, { projection: { lectureId: 1, shortId: 1, text: 1 } }).limit(20).toArray();
  let idHits = 0, shortIdHits = 0;
  const shortIdIsLecture = []; // where a lecture with that shortId exists, does its _id match lectureId?

  for (const t of sample) {
    const byId = t.lectureId ? await lectures.findOne({ _id: t.lectureId }, { projection: { _id: 1, shortId: 1, titleArabic: 1 } }) : null;
    const byShort = (t.shortId != null) ? await lectures.findOne({ shortId: t.shortId }, { projection: { _id: 1, shortId: 1, titleArabic: 1 } }) : null;
    if (byId) idHits++;
    if (byShort) shortIdHits++;
    if (byShort && t.lectureId) shortIdIsLecture.push(String(byShort._id) === String(t.lectureId));
  }

  console.log(`Of ${sample.length} sampled transcripts, a matching MAIN-DB lecture was found by:`);
  console.log(`   _id     : ${idHits}/${sample.length}`);
  console.log(`   shortId : ${shortIdHits}/${sample.length}`);
  const s0 = sample[0] || {};
  console.log(`\n   e.g. transcript.lectureId=${s0.lectureId}  transcript.shortId=${s0.shortId}`);
  if (shortIdHits) {
    const consistent = shortIdIsLecture.length && shortIdIsLecture.every(Boolean);
    console.log(`   (shortId→lecture._id ${consistent ? 'MATCHES' : 'does NOT match'} transcript.lectureId)`);
  }

  console.log('\n──────── VERDICT ────────');
  if (idHits === sample.length) {
    console.log('✅ Join by _id works — hydration should already populate titles/links.');
    console.log('   If titles are still blank, inspect the /search/api response for lectureId.');
  } else if (idHits === 0 && shortIdHits > 0) {
    console.log('❌ ROOT CAUSE: transcript.lectureId no longer matches any main-DB lecture _id');
    console.log('   (the migration regenerated lecture _ids), BUT transcript.shortId DOES match.');
    console.log('   FIX: hydrate by shortId instead of _id (numeric business key, migration-stable).');
  } else if (idHits === 0 && shortIdHits === 0) {
    console.log('❌ Neither _id NOR shortId matches — the main DB lectures are a different set,');
    console.log('   or MONGODB_URI points at the wrong DB. Verify the migration target.');
  } else {
    console.log(`⚠️  Partial: _id ${idHits}, shortId ${shortIdHits}. Prefer whichever is complete;`);
    console.log('   shortId is usually the safer, migration-stable key.');
  }

  await searchConn.close();
  await mainConn.close();
})().catch(e => { console.error(e); process.exit(1); });
