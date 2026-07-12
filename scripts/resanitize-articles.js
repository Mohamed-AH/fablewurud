/**
 * Re-sanitize existing article content with the allowlist sanitizer.
 *
 * Phase 0 (C1) of the code-audit remediation. Existing articles were saved
 * before allowlist sanitization existed and may contain stored-XSS payloads
 * that the old regex blacklist let through.
 *
 * Usage:
 *   node scripts/resanitize-articles.js            # dry-run (default, no writes)
 *   node scripts/resanitize-articles.js --apply    # write sanitized content
 *
 * SAFETY: dry-run by default. Review the diff summary before running --apply.
 * This is a PRODUCTION database — only run --apply deliberately, with a backup.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { sanitizeArticleHtml } = require('../utils/sanitizeHtml');

const APPLY = process.argv.includes('--apply');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const { Article } = require('../models');

  const articles = await Article.find({}).select('_id shortId title content').lean();
  console.log(`Scanning ${articles.length} articles (${APPLY ? 'APPLY' : 'DRY-RUN'})...\n`);

  let changed = 0;
  const ops = [];

  for (const a of articles) {
    const before = a.content || '';
    const after = sanitizeArticleHtml(before);
    if (after !== before) {
      changed++;
      const delta = before.length - after.length;
      console.log(`#${a.shortId} "${(a.title || '').slice(0, 50)}" — ${delta} chars removed`);
      if (APPLY) {
        ops.push({ updateOne: { filter: { _id: a._id }, update: { $set: { content: after } } } });
      }
    }
  }

  console.log(`\n${changed} of ${articles.length} articles would change.`);

  if (APPLY && ops.length) {
    const res = await Article.bulkWrite(ops);
    console.log(`Applied. Modified: ${res.modifiedCount}`);
  } else if (!APPLY && changed) {
    console.log('Dry-run only. Re-run with --apply to write changes.');
  }

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Re-sanitize failed:', err);
  process.exit(1);
});
