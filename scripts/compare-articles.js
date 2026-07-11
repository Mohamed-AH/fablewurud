#!/usr/bin/env node
/**
 * Article Content Comparison Script
 *
 * Compares article body text stored in database against original source URLs.
 * Focuses on actual text errors, ignoring formatting/encoding differences.
 *
 * STRICTLY READ-ONLY - Makes no changes to the database.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');

const args = process.argv.slice(2);
const options = {
  limit: null,
  start: 1,
  type: null,
  format: 'human',
  output: null,
  delay: 500
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--limit': options.limit = parseInt(args[++i], 10); break;
    case '--start': options.start = parseInt(args[++i], 10); break;
    case '--type': options.type = args[++i]; break;
    case '--format': options.format = args[++i]; break;
    case '--output': options.output = args[++i]; break;
    case '--delay': options.delay = parseInt(args[++i], 10); break;
    case '--help':
      console.log(`
Article Content Comparison

Usage: node scripts/compare-articles.js [options]

Options:
  --limit N       Only check first N articles
  --start N       Start from article shortId N
  --type TYPE     Filter by type (Asdaa|TelegramArticle)
  --format FMT    json, jsonl, or human (default: human)
  --output FILE   Write to file
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

function writeOutput(data) {
  const content = options.format === 'json'
    ? JSON.stringify(data, null, 2)
    : data.map(d => JSON.stringify(d)).join('\n');
  if (options.output) {
    fs.writeFileSync(options.output, content);
  } else {
    console.log(content);
  }
}

// Normalize text for comparison - ignore formatting differences
function normalizeText(text) {
  if (!text) return '';
  return text
    // Normalize all dash types to simple hyphen
    .replace(/[‐-―−﹘﹣－⁃]/g, '-')
    .replace(/–/g, '-')
    .replace(/—/g, '-')
    // Normalize quotes (using Unicode escapes for reliability)
    .replace(/[‘’‚‛`´]/g, "'")  // ' ' ‚ ‛ ` ´
    .replace(/[“”„‟«»]/g, '"')  // " " „ ‟ « »
    // Normalize Arabic characters that are often confused
    .replace(/ى$/g, 'ي')  // Final yaa
    .replace(/ة$/g, 'ه')  // Taa marbuta at end of word
    // Remove diacritics/tashkeel for comparison (optional - comment out if you want to catch these)
    // .replace(/[ً-ٰٟ]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// Convert HTML to plain text
function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '-')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&[a-z]+;/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract Asdaa content
function extractAsdaaContent(html) {
  const startMatch = html.match(/<div[^>]*class="entry-content[^"]*"[^>]*>/i);
  if (!startMatch) return null;

  const startIndex = startMatch.index + startMatch[0].length;
  const afterStart = html.substring(startIndex);

  let endIndex;
  const tagsMatch = afterStart.match(/<div[^>]*class="post-bottom-meta/i);
  if (tagsMatch) {
    endIndex = tagsMatch.index;
  } else {
    const commentMatch = afterStart.match(/<\/div><!--\s*\.entry-content/i);
    endIndex = commentMatch ? commentMatch.index : afterStart.indexOf('</article>');
  }

  if (endIndex <= 0) endIndex = afterStart.length;
  return htmlToText(afterStart.substring(0, endIndex));
}

// Extract Telegram content
function extractTelegramContent(html) {
  const match = html.match(/<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  return match ? htmlToText(match[1]) : null;
}

// Find word-level differences (much more practical than char-level)
function findWordDifferences(stored, source) {
  const storedNorm = normalizeText(stored);
  const sourceNorm = normalizeText(source);

  if (storedNorm === sourceNorm) {
    return { identical: true, differences: [] };
  }

  // Split into words
  const storedWords = storedNorm.split(/\s+/);
  const sourceWords = sourceNorm.split(/\s+/);

  const differences = [];

  // Use LCS-style approach to find differences
  let si = 0, ti = 0;

  while (si < storedWords.length && ti < sourceWords.length) {
    if (storedWords[si] === sourceWords[ti]) {
      si++;
      ti++;
    } else {
      // Found a difference - look ahead to find resync point
      let foundSync = false;

      for (let lookAhead = 1; lookAhead <= 20 && !foundSync; lookAhead++) {
        // Check if stored word appears later in source
        for (let j = 0; j <= lookAhead; j++) {
          if (si + j < storedWords.length && ti + lookAhead < sourceWords.length) {
            if (storedWords[si + j] === sourceWords[ti + lookAhead]) {
              // Source has extra words
              if (j === 0 && lookAhead > 0) {
                const extraWords = sourceWords.slice(ti, ti + lookAhead).join(' ');
                differences.push({
                  type: 'missing_from_db',
                  position: si,
                  text: extraWords,
                  context: storedWords.slice(Math.max(0, si - 3), si + 3).join(' ')
                });
                ti += lookAhead;
                foundSync = true;
                break;
              }
            }
          }

          if (ti + j < sourceWords.length && si + lookAhead < storedWords.length) {
            if (sourceWords[ti + j] === storedWords[si + lookAhead]) {
              // DB has extra words
              if (j === 0 && lookAhead > 0) {
                const extraWords = storedWords.slice(si, si + lookAhead).join(' ');
                differences.push({
                  type: 'extra_in_db',
                  position: si,
                  text: extraWords,
                  context: sourceWords.slice(Math.max(0, ti - 3), ti + 3).join(' ')
                });
                si += lookAhead;
                foundSync = true;
                break;
              }
            }
          }
        }
      }

      if (!foundSync) {
        // Single word difference (replacement)
        differences.push({
          type: 'word_diff',
          position: si,
          stored: storedWords[si],
          source: sourceWords[ti],
          context: storedWords.slice(Math.max(0, si - 2), si + 3).join(' ')
        });
        si++;
        ti++;
      }
    }
  }

  // Remaining words
  if (si < storedWords.length) {
    differences.push({
      type: 'extra_in_db_end',
      text: storedWords.slice(si).join(' ').substring(0, 200)
    });
  }
  if (ti < sourceWords.length) {
    differences.push({
      type: 'missing_from_db_end',
      text: sourceWords.slice(ti).join(' ').substring(0, 200)
    });
  }

  return { identical: false, differences };
}

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

const articleSchema = new mongoose.Schema({
  shortId: Number,
  type: String,
  sourceUrl: String,
  title: String,
  content: String,
  lastEditedAt: Date
}, { strict: false });

async function main() {
  if (options.format === 'human') {
    log('Article Content Comparison');
    log('=' .repeat(60));
    log(`Started: ${new Date().toISOString()}\n`);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(mongoUri, { maxPoolSize: 5 });
  if (options.format === 'human') log('Connected.\n');

  const Article = mongoose.model('Article', articleSchema, 'articles');

  const query = { sourceUrl: { $exists: true, $ne: '' } };
  if (options.start > 1) query.shortId = { $gte: options.start };
  if (options.type) query.type = options.type;

  let articlesQuery = Article.find(query)
    .select('shortId type sourceUrl title content lastEditedAt')
    .sort({ shortId: 1 })
    .lean();

  if (options.limit) articlesQuery = articlesQuery.limit(options.limit);

  const articles = await articlesQuery;
  if (options.format === 'human') log(`Found ${articles.length} articles\n`);

  const results = [];
  const stats = { total: 0, identical: 0, different: 0, errors: 0 };

  for (const article of articles) {
    stats.total++;

    try {
      if (!article.sourceUrl) continue;

      if (options.format === 'human') {
        process.stdout.write(`\r[${stats.total}/${articles.length}] #${article.shortId}...`);
      }

      const html = await fetchUrl(article.sourceUrl);

      let sourceContent;
      if (article.type === 'TelegramArticle' || article.sourceUrl.includes('t.me')) {
        sourceContent = extractTelegramContent(html);
      } else {
        sourceContent = extractAsdaaContent(html);
      }

      if (!sourceContent) {
        if (options.format === 'human') log(`\n#${article.shortId}: Could not extract source`);
        stats.errors++;
        continue;
      }

      const storedContent = htmlToText(article.content);
      const result = findWordDifferences(storedContent, sourceContent);

      if (result.identical) {
        stats.identical++;
      } else {
        // Filter out trivial differences (encoding/formatting only)
        const meaningfulDiffs = result.differences.filter(d => {
          if (d.type === 'word_diff') {
            const s = normalizeText(d.stored);
            const t = normalizeText(d.source);
            return s !== t;
          }
          return true;
        });

        if (meaningfulDiffs.length === 0) {
          stats.identical++;
        } else {
          stats.different++;

          const articleDiff = {
            shortId: article.shortId,
            title: article.title,
            sourceUrl: article.sourceUrl,
            differences: meaningfulDiffs
          };
          results.push(articleDiff);

          if (options.format === 'human') {
            log(`\n${'='.repeat(60)}`);
            log(`#${article.shortId}: ${article.title.substring(0, 50)}`);
            log(`Differences: ${meaningfulDiffs.length}`);

            meaningfulDiffs.slice(0, 10).forEach(d => {
              if (d.type === 'word_diff') {
                log(`  CHANGED: "${d.stored}" -> "${d.source}"`);
              } else if (d.type === 'extra_in_db') {
                log(`  EXTRA IN DB: "${d.text.substring(0, 50)}..."`);
              } else if (d.type === 'missing_from_db') {
                log(`  MISSING FROM DB: "${d.text.substring(0, 50)}..."`);
              } else {
                log(`  ${d.type}: ${d.text?.substring(0, 50) || ''}`);
              }
            });

            if (meaningfulDiffs.length > 10) {
              log(`  ... and ${meaningfulDiffs.length - 10} more`);
            }
          }
        }
      }

    } catch (error) {
      stats.errors++;
      if (options.format === 'human') log(`\n#${article.shortId}: ERROR - ${error.message}`);
    }

    await new Promise(r => setTimeout(r, options.delay));
  }

  if (options.format === 'json' || options.format === 'jsonl') {
    writeOutput(results);
  } else {
    log(`\n\n${'='.repeat(60)}`);
    log('SUMMARY');
    log(`Total: ${stats.total}, Identical: ${stats.identical}, Different: ${stats.different}, Errors: ${stats.errors}`);
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
