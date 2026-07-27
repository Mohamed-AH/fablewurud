#!/usr/bin/env node
/**
 * Import PDF publications into MongoDB (Run on Cloud VM)
 *
 * Joins the catalog CSV (title/category per filename) with the upload manifest
 * (public URL + byte size per filename) produced by upload-pdfs-to-r2.js, then
 * creates one Publication document per PDF, all linked to the given Sheikh.
 *
 * Idempotent: matches existing publications by sourceUrl OR fileUrl and updates
 * them in place instead of creating duplicates.
 *
 * Usage:
 *   node scripts/import-publications.js --catalog pdf_catalog.csv --manifest pdf-upload-manifest.json [options]
 *
 * Options:
 *   --sheikh NAME     Sheikh Arabic name (default: "أحمد بن يحيى النجمي")
 *   --unpublished     Create as drafts (isPublished: false)
 *   --dry-run         Preview without writing
 *   --env FILE        Path to .env file (default: .env)
 *
 * Catalog CSV columns: file-name, title, category, source-url
 * Manifest JSON: { files: [ { filename, url, size, ... } ] }
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';
require('dotenv').config({ path: envPath });

const fs = require('fs');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const { Sheikh, Publication } = require('../models');

const args = process.argv.slice(2);
function getArg(name, def) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
}
const CATALOG = getArg('--catalog');
const MANIFEST = getArg('--manifest');
const SHEIKH_NAME = getArg('--sheikh', 'أحمد بن يحيى النجمي');
const DRY_RUN = args.includes('--dry-run');
const UNPUBLISHED = args.includes('--unpublished');

const VALID_CATEGORIES = ['الكتب', 'التعليقات', 'الرسائل', 'من السيرة الذاتية'];

if (!CATALOG || !MANIFEST) {
  console.log('Usage: node scripts/import-publications.js --catalog pdf_catalog.csv --manifest pdf-upload-manifest.json [--dry-run]');
  process.exit(1);
}

async function findOrCreateSheikh(name) {
  let sheikh = await Sheikh.findOne({ nameArabic: name })
    || await Sheikh.findOne({ nameArabic: `الشيخ ${name}` })
    || await Sheikh.findOne({ nameArabic: name.replace('الشيخ ', '') })
    // Fallback: the record may store a title-prefixed name (e.g. "الشيخ العلامة … النجمي")
    || await Sheikh.findOne({ nameArabic: /النجمي/ });
  if (sheikh) return sheikh;
  if (DRY_RUN) return { _id: null, nameArabic: name, isNew: true };
  sheikh = new Sheikh({ nameArabic: name, honorific: 'رحمه الله', titlePrefix: 'الشيخ العلامة', titlePrefixEnglish: 'Sheikh al-‘Allāmah' });
  await sheikh.save();
  console.log(`  ➕ Created sheikh: ${name} (shortId ${sheikh.shortId})`);
  return sheikh;
}

function normalizeCategory(cat) {
  const c = String(cat || '').trim();
  return VALID_CATEGORIES.includes(c) ? c : 'الكتب';
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  console.log('\n📚 Import PDF publications');
  console.log('='.repeat(50));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '⚡ LIVE'}`);
  console.log(`Sheikh: ${SHEIKH_NAME}\n`);

  // Read catalog (xlsx lib parses CSV, handles quoting)
  const wb = XLSX.readFile(CATALOG);
  const catalog = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

  // Read manifest → filename → { url, size }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf-8'));
  const byFile = {};
  for (const f of (manifest.files || [])) {
    if (f.status === 'failed') continue;
    byFile[f.filename] = f;
  }

  console.log(`📄 Catalog rows: ${catalog.length}`);
  console.log(`📦 Manifest files: ${Object.keys(byFile).length}\n`);

  await mongoose.connect(process.env.MONGODB_URI);
  const sheikh = await findOrCreateSheikh(SHEIKH_NAME);

  const stats = { created: 0, updated: 0, skipped: 0, missing: 0, byCategory: {} };

  for (const row of catalog) {
    const fileName = String(row['file-name'] || '').trim();
    const title = String(row['title'] || '').trim();
    const category = normalizeCategory(row['category']);
    const sourceUrl = String(row['source-url'] || '').trim();
    const pageCount = parseInt(row['page_count']) || 0;

    if (!fileName || !title) { stats.skipped++; continue; }

    const up = byFile[fileName];
    if (!up || !up.url) {
      console.log(`  ⚠️  No uploaded file for: ${fileName}`);
      stats.missing++;
      continue;
    }

    stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

    const doc = {
      sheikhId: sheikh._id,
      title,
      category,
      fileUrl: up.url,
      fileName,
      fileSize: up.size || 0,
      pageCount,
      sourceUrl,
      isPublished: !UNPUBLISHED
    };

    if (DRY_RUN) {
      console.log(`  [${category}] ${title}`);
      stats.created++;
      continue;
    }

    // Idempotent upsert by sourceUrl or fileUrl
    const existing = await Publication.findOne({
      $or: [
        sourceUrl ? { sourceUrl } : null,
        { fileUrl: up.url }
      ].filter(Boolean)
    });

    if (existing) {
      Object.assign(existing, doc);
      await existing.save();
      stats.updated++;
    } else {
      await new Publication(doc).save();
      stats.created++;
    }
  }

  await mongoose.disconnect();

  console.log('\n' + '='.repeat(50));
  console.log(`  Created:  ${stats.created}`);
  console.log(`  Updated:  ${stats.updated}`);
  console.log(`  Missing:  ${stats.missing}  (in catalog, not in manifest)`);
  console.log(`  Skipped:  ${stats.skipped}`);
  console.log('  By category:');
  for (const [c, n] of Object.entries(stats.byCategory)) console.log(`    ${c}: ${n}`);
  console.log('='.repeat(50));
  if (DRY_RUN) console.log('\n💡 Dry run — nothing written. Remove --dry-run to apply.');
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
