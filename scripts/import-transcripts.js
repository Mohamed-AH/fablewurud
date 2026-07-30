/**
 * Import vendor transcript CSVs into the search DB, enriched with lecture metadata.
 *
 * Mapping: each CSV is named after the source audio file with a .csv extension
 * (e.g. 18Fiqhmuyassar.csv → lecture.audioFileName "18Fiqhmuyassar.m4a"). We join
 * on the filename STEM (name without extension). Every transcript row is enriched
 * with realm / sheikhId / seriesId / seriesTitle / dateRecorded / audioFileName so
 * search can filter without a cross-collection join.
 *
 * CSV columns: start,end,text,speaker   (start/end are MILLISECONDS)
 *
 * Idempotent per lecture: a matched lecture's existing transcripts are replaced.
 * Resumable: --skip-existing skips lectures that already have transcripts (cheap
 * re-runs as ~100 CSVs/day arrive).
 *
 * Usage:
 *   node scripts/import-transcripts.js ./transcripts                 # DRY RUN (default)
 *   node scripts/import-transcripts.js ./transcripts --apply         # write
 *   node scripts/import-transcripts.js ./transcripts --apply --skip-existing
 *   node scripts/import-transcripts.js ./transcripts --limit 100     # first N files
 *
 * Writes only to the SEARCH DB transcripts collection. Never touches lectures.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SKIP_EXISTING = args.includes('--skip-existing');
const limIdx = args.indexOf('--limit');
const LIMIT = limIdx !== -1 && args[limIdx + 1] ? parseInt(args[limIdx + 1], 10) : null;
const csvDir = args.find(a => !a.startsWith('--') && a !== String(LIMIT));

const AUDIO_EXT = /\.(m4a|mp3|wav|ogg|aac|flac)$/i;
const audioStem = n => String(n || '').replace(AUDIO_EXT, '').normalize('NFC').trim();
const csvStem = n => String(n || '').replace(/\.csv$/i, '').normalize('NFC').trim();

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(file)
      .pipe(csv())
      .on('data', r => rows.push(r))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

(async () => {
  if (!csvDir) { console.error('Usage: node scripts/import-transcripts.js <csvDir> [--apply] [--skip-existing] [--limit N]'); process.exit(1); }
  if (!fs.existsSync(csvDir)) { console.error(`❌ CSV dir not found: ${csvDir}`); process.exit(1); }
  const mainUri = process.env.MONGODB_URI;
  const searchUri = process.env.SEARCH_MONGODB_URI;
  if (!mainUri || !searchUri) { console.error('❌ MONGODB_URI and SEARCH_MONGODB_URI must be set'); process.exit(1); }

  const mainConn = await mongoose.createConnection(mainUri).asPromise();
  const searchConn = await mongoose.createConnection(searchUri).asPromise();
  console.log(`✅ main DB:   ${mainConn.name} @ ${mainConn.host}`);
  console.log(`✅ search DB: ${searchConn.name} @ ${searchConn.host}`);
  console.log(APPLY ? '\n⚠️  APPLY mode — will WRITE transcripts.\n' : '\n🧪 DRY RUN — no writes. Add --apply to commit.\n');

  const lectures = mainConn.db.collection('lectures');
  const sheikhs = mainConn.db.collection('sheikhs');
  const series = mainConn.db.collection('series');
  const transcripts = searchConn.db.collection('transcripts');

  // Realm per sheikh: nameArabic contains النجمي ⇒ najmi, else hasan.
  const realmBySheikh = new Map();
  for await (const s of sheikhs.find({}, { projection: { _id: 1, nameArabic: 1 } })) {
    realmBySheikh.set(String(s._id), /النجمي/.test(s.nameArabic || '') ? 'najmi' : 'hasan');
  }
  // Series titles.
  const seriesTitleById = new Map();
  for await (const s of series.find({}, { projection: { _id: 1, titleArabic: 1 } })) {
    seriesTitleById.set(String(s._id), s.titleArabic || '');
  }
  // Lecture stem → lecture (skip ambiguous stems — the audit flags these).
  const byStem = new Map();
  const ambiguous = new Set();
  for await (const l of lectures.find(
    { audioFileName: { $exists: true, $nin: [null, ''] } },
    { projection: { _id: 1, shortId: 1, audioFileName: 1, sheikhId: 1, seriesId: 1, dateRecorded: 1, dateRecordedHijri: 1 } }
  )) {
    const stem = audioStem(l.audioFileName);
    if (byStem.has(stem)) { ambiguous.add(stem); continue; }
    byStem.set(stem, l);
  }
  ambiguous.forEach(s => byStem.delete(s));
  console.log(`Indexed ${byStem.size} lectures by unique stem (${ambiguous.size} ambiguous stems skipped).\n`);

  let files = fs.readdirSync(csvDir).filter(f => f.toLowerCase().endsWith('.csv')).sort();
  if (LIMIT) files = files.slice(0, LIMIT);

  const report = { files: files.length, matched: 0, unmatched: [], ambiguous: [], skipped: 0, rowsWritten: 0, lecturesWritten: 0 };

  for (const file of files) {
    const stem = csvStem(file);
    if (ambiguous.has(stem)) { report.ambiguous.push(file); continue; }
    const lecture = byStem.get(stem);
    if (!lecture) { report.unmatched.push(file); continue; }
    report.matched++;

    if (SKIP_EXISTING) {
      const existing = await transcripts.countDocuments({ lectureId: lecture._id });
      if (existing > 0) { report.skipped++; continue; }
    }

    const rows = await parseCsv(path.join(csvDir, file));
    const realm = realmBySheikh.get(String(lecture.sheikhId)) || 'hasan';
    const seriesTitle = lecture.seriesId ? (seriesTitleById.get(String(lecture.seriesId)) || '') : '';

    const docs = rows.map(r => {
      const startMs = parseInt(r.start, 10) || 0;
      const endMs = r.end != null && r.end !== '' ? parseInt(r.end, 10) : undefined;
      return {
        lectureId: lecture._id,
        shortId: lecture.shortId,
        text: (r.text || '').trim(),
        speaker: (r.speaker || '').trim() || undefined,
        startTimeSec: Math.round(startMs / 1000),
        startTimeMs: startMs,
        endTimeMs: endMs,
        sourceCsv: file,
        audioFileName: lecture.audioFileName,
        realm,
        sheikhId: lecture.sheikhId,
        seriesId: lecture.seriesId,
        seriesTitle,
        dateRecorded: lecture.dateRecorded,
        dateRecordedHijri: lecture.dateRecordedHijri
      };
    }).filter(d => d.text); // drop empty-text rows

    if (APPLY) {
      await transcripts.deleteMany({ lectureId: lecture._id }); // idempotent replace
      if (docs.length) await transcripts.insertMany(docs, { ordered: false });
    }
    report.rowsWritten += docs.length;
    report.lecturesWritten++;
    if (report.lecturesWritten % 25 === 0) console.log(`  … ${report.lecturesWritten} lectures processed`);
  }

  console.log('\n──────── REPORT ────────');
  console.log(`CSV files            : ${report.files}`);
  console.log(`matched a lecture    : ${report.matched}`);
  console.log(`skipped (existing)   : ${report.skipped}`);
  console.log(`lectures written     : ${report.lecturesWritten}${APPLY ? '' : ' (dry-run)'}`);
  console.log(`transcript rows      : ${report.rowsWritten}${APPLY ? '' : ' (dry-run)'}`);
  console.log(`unmatched CSVs       : ${report.unmatched.length}`);
  report.unmatched.slice(0, 20).forEach(f => console.log(`   ✗ ${f}`));
  if (report.unmatched.length > 20) console.log(`   … and ${report.unmatched.length - 20} more`);
  if (report.ambiguous.length) {
    console.log(`ambiguous-stem CSVs  : ${report.ambiguous.length} (fix via the audit)`);
    report.ambiguous.slice(0, 20).forEach(f => console.log(`   ! ${f}`));
  }
  if (!APPLY) console.log('\n🧪 DRY RUN complete — re-run with --apply to write.');

  await mainConn.close();
  await searchConn.close();
})().catch(e => { console.error(e); process.exit(1); });
