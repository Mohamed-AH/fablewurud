#!/usr/bin/env node
/**
 * Import Sheikh Ahmed Al-Najmi's lectures from the metadata CSV (Run on Cloud VM)
 *
 * The generic Excel importer builds each lecture title as "SeriesName - Sequence",
 * which discards the real per-lecture titles. This CSV *has* meaningful titles
 * (e.g. "ألهاكم التكاثر"), so this adapter imports them directly while reusing the
 * same Sheikh/Series/Lecture models and the standard batch/manifest workflow.
 *
 * After this, the existing pipeline is reused unchanged:
 *   upload:  node scripts/upload-to-r2-local.js /path/to/audio --skip-existing
 *   verify:  node scripts/upload-to-oci-verify.js --manifest upload-manifest.json
 *   publish: node scripts/publish-batch.js --batch najmi
 *
 * Usage:
 *   node scripts/import-najmi-lectures.js lectures_metadata_final.csv [options]
 *
 * Options:
 *   --batch NAME    Batch identifier (default: "najmi")
 *   --sheikh NAME   Sheikh Arabic name (default: "أحمد بن يحيى النجمي")
 *   --dry-run       Preview without writing
 *   --env FILE      Path to .env file (default: .env)
 *
 * CSV columns: file-name, lecture-title, sequence-inseries, date-hirji, date-gregorian, category, source-url
 *   NOTE: the "category" column holds the SERIES name (54 distinct series).
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';
require('dotenv').config({ path: envPath });

const path = require('path');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const { Sheikh, Series, Lecture } = require('../models');

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
}
const CSV_FILE = args.find(a => !a.startsWith('--') && a !== envPath
  && args[args.indexOf(a) - 1] !== '--env'
  && args[args.indexOf(a) - 1] !== '--batch'
  && args[args.indexOf(a) - 1] !== '--sheikh');
const BATCH = getArg('--batch', 'najmi');
const SHEIKH_NAME = getArg('--sheikh', 'أحمد بن يحيى النجمي');
const DRY_RUN = args.includes('--dry-run');

if (!CSV_FILE) {
  console.log('Usage: node scripts/import-najmi-lectures.js <csv-file> [--batch najmi] [--dry-run]');
  process.exit(1);
}

// Heuristic: map a series name to the site's Category enum by keyword.
function categoryForSeries(name) {
  const s = String(name || '');
  const has = (...ws) => ws.some(w => s.includes(w));
  if (has('تفسير', 'قرآني', 'قرآنية', 'لقاءات قرآنية')) return 'Tafsir';
  if (has('صحيح مسلم', 'الأربعين', 'عمدة الأحكام', 'حديثية', 'البيقونية', 'نيل الأوطار', 'أعلام السنة')) return 'Hadith';
  if (has('عقدية', 'العقيدة', 'الواسطية', 'أصول السنة', 'الأصول الثلاثة', 'نواقض', 'الجماعات', 'التوسل')) return 'Aqeedah';
  if (has('الصلاة', 'الحج', 'العمرة', 'النكاح', 'الطلاق', 'البيوع', 'الصيام', 'الطهارة', 'الزكاة',
          'الأيمان', 'النذور', 'الأطعمة', 'الفرائض', 'الحدود', 'العتق', 'الجهاد', 'الهدي', 'الاضاحي',
          'تأسيس الأحكام', 'أخصر المختصرات', 'صفة الحج', 'صلاة العيدين', 'القضاء', 'الجنايات')) return 'Fiqh';
  if (has('سيرة', 'مواقف تربوية')) return 'Seerah';
  return 'Other';
}

// Strip any embedded URL and tidy whitespace from a raw title cell.
function cleanTitle(raw) {
  let t = String(raw || '').trim();
  const httpIdx = t.search(/https?:\/\//i);
  if (httpIdx !== -1) t = t.slice(0, httpIdx).trim();
  return t.replace(/\s+/g, ' ').trim();
}

function toM4a(fileName) {
  const base = path.basename(String(fileName || '').trim(), path.extname(fileName || ''));
  return base ? base + '.m4a' : null;
}

async function findOrCreateSheikh(name) {
  let sheikh = await Sheikh.findOne({ nameArabic: name })
    || await Sheikh.findOne({ nameArabic: `الشيخ ${name}` })
    || await Sheikh.findOne({ nameArabic: name.replace('الشيخ ', '') })
    // Fallback: the record may store a title-prefixed name (e.g. "الشيخ العلامة … النجمي")
    || await Sheikh.findOne({ nameArabic: /النجمي/ });
  if (sheikh) return sheikh;
  if (DRY_RUN) return { _id: new mongoose.Types.ObjectId(), nameArabic: name, isNew: true };
  sheikh = new Sheikh({ nameArabic: name, honorific: 'رحمه الله', titlePrefix: 'الشيخ العلامة', titlePrefixEnglish: 'Sheikh al-‘Allāmah' });
  await sheikh.save();
  console.log(`  ➕ Created sheikh: ${name} (shortId ${sheikh.shortId})`);
  return sheikh;
}

async function findOrCreateSeries(title, sheikhId, cache) {
  if (cache[title]) return cache[title];
  let series = await Series.findOne({ sheikhId, titleArabic: title });
  if (!series && !DRY_RUN) {
    series = new Series({
      titleArabic: title,
      sheikhId,
      category: categoryForSeries(title),
      tags: ['najmi', 'النجمي'],
      isVisible: true
    });
    await series.save();
    console.log(`  ➕ Series: ${title} [${series.category}]`);
  } else if (!series && DRY_RUN) {
    series = { _id: new mongoose.Types.ObjectId(), titleArabic: title, isNew: true };
    console.log(`  ➕ (dry) Series: ${title} [${categoryForSeries(title)}]`);
  }
  cache[title] = series;
  return series;
}

async function main() {
  if (!process.env.MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

  console.log('\n🎧 Import Najmi lectures');
  console.log('='.repeat(50));
  console.log(`Mode:   ${DRY_RUN ? '🔍 DRY RUN' : '⚡ LIVE'}`);
  console.log(`Batch:  ${BATCH}`);
  console.log(`Sheikh: ${SHEIKH_NAME}\n`);

  const wb = XLSX.readFile(CSV_FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  console.log(`📄 Rows: ${rows.length}\n`);

  await mongoose.connect(process.env.MONGODB_URI);
  const sheikh = await findOrCreateSheikh(SHEIKH_NAME);

  const seriesCache = {};
  const stats = { created: 0, updated: 0, skipped: 0, series: new Set(), seq: {} };

  for (const row of rows) {
    const audioFileName = toM4a(row['file-name']);
    const seriesTitle = String(row['category'] || '').trim(); // "category" column = series name
    if (!audioFileName || !seriesTitle) { stats.skipped++; continue; }

    let titleAr = cleanTitle(row['lecture-title']);
    // Per-series running sequence when the CSV omits one
    stats.seq[seriesTitle] = (stats.seq[seriesTitle] || 0) + 1;
    const seq = String(row['sequence-inseries'] || '').trim() || String(stats.seq[seriesTitle]);
    if (!titleAr) titleAr = `${seriesTitle} - ${seq}`;

    const series = await findOrCreateSeries(seriesTitle, sheikh._id, seriesCache);
    stats.series.add(seriesTitle);

    const lectureNumber = /^\d+$/.test(seq) ? parseInt(seq) : (stats.seq[seriesTitle]);
    const hijri = String(row['date-hirji'] || '').trim();

    const doc = {
      audioFileName,
      titleArabic: titleAr,
      titleEnglish: titleAr,
      sheikhId: sheikh._id,
      seriesId: series._id || null,
      category: categoryForSeries(seriesTitle),
      lectureNumber,
      sortOrder: lectureNumber,
      tags: ['najmi', 'النجمي'],
      published: false,
      metadata: {
        importBatch: BATCH,
        seriesName: seriesTitle,
        sourceUrl: String(row['source-url'] || '').trim(),
        dateHijriRaw: hijri,
        excelFilename: row['file-name'],
        importedAt: new Date().toISOString()
      }
    };

    if (DRY_RUN) { stats.created++; continue; }

    const existing = await Lecture.findOne({ audioFileName, sheikhId: sheikh._id });
    if (existing) {
      existing.titleArabic = titleAr;
      existing.seriesId = series._id;
      existing.lectureNumber = lectureNumber;
      existing.sortOrder = lectureNumber;
      existing.category = doc.category;
      existing.metadata = { ...(existing.metadata || {}), ...doc.metadata };
      if (!existing.tags?.includes('najmi')) existing.tags = [...(existing.tags || []), 'najmi', 'النجمي'];
      await existing.save();
      stats.updated++;
    } else {
      await new Lecture(doc).save();
      stats.created++;
    }
  }

  await mongoose.disconnect();

  console.log('\n' + '='.repeat(50));
  console.log(`  Created: ${stats.created}`);
  console.log(`  Updated: ${stats.updated}`);
  console.log(`  Skipped: ${stats.skipped}`);
  console.log(`  Series:  ${stats.series.size}`);
  console.log('='.repeat(50));
  console.log('\n📋 NEXT:');
  console.log('   1. Upload audio:  node scripts/upload-to-r2-local.js /path/to/audio --skip-existing');
  console.log('   2. Link URLs:     node scripts/upload-to-oci-verify.js --manifest upload-manifest.json');
  console.log(`   3. Publish:       node scripts/publish-batch.js --batch ${BATCH}`);
  console.log('   4. Fix counts:    node scripts/sync-lecture-counts.js');
  if (DRY_RUN) console.log('\n💡 Dry run — nothing written. Remove --dry-run to apply.');
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
