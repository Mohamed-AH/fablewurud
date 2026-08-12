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

  // Does the SEARCH cluster still hold a (co-located) lectures collection from
  // before the split? If so, transcript.lectureId likely matches IT, and its
  // audioFileName can bridge to the current main-DB lecture (stable content key).
  console.log('── search-cluster lectures (bridge candidate) ──');
  const searchCols = (await searchConn.db.listCollections().toArray()).map(c => c.name);
  if (searchCols.includes('lectures')) {
    const searchLectures = searchConn.db.collection('lectures');
    const slCount = await searchLectures.countDocuments();
    console.log(`   search DB HAS a lectures collection: ${slCount} docs`);
    let bridged = 0;
    for (const t of sample) {
      if (!t.lectureId) continue;
      const old = await searchLectures.findOne({ _id: t.lectureId }, { projection: { audioFileName: 1 } });
      if (old && old.audioFileName) {
        const cur = await lectures.findOne({ audioFileName: old.audioFileName }, { projection: { _id: 1, shortId: 1 } });
        if (cur) bridged++;
      }
    }
    console.log(`   bridged via lectureId→audioFileName→main lecture: ${bridged}/${sample.length}`);
    if (bridged) console.log('   ✅ BRIDGE WORKS — re-key transcripts by audioFileName (one-time migration).');
  } else {
    console.log('   search DB has NO lectures collection — bridge source unavailable here.');
  }
  console.log('');

  // Profile the main-DB lectures so we can tell "wrong DB" from "different keying".
  console.log('\n── main-DB lecture profile ──');
  const lSample = await lectures.find({}, { projection: { _id: 1, shortId: 1, titleArabic: 1, audioFileName: 1 } }).limit(3).toArray();
  lSample.forEach((l, i) => console.log(`   [${i}] _id=${l._id} shortId=${l.shortId} (type ${typeof l.shortId}) title=${(l.titleArabic || '').slice(0, 30)}`));
  const withShort = await lectures.countDocuments({ shortId: { $exists: true, $ne: null } });
  console.log(`   lectures with a shortId: ${withShort}/${lCount}`);
  const nums = await lectures.find({ shortId: { $type: 'number' } }).sort({ shortId: 1 }).limit(1).toArray();
  const numsMax = await lectures.find({ shortId: { $type: 'number' } }).sort({ shortId: -1 }).limit(1).toArray();
  if (nums[0]) console.log(`   numeric shortId range: ${nums[0].shortId} .. ${numsMax[0].shortId}`);
  // Does the sampled transcript's shortId exist as a STRING (type mismatch)?
  if (s0.shortId != null) {
    const asStr = await lectures.findOne({ shortId: String(s0.shortId) }, { projection: { _id: 1 } });
    if (asStr) console.log(`   ⚠️  lecture with shortId as STRING "${s0.shortId}" exists — type mismatch (number vs string)`);
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
