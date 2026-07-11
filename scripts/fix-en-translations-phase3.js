/**
 * Phase 3: Fix Series Records - English translations
 *
 * Fixes:
 * - titleEnglish: Arabic text → English/transliterated text
 * - slug_en: Arabic characters → Latin transliteration
 * - descriptionEnglish: Stub descriptions → Full English (where applicable)
 *
 * Run: node scripts/fix-en-translations-phase3.js [--dry-run]
 * Requires: .env file with MONGODB_URI
 */

const mongoose = require('mongoose');
const { Series } = require('../models');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = process.argv.includes('--dry-run');

// Series translations mapping by shortId
// Based on REVIEW-TODO-2mar.md
const SERIES_TRANSLATIONS = {
  25: {
    titleEnglish: "Itmam al-Minnah: Explanation of Usul al-Sunnah",
    slug_en: "itmam-al-minnah-usul-al-sunnah"
  },
  5: {
    titleEnglish: "Irshad al-Sari: Explanation of al-Sunnah by al-Barbahari",
    slug_en: "irshad-al-sari-al-barbahari"
  },
  18: {
    titleEnglish: "Al-Afnan al-Nadiyyah - Ramadan Archive",
    slug_en: "al-afnan-al-nadiyyah-ramadan-archive"
  },
  16: {
    titleEnglish: "Al-Afnan al-Nadiyyah - Online",
    slug_en: "al-afnan-al-nadiyyah-online"
  },
  8: {
    titleEnglish: "Al-Tuhfah al-Najmiyyah: Explanation of 40 Nawawi Hadith",
    slug_en: "al-tuhfah-al-najmiyyah-40-nawawi"
  },
  11: {
    titleEnglish: "Al-Ta'liqat al-Bahiyyah on Creed Treatises",
    slug_en: "al-taliqat-al-bahiyyah-creed"
  },
  4: {
    titleEnglish: "Al-Tafsir al-Muyassar (Simplified Tafsir)",
    slug_en: "al-tafsir-al-muyassar"
  },
  26: {
    titleEnglish: "Al-Sharh al-Mujaz: Concise Explanation of Tawhid al-Khaliq",
    slug_en: "al-sharh-al-mujaz-tawhid"
  },
  3: {
    titleEnglish: "Al-Mulakhkhas al-Fiqhi (Fiqh Summary)",
    slug_en: "al-mulakhkhas-al-fiqhi"
  },
  19: {
    titleEnglish: "Al-Mulakhkhas al-Fiqhi - Ramadan Archive",
    slug_en: "al-mulakhkhas-al-fiqhi-ramadan-archive"
  },
  2: {
    titleEnglish: "Al-Mulakhkhas: Explanation of Kitab al-Tawhid",
    slug_en: "al-mulakhkhas-kitab-al-tawhid"
  },
  20: {
    titleEnglish: "Al-Mumti' Sharh Zad al-Mustaqni' - Ramadan Archive",
    slug_en: "al-mumti-zad-al-mustaqni-ramadan-archive"
  },
  7: {
    titleEnglish: "Al-Mawrid al-'Adhb al-Zulal",
    slug_en: "al-mawrid-al-adhb-al-zulal"
  },
  1: {
    titleEnglish: "Ta'sis al-Ahkam: Explanation of 'Umdat al-Ahkam",
    slug_en: "tasis-al-ahkam-umdat-al-ahkam"
  },
  21: {
    titleEnglish: "Ta'sis al-Ahkam - Ramadan Archive",
    slug_en: "tasis-al-ahkam-ramadan-archive"
  },
  27: {
    titleEnglish: "Ta'sis al-Ahkam - Book of Purification",
    slug_en: "tasis-al-ahkam-purification"
  },
  15: {
    titleEnglish: "Ta'sis al-Ahkam - Online",
    slug_en: "tasis-al-ahkam-online"
  },
  10: {
    titleEnglish: "Tanbih al-Anam: Benefits from Subul al-Salam",
    slug_en: "tanbih-al-anam-subul-al-salam"
  },
  22: {
    titleEnglish: "Tanbih al-Anam - Ramadan Archive",
    slug_en: "tanbih-al-anam-ramadan-archive"
  },
  12: {
    titleEnglish: "Friday Sermons",
    slug_en: "friday-sermons"
  },
  9: {
    titleEnglish: "Friday Sermons - Summarized Seerah",
    slug_en: "friday-sermons-summarized-seerah"
  },
  29: {
    titleEnglish: "Ramadan Lessons - Taysir al-'Ali al-Qadir (Ibn Kathir Summary)",
    slug_en: "ramadan-lessons-taysir-ibn-kathir"
  },
  28: {
    titleEnglish: "Ramadan Lessons - Ministry of Islamic Affairs",
    slug_en: "ramadan-lessons-ministry-islamic-affairs"
  },
  23: {
    titleEnglish: "Explanation of Kitab al-Fiqh al-Muyassar - Ramadan Archive",
    slug_en: "fiqh-al-muyassar-ramadan-archive"
  },
  6: {
    titleEnglish: "Sahih al-Bukhari",
    slug_en: "sahih-al-bukhari"
  },
  24: {
    titleEnglish: "Kitab Adab al-Mashi ila al-Salah - Ramadan Archive",
    slug_en: "adab-al-mashi-salah-ramadan-archive"
  },
  13: {
    titleEnglish: "Miscellaneous Lectures",
    slug_en: "miscellaneous-lectures"
  },
  14: {
    titleEnglish: "Brief Biography of the Prophet",
    slug_en: "brief-biography-prophet"
  },
  17: {
    titleEnglish: "Ma'arij al-Qabul: Explanation of Sullam al-Wusul - Online",
    slug_en: "maarij-al-qabul-online"
  }
};

