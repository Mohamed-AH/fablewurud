/**
 * Article Import Script
 *
 * Imports articles from JSON file into the database.
 *
 * Usage: node scripts/import-articles.js <path-to-json-file>
 *
 * Expected JSON structure:
 * [
 *   {
 *     "type": "Asdaa" | "TelegramArticle",
 *     "date": "DD.MM.YYYY",
 *     "url": "https://...",
 *     "title": "Arabic title",
 *     "summary": "Short summary",
 *     "full_text": "Full article content"
 *   }
 * ]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Article } = require('../models');

function parseDate(dateStr) {
  if (!dateStr) return new Date();

  try {
    const parts = String(dateStr).split('.');
    if (parts.length === 3) {
      const [day, month, year] = parts.map(p => parseInt(p, 10));
      return new Date(year, month - 1, day);
    }
  } catch (error) {
    console.warn(`⚠️  Could not parse date: ${dateStr}, using current date`);
  }

  return new Date();
}

async function importArticles(jsonFilePath) {
  console.log('📚 Article Import Script');
  console.log('========================\n');

  // Validate file path
  if (!jsonFilePath) {
    console.error('❌ Usage: node scripts/import-articles.js <path-to-json-file>');
    process.exit(1);
  }

  const absolutePath = path.resolve(jsonFilePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ File not found: ${absolutePath}`);
    process.exit(1);
  }

  // Connect to database
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI not set in environment');
    process.exit(1);
  }

  console.log('🔌 Connecting to database...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to database\n');

  // Read and parse JSON
  console.log(`📖 Reading file: ${absolutePath}`);
  const rawData = fs.readFileSync(absolutePath, 'utf8');
  const articles = JSON.parse(rawData);

  console.log(`📊 Found ${articles.length} articles to import\n`);

  // Check for existing articles to avoid duplicates
  const existingCount = await Article.countDocuments();
  console.log(`📈 Current articles in database: ${existingCount}`);

  if (existingCount > 0) {
    console.log('⚠️  Articles already exist. Checking for duplicates by sourceUrl...\n');
  }

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < articles.length; i++) {
    const item = articles[i];

    try {
      // Check for duplicate by sourceUrl
      if (item.url) {
        const existing = await Article.findOne({ sourceUrl: item.url });
        if (existing) {
          skipped++;
          continue;
        }
      }

      const article = new Article({
        type: item.type || 'Asdaa',
        publishedAt: parseDate(item.date),
        sourceUrl: item.url || '',
        title: item.title || 'بدون عنوان',
        summary: item.summary || '',
        content: item.full_text || item.content || '',
        isPublished: true
      });

      await article.save();
      imported++;

      if ((i + 1) % 50 === 0) {
        console.log(`   Processed ${i + 1}/${articles.length}...`);
      }
    } catch (error) {
      errors++;
      console.error(`❌ Error importing article "${item.title?.substring(0, 30)}...": ${error.message}`);
    }
  }

  console.log('\n📊 Import Summary');
  console.log('=================');
  console.log(`✅ Imported: ${imported}`);
  console.log(`⏭️  Skipped (duplicates): ${skipped}`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`📚 Total in database: ${await Article.countDocuments()}`);

  await mongoose.disconnect();
  console.log('\n✅ Import complete!');
}

const jsonFilePath = process.argv[2];
importArticles(jsonFilePath).catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
