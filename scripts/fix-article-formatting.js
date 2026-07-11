#!/usr/bin/env node
/**
 * Article Formatting Cleanup Script
 *
 * Fixes erratic line breaks introduced during copy-paste, while preserving
 * genuine paragraph boundaries. Also flags syntax issues (unclosed brackets,
 * orphan asterisks).
 *
 * Runs against the database. Default mode is DRY RUN (read-only).
 *
 * Usage:
 *   node scripts/fix-article-formatting.js [options]
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
  output: null
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--limit': options.limit = parseInt(args[++i], 10); break;
    case '--start': options.start = parseInt(args[++i], 10); break;
    case '--type': options.type = args[++i]; break;
    case '--ids': options.ids = args[++i].split(',').map(n => parseInt(n, 10)); break;
    case '--format': options.format = args[++i]; break;
    case '--output': options.output = args[++i]; break;
    case '--help':
      console.log(`
Article Formatting Cleanup

Usage: node scripts/fix-article-formatting.js [options]

Options:
  --dry-run       Show changes without modifying DB (default)
  --apply         Actually apply corrections to database
  --limit N       Only process first N articles
  --start N       Start from article shortId N
  --type TYPE     Filter by type (Asdaa|TelegramArticle)
  --ids 1,2,3     Only process specific shortIds
  --format FMT    human or json (default: human)
  --output FILE   Write results to file

Line Break Fixes:
  1. Split headers: "أولاً\\n:" -> "أولاً:"
  2. Standalone colons: "text\\n:\\nmore" -> "text:\\nmore"
  3. Orphan punctuation: "text\\n: –\\nmore" -> "text: –\\nmore"

Syntax Flags (reported only, not auto-fixed):
  - Unclosed/extra parentheses
  - Orphan asterisks (standalone * lines)
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
// LINE BREAK FIXING
// ============================================================

function fixLineBreaks(text) {
  if (!text) return { text, fixes: [] };

  const fixes = [];
  let result = text;

  // Fix 1: Split header + colon
  // "أولاً\n:" or "بالأمور التالية\n:" -> join them
  // Pattern: short line (<=30 chars) followed by line starting with ':'
  const splitHeaderRegex = /^(.{1,30})\n(:.*)$/gm;
  result = result.replace(splitHeaderRegex, (match, header, colonLine) => {
    const headerTrimmed = header.trim();
    if (headerTrimmed.length === 0) return match;
    fixes.push({
      type: 'split_header_colon',
      before: headerTrimmed + '\\n' + colonLine.trim().substring(0, 30),
      after: headerTrimmed + colonLine.trim()
    });
    return header.trimEnd() + colonLine;
  });

  // Fix 2: Standalone colon on its own line
  // "text\n:\nmore" -> "text:\nmore"
  result = result.replace(/([^\n]+)\n:\n/g, (match, prevLine) => {
    fixes.push({
      type: 'solo_colon',
      before: prevLine.trim().substring(prevLine.trim().length - 20) + '\\n:\\n',
      after: prevLine.trim().substring(prevLine.trim().length - 20) + ':\\n'
    });
    return prevLine + ':\n';
  });

  // Fix 3: Standalone orphan punctuation lines (": –", "–", ": ١")
  // These are short lines (<10 chars) that are just punctuation/symbols
  // Join them to the previous line
  const lines = result.split('\n');
  const cleanedLines = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Check if this is an orphan punctuation line that should join previous
    if (
      trimmed.length > 0 &&
      trimmed.length <= 8 &&
      /^[:\-–—\s]+$/.test(trimmed) &&
      cleanedLines.length > 0
    ) {
      const prevIdx = cleanedLines.length - 1;
      const prev = cleanedLines[prevIdx].trimEnd();
      fixes.push({
        type: 'orphan_punctuation',
        before: prev.substring(Math.max(0, prev.length - 20)) + '\\n' + trimmed,
        after: prev.substring(Math.max(0, prev.length - 20)) + ' ' + trimmed
      });
      cleanedLines[prevIdx] = prev + ' ' + trimmed;
      continue;
    }

    cleanedLines.push(lines[i]);
  }
  result = cleanedLines.join('\n');

  return { text: result, fixes };
}

// ============================================================
// SYNTAX ISSUE DETECTION
// ============================================================

function detectSyntaxIssues(text) {
  if (!text) return [];

  const issues = [];
  const lines = text.split('\n');

  // Check parenthesis balance
  let parenBalance = 0;
  const parenIssueLines = [];
  for (let i = 0; i < lines.length; i++) {
    let lineBal = 0;
    for (const ch of lines[i]) {
      if (ch === '(') lineBal++;
      if (ch === ')') lineBal--;
    }
    if (lineBal !== 0) {
      parenIssueLines.push({
        line: i + 1,
        balance: lineBal,
        text: lines[i].trim().substring(0, 80)
      });
    }
    parenBalance += lineBal;
  }

  if (parenBalance !== 0) {
    issues.push({
      type: 'unbalanced_parentheses',
      balance: parenBalance,
      detail: parenBalance > 0 ? parenBalance + ' unclosed "("' : Math.abs(parenBalance) + ' extra ")"',
      lines: parenIssueLines
    });
  }

  // Check for orphan asterisks (standalone * on a line)
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\*+\s*$/.test(lines[i])) {
      const before = i > 0 ? lines[i - 1].trim().substring(0, 40) : '(start)';
      const after = i < lines.length - 1 ? lines[i + 1].trim().substring(0, 40) : '(end)';
      issues.push({
        type: 'orphan_asterisk',
        line: i + 1,
        context: { before, after }
      });
    }
  }

  return issues;
}

// ============================================================
// MAIN
// ============================================================

const articleSchema = new mongoose.Schema({
  shortId: Number,
  type: String,
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
  log('Article Formatting Cleanup');
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

  const query = {};
  if (options.start > 1) query.shortId = { $gte: options.start };
  if (options.type) query.type = options.type;
  if (options.ids) query.shortId = { $in: options.ids };

  let articlesQuery = Article.find(query)
    .select('shortId type title content')
    .sort({ shortId: 1 });

  if (options.limit) articlesQuery = articlesQuery.limit(options.limit);

  const articles = await articlesQuery;
  log(`Found ${articles.length} articles\n`);

  const results = [];
  const stats = {
    total: 0,
    withFixes: 0,
    withSyntaxIssues: 0,
    applied: 0,
    totalFixCount: 0
  };

  for (const article of articles) {
    stats.total++;

    if (options.format === 'human') {
      process.stdout.write(`\r[${stats.total}/${articles.length}] #${article.shortId}...`);
    }

    const { text: fixedContent, fixes } = fixLineBreaks(article.content);
    const syntaxIssues = detectSyntaxIssues(article.content);

    if (fixes.length === 0 && syntaxIssues.length === 0) continue;

    const entry = {
      shortId: article.shortId,
      title: article.title
    };

    if (fixes.length > 0) {
      stats.withFixes++;
      stats.totalFixCount += fixes.length;
      entry.fixes = fixes;

      if (options.format === 'human') {
        log(`\n${'='.repeat(60)}`);
        log(`#${article.shortId}: ${article.title.substring(0, 50)}`);
        log(`Line break fixes: ${fixes.length}`);
        fixes.forEach(f => {
          log(`  [${f.type}]`);
          log(`    BEFORE: ${f.before}`);
          log(`    AFTER:  ${f.after}`);
        });
      }

      if (!options.dryRun) {
        try {
          await Article.updateOne(
            { _id: article._id },
            {
              $set: {
                content: fixedContent,
                lastEditedAt: new Date()
              },
              $push: {
                editHistory: {
                  editedAt: new Date(),
                  fieldsChanged: ['content'],
                  changes: [{
                    field: 'content',
                    oldValue: article.content.substring(0, 200) + '...',
                    newValue: fixedContent.substring(0, 200) + '...'
                  }],
                  changeDescription: `Automated formatting cleanup: ${fixes.length} line break fixes`
                }
              }
            }
          );
          stats.applied++;
          if (options.format === 'human') log('  -> APPLIED');
        } catch (error) {
          if (options.format === 'human') log(`  -> ERROR: ${error.message}`);
        }
      }
    }

    if (syntaxIssues.length > 0) {
      stats.withSyntaxIssues++;
      entry.syntaxIssues = syntaxIssues;

      if (options.format === 'human') {
        if (fixes.length === 0) {
          log(`\n${'='.repeat(60)}`);
          log(`#${article.shortId}: ${article.title.substring(0, 50)}`);
        }
        log(`  Syntax issues: ${syntaxIssues.length}`);
        syntaxIssues.forEach(issue => {
          if (issue.type === 'unbalanced_parentheses') {
            log(`    BRACKETS: ${issue.detail}`);
            issue.lines.forEach(l => {
              log(`      L${l.line} (${l.balance > 0 ? '+' : ''}${l.balance}): ${l.text}`);
            });
          } else if (issue.type === 'orphan_asterisk') {
            log(`    ORPHAN *: line ${issue.line}, between "${issue.context.before}" and "${issue.context.after}"`);
          }
        });
      }
    }

    results.push(entry);
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
    log(`Total articles scanned: ${stats.total}`);
    log(`Articles with line break issues: ${stats.withFixes} (${stats.totalFixCount} total fixes)`);
    log(`Articles with syntax issues: ${stats.withSyntaxIssues}`);
    if (!options.dryRun) {
      log(`Applied fixes to: ${stats.applied} articles`);
    }
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