// Check if a string contains Arabic characters
function hasArabic(str) {
  return /[\u0600-\u06FF]/.test(str || '');
}

async function fixSeriesRecords() {
  try {
    if (!MONGODB_URI) {
      console.log('❌ MONGODB_URI not found in environment.');
      console.log('   Please create a .env file with your MongoDB connection string.');
      console.log('   Example: MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/duroos\n');
      process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    console.log('═'.repeat(80));
    console.log('PHASE 3: FIX SERIES RECORDS - ENGLISH TRANSLATIONS' + (DRY_RUN ? ' [DRY RUN]' : ''));
    console.log('═'.repeat(80));
    if (DRY_RUN) console.log('⚠️  DRY RUN MODE - No changes will be made\n');
    console.log();

    const allSeries = await Series.find({}).sort({ shortId: 1 });
    console.log(`Found ${allSeries.length} series records.\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    const errors = [];

    for (const series of allSeries) {
      const translation = SERIES_TRANSLATIONS[series.shortId];

      if (!translation) {
        console.log(`⚠️  Series #${series.shortId} "${series.titleArabic}" - No translation mapping found`);
        skippedCount++;
        continue;
      }

      const updates = {};
      const changes = [];

      // Check titleEnglish
      if (hasArabic(series.titleEnglish) || !series.titleEnglish || series.titleEnglish === '-') {
        updates.titleEnglish = translation.titleEnglish;
        changes.push(`titleEnglish: "${series.titleEnglish || '-'}" → "${translation.titleEnglish}"`);
      }

      // Check slug_en
      if (hasArabic(series.slug_en) || !series.slug_en) {
        updates.slug_en = translation.slug_en;
        changes.push(`slug_en: "${series.slug_en || '-'}" → "${translation.slug_en}"`);
      }

      if (Object.keys(updates).length > 0) {
        try {
          if (!DRY_RUN) {
            await Series.updateOne({ _id: series._id }, { $set: updates });
          }
          console.log(`${DRY_RUN ? '🔍' : '✅'} Series #${series.shortId} "${series.titleArabic}"`);
          changes.forEach(c => console.log(`   ${c}`));
          console.log();
          updatedCount++;
        } catch (err) {
          console.log(`❌ Error updating Series #${series.shortId}: ${err.message}`);
          errors.push({ shortId: series.shortId, error: err.message });
        }
      } else {
        console.log(`✓  Series #${series.shortId} - Already has correct English fields`);
        skippedCount++;
      }
    }

    console.log();
    console.log('═'.repeat(80));
    console.log('PHASE 3 SUMMARY' + (DRY_RUN ? ' [DRY RUN]' : ''));
    console.log('═'.repeat(80));
    console.log(`   ${DRY_RUN ? 'Would update' : 'Updated'}: ${updatedCount} series`);
    console.log(`   Skipped: ${skippedCount} series`);
    console.log(`   Errors:  ${errors.length}`);

    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.forEach(e => console.log(`   - Series #${e.shortId}: ${e.error}`));
    }

    if (DRY_RUN) console.log('\nRun without --dry-run to apply changes.');
    console.log();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixSeriesRecords();
