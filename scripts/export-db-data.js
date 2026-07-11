#!/usr/bin/env node
/**
 * Export Database Data Script
 *
 * Exports all lectures and series data to a readable text format for verification.
 *
 * Usage:
 *   node scripts/export-db-data.js --env .env --output data-export.txt
 *
 * Options:
 *   --env FILE     Path to .env file (default: .env)
 *   --output FILE  Output file path (required)
 *   --format       Output format: txt (default) or json
 *   --all          Export all fields (default: only essential fields)
 */

const fs = require('fs');

// Parse arguments
const args = process.argv.slice(2);
const envIndex = args.indexOf('--env');
const envPath = envIndex !== -1 ? args[envIndex + 1] : '.env';
const outputIndex = args.indexOf('--output');
const outputFile = outputIndex !== -1 ? args[outputIndex + 1] : null;
const formatIndex = args.indexOf('--format');
const format = formatIndex !== -1 ? args[formatIndex + 1] : 'txt';
const exportAll = args.includes('--all');

if (!outputFile) {
  console.error('❌ Error: --output FILE is required');
  console.error('Usage: node scripts/export-db-data.js --env .env --output data-export.txt');
  process.exit(1);
}

require('dotenv').config({ path: envPath });

if (!process.env.MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is not set.');
  process.exit(1);
}

const mongoose = require('mongoose');
const Lecture = require('../models/Lecture');
const Series = require('../models/Series');
const Sheikh = require('../models/Sheikh');
const Section = require('../models/Section');

