#!/usr/bin/env node
/**
 * Apply Article Corrections Script
 *
 * Reads diff output from compare-articles.js and applies corrections.
 *
 * Usage:
 *   node scripts/apply-article-corrections.js <diffs.json> [options]
 *
 * Options:
 *   --dry-run       Show what would change without modifying DB (default)
 *   --apply         Actually apply the corrections
 *   --ids 1,2,3     Only process specific article shortIds
 *   --skip 1,2,3    Skip specific article shortIds
 *
 * Input format (from compare-articles.js --format json):
 * [
 *   {
 *     "shortId": 42,
 *     "title": "...",
 *     "sourceUrl": "...",
 *     "replacements": [
 *       { "position": 156, "stored": "أ", "source": "ا", "context": {...} },
 *       ...
 *     ]
 *   }
 * ]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');

const args = process.argv.slice(2);
const inputFile = args.find(a => !a.startsWith('--'));
const options = {
  dryRun: !args.includes('--apply'),
  ids: null,
  skip: null
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ids') {
    options.ids = args[++i].split(',').map(n => parseInt(n, 10));
  }
  if (args[i] === '--skip') {
    options.skip = args[++i].split(',').map(n => parseInt(n, 10));
  }
  if (args[i] === '--help') {
    console.log(`
Apply Article Corrections

Usage: node scripts/apply-article-corrections.js <diffs.json> [options]

Options:
  --dry-run       Show changes without modifying DB (default)
  --apply         Actually apply corrections to database
  --ids 1,2,3     Only process these article shortIds
  --skip 1,2,3    Skip these article shortIds

Steps:
  1. Run comparison: node scripts/compare-articles.js --format json -o diffs.json
  2. Review diffs.json manually
  3. Dry run: node scripts/apply-article-corrections.js diffs.json
  4. Apply: node scripts/apply-article-corrections.js diffs.json --apply
`);
    process.exit(0);
  }
}

if (!inputFile) {
  console.error('Usage: node scripts/apply-article-corrections.js <diffs.json> [--apply]');
  process.exit(1);
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Apply replacements to content
function applyReplacements(content, replacements) {
  // Work with stripped text for matching
  const stripped = stripHtml(content).replace(/\s+/g, ' ').trim();

  // Build a mapping from stripped positions to original HTML positions
  // This is complex because we need to preserve HTML structure

  // Simpler approach: for each replacement, find and replace in original HTML
  let modified = content;

  for (const r of replacements) {
    if (r.type === 'length_diff') continue; // Skip length diffs for now

    const { stored, source, context } = r;

    // Build a search pattern using context
    const searchPattern = context.before + stored + context.after;
    const replacePattern = context.before + source + context.after;

    // Normalize whitespace in patterns for matching
    const searchNorm = searchPattern.replace(/\s+/g, ' ');
    const replaceNorm = replacePattern.replace(/\s+/g, ' ');

    // Try direct text replacement
    if (modified.includes(stored)) {
      // Find the occurrence in context
      const contextIndex = modified.indexOf(context.before + stored);
      if (contextIndex >= 0) {
        modified = modified.substring(0, contextIndex) +
                   context.before + source +
                   modified.substring(contextIndex + context.before.length + stored.length);
      } else {
        // Fallback: simple replace (may catch wrong occurrence)
        modified = modified.replace(stored, source);
      }
    }
  }

  return modified;
}

const articleSchema = new mongoose.Schema({
  shortId: Number,
  content: String,
  editHistory: [{
    editedBy: mongoose.Schema.Types.ObjectId,
    editedAt: Date,
    fieldsChanged: [String],
    changes: [{
      field: String,
      oldValue: String,
      newValue: String
    }],
    changeDescription: String
  }],
  lastEditedAt: Date
}, { strict: false });

async function main() {
  console.log('Article Correction Tool');
  console.log('='.repeat(50));
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no changes)' : 'APPLY CHANGES'}`);
  console.log(`Input: ${inputFile}\n`);

  // Read diffs
  const diffs = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  console.log(`Loaded ${diffs.length} articles with differences\n`);

  // Filter by ids if specified
  let toProcess = diffs;
  if (options.ids) {
    toProcess = diffs.filter(d => options.ids.includes(d.shortId));
    console.log(`Filtered to ${toProcess.length} articles by --ids`);
  }
  if (options.skip) {
    toProcess = toProcess.filter(d => !options.skip.includes(d.shortId));
    console.log(`Filtered to ${toProcess.length} articles after --skip`);
  }

  if (toProcess.length === 0) {
    console.log('No articles to process.');
    return;
  }

  // Connect to database
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to database.\n');

  const Article = mongoose.model('Article', articleSchema, 'articles');

  let applied = 0;
  let skipped = 0;
  let errors = 0;

  for (const diff of toProcess) {
    console.log(`\n#${diff.shortId}: ${diff.title.substring(0, 40)}...`);
    console.log(`  Replacements: ${diff.replacements.length}`);

    // Show each replacement
    for (const r of diff.replacements) {
      if (r.type === 'length_diff') {
        console.log(`  LENGTH: ${r.storedLength} → ${r.sourceLength}`);
      } else {
        console.log(`  "${r.stored}" → "${r.source}"`);
      }
    }

    if (options.dryRun) {
      console.log('  [DRY RUN - no changes made]');
      skipped++;
      continue;
    }

    try {
      const article = await Article.findOne({ shortId: diff.shortId });
      if (!article) {
        console.log('  ERROR: Article not found in database');
        errors++;
        continue;
      }

      const oldContent = article.content;
      const newContent = applyReplacements(oldContent, diff.replacements);

      if (oldContent === newContent) {
        console.log('  SKIPPED: No changes detected after applying');
        skipped++;
        continue;
      }

      // Update article
      article.content = newContent;
      article.lastEditedAt = new Date();

      // Add to edit history (initialize if missing on older articles)
      if (!article.editHistory) {
        article.editHistory = [];
      }
      article.editHistory.push({
        editedAt: new Date(),
        fieldsChanged: ['content'],
        changes: [{
          field: 'content',
          oldValue: oldContent.substring(0, 200) + '...',
          newValue: newContent.substring(0, 200) + '...'
        }],
        changeDescription: 'Automated correction from source comparison'
      });

      await article.save();
      console.log('  APPLIED');
      applied++;

    } catch (error) {
      console.log(`  ERROR: ${error.message}`);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log(`Applied: ${applied}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
