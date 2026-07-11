#!/usr/bin/env node
/**
 * Audio Diagnosis Script
 *
 * Analyzes the relationship between:
 * - Audio files in a directory
 * - Lecture records in MongoDB
 * - OCI upload status
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac'];

async function main() {
  const audioDir = process.argv[2];

  console.log('🔍 Audio Diagnosis Tool');
  console.log('========================\n');

  // Connect to MongoDB
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected\n');

  const { Lecture } = require('../models');

  // Get all lectures
  const allLectures = await Lecture.find({}).lean();
  console.log(`📚 Total lectures in database: ${allLectures.length}\n`);

  // Categorize lectures
  const withOciUrl = allLectures.filter(l => l.audioUrl && l.audioUrl.includes('objectstorage'));
  const withAudioFileName = allLectures.filter(l => l.audioFileName);
  const withoutAudioFileName = allLectures.filter(l => !l.audioFileName);
  const withoutOciUrl = allLectures.filter(l => !l.audioUrl || !l.audioUrl.includes('objectstorage'));

  console.log('='.repeat(60));
  console.log('📊 DATABASE STATUS');
  console.log('='.repeat(60));
  console.log(`  Lectures with OCI URL (streaming from cloud): ${withOciUrl.length}`);
  console.log(`  Lectures without OCI URL (need migration): ${withoutOciUrl.length}`);
  console.log(`  Lectures with audioFileName: ${withAudioFileName.length}`);
  console.log(`  Lectures WITHOUT audioFileName: ${withoutAudioFileName.length}`);
  console.log('');

  // Show lectures without audioFileName
  if (withoutAudioFileName.length > 0) {
    console.log('='.repeat(60));
    console.log('⚠️  LECTURES WITHOUT audioFileName (cannot match to files):');
    console.log('='.repeat(60));
    withoutAudioFileName.forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.titleArabic || l.titleEnglish || 'Untitled'}`);
      console.log(`     ID: ${l._id}`);
      if (l.audioPath) console.log(`     audioPath: ${l.audioPath}`);
    });
    console.log('');
  }

  // Show lectures that need OCI migration
  if (withoutOciUrl.length > 0 && withoutOciUrl.length <= 30) {
    console.log('='.repeat(60));
    console.log('📋 LECTURES NEEDING OCI MIGRATION:');
    console.log('='.repeat(60));
    withoutOciUrl.forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.titleArabic || l.titleEnglish || 'Untitled'}`);
      console.log(`     audioFileName: ${l.audioFileName || 'NOT SET'}`);
    });
    console.log('');
  }

  // If audio directory provided, analyze files
  if (audioDir && fs.existsSync(audioDir)) {
    console.log('='.repeat(60));
    console.log(`📁 ANALYZING FILES IN: ${audioDir}`);
    console.log('='.repeat(60));

    const files = fs.readdirSync(audioDir).filter(f => {
      const ext = path.extname(f).toLowerCase();
      return AUDIO_EXTENSIONS.includes(ext);
    });

    console.log(`  Total audio files: ${files.length}\n`);

    // Try to match files to lectures
    const matched = [];
    const unmatched = [];

    for (const file of files) {
      const baseName = path.basename(file, path.extname(file));

      // Try different matching strategies
      const lecture = await Lecture.findOne({
        $or: [
          { audioFileName: file },
          { audioFileName: baseName },
          { audioFileName: { $regex: baseName.replace(/[-_]/g, '.*'), $options: 'i' } }
        ]
      }).lean();

      if (lecture) {
        matched.push({ file, lecture });
      } else {
        unmatched.push(file);
      }
    }

    console.log(`  ✅ Files matched to lectures: ${matched.length}`);
    console.log(`  ❌ Files with no matching lecture: ${unmatched.length}\n`);

    if (unmatched.length > 0 && unmatched.length <= 50) {
      console.log('  Unmatched files (orphans):');
      unmatched.forEach((f, i) => {
        console.log(`    ${i + 1}. ${f}`);
      });
      console.log('');
    }

    // Find lectures with audioFileName that don't have matching files
    const fileSet = new Set(files.map(f => f.toLowerCase()));
    const baseNameSet = new Set(files.map(f => path.basename(f, path.extname(f)).toLowerCase()));

    const lecturesWithMissingFiles = withAudioFileName.filter(l => {
      const fileName = l.audioFileName.toLowerCase();
      const baseName = path.basename(l.audioFileName, path.extname(l.audioFileName)).toLowerCase();
      return !fileSet.has(fileName) && !baseNameSet.has(baseName);
    });

    if (lecturesWithMissingFiles.length > 0) {
      console.log('='.repeat(60));
      console.log('⚠️  LECTURES WITH audioFileName BUT NO MATCHING FILE:');
      console.log('='.repeat(60));
      lecturesWithMissingFiles.slice(0, 30).forEach((l, i) => {
        console.log(`  ${i + 1}. ${l.titleArabic || l.titleEnglish}`);
        console.log(`     audioFileName: ${l.audioFileName}`);
      });
      if (lecturesWithMissingFiles.length > 30) {
        console.log(`  ... and ${lecturesWithMissingFiles.length - 30} more`);
      }
      console.log('');
    }
  }

  // Show sample of audioFileName formats in DB
  console.log('='.repeat(60));
  console.log('📝 SAMPLE audioFileName VALUES IN DATABASE:');
  console.log('='.repeat(60));
  const samples = withAudioFileName.slice(0, 10);
  samples.forEach((l, i) => {
    console.log(`  ${i + 1}. "${l.audioFileName}"`);
    console.log(`     Title: ${l.titleArabic || l.titleEnglish}`);
  });
  console.log('');

  // Show what the upload script is looking for
  console.log('='.repeat(60));
  console.log('💡 DIAGNOSIS SUMMARY');
  console.log('='.repeat(60));
  console.log(`
The upload script matches files by audioFileName field.

Current stats:
  - ${allLectures.length} total lectures
  - ${withAudioFileName.length} have audioFileName set
  - ${withOciUrl.length} are already using OCI
  - ${withoutAudioFileName.length} have NO audioFileName (can't match)

To fix unmatched lectures, you need to either:
1. Update audioFileName in DB to match actual file names
2. Rename files to match audioFileName in DB
3. Run a manual update for specific lectures
`);

  await mongoose.disconnect();
  console.log('\n✅ Done');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
