#!/usr/bin/env node
/**
 * Refetch Articles Script
 *
 * Fetches fresh content from source URLs for specific articles
 * and replaces the database content with properly formatted text.
 *
 * Usage:
 *   node scripts/refetch-articles.js --ids 88,37
 *   node scripts/refetch-articles.js --ids 88,37 --apply
 */

require('dotenv').config();
const mongoose = require('mongoose');

const args = process.argv.slice(2);
const options = {
  dryRun: !args.includes('--apply'),
  ids: null
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ids') {
    options.ids = args[++i].split(',').map(n => parseInt(n, 10));
  }
  if (args[i] === '--help') {
    console.log(`
Refetch Articles from Source

Usage: node scripts/refetch-articles.js --ids 88,37 [--apply]

Fetches fresh content from the original source URL,
extracts clean paragraph-structured text, and replaces
the database content.

Options:
  --ids 1,2,3     Article shortIds to refetch (required)
  --apply         Actually update the database (default: dry run)
`);
    process.exit(0);
  }
}

if (!options.ids || options.ids.length === 0) {
  console.error('Usage: node scripts/refetch-articles.js --ids 88,37 [--apply]');
  process.exit(1);
}

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
  const startMatch = html.match(/<div[^>]*class="entry-content[^"]*"[^>]*>/i);
  if (!startMatch) return null;

  const startIndex = startMatch.index + startMatch[0].length;
  const afterStart = html.substring(startIndex);

  let endIndex;
  const tagsMatch = afterStart.match(/<div[^>]*class="post-bottom/i);
  if (tagsMatch) {
    endIndex = tagsMatch.index;
  } else {
    const commentMatch = afterStart.match(/<\/div><!--\s*\.entry-content/i);
    endIndex = commentMatch ? commentMatch.index : afterStart.indexOf('</article>');
  }
  if (endIndex <= 0) endIndex = afterStart.length;

  let cleaned = afterStart.substring(0, endIndex)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  const paragraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;

  while ((match = pRegex.exec(cleaned)) !== null) {
    let pContent = match[1];
    pContent = pContent.replace(/<br\s*\/?>/gi, '\n');
    pContent = stripTags(pContent);
    pContent = decodeEntities(pContent);
    pContent = pContent
      .split('\n')
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(line => line.length > 0)
      .join('\n');

    if (pContent.trim()) {
      paragraphs.push(pContent.trim());
    }
  }

  if (paragraphs.length === 0) return null;
  return paragraphs.join('\n');
}

function extractTelegramParagraphs(html) {
  const match = html.match(/<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (!match) return null;

  let content = match[1];
  content = content.replace(/<br\s*\/?>/gi, '\n');
  content = stripTags(content);
  content = decodeEntities(content);

  return content
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length > 0)
    .join('\n');
}

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
  console.log('Refetch Articles from Source');
  console.log('='.repeat(50));
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'APPLY'}`);
  console.log(`Articles: ${options.ids.join(', ')}\n`);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.\n');

  const Article = mongoose.model('Article', articleSchema, 'articles');

  for (const shortId of options.ids) {
    console.log(`${'='.repeat(50)}`);
    console.log(`#${shortId}:`);

    const article = await Article.findOne({ shortId });
    if (!article) {
      console.log('  NOT FOUND\n');
      continue;
    }

    console.log(`  Title: ${article.title}`);
    console.log(`  Source: ${article.sourceUrl}`);
    console.log(`  Type: ${article.type}`);

    if (!article.sourceUrl) {
      console.log('  No source URL - skipping\n');
      continue;
    }

    try {
      console.log('  Fetching...');
      const html = await fetchUrl(article.sourceUrl);

      let freshContent;
      if (article.type === 'TelegramArticle' || article.sourceUrl.includes('t.me')) {
        freshContent = extractTelegramParagraphs(html);
      } else {
        freshContent = extractAsdaaParagraphs(html);
      }

      if (!freshContent) {
        console.log('  ERROR: Could not extract content from source\n');
        continue;
      }

      const oldLines = article.content.replace(/<[^>]+>/g, '').split('\n').filter(l => l.trim()).length;
      const newLines = freshContent.split('\n').filter(l => l.trim()).length;

      console.log(`  Old: ${oldLines} lines, ${article.content.length} chars`);
      console.log(`  New: ${newLines} lines, ${freshContent.length} chars`);
      console.log(`  Line breaks removed: ${oldLines - newLines}`);
      console.log('');

      // Show the full reformatted content
      console.log('  --- REFORMATTED CONTENT ---');
      const lines = freshContent.split('\n');
      lines.forEach((line, i) => {
        console.log(`  P${(i + 1).toString().padStart(2)}: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
      });
      console.log('  --- END ---\n');

      if (!options.dryRun) {
        await Article.updateOne(
          { _id: article._id },
          {
            $set: {
              content: freshContent,
              lastEditedAt: new Date()
            },
            $push: {
              editHistory: {
                editedAt: new Date(),
                fieldsChanged: ['content'],
                changes: [{
                  field: 'content',
                  oldValue: article.content.substring(0, 200) + '...',
                  newValue: freshContent.substring(0, 200) + '...'
                }],
                changeDescription: `Refetched from source: ${oldLines - newLines} erratic line breaks removed`
              }
            }
          }
        );
        console.log('  -> APPLIED\n');
      } else {
        console.log('  [DRY RUN - no changes]\n');
      }

    } catch (error) {
      console.log(`  ERROR: ${error.message}\n`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
