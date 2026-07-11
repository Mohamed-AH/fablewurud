#!/usr/bin/env node
/**
 * Fix specific lectures by matching metadata.excelFilename with OCI files
 */

require('dotenv').config();

const mongoose = require('mongoose');

const lectureIds = [
  '6975bbf46613f0950b9cc10b',
  '6975bc0b6613f0950b9cc1f5',
  '6975bbc56613f0950b9cbee9',
  '6975bbe46613f0950b9cc051',
  '6975bbd56613f0950b9cbf9d',
  '6975bbc46613f0950b9cbee3',
  '6975bc056613f0950b9cc1b9',
  '6975bbf86613f0950b9cc135',
  '6975bbf36613f0950b9cc0ff',
  '6975bbfa6613f0950b9cc14d',
  '6975bc026613f0950b9cc19b',
  '6975bc046613f0950b9cc1b3',
  '6975bbff6613f0950b9cc183'
];

async function main() {
  const dryRun = !process.argv.includes('--apply');

  console.log('🔧 Fix Lectures Audio Script');
  console.log('============================\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made');
    console.log('   Run with --apply to actually update the database\n');
  }

  // Connect to MongoDB
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected\n');

  const { Lecture } = require('../models');
  const { listObjects, getPublicUrl } = require('../utils/ociStorage');

  // Get OCI files
  console.log('Fetching OCI files...');
  const ociFiles = await listObjects('', 500);
  console.log(`✅ Found ${ociFiles.length} files in OCI\n`);

  // Create a map of base filename -> full OCI filename
  const ociFileMap = new Map();
  ociFiles.forEach(f => {
    if (f && f.name) {
      // Map by base name (without extension)
      const baseName = f.name.toLowerCase().replace(/\.(mp3|m4a|wav|ogg|flac)$/i, '');
      ociFileMap.set(baseName, f.name);
    }
  });

  let updated = 0;
  let notFound = 0;
  let noMetadata = 0;

  for (const id of lectureIds) {
    const lecture = await Lecture.findById(id);

    if (!lecture) {
      console.log(`❌ Lecture not found: ${id}`);
      continue;
    }

    console.log(`\n${lecture.titleArabic}`);
    console.log(`   ID: ${id}`);

    if (!lecture.metadata || !lecture.metadata.excelFilename) {
      console.log(`   ⚠️  No metadata.excelFilename - skipping`);
      noMetadata++;
      continue;
    }

    const excelFilename = lecture.metadata.excelFilename;
    console.log(`   📁 Expected: ${excelFilename}`);

    // Find matching OCI file
    const baseName = excelFilename.toLowerCase().replace(/\.(mp3|m4a|wav|ogg|flac)$/i, '');
    const ociFileName = ociFileMap.get(baseName);

    if (!ociFileName) {
      console.log(`   ❌ No matching file in OCI`);
      notFound++;
      continue;
    }

    const audioUrl = getPublicUrl(ociFileName);
    console.log(`   ✅ Found: ${ociFileName}`);
    console.log(`   🔗 URL: ${audioUrl}`);

    if (!dryRun) {
      await Lecture.updateOne(
        { _id: id },
        {
          $set: {
            audioFileName: ociFileName,
            audioUrl: audioUrl
          }
        }
      );
      console.log(`   ✅ Updated!`);
    } else {
      console.log(`   (would update)`);
    }
    updated++;
  }

  console.log('\n' + '='.repeat(40));
  console.log('SUMMARY');
  console.log('='.repeat(40));
  console.log(`Total lectures: ${lectureIds.length}`);
  console.log(`Matched & ${dryRun ? 'would update' : 'updated'}: ${updated}`);
  console.log(`No matching OCI file: ${notFound}`);
  console.log(`No metadata.excelFilename: ${noMetadata}`);

  if (dryRun && updated > 0) {
    console.log('\n💡 Run with --apply to update the database');
  }

  await mongoose.disconnect();
  console.log('\n✅ Done');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
