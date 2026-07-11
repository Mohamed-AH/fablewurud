/**
 * Phase 1: Fix Sheikh Record - English translations
 *
 * Fixes:
 * 1. nameEnglish: Arabic text → English text
 * 2. slug_en: Arabic characters → Latin transliteration
 *
 * Run: node scripts/fix-en-translations-phase1.js [--dry-run]
 * Requires: .env file with MONGODB_URI
 */

const mongoose = require('mongoose');
const { Sheikh } = require('../models');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = process.argv.includes('--dry-run');

async function fixSheikhRecord() {
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
    console.log('PHASE 1: FIX SHEIKH RECORD' + (DRY_RUN ? ' [DRY RUN]' : ''));
    console.log('═'.repeat(80));
    if (DRY_RUN) console.log('⚠️  DRY RUN MODE - No changes will be made\n');
    console.log();

    const sheikh = await Sheikh.findOne({});

    if (!sheikh) {
      console.log('❌ No sheikh found in database');
      process.exit(1);
    }

    console.log('📋 CURRENT STATE:');
    console.log('─'.repeat(60));
    console.log(`   Name (AR): ${sheikh.nameArabic}`);
    console.log(`   Name (EN): ${sheikh.nameEnglish}`);
    console.log(`   Slug (EN): ${sheikh.slug_en}`);
    console.log(`   Slug (AR): ${sheikh.slug_ar}`);
    console.log(`   Bio (EN):  ${sheikh.bioEnglish ? '✓ Present' : '✗ Missing'}`);
    console.log();

    // Check if nameEnglish contains Arabic
    const hasArabicInNameEN = /[\u0600-\u06FF]/.test(sheikh.nameEnglish || '');
    const hasArabicInSlugEN = /[\u0600-\u06FF]/.test(sheikh.slug_en || '');

    if (!hasArabicInNameEN && !hasArabicInSlugEN) {
      console.log('✅ Sheikh record already has proper English fields!');
      console.log('   No changes needed.\n');
      process.exit(0);
    }

    console.log('🔧 FIXES TO APPLY:');
    console.log('─'.repeat(60));

    const updates = {};

    // Fix 1: nameEnglish
    if (hasArabicInNameEN) {
      const newNameEN = 'Sheikh Hassan bin Muhammad Mansour Al-Daghriri';
      console.log(`   ✎ nameEnglish:`);
      console.log(`     FROM: "${sheikh.nameEnglish}"`);
      console.log(`     TO:   "${newNameEN}"`);
      updates.nameEnglish = newNameEN;
    }

    // Fix 2: slug_en
    if (hasArabicInSlugEN) {
      const newSlugEN = 'hassan-al-daghriri';
      console.log(`   ✎ slug_en:`);
      console.log(`     FROM: "${sheikh.slug_en}"`);
      console.log(`     TO:   "${newSlugEN}"`);
      updates.slug_en = newSlugEN;
    }

    console.log();

    // Apply updates
    if (Object.keys(updates).length > 0) {
      if (DRY_RUN) {
        console.log('🔍 DRY RUN - Would update 1 record\n');
      } else {
        await Sheikh.updateOne({ _id: sheikh._id }, { $set: updates });
        console.log('✅ Sheikh record updated successfully!\n');

        // Verify
        const updated = await Sheikh.findById(sheikh._id);
        console.log('📋 VERIFIED STATE:');
        console.log('─'.repeat(60));
        console.log(`   Name (AR): ${updated.nameArabic}`);
        console.log(`   Name (EN): ${updated.nameEnglish}`);
        console.log(`   Slug (EN): ${updated.slug_en}`);
        console.log(`   Slug (AR): ${updated.slug_ar}`);
        console.log();
      }
    }

    console.log('═'.repeat(80));
    console.log('PHASE 1 COMPLETE' + (DRY_RUN ? ' [DRY RUN]' : ''));
    console.log('═'.repeat(80));
    if (DRY_RUN) console.log('\nRun without --dry-run to apply changes.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixSheikhRecord();