async function exportData() {
  console.log('\n📦 Database Export Script');
  console.log('='.repeat(50));

  // Connect to MongoDB
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected\n');

  // Fetch all data
  console.log('📥 Fetching data...');

  const [series, lectures, sheikhs, sections] = await Promise.all([
    Series.find().populate('sectionId').lean(),
    Lecture.find().populate('seriesId', 'titleArabic slug').populate('sheikhId', 'nameArabic slug').lean(),
    Sheikh.find().lean(),
    Section.find().lean()
  ]);

  console.log(`   Series: ${series.length}`);
  console.log(`   Lectures: ${lectures.length}`);
  console.log(`   Sheikhs: ${sheikhs.length}`);
  console.log(`   Sections: ${sections.length}`);
  if (exportAll) {
    console.log('   Mode: Exporting ALL fields');
  }

  if (format === 'json') {
    // JSON format - always exports all fields
    const data = {
      exportDate: new Date().toISOString(),
      exportAll: true,
      stats: {
        series: series.length,
        lectures: lectures.length,
        sheikhs: sheikhs.length,
        sections: sections.length
      },
      sections,
      sheikhs,
      series,
      lectures
    };
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf8');
  } else {
    // Text format for easy verification
    let output = [];

    output.push('='.repeat(80));
    output.push('DATABASE EXPORT - ' + new Date().toISOString());
    output.push('Mode: ' + (exportAll ? 'FULL EXPORT (all fields)' : 'Essential fields only'));
    output.push('='.repeat(80));
    output.push('');

    // ========== SHEIKHS ==========
    output.push('');
    output.push('█'.repeat(80));
    output.push('SHEIKHS');
    output.push('█'.repeat(80));
    output.push('');

    for (const sheikh of sheikhs) {
      output.push(`ID: ${sheikh._id}`);
      if (exportAll) output.push(`Short ID: ${sheikh.shortId || '-'}`);
      output.push(`Name (AR): ${sheikh.nameArabic}`);
      output.push(`Name (EN): ${sheikh.nameEnglish || '-'}`);
      if (exportAll) output.push(`Honorific: ${sheikh.honorific || '-'}`);
      output.push(`Slug: ${sheikh.slug}`);
      if (exportAll) {
        output.push(`Slug (EN): ${sheikh.slug_en || '-'}`);
        output.push(`Slug (AR): ${sheikh.slug_ar || '-'}`);
        output.push(`Bio (AR): ${sheikh.bioArabic || '-'}`);
        output.push(`Bio (EN): ${sheikh.bioEnglish || '-'}`);
        output.push(`Photo URL: ${sheikh.photoUrl || '-'}`);
        output.push(`Lecture Count: ${sheikh.lectureCount || 0}`);
        output.push(`Created: ${sheikh.createdAt || '-'}`);
        output.push(`Updated: ${sheikh.updatedAt || '-'}`);
      } else {
        output.push(`Bio: ${(sheikh.bioArabic || '').substring(0, 100)}${(sheikh.bioArabic || '').length > 100 ? '...' : ''}`);
      }
      output.push('-'.repeat(40));
    }

    // ========== SECTIONS ==========
    if (exportAll && sections.length > 0) {
      output.push('');
      output.push('█'.repeat(80));
      output.push('SECTIONS');
      output.push('█'.repeat(80));
      output.push('');

      // Sort by displayOrder
      const sortedSections = [...sections].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));

      for (const section of sortedSections) {
        output.push(`ID: ${section._id}`);
        output.push(`Title (AR): ${section.title?.ar || '-'}`);
        output.push(`Title (EN): ${section.title?.en || '-'}`);
        output.push(`Slug: ${section.slug || '-'}`);
        output.push(`Description (AR): ${section.description?.ar || '-'}`);
        output.push(`Description (EN): ${section.description?.en || '-'}`);
        output.push(`Icon: ${section.icon || '-'}`);
        output.push(`Display Order: ${section.displayOrder || 0}`);
        output.push(`Is Visible: ${section.isVisible !== false ? 'Yes' : 'No'}`);
        output.push(`Is Default: ${section.isDefault ? 'Yes' : 'No'}`);
        output.push(`Collapsed By Default: ${section.collapsedByDefault ? 'Yes' : 'No'}`);
        output.push(`Max Visible: ${section.maxVisible || 5}`);
        output.push(`Created: ${section.createdAt || '-'}`);
        output.push(`Updated: ${section.updatedAt || '-'}`);
        output.push('-'.repeat(40));
      }
    }

    // ========== SERIES ==========
    output.push('');
    output.push('█'.repeat(80));
    output.push('SERIES');
    output.push('█'.repeat(80));
    output.push('');

    // Group series by similarity for easier comparison
    const seriesSorted = [...series].sort((a, b) =>
      (a.titleArabic || '').localeCompare(b.titleArabic || '', 'ar')
    );

    for (const s of seriesSorted) {
      output.push(`ID: ${s._id}`);
      if (exportAll) output.push(`Short ID: ${s.shortId || '-'}`);
      output.push(`Title (AR): ${s.titleArabic}`);
      output.push(`Title (EN): ${s.titleEnglish || '-'}`);
      output.push(`Slug: ${s.slug}`);
      if (exportAll) {
        output.push(`Slug (EN): ${s.slug_en || '-'}`);
        output.push(`Slug (AR): ${s.slug_ar || '-'}`);
        output.push(`Description (AR): ${s.descriptionArabic || '-'}`);
        output.push(`Description (EN): ${s.descriptionEnglish || '-'}`);
      }
      output.push(`Category: ${s.category || '-'}`);
      if (exportAll) {
        output.push(`Tags: ${(s.tags || []).join(', ') || '-'}`);
        output.push(`Book Title: ${s.bookTitle || '-'}`);
        output.push(`Book Author: ${s.bookAuthor || '-'}`);
      }
      output.push(`Lecture Count: ${s.lectureCount || 0}`);
      output.push(`Sheikh: ${s.sheikhId || '-'}`);
      if (exportAll) {
        output.push(`Thumbnail URL: ${s.thumbnailUrl || '-'}`);
        output.push(`Is Visible: ${s.isVisible !== false ? 'Yes' : 'No'}`);
        output.push(`Section: ${s.sectionId?.title?.en || s.sectionId?.slug || s.sectionId || '-'}`);
        output.push(`Section Order: ${s.sectionOrder || 0}`);
        output.push(`Created: ${s.createdAt || '-'}`);
        output.push(`Updated: ${s.updatedAt || '-'}`);
      }
      output.push('-'.repeat(40));
    }

    // ========== LECTURES BY SERIES ==========
    output.push('');
    output.push('█'.repeat(80));
    output.push('LECTURES (grouped by series)');
    output.push('█'.repeat(80));

    // Group lectures by series
    const lecturesBySeries = new Map();
    const noSeriesLectures = [];

    for (const lec of lectures) {
      const seriesId = lec.seriesId?._id?.toString() || lec.seriesId?.toString() || null;
      if (seriesId) {
        if (!lecturesBySeries.has(seriesId)) {
          lecturesBySeries.set(seriesId, []);
        }
        lecturesBySeries.get(seriesId).push(lec);
      } else {
        noSeriesLectures.push(lec);
      }
    }

    // Create series lookup
    const seriesLookup = new Map(series.map(s => [s._id.toString(), s]));

    // Output lectures by series
    for (const [seriesId, seriesLectures] of lecturesBySeries) {
      const seriesInfo = seriesLookup.get(seriesId);
      output.push('');
      output.push('═'.repeat(80));
      output.push(`SERIES: ${seriesInfo?.titleArabic || 'Unknown'}`);
      output.push(`Series Slug: ${seriesInfo?.slug || 'Unknown'}`);
      output.push(`Series ID: ${seriesId}`);
      output.push('═'.repeat(80));

      // Sort by lecture number
      seriesLectures.sort((a, b) => (a.lectureNumber || 0) - (b.lectureNumber || 0));

      for (const lec of seriesLectures) {
        output.push('');
        output.push(`  Lecture #${lec.lectureNumber || '?'}`);
        output.push(`  ID: ${lec._id}`);
        if (exportAll) output.push(`  Short ID: ${lec.shortId || '-'}`);
        output.push(`  Title (AR): ${lec.titleArabic}`);
        output.push(`  Title (EN): ${lec.titleEnglish || '-'}`);
        if (exportAll) {
          output.push(`  Description (AR): ${lec.descriptionArabic || '-'}`);
          output.push(`  Description (EN): ${lec.descriptionEnglish || '-'}`);
        }
        output.push(`  Slug: ${lec.slug}`);
        if (exportAll) {
          output.push(`  Slug (EN): ${lec.slug_en || '-'}`);
          output.push(`  Slug (AR): ${lec.slug_ar || '-'}`);
        }
        output.push(`  Audio: ${lec.audioFileName || 'NO AUDIO'}`);
        if (exportAll) {
          output.push(`  Audio URL: ${lec.audioUrl || '-'}`);
        }
        output.push(`  Duration: ${lec.duration || 0}s`);
        output.push(`  Duration Verified: ${lec.durationVerified ? 'Yes' : 'No'}`);
        if (exportAll) {
          output.push(`  File Size: ${lec.fileSize || 0} bytes`);
          output.push(`  Sort Order: ${lec.sortOrder || 0}`);
          output.push(`  Location: ${lec.location || '-'}`);
          output.push(`  Category: ${lec.category || '-'}`);
          output.push(`  Tags: ${(lec.tags || []).join(', ') || '-'}`);
          output.push(`  Sheikh: ${lec.sheikhId?.nameArabic || lec.sheikhId || '-'}`);
          output.push(`  Date Recorded: ${lec.dateRecorded || '-'}`);
          output.push(`  Date Recorded (Hijri): ${lec.dateRecordedHijri || '-'}`);
          output.push(`  Published: ${lec.published ? 'Yes' : 'No'}`);
          output.push(`  Featured: ${lec.featured ? 'Yes' : 'No'}`);
          output.push(`  Play Count: ${lec.playCount || 0}`);
          output.push(`  Download Count: ${lec.downloadCount || 0}`);
          if (lec.metadata && Object.keys(lec.metadata).length > 0) {
            output.push(`  Metadata: ${JSON.stringify(lec.metadata)}`);
          }
          output.push(`  Updated: ${lec.updatedAt || '-'}`);
        }
        output.push(`  Created: ${lec.createdAt || '-'}`);

        // Check for potential issues
        const issues = [];
        if (!lec.lectureNumber) issues.push('NO_LECTURE_NUMBER');
        if (!lec.audioFileName) issues.push('NO_AUDIO');
        if (!lec.slug) issues.push('NO_SLUG');
        if (lec.slug && lec.titleArabic && !lec.slug.includes(lec.lectureNumber?.toString())) {
          // Slug might not match lecture number
          issues.push('SLUG_MAY_NOT_MATCH_NUMBER');
        }

        if (issues.length > 0) {
          output.push(`  ⚠️ ISSUES: ${issues.join(', ')}`);
        }
        output.push('  ' + '-'.repeat(38));
      }
    }

    // Lectures without series
    if (noSeriesLectures.length > 0) {
      output.push('');
      output.push('═'.repeat(80));
      output.push('LECTURES WITHOUT SERIES');
      output.push('═'.repeat(80));

      for (const lec of noSeriesLectures) {
        output.push('');
        output.push(`  ID: ${lec._id}`);
        if (exportAll) output.push(`  Short ID: ${lec.shortId || '-'}`);
        output.push(`  Title (AR): ${lec.titleArabic}`);
        output.push(`  Title (EN): ${lec.titleEnglish || '-'}`);
        output.push(`  Slug: ${lec.slug}`);
        if (exportAll) {
          output.push(`  Slug (EN): ${lec.slug_en || '-'}`);
          output.push(`  Slug (AR): ${lec.slug_ar || '-'}`);
        }
        output.push(`  Audio: ${lec.audioFileName || 'NO AUDIO'}`);
        if (exportAll) {
          output.push(`  Audio URL: ${lec.audioUrl || '-'}`);
          output.push(`  Duration: ${lec.duration || 0}s`);
          output.push(`  Sheikh: ${lec.sheikhId?.nameArabic || lec.sheikhId || '-'}`);
          output.push(`  Published: ${lec.published ? 'Yes' : 'No'}`);
          output.push(`  Created: ${lec.createdAt || '-'}`);
        }
        output.push(`  ⚠️ NO SERIES ASSIGNED`);
        output.push('  ' + '-'.repeat(38));
      }
    }

    // ========== SUMMARY & POTENTIAL ISSUES ==========
    output.push('');
    output.push('█'.repeat(80));
    output.push('SUMMARY & POTENTIAL ISSUES');
    output.push('█'.repeat(80));
    output.push('');

    // Check for duplicate slugs
    const slugCounts = new Map();
    for (const lec of lectures) {
      const slug = lec.slug;
      slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1);
    }
    const duplicateSlugs = [...slugCounts.entries()].filter(([_, count]) => count > 1);

    if (duplicateSlugs.length > 0) {
      output.push('⚠️ DUPLICATE SLUGS FOUND:');
      for (const [slug, count] of duplicateSlugs) {
        output.push(`   "${slug}" appears ${count} times`);
        const matching = lectures.filter(l => l.slug === slug);
        for (const m of matching) {
          output.push(`      - ID: ${m._id}, Title: ${m.titleArabic?.substring(0, 50)}`);
        }
      }
      output.push('');
    }

    // Check for duplicate titles within same series
    output.push('Checking for duplicate titles within same series...');
    const titleBySeriesMap = new Map();
    for (const lec of lectures) {
      const key = `${lec.seriesId?._id || 'none'}::${lec.titleArabic}`;
      if (!titleBySeriesMap.has(key)) {
        titleBySeriesMap.set(key, []);
      }
      titleBySeriesMap.get(key).push(lec);
    }
    const duplicateTitles = [...titleBySeriesMap.entries()].filter(([_, lecs]) => lecs.length > 1);

    if (duplicateTitles.length > 0) {
      output.push('⚠️ DUPLICATE TITLES IN SAME SERIES:');
      for (const [key, lecs] of duplicateTitles) {
        output.push(`   Title: "${lecs[0].titleArabic?.substring(0, 60)}..."`);
        for (const l of lecs) {
          output.push(`      - ID: ${l._id}, Slug: ${l.slug}`);
        }
      }
      output.push('');
    }

    // Lectures without audio
    const noAudio = lectures.filter(l => !l.audioFileName);
    output.push(`📊 Lectures without audio: ${noAudio.length}`);

    // Lectures without lecture number
    const noNumber = lectures.filter(l => !l.lectureNumber);
    output.push(`📊 Lectures without lecture number: ${noNumber.length}`);

    // Lectures without series
    output.push(`📊 Lectures without series: ${noSeriesLectures.length}`);

    if (exportAll) {
      // Additional stats when exporting all
      const unpublished = lectures.filter(l => !l.published);
      output.push(`📊 Unpublished lectures: ${unpublished.length}`);

      const featured = lectures.filter(l => l.featured);
      output.push(`📊 Featured lectures: ${featured.length}`);

      const noShortId = lectures.filter(l => !l.shortId);
      output.push(`📊 Lectures without shortId: ${noShortId.length}`);

      const hiddenSeries = series.filter(s => s.isVisible === false);
      output.push(`📊 Hidden series: ${hiddenSeries.length}`);

      const seriesWithSection = series.filter(s => s.sectionId);
      output.push(`📊 Series with section assigned: ${seriesWithSection.length}`);

      output.push(`📊 Total sections: ${sections.length}`);
    }

    output.push('');
    output.push('='.repeat(80));
    output.push('END OF EXPORT');
    output.push('='.repeat(80));

    fs.writeFileSync(outputFile, output.join('\n'), 'utf8');
  }

  console.log(`\n✓ Data exported to: ${outputFile}`);

  await mongoose.disconnect();
  console.log('✓ Done!\n');
}

exportData().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
