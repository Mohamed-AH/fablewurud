#!/usr/bin/env node
/**
 * Set the honorific title prefix for Sheikh Ahmed Al-Najmi.
 *
 * Sheikh Hasan's title ("الشيخ") is embedded in his stored name, while Sheikh
 * Ahmed was imported with a bare name. This sets his `titlePrefix` so the UI can
 * display "الشيخ العلامة أحمد بن يحيى النجمي" (via utils/sheikhName.js) without
 * touching the stored name or affecting Sheikh Hasan.
 *
 * Usage:
 *   node scripts/set-najmi-title.js            # dry-run (default)
 *   node scripts/set-najmi-title.js --apply    # write to DB
 *   node scripts/set-najmi-title.js --env .env.production --apply
 */
const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';
require('dotenv').config({ path: envPath });

const mongoose = require('mongoose');
const { Sheikh } = require('../models');

const APPLY = process.argv.includes('--apply');
const TITLE_AR = 'الشيخ العلامة';
const TITLE_EN = 'Sheikh al-‘Allāmah';

async function main() {
  if (!process.env.MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }
  await mongoose.connect(process.env.MONGODB_URI);

  const sheikh = await Sheikh.findOne({ nameArabic: /النجمي/ });
  if (!sheikh) {
    console.error('❌ Najmi sheikh not found (nameArabic matching /النجمي/)');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Found: ${sheikh.nameArabic} (shortId ${sheikh.shortId})`);
  console.log(`  current titlePrefix:        "${sheikh.titlePrefix || ''}"`);
  console.log(`  current titlePrefixEnglish: "${sheikh.titlePrefixEnglish || ''}"`);
  console.log(`  → will set titlePrefix        = "${TITLE_AR}"`);
  console.log(`  → will set titlePrefixEnglish = "${TITLE_EN}"`);
  console.log(`  display becomes: "${TITLE_AR} ${sheikh.nameArabic}"`);

  if (!APPLY) {
    console.log('\n💡 Dry run — nothing written. Re-run with --apply to save.');
    await mongoose.disconnect();
    return;
  }

  sheikh.titlePrefix = TITLE_AR;
  sheikh.titlePrefixEnglish = TITLE_EN;
  await sheikh.save();
  console.log('\n✅ Saved.');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
