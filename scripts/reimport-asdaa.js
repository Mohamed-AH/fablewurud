#!/usr/bin/env node
/**
 * Re-import Asdaa Articles with Formatted HTML
 *
 * Fetches each Asdaa article from its source URL and replaces the
 * database content with clean, semantically-structured HTML that
 * preserves the original formatting:
 *   - Paragraph breaks from <p> tags
 *   - Quran verses (green) -> <span class="quran">
 *   - Hadith text (blue) -> <span class="hadith">
 *   - Section headers (red) -> <span class="section-header">
 *   - Bold text preserved
 *
 * Also updates the title to match the original source.
 *
 * Default mode is DRY RUN (read-only).
 *
 * Usage:
 *   node scripts/reimport-asdaa.js [options]
 *
 * Options:
 *   --dry-run       Show what would change (default)
 *   --apply         Actually update the database
 *   --limit N       Only process first N articles
 *   --start N       Start from shortId N
 *   --ids 1,2,3     Only process specific shortIds
 *   --delay MS      Delay between requests (default: 500)
 */

require('dotenv').config();
const mongoose = require('mongoose');

const args = process.argv.slice(2);
const options = {
  dryRun: !args.includes('--apply'),
  limit: null,
  start: 1,
  ids: null,
  delay: 500
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--limit': options.limit = parseInt(args[++i], 10); break;
    case '--start': options.start = parseInt(args[++i], 10); break;
    case '--ids': options.ids = args[++i].split(',').map(n => parseInt(n, 10)); break;
    case '--delay': options.delay = parseInt(args[++i], 10); break;
    case '--help':
      console.log(`
Re-import Asdaa Articles with Formatted HTML

Fetches articles from source URLs and replaces DB content with
clean HTML preserving paragraph structure and text formatting
(Quran=green, Hadith=blue, Headers=red).

Also restores original titles from source.

Usage: node scripts/reimport-asdaa.js [options]

Options:
  --dry-run       Show what would change (default)
  --apply         Actually update the database
  --limit N       Only process first N articles
  --start N       Start from shortId N
  --ids 1,2,3     Only process specific shortIds
  --delay MS      Delay between requests (default: 500)
`);
      process.exit(0);
  }
}

// ============================================================
// HTML EXTRACTION & CLEANUP
// ============================================================

// Map inline color styles to semantic CSS classes
function convertColorToClass(html) {
  return html
    // Quran verses: green shades
    .replace(/<span[^>]*style="[^"]*color:\s*#(008000|339966|006600|009933)[^"]*"[^>]*>/gi,
      '<span class="quran">')
    // Hadith: blue shades
    .replace(/<span[^>]*style="[^"]*color:\s*#(0000ff|3366ff|666699|0000cc|000099)[^"]*"[^>]*>/gi,
      '<span class="hadith">')
    // Section headers: red
    .replace(/<span[^>]*style="[^"]*color:\s*#(ff0000|cc0000|ee0000)[^"]*"[^>]*>/gi,
      '<span class="section-header">')
    // Remove any remaining inline styles from spans
    .replace(/<span[^>]*style="[^"]*color:[^"]*"[^>]*>/gi, '<span>')
    // Clean up empty spans
    .replace(/<span>([^<]*)<\/span>/g, '$1');
}

// Strip unwanted tags but keep semantic ones
function cleanHtml(html) {
  // Remove script/style
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // Convert colors to classes
  cleaned = convertColorToClass(cleaned);

  // Remove all attributes from p tags
  cleaned = cleaned.replace(/<p[^>]*>/gi, '<p>');

  // Remove img tags (author avatar etc)
  cleaned = cleaned.replace(/<img[^>]*>/gi, '');

  // Remove div tags but keep content
  cleaned = cleaned.replace(/<\/?div[^>]*>/gi, '');

  // Remove links but keep text
  cleaned = cleaned.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1');

  // Decode HTML entities
  cleaned = cleaned
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8217;/g, '’')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)));

  // Clean up whitespace within tags
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .replace(/<p>\s*/gi, '<p>')
    .replace(/\s*<\/p>/gi, '</p>');

  // Remove empty paragraphs
  cleaned = cleaned.replace(/<p>\s*<\/p>/gi, '');

  return cleaned.trim();
}

function extractAsdaaContent(html) {
  // Find entry-content div
  const startMatch = html.match(/<div[^>]*class="entry-content[^"]*"[^>]*>/i);
  if (!startMatch) return null;

  const startIndex = startMatch.index + startMatch[0].length;
  const afterStart = html.substring(startIndex);

  // Find end boundary
  let endIndex;
  const tagsMatch = afterStart.match(/<div[^>]*class="post-bottom/i);
  if (tagsMatch) {
    endIndex = tagsMatch.index;
  } else {
    const commentMatch = afterStart.match(/<\/div><!--\s*\.entry-content/i);
    endIndex = commentMatch ? commentMatch.index : afterStart.indexOf('</article>');
  }
  if (endIndex <= 0) endIndex = afterStart.length;

  const rawContent = afterStart.substring(0, endIndex);

  // Extract paragraphs as clean HTML
  const cleaned = cleanHtml(rawContent);

  // Extract individual <p>...</p> blocks
  const paragraphs = [];
  const pRegex = /<p>([\s\S]*?)<\/p>/gi;
  let match;

  while ((match = pRegex.exec(cleaned)) !== null) {
    const content = match[1].trim();
    if (content) {
      paragraphs.push(`<p>${content}</p>`);
    }
  }

  if (paragraphs.length === 0) return null;

  // Skip the author name paragraph (first paragraph is usually just the name)
  let startIdx = 0;
  const firstText = paragraphs[0].replace(/<[^>]+>/g, '').trim();
  if (firstText.length < 50 && firstText.includes('الدغريري')) {
    startIdx = 1;
  }

  return paragraphs.slice(startIdx).join('\n');
}

function extractAsdaaTitle(html) {
  const match = html.match(/<h1[^>]*class="[^"]*post-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match) return null;
  return match[1].replace(/<[^>]+>/g, '').trim();
}

