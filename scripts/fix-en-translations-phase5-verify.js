/**
 * Phase 5: Verify English Translations
 *
 * Checks:
 * - All EN fields have proper Latin characters (no Arabic)
 * - All slugs are URL-safe
 * - No duplicate slugs within entity types
 *
 * Run: node scripts/fix-en-translations-phase5-verify.js
 * Requires: .env file with MONGODB_URI
 */

const mongoose = require('mongoose');
const { Sheikh, Series, Lecture, Section } = require('../models');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

// Check if a string contains Arabic characters
function hasArabic(str) {
  return /[\u0600-\u06FF]/.test(str || '');
}

// Check if slug is URL-safe
function isUrlSafe(str) {
  if (!str) return false;
  return /^[a-z0-9-]+$/.test(str);
}

async function verifyTranslations() {
  try {
    if (!MONGODB_URI) {
      console.log('❌ MONGODB_URI not found in environment.');
      console.log('   Please create a .env file with your MongoDB connection string.\n');
      process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    console.log('═'.repeat(80));
    console.log('PHASE 5: VERIFY ENGLISH TRANSLATIONS');
    console.log('═'.repeat(80));
    console.log();

    const issues = [];
    const summary = {
      sheikh: { total: 0, issues: 0 },
      sections: { total: 0, issues: 0 },
      series: { total: 0, issues: 0 },
      lectures: { total: 0, issues: 0 }
    };

    // ═══════════════════════════════════════════════════════════════════
    // CHECK SHEIKH
    // ═══════════════════════════════════════════════════════════════════
    console.log('Checking Sheikh records...');
    const sheikhs = await Sheikh.find({}).lean();
    summary.sheikh.total = sheikhs.length;

    for (const s of sheikhs) {
      if (hasArabic(s.nameEnglish)) {
        issues.push({ entity: 'Sheikh', id: s.shortId, field: 'nameEnglish', value: s.nameEnglish });
        summary.sheikh.issues++;
      }
      if (hasArabic(s.slug_en)) {
        issues.push({ entity: 'Sheikh', id: s.shortId, field: 'slug_en', value: s.slug_en });
        summary.sheikh.issues++;
      }
      if (s.slug_en && !isUrlSafe(s.slug_en)) {
        issues.push({ entity: 'Sheikh', id: s.shortId, field: 'slug_en (not URL-safe)', value: s.slug_en });
        summary.sheikh.issues++;
      }
    }
    console.log(`   ${sheikhs.length} records checked, ${summary.sheikh.issues} issues\n`);

    // ═══════════════════════════════════════════════════════════════════
    // CHECK SECTIONS
    // ═══════════════════════════════════════════════════════════════════
    console.log('Checking Section records...');
    const sections = await Section.find({}).lean();
    summary.sections.total = sections.length;

    for (const s of sections) {
      if (hasArabic(s.titleEnglish)) {
        issues.push({ entity: 'Section', id: s.slug, field: 'titleEnglish', value: s.titleEnglish });
        summary.sections.issues++;
      }
    }
    console.log(`   ${sections.length} records checked, ${summary.sections.issues} issues\n`);

    // ═══════════════════════════════════════════════════════════════════
    // CHECK SERIES
    // ═══════════════════════════════════════════════════════════════════
    console.log('Checking Series records...');
    const series = await Series.find({}).lean();
    summary.series.total = series.length;

    const seriesSlugs = new Set();
    for (const s of series) {
      if (hasArabic(s.titleEnglish)) {
        issues.push({ entity: 'Series', id: s.shortId, field: 'titleEnglish', value: s.titleEnglish });
        summary.series.issues++;
      }
      if (hasArabic(s.slug_en)) {
        issues.push({ entity: 'Series', id: s.shortId, field: 'slug_en', value: s.slug_en });
        summary.series.issues++;
      }
      if (s.slug_en && !isUrlSafe(s.slug_en)) {
        issues.push({ entity: 'Series', id: s.shortId, field: 'slug_en (not URL-safe)', value: s.slug_en });
        summary.series.issues++;
      }
      // Check for duplicates
      if (s.slug_en && seriesSlugs.has(s.slug_en)) {
        issues.push({ entity: 'Series', id: s.shortId, field: 'slug_en (DUPLICATE)', value: s.slug_en });
        summary.series.issues++;
      }
      if (s.slug_en) seriesSlugs.add(s.slug_en);
    }
    console.log(`   ${series.length} records checked, ${summary.series.issues} issues\n`);

    // ═══════════════════════════════════════════════════════════════════
    // CHECK LECTURES
    // ═══════════════════════════════════════════════════════════════════
    console.log('Checking Lecture records...');
    const lectures = await Lecture.find({}).lean();
    summary.lectures.total = lectures.length;

    const lectureSlugs = new Set();
    let arabicTitleCount = 0;
    let arabicSlugCount = 0;

    for (const lec of lectures) {
      if (hasArabic(lec.titleEnglish)) {
        arabicTitleCount++;
        if (arabicTitleCount <= 5) { // Only log first 5
          issues.push({ entity: 'Lecture', id: lec.shortId, field: 'titleEnglish', value: lec.titleEnglish?.substring(0, 50) + '...' });
        }
        summary.lectures.issues++;
      }
      if (hasArabic(lec.slug_en)) {
        arabicSlugCount++;
        if (arabicSlugCount <= 5) {
          issues.push({ entity: 'Lecture', id: lec.shortId, field: 'slug_en', value: lec.slug_en });
        }
        summary.lectures.issues++;
      }
      if (lec.slug_en && !isUrlSafe(lec.slug_en) && !hasArabic(lec.slug_en)) {
        issues.push({ entity: 'Lecture', id: lec.shortId, field: 'slug_en (not URL-safe)', value: lec.slug_en });
        summary.lectures.issues++;
      }
      // Check for duplicates
      if (lec.slug_en && lectureSlugs.has(lec.slug_en)) {
        issues.push({ entity: 'Lecture', id: lec.shortId, field: 'slug_en (DUPLICATE)', value: lec.slug_en });
        summary.lectures.issues++;
      }
      if (lec.slug_en) lectureSlugs.add(lec.slug_en);
    }

    if (arabicTitleCount > 5) {
      issues.push({ entity: 'Lecture', id: '-', field: 'titleEnglish', value: `... and ${arabicTitleCount - 5} more with Arabic` });
    }
    if (arabicSlugCount > 5) {
      issues.push({ entity: 'Lecture', id: '-', field: 'slug_en', value: `... and ${arabicSlugCount - 5} more with Arabic` });
    }

    console.log(`   ${lectures.length} records checked, ${summary.lectures.issues} issues\n`);

    // ═══════════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════════
    console.log('═'.repeat(80));
    console.log('VERIFICATION SUMMARY');
    console.log('═'.repeat(80));
    console.log();

    const totalIssues = summary.sheikh.issues + summary.sections.issues + summary.series.issues + summary.lectures.issues;

    console.log('┌─────────────┬─────────┬────────┐');
    console.log('│ Entity      │ Total   │ Issues │');
    console.log('├─────────────┼─────────┼────────┤');
    console.log(`│ Sheikh      │ ${String(summary.sheikh.total).padStart(7)} │ ${String(summary.sheikh.issues).padStart(6)} │`);
    console.log(`│ Sections    │ ${String(summary.sections.total).padStart(7)} │ ${String(summary.sections.issues).padStart(6)} │`);
    console.log(`│ Series      │ ${String(summary.series.total).padStart(7)} │ ${String(summary.series.issues).padStart(6)} │`);
    console.log(`│ Lectures    │ ${String(summary.lectures.total).padStart(7)} │ ${String(summary.lectures.issues).padStart(6)} │`);
    console.log('├─────────────┼─────────┼────────┤');
    console.log(`│ TOTAL       │ ${String(summary.sheikh.total + summary.sections.total + summary.series.total + summary.lectures.total).padStart(7)} │ ${String(totalIssues).padStart(6)} │`);
    console.log('└─────────────┴─────────┴────────┘');
    console.log();

    if (totalIssues === 0) {
      console.log('✅ ALL CHECKS PASSED! No Arabic characters found in English fields.');
      console.log('   All slugs are URL-safe and unique.\n');
    } else {
      console.log(`⚠️  Found ${totalIssues} issues that need attention:\n`);

      // Group issues by entity
      const groupedIssues = {};
      for (const issue of issues) {
        if (!groupedIssues[issue.entity]) groupedIssues[issue.entity] = [];
        groupedIssues[issue.entity].push(issue);
      }

      for (const [entity, entityIssues] of Object.entries(groupedIssues)) {
        console.log(`${entity}:`);
        entityIssues.forEach(i => {
          console.log(`   #${i.id} ${i.field}: "${i.value}"`);
        });
        console.log();
      }

      console.log('─'.repeat(60));
      console.log('Run the appropriate fix script to resolve issues:');
      console.log('  Phase 1 (Sheikh):   node scripts/fix-en-translations-phase1.js');
      console.log('  Phase 3 (Series):   node scripts/fix-en-translations-phase3.js');
      console.log('  Phase 4 (Lectures): node scripts/fix-en-translations-phase4.js');
      console.log();
    }

    process.exit(totalIssues > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyTranslations();
