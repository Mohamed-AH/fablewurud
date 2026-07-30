/**
 * READ-ONLY pre-flight audit for the transcript import.
 *
 * Verifies the one thing that makes the CSV→lecture join safe: that the
 * audioFileName "stem" (filename without extension) is UNIQUE across all
 * lectures. A collision means a CSV named after that stem could map to more
 * than one lecture — those must be resolved before importing.
 *
 * If you pass a CSV directory, it also reports two-way coverage:
 *   - CSV files with no matching lecture (audio renamed / not in DB)
 *   - lectures with no CSV yet (not transcribed)
 *
 * Usage:
 *   node scripts/audit-transcript-mapping.js                 # stem-uniqueness only
 *   node scripts/audit-transcript-mapping.js ./transcripts   # + coverage vs a CSV dir
 *
 * Safe on production — only reads.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const csvDir = process.argv[2] || null;

// Strip a trailing audio/csv extension to get the join "stem"; normalize (NFC + trim).
const AUDIO_EXT = /\.(m4a|mp3|wav|ogg|aac|flac)$/i;
function audioStem(name) {
  return String(name || '').replace(AUDIO_EXT, '').normalize('NFC').trim();
}
function csvStem(name) {
  return String(name || '').replace(/\.csv$/i, '').normalize('NFC').trim();
}

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('❌ MONGODB_URI not set'); process.exit(1); }

  const conn = await mongoose.createConnection(uri).asPromise();
  console.log(`✅ main DB: ${conn.name} @ ${conn.host}\n`);
  const lectures = conn.db.collection('lectures');

  // Build stem → [lectures] map over everything that has an audioFileName.
  const cursor = lectures.find(
    { audioFileName: { $exists: true, $nin: [null, ''] } },
    { projection: { _id: 1, shortId: 1, audioFileName: 1, titleArabic: 1 } }
  );
  const byStem = new Map();
  let total = 0;
  for await (const l of cursor) {
    total++;
    const stem = audioStem(l.audioFileName);
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(l);
  }
  console.log(`lectures with an audioFileName: ${total}`);
  console.log(`distinct stems: ${byStem.size}`);

  // Report collisions (the blocker).
  const collisions = [...byStem.entries()].filter(([, arr]) => arr.length > 1);
  if (collisions.length) {
    console.log(`\n❌ ${collisions.length} AMBIGUOUS stem(s) — resolve before importing:`);
    collisions.slice(0, 50).forEach(([stem, arr]) => {
      console.log(`   "${stem}" → ${arr.map(l => `#${l.shortId}(${l.audioFileName})`).join('  ,  ')}`);
    });
    if (collisions.length > 50) console.log(`   … and ${collisions.length - 50} more`);
  } else {
    console.log('\n✅ All stems unique — the audioFileName join is safe.');
  }

  // Optional: coverage against a folder of vendor CSVs.
  if (csvDir) {
    if (!fs.existsSync(csvDir)) { console.error(`\n❌ CSV dir not found: ${csvDir}`); }
    else {
      const files = fs.readdirSync(csvDir).filter(f => f.toLowerCase().endsWith('.csv'));
      console.log(`\n── coverage vs ${files.length} CSV file(s) in ${csvDir} ──`);
      const csvStems = new Set(files.map(csvStem));
      const unmatched = files.filter(f => !byStem.has(csvStem(f)));
      const lecturesWithCsv = [...byStem.keys()].filter(s => csvStems.has(s)).length;
      console.log(`   CSVs matching a lecture : ${files.length - unmatched.length}/${files.length}`);
      console.log(`   lectures covered by CSVs: ${lecturesWithCsv}/${byStem.size}`);
      if (unmatched.length) {
        console.log(`   ⚠️  ${unmatched.length} CSV(s) with NO matching lecture:`);
        unmatched.slice(0, 30).forEach(f => console.log(`        ${f}`));
        if (unmatched.length > 30) console.log(`        … and ${unmatched.length - 30} more`);
      }
    }
  }

  await conn.close();
})().catch(e => { console.error(e); process.exit(1); });