// ============================================================
// FETCH
// ============================================================

async function fetchUrl(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'ar,en'
        }
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

// ============================================================
// MAIN
// ============================================================

const articleSchema = new mongoose.Schema({
  shortId: Number,
  type: String,
  sourceUrl: String,
  title: String,
  content: String,
  editHistory: [{
    editedBy: mongoose.Schema.Types.ObjectId,
    editedAt: Date,
    fieldsChanged: [String],
    changes: [{ field: String, oldValue: String, newValue: String }],
    changeDescription: String
  }],
  lastEditedAt: Date
}, { strict: false });

async function main() {
  console.log('Re-import Asdaa Articles with Formatted HTML');
  console.log('='.repeat(55));
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'APPLY'}\n`);

  await mongoose.connect(process.env.MONGODB_URI, { maxPoolSize: 5 });
  console.log('Connected.\n');

  const Article = mongoose.model('Article', articleSchema, 'articles');

  const query = { type: 'Asdaa', sourceUrl: { $exists: true, $ne: '' } };
  if (options.start > 1) query.shortId = { $gte: options.start };
  if (options.ids) query.shortId = { $in: options.ids };

  let q = Article.find(query)
    .select('shortId type sourceUrl title content')
    .sort({ shortId: 1 });
  if (options.limit) q = q.limit(options.limit);

  const articles = await q;
  console.log(`Found ${articles.length} Asdaa articles\n`);

  const stats = { total: 0, updated: 0, errors: 0, skipped: 0 };

  for (const article of articles) {
    stats.total++;
    process.stdout.write(`\r[${stats.total}/${articles.length}] #${article.shortId}...                    `);

    try {
      const html = await fetchUrl(article.sourceUrl);

      const newContent = extractAsdaaContent(html);
      const newTitle = extractAsdaaTitle(html);

      if (!newContent) {
        console.log(`\n#${article.shortId}: Could not extract content - SKIPPED`);
        stats.skipped++;
        continue;
      }

      const oldPlain = article.content.replace(/<[^>]+>/g, '').trim();
      const newPlain = newContent.replace(/<[^>]+>/g, '').trim();

      const titleChanged = newTitle && newTitle !== article.title;
      const contentChanged = oldPlain !== newPlain || !article.content.includes('<p>');

      if (!titleChanged && !contentChanged) {
        stats.skipped++;
        continue;
      }

      stats.updated++;

      // Show changes
      console.log(`\n${'='.repeat(55)}`);
      console.log(`#${article.shortId}: ${article.title.substring(0, 50)}`);

      if (titleChanged) {
        console.log(`  TITLE: "${article.title}"`);
        console.log(`      -> "${newTitle}"`);
      }

      const oldLines = oldPlain.split('\n').filter(l => l.trim()).length;
      const newParagraphs = (newContent.match(/<p>/gi) || []).length;
      console.log(`  CONTENT: ${oldLines} lines -> ${newParagraphs} paragraphs (HTML formatted)`);

      // Show content preview
      const previewPs = newContent.match(/<p>([\s\S]*?)<\/p>/gi) || [];
      console.log(`  Preview (first 3 paragraphs):`);
      previewPs.slice(0, 3).forEach((p, i) => {
        const text = p.replace(/<[^>]+>/g, '').trim();
        const hasQuran = p.includes('class="quran"');
        const hasHadith = p.includes('class="hadith"');
        const hasHeader = p.includes('class="section-header"');
        const tags = [hasQuran && 'QURAN', hasHadith && 'HADITH', hasHeader && 'HEADER'].filter(Boolean);
        console.log(`    P${i + 1}${tags.length ? ' [' + tags.join(',') + ']' : ''}: ${text.substring(0, 80)}${text.length > 80 ? '...' : ''}`);
      });

      if (!options.dryRun) {
        const updateFields = { lastEditedAt: new Date() };
        const fieldsChanged = [];
        const changes = [];

        if (contentChanged) {
          updateFields.content = newContent;
          fieldsChanged.push('content');
          changes.push({
            field: 'content',
            oldValue: article.content.substring(0, 200) + '...',
            newValue: newContent.substring(0, 200) + '...'
          });
        }

        if (titleChanged) {
          updateFields.title = newTitle;
          fieldsChanged.push('title');
          changes.push({
            field: 'title',
            oldValue: article.title,
            newValue: newTitle
          });
        }

        await Article.updateOne(
          { _id: article._id },
          {
            $set: updateFields,
            $push: {
              editHistory: {
                editedAt: new Date(),
                fieldsChanged,
                changes,
                changeDescription: 'Re-imported from source with HTML formatting'
              }
            }
          }
        );
        console.log('  -> APPLIED');
      }

    } catch (error) {
      stats.errors++;
      console.log(`\n#${article.shortId}: ERROR - ${error.message}`);
    }

    await new Promise(r => setTimeout(r, options.delay));
  }

  console.log(`\n\n${'='.repeat(55)}`);
  console.log('SUMMARY');
  console.log(`Total: ${stats.total}`);
  console.log(`Updated: ${stats.updated}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
