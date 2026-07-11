/**
 * Article Title Update Script
 *
 * Updates article titles from a JSON file without modifying other fields.
 * Matches articles by sourceUrl to prevent mixups.
 *
 * Usage:
 *   node scripts/update-article-titles.js <path-to-json-file>          # Dry run (default)
 *   node scripts/update-article-titles.js <path-to-json-file> --apply  # Apply changes
 *
 * Expected JSON structure:
 * [
 *   {
 *     "url": "https://...",      // Maps to sourceUrl in DB
 *     "title": "New title"       // The updated title
 *   }
 * ]
 */
const path = require('path');

// Resolve paths relative to script location
const scriptDir = __dirname;
const projectRoot = path.resolve(scriptDir, '..');

require('dotenv').config({ path: path.join(projectRoot, '.env') });
const fs = require('fs');
const mongoose = require('mongoose');

// Import Article model directly to avoid any index.js issues
const Article = require(path.join(projectRoot, 'models', 'Article'));

async function updateArticleTitles(jsonFilePath, applyChanges = false) {
  console.log('📝 Article Title Update Script');
  console.log('================================\n');
  console.log(`Mode: ${applyChanges ? '🔴 APPLY (will modify database)' : '🟢 DRY RUN (no changes)'}\n`);

  // Validate file path
  if (!jsonFilePath) {
    console.error('❌ Usage: node scripts/update-article-titles.js <path-to-json-file> [--apply]');
    process.exit(1);
  }

  const absolutePath = path.resolve(jsonFilePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ File not found: ${absolutePath}`);
    process.exit(1);
  }

  // Load JSON file
  let articles;
  try {
    const fileContent = fs.readFileSync(absolutePath, 'utf-8');
    articles = JSON.parse(fileContent);
    console.log(`📂 Loaded ${articles.length} articles from JSON\n`);
  } catch (error) {
    console.error(`❌ Failed to parse JSON: ${error.message}`);
    process.exit(1);
  }

  // Connect to database
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI environment variable not set');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');
  } catch (error) {
    console.error(`❌ Failed to connect to MongoDB: ${error.message}`);
    process.exit(1);
  }

  // Track results
  const results = {
    matched: 0,
    changed: 0,
    unchanged: 0,
    notFound: 0,
    errors: 0
  };

  const changes = [];
  const notFound = [];

  console.log('Processing articles...\n');
  console.log('─'.repeat(80));

  for (let i = 0; i < articles.length; i++) {
    const jsonArticle = articles[i];
    const sourceUrl = jsonArticle.url;
    const newTitle = jsonArticle.title;

    if (!sourceUrl) {
      console.log(`⚠️  [${i + 1}] Skipping - no URL in JSON`);
      results.errors++;
      continue;
    }

    if (!newTitle) {
      console.log(`⚠️  [${i + 1}] Skipping - no title in JSON for ${sourceUrl}`);
      results.errors++;
      continue;
    }

    try {
      // Find article by exact sourceUrl match
      const dbArticle = await Article.findOne({ sourceUrl: sourceUrl }).lean();

      if (!dbArticle) {
        notFound.push({ url: sourceUrl, title: newTitle });
        results.notFound++;
        continue;
      }

      results.matched++;
      const oldTitle = dbArticle.title;

      // Compare titles (trim whitespace for comparison)
      if (oldTitle.trim() === newTitle.trim()) {
        results.unchanged++;
        continue;
      }

      // Title is different - log the change
      results.changed++;
      changes.push({
        _id: dbArticle._id,
        sourceUrl,
        oldTitle,
        newTitle
      });

      console.log(`✏️  [${i + 1}] Title change detected:`);
      console.log(`    URL: ${sourceUrl.substring(0, 60)}...`);
      console.log(`    OLD: ${oldTitle.substring(0, 60)}${oldTitle.length > 60 ? '...' : ''}`);
      console.log(`    NEW: ${newTitle.substring(0, 60)}${newTitle.length > 60 ? '...' : ''}`);
      console.log('');

    } catch (error) {
      console.error(`❌ [${i + 1}] Error processing ${sourceUrl}: ${error.message}`);
      results.errors++;
    }
  }

  console.log('─'.repeat(80));
  console.log('\n📊 Summary:');
  console.log(`   Total in JSON:    ${articles.length}`);
  console.log(`   Matched in DB:    ${results.matched}`);
  console.log(`   Titles changed:   ${results.changed}`);
  console.log(`   Titles unchanged: ${results.unchanged}`);
  console.log(`   Not found in DB:  ${results.notFound}`);
  console.log(`   Errors:           ${results.errors}`);

  // Show not found articles if any
  if (notFound.length > 0 && notFound.length <= 10) {
    console.log('\n⚠️  Articles not found in database:');
    notFound.forEach((item, idx) => {
      console.log(`   ${idx + 1}. ${item.url}`);
    });
  } else if (notFound.length > 10) {
    console.log(`\n⚠️  ${notFound.length} articles not found (showing first 10):`);
    notFound.slice(0, 10).forEach((item, idx) => {
      console.log(`   ${idx + 1}. ${item.url}`);
    });
  }

  // Apply changes if requested
  if (applyChanges && changes.length > 0) {
    console.log('\n🔄 Applying changes to database...\n');

    let updateCount = 0;
    for (const change of changes) {
      try {
        await Article.updateOne(
          { _id: change._id },
          { $set: { title: change.newTitle } }
        );
        updateCount++;
      } catch (error) {
        console.error(`❌ Failed to update ${change.sourceUrl}: ${error.message}`);
      }
    }

    console.log(`✅ Successfully updated ${updateCount}/${changes.length} articles`);
  } else if (!applyChanges && changes.length > 0) {
    console.log('\n💡 To apply these changes, run with --apply flag:');
    console.log(`   node scripts/update-article-titles.js ${jsonFilePath} --apply`);
  } else if (changes.length === 0) {
    console.log('\n✅ No changes needed - all titles are already up to date');
  }

  await mongoose.disconnect();
  console.log('\n👋 Done');
}

// Parse command line arguments
const args = process.argv.slice(2);
const jsonFilePath = args.find(arg => !arg.startsWith('--'));
const applyChanges = args.includes('--apply');

updateArticleTitles(jsonFilePath, applyChanges).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
