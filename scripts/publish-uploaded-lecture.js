#!/usr/bin/env node
/**
 * Script to publish uploaded lectures
 *
 * Usage:
 *   node scripts/publish-uploaded-lecture.js --id <lectureId>           # Publish by ID
 *   node scripts/publish-uploaded-lecture.js --series <seriesId>        # Publish all in series
 *   node scripts/publish-uploaded-lecture.js --with-audio               # Publish all with audio
 *   node scripts/publish-uploaded-lecture.js --recent [hours]           # Publish recently uploaded (default: 24h)
 *   node scripts/publish-uploaded-lecture.js --all                      # Publish all unpublished
 *   node scripts/publish-uploaded-lecture.js --dry-run                  # Preview without changes
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  id: null,
  series: null,
  withAudio: false,
  recent: null,
  all: false,
  dryRun: false
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--id':
      options.id = args[++i];
      break;
    case '--series':
      options.series = args[++i];
      break;
    case '--with-audio':
      options.withAudio = true;
      break;
    case '--recent':
      // Check if next arg is a number or another flag
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        options.recent = parseInt(nextArg);
        i++;
      } else {
        options.recent = 24; // Default to 24 hours
      }
      break;
    case '--all':
      options.all = true;
      break;
    case '--dry-run':
      options.dryRun = true;
      break;
    case '--help':
    case '-h':
      printUsage();
      process.exit(0);
  }
}

function printUsage() {
  console.log(`
📚 Publish Uploaded Lecture Script
===================================

Usage:
  node scripts/publish-uploaded-lecture.js [options]

Options:
  --id <lectureId>     Publish a specific lecture by its MongoDB ID
  --series <seriesId>  Publish all unpublished lectures in a series
  --with-audio         Publish all unpublished lectures that have audio files
  --recent [hours]     Publish lectures uploaded in the last N hours (default: 24)
  --all                Publish all unpublished lectures
  --dry-run            Preview changes without actually publishing
  --help, -h           Show this help message

Examples:
  # Publish a specific lecture
  node scripts/publish-uploaded-lecture.js --id 65abc123def456

  # Publish all lectures in a series
  node scripts/publish-uploaded-lecture.js --series 65abc123def456

  # Publish all lectures with audio (most common after bulk upload)
  node scripts/publish-uploaded-lecture.js --with-audio

  # Publish lectures uploaded in the last 6 hours
  node scripts/publish-uploaded-lecture.js --recent 6

  # Preview what would be published without making changes
  node scripts/publish-uploaded-lecture.js --with-audio --dry-run
`);
}

// Validate options
const hasOption = options.id || options.series || options.withAudio || options.recent || options.all;
if (!hasOption) {
  console.error('❌ Error: No option specified. Use --help to see available options.\n');
  printUsage();
  process.exit(1);
}

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected\n');

    const { Lecture, Series } = require('../models');

    // Build query based on options
    let query = { published: false };
    let description = '';

    if (options.id) {
      query._id = options.id;
      description = `lecture with ID: ${options.id}`;
    } else if (options.series) {
      query.seriesId = options.series;
      const series = await Series.findById(options.series);
      description = series
        ? `lectures in series: "${series.titleArabic}"`
        : `lectures in series ID: ${options.series}`;
    } else if (options.withAudio) {
      query.audioUrl = { $exists: true, $ne: null, $ne: '' };
      description = 'lectures with audio files';
    } else if (options.recent) {
      const hoursAgo = new Date(Date.now() - options.recent * 60 * 60 * 1000);
      query.createdAt = { $gte: hoursAgo };
      description = `lectures created in the last ${options.recent} hours`;
    } else if (options.all) {
      description = 'all unpublished lectures';
    }

    // Find matching lectures
    const lectures = await Lecture.find(query)
      .populate('sheikhId', 'nameArabic nameEnglish')
      .populate('seriesId', 'titleArabic titleEnglish')
      .sort({ createdAt: -1 });

    if (lectures.length === 0) {
      console.log(`ℹ️  No unpublished ${description} found.\n`);
      process.exit(0);
    }

    console.log(`📋 Found ${lectures.length} unpublished ${description}:\n`);
    console.log('─'.repeat(80));

    lectures.forEach((lecture, index) => {
      const hasAudio = lecture.audioUrl ? '🎵' : '⚠️ ';
      const sheikh = lecture.sheikhId?.nameArabic || 'Unknown';
      const series = lecture.seriesId?.titleArabic || 'Standalone';

      console.log(`${index + 1}. ${hasAudio} ${lecture.titleArabic}`);
      console.log(`   Sheikh: ${sheikh} | Series: ${series}`);
      console.log(`   Created: ${lecture.createdAt.toISOString()}`);
      if (!lecture.audioUrl) {
        console.log(`   ⚠️  Warning: No audio file attached`);
      }
      console.log('');
    });

    console.log('─'.repeat(80));

    if (options.dryRun) {
      console.log('\n🔍 DRY RUN - No changes made.');
      console.log(`   Would publish ${lectures.length} lecture(s).\n`);
      process.exit(0);
    }

    // Publish the lectures
    const lectureIds = lectures.map(l => l._id);
    const result = await Lecture.updateMany(
      { _id: { $in: lectureIds } },
      { $set: { published: true } }
    );

    console.log(`\n✅ Published ${result.modifiedCount} lecture(s)!`);

    // Show summary
    const totalPublished = await Lecture.countDocuments({ published: true });
    const totalUnpublished = await Lecture.countDocuments({ published: false });

    console.log(`\n📊 Summary:`);
    console.log(`   Total published: ${totalPublished}`);
    console.log(`   Total unpublished: ${totalUnpublished}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
