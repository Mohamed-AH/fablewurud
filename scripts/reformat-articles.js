#!/usr/bin/env node
/**
 * Article Reformatting Script
 *
 * Re-extracts article content from original source URLs to fix
 * erratic line breaks introduced during copy-paste.
 *
 * Preserves only genuine paragraph breaks (from <p> tags in source HTML)
 * while removing mid-sentence wraps.
 *
 * Default mode is DRY RUN (read-only).
 *
 * Usage:
 *   node scripts/reformat-articles.js [options]
 *
 * Options:
 *   --dry-run       Show what would change without modifying DB (default)
 *   --apply         Actually apply the corrections
 *   --limit N       Only process first N articles
 *   --start N       Start from article shortId N
 *   --type TYPE     Filter by type (Asdaa|TelegramArticle)
 *   --ids 1,2,3     Only process specific shortIds
 *   --format FMT    human or json (default: human)
 *   --output FILE   Write results to file
 *   --delay MS      Delay between requests (default: 500)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');

const args = process.argv.slice(2);
const options = {
  dryRun: !args.includes('--apply'),
  limit: null,
  start: 1,
  type: null,
  ids: null,
  format: 'human',
  output: null,
  delay: 500
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--limit': options.limit = parseInt(args[++i], 10); break;
    case '--start': options.start = parseInt(args[++i], 10); break;
    case '--type': options.type = args[++i]; break;
    case '--ids': options.ids = args[++i].split(',').map(n => parseInt(n, 10)); break;
    case '--format': options.format = args[++i]; break;
    case '--output': options.output = args[++i]; break;
    case '--delay': options.delay = parseInt(args[++i], 10); break;
    case '--help':
      console.log(`
Article Reformatting - Fix Line Breaks from Source

Re-extracts content from original source URLs, keeping only
genuine paragraph breaks (from <p> tags) and removing erratic
mid-sentence wraps from copy-paste.

Usage: node scripts/reformat-articles.js [options]

Options:
  --dry-run       Show changes without modifying DB (default)
  --apply         Actually apply corrections to database
  --limit N       Only process first N articles
  --start N       Start from article shortId N
  --type TYPE     Filter by type (Asdaa|TelegramArticle)
  --ids 1,2,3     Only process specific shortIds
  --format FMT    human or json (default: human)
  --output FILE   Write results to file
  --delay MS      Delay between requests (default: 500)
`);
      process.exit(0);
  }
}

function log(msg) {
  if (options.format === 'human') {
    if (options.output) {
      fs.appendFileSync(options.output, msg + '\n');
    } else {
      console.log(msg);
    }
  }
}

// ============================================================
// HTML CONTENT EXTRACTION - PARAGRAPH-AWARE
// ============================================================

function decodeEntities(text) {
  return text
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8217;/g, '’')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&[a-z]+;/gi, '');
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '');
}

function extractAsdaaParagraphs(html) {
  // Find the entry-content div
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

  const contentHtml = afterStart.substring(0, endIndex);

  // Remove script/style tags
  let cleaned = contentHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // Extract paragraphs from <p> tags
  // Each <p>...</p> becomes one paragraph, joined by \n
  const paragraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;

  while ((match = pRegex.exec(cleaned)) !== null) {
    let pContent = match[1];
    // Handle <br> inside paragraphs - keep as line breaks within paragraph
    pContent = pContent.replace(/<br\s*\/?>/gi, '\n');
    // Strip remaining tags but preserve text
    pContent = stripTags(pContent);
    // Decode HTML entities
    pContent = decodeEntities(pContent);
    // Normalize whitespace within lines (but keep explicit \n from <br>)
    pContent = pContent
      .split('\n')
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(line => line.length > 0)
      .join('\n');

    if (pContent.trim()) {
      paragraphs.push(pContent.trim());
    }
  }

  // If no <p> tags found, fall back to splitting on block-level tags
  if (paragraphs.length === 0) {
    cleaned = cleaned
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/div>/gi, '\n\n')
      .replace(/<\/h[1-6]>/gi, '\n\n');
    cleaned = stripTags(cleaned);
    cleaned = decodeEntities(cleaned);
    return cleaned
      .split(/\n{2,}/)
      .map(p => p.replace(/\s+/g, ' ').trim())
      .filter(p => p.length > 0)
      .join('\n');
  }

  return paragraphs.join('\n');
}

function extractTelegramParagraphs(html) {
  const match = html.match(/<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (!match) return null;

  let content = match[1];
  // <br> tags are the paragraph separators in Telegram
  content = content.replace(/<br\s*\/?>/gi, '\n');
  content = stripTags(content);
  content = decodeEntities(content);

  return content
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n');
}

// ============================================================
// TEXT COMPARISON - verify no content is lost
// ============================================================

function normalizeForComparison(text) {
  if (!text) return '';
  return text
    .replace(/[‐-―−﹘﹣－⁃]/g, '-')
    .replace(/–/g, '-')
    .replace(/—/g, '-')
    .replace(/[‘’‚‛`´]/g, "'")
    .replace(/[“”„‟«»]/g, '"')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function contentMatch(dbText, sourceText) {
  const dbNorm = normalizeForComparison(dbText);
  const srcNorm = normalizeForComparison(sourceText);

  if (dbNorm === srcNorm) return { match: true, similarity: 1.0 };

  // Calculate similarity using common substring ratio
  const shorter = dbNorm.length < srcNorm.length ? dbNorm : srcNorm;
  const longer = dbNorm.length < srcNorm.length ? srcNorm : dbNorm;

  if (shorter.length === 0) return { match: false, similarity: 0 };

  // Check how much of the shorter text appears in the longer
  // Use chunks to handle minor differences
  const chunkSize = 20;
  let matchedChunks = 0;
  let totalChunks = 0;

  for (let i = 0; i < shorter.length; i += chunkSize) {
    const chunk = shorter.substring(i, i + chunkSize);
    if (chunk.length >= 10) {
      totalChunks++;
      if (longer.includes(chunk)) matchedChunks++;
    }
  }

  const similarity = totalChunks > 0 ? matchedChunks / totalChunks : 0;
  return { match: similarity > 0.85, similarity };
}

// ============================================================
// FETCH
// ============================================================

async function fetchUrl(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
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
      if (attempt === retries) throw error;
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
  log('Article Reformatting - Fix Line Breaks from Source');
  log('='.repeat(60));
  log(`Mode: ${options.dryRun ? 'DRY RUN (no changes)' : 'APPLY CHANGES'}`);
  log(`Started: ${new Date().toISOString()}\n`);

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(mongoUri, { maxPoolSize: 5 });
  log('Connected to database.\n');

  const Article = mongoose.model('Article', articleSchema, 'articles');

  const query = { sourceUrl: { $exists: true, $ne: '' } };
  if (options.start > 1) query.shortId = { ...(query.shortId || {}), $gte: options.start };
  if (options.type) query.type = options.type;
  if (options.ids) query.shortId = { $in: options.ids };

  let articlesQuery = Article.find(query)
    .select('shortId type sourceUrl title content')
    .sort({ shortId: 1 });

  if (options.limit) articlesQuery = articlesQuery.limit(options.limit);

  const articles = await articlesQuery;
  log(`Found ${articles.length} articles\n`);

  const results = [];
  const stats = {
    total: 0,
    reformatted: 0,
    unchanged: 0,
    errors: 0,
    applied: 0,
    lowSimilarity: 0
  };

  for (const article of articles) {
    stats.total++;

    if (options.format === 'human') {
      process.stdout.write(`\r[${stats.total}/${articles.length}] #${article.shortId}...                    `);
    }

    try {
      if (!article.sourceUrl) {
        stats.unchanged++;
        continue;
      }

      const html = await fetchUrl(article.sourceUrl);

      let sourceContent;
      if (article.type === 'TelegramArticle' || article.sourceUrl.includes('t.me')) {
        sourceContent = extractTelegramParagraphs(html);
      } else {
        sourceContent = extractAsdaaParagraphs(html);
      }

      if (!sourceContent) {
        if (options.format === 'human') log(`\n#${article.shortId}: Could not extract source content`);
        stats.errors++;
        continue;
      }

      // Compare to verify content integrity
      const dbPlain = article.content
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)));

      const { match, similarity } = contentMatch(dbPlain, sourceContent);

      if (!match) {
        stats.lowSimilarity++;
        if (options.format === 'human') {
          log(`\n#${article.shortId}: LOW SIMILARITY (${(similarity * 100).toFixed(1)}%) - SKIPPED`);
          log(`  DB length: ${dbPlain.length}, Source length: ${sourceContent.length}`);
        }
        results.push({
          shortId: article.shortId,
          title: article.title,
          status: 'low_similarity',
          similarity: Math.round(similarity * 100)
        });
        continue;
      }

      // Count line changes
      const dbLines = dbPlain.split('\n').filter(l => l.trim()).length;
      const sourceLines = sourceContent.split('\n').filter(l => l.trim()).length;
      const lineDiff = dbLines - sourceLines;

      if (lineDiff <= 0) {
        stats.unchanged++;
        continue;
      }

      stats.reformatted++;

      const entry = {
        shortId: article.shortId,
        title: article.title,
        status: 'reformatted',
        similarity: Math.round(similarity * 100),
        linesBefore: dbLines,
        linesAfter: sourceLines,
        linesRemoved: lineDiff
      };
      results.push(entry);

      if (options.format === 'human') {
        log(`\n${'='.repeat(60)}`);
        log(`#${article.shortId}: ${article.title.substring(0, 50)}`);
        log(`  Lines: ${dbLines} -> ${sourceLines} (${lineDiff} erratic breaks removed)`);
        log(`  Content match: ${(similarity * 100).toFixed(1)}%`);

        // Show first few lines of reformatted content
        const previewLines = sourceContent.split('\n').filter(l => l.trim()).slice(0, 5);
        log(`  Preview:`);
        previewLines.forEach((l, i) => {
          log(`    P${i + 1}: ${l.substring(0, 70)}${l.length > 70 ? '...' : ''}`);
        });
      }

      if (!options.dryRun) {
        try {
          await Article.updateOne(
            { _id: article._id },
            {
              $set: {
                content: sourceContent,
                lastEditedAt: new Date()
              },
              $push: {
                editHistory: {
                  editedAt: new Date(),
                  fieldsChanged: ['content'],
                  changes: [{
                    field: 'content',
                    oldValue: article.content.substring(0, 200) + '...',
                    newValue: sourceContent.substring(0, 200) + '...'
                  }],
                  changeDescription: `Reformatted from source: ${lineDiff} erratic line breaks removed`
                }
              }
            }
          );
          stats.applied++;
          if (options.format === 'human') log('  -> APPLIED');
        } catch (error) {
          if (options.format === 'human') log(`  -> ERROR: ${error.message}`);
          stats.errors++;
        }
      }

    } catch (error) {
      stats.errors++;
      if (options.format === 'human') log(`\n#${article.shortId}: ERROR - ${error.message}`);
    }

    await new Promise(r => setTimeout(r, options.delay));
  }

  if (options.format === 'json') {
    const output = JSON.stringify(results, null, 2);
    if (options.output) {
      fs.writeFileSync(options.output, output);
    } else {
      console.log(output);
    }
  } else {
    log(`\n\n${'='.repeat(60)}`);
    log('SUMMARY');
    log(`Total: ${stats.total}`);
    log(`Reformatted: ${stats.reformatted}`);
    log(`Unchanged: ${stats.unchanged}`);
    log(`Low similarity (skipped): ${stats.lowSimilarity}`);
    log(`Errors: ${stats.errors}`);
    if (!options.dryRun) {
      log(`Applied: ${stats.applied}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
