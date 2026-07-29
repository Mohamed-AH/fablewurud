/**
 * Read-only search diagnostic.
 *
 * Confirms whether the SEARCH database (SEARCH_MONGODB_URI) can actually power
 * the site's transcript search — specifically whether the `$lookup` from the
 * `transcripts` collection to a `lectures` collection (which MUST live in the
 * SAME search DB) hydrates lecture title / audio / link fields.
 *
 * The homepage renders each result's play button, title and "go to lecture"
 * link entirely from those hydrated fields, so if the lookup returns null the
 * search "returns results" but they're unusable.
 *
 * Usage:
 *   node scripts/diagnose-search.js "هود ورود"
 *
 * Safe to run against production — it only reads.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const QUERY = process.argv[2] || 'الصلاة';

(async () => {
  const uri = process.env.SEARCH_MONGODB_URI;
  if (!uri) { console.error('❌ SEARCH_MONGODB_URI not set'); process.exit(1); }

  const conn = await mongoose.createConnection(uri).asPromise();
  console.log(`✅ Connected to search DB: ${conn.name} @ ${conn.host}\n`);

  const db = conn.db;

  // 1) What collections exist, and how big?
  const cols = (await db.listCollections().toArray()).map(c => c.name);
  console.log('Collections in the search DB:', cols.join(', ') || '(none)');
  const has = name => cols.includes(name);

  const transcripts = db.collection('transcripts');
  const lectures = db.collection('lectures');

  const tCount = has('transcripts') ? await transcripts.countDocuments() : 0;
  const lCount = has('lectures') ? await lectures.countDocuments() : 0;
  console.log(`  transcripts: ${has('transcripts') ? tCount : 'MISSING'}`);
  console.log(`  lectures   : ${has('lectures') ? lCount : 'MISSING ❌  <-- $lookup cannot hydrate without this'}\n`);

  if (!has('transcripts') || tCount === 0) {
    console.error('❌ No transcripts in this DB — wrong SEARCH_MONGODB_URI or not imported.');
    await conn.close(); process.exit(2);
  }

  // 2) Does a sample transcript's lectureId resolve to a lecture in THIS db?
  const sample = await transcripts.findOne({}, { projection: { lectureId: 1, text: 1 } });
  console.log(`Sample transcript.lectureId: ${sample.lectureId}`);
  if (has('lectures')) {
    const match = await lectures.findOne({ _id: sample.lectureId }, { projection: { titleArabic: 1, shortId: 1, audioUrl: 1, audioFileName: 1 } });
    if (match) {
      console.log('  ✅ matching lecture found:', {
        title: match.titleArabic, shortId: match.shortId,
        audio: match.audioUrl || match.audioFileName || '(none)'
      });
    } else {
      console.log('  ❌ NO lecture with that _id in the search DB — lectureId/_id mismatch.');
      console.log('     (transcripts reference lecture _ids that this DB\'s lectures collection does not contain.)');
    }
  }
  console.log('');

  // 3) Run the REAL pipeline (Atlas $search) for the given query and report hydration.
  console.log(`Running Atlas $search for: "${QUERY}"`);
  let rows;
  try {
    rows = await transcripts.aggregate([
      { $search: { index: 'default', compound: { should: [
        { phrase: { query: QUERY, path: 'text', slop: 2, score: { boost: { value: 5 } } } },
        { text: { query: QUERY, path: 'text', fuzzy: { maxEdits: 1 } } }
      ], minimumShouldMatch: 1 } } },
      { $limit: 20 },
      { $lookup: { from: 'lectures', localField: 'lectureId', foreignField: '_id', as: 'lecture' } },
      { $unwind: { path: '$lecture', preserveNullAndEmptyArrays: true } },
      { $project: {
        text: 1,
        lectureId: 1,
        lectureTitle: '$lecture.titleArabic',
        lectureShortId: '$lecture.shortId',
        audioUrl: '$lecture.audioUrl',
        audioFileName: '$lecture.audioFileName'
      } }
    ]).toArray();
  } catch (e) {
    console.error(`  ❌ $search failed: ${e.message}`);
    console.error('     → the Atlas Search index "default" may be missing/mis-named on the transcripts collection.');
    await conn.close(); process.exit(3);
  }

  console.log(`  matched ${rows.length} transcript rows`);
  const hydrated = rows.filter(r => r.lectureTitle || r.audioUrl || r.audioFileName || r.lectureShortId).length;
  console.log(`  hydrated with lecture data: ${hydrated} / ${rows.length}`);
  console.log('  sample rows:');
  rows.slice(0, 3).forEach((r, i) => console.log(`   [${i}] title=${r.lectureTitle || 'NULL'} | shortId=${r.lectureShortId || 'NULL'} | audio=${r.audioUrl || r.audioFileName || 'NULL'}`));

  console.log('\n──────── VERDICT ────────');
  if (rows.length === 0) {
    console.log('Search index works but this query matched nothing. Try another query.');
  } else if (hydrated === 0) {
    console.log('❌ CONFIRMS the split: this search DB has NO usable `lectures` collection,');
    console.log('   so an in-DB $lookup can\'t hydrate. This is expected now that lecture/audio');
    console.log('   metadata was moved to a separate (main) cluster.');
    console.log('   FIX (already applied in code): routes/search.js no longer $lookup\'s here —');
    console.log('   it hydrates title/audio/link from the MAIN DB via hydrateLectures(). Deploy');
    console.log('   the updated code; no need to copy lectures back into the search DB.');
  } else if (hydrated < rows.length) {
    console.log('⚠️  PARTIAL in-DB hydration — irrelevant once the app hydrates from the main');
    console.log('   DB (routes/search.js hydrateLectures). Deploy the updated code.');
  } else {
    console.log('ℹ️  This search DB still co-locates a lectures copy, so the old path would work,');
    console.log('   but the app now hydrates from the MAIN DB regardless (routes/search.js).');
  }

  await conn.close();
})().catch(e => { console.error(e); process.exit(1); });
