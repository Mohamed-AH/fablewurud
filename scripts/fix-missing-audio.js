#!/usr/bin/env node
/**
 * Fix Missing Audio Script
 *
 * Diagnoses lectures without audioFileName and helps match them
 * with available audio files.
 *
 * Usage:
 *   node scripts/fix-missing-audio.js                    # List lectures without audio
 *   node scripts/fix-missing-audio.js --list-oci        # Also list OCI files
 *   node scripts/fix-missing-audio.js --match           # Try to suggest matches
 */

require('dotenv').config();

const mongoose = require('mongoose');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const listOci = args.includes('--list-oci');
  const tryMatch = args.includes('--match');

  console.log('🔍 Missing Audio Diagnosis Tool');
  console.log('================================\n');

  // Connect to MongoDB
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected\n');

  const { Lecture, Series, Sheikh } = require('../models');

  // Find lectures without audioFileName
  const lecturesWithoutAudio = await Lecture.find({
    $or: [
      { audioFileName: { $exists: false } },
      { audioFileName: null },
      { audioFileName: '' }
    ]
  })
  .populate('sheikhId', 'nameArabic')
  .populate('seriesId', 'titleArabic')
  .lean();

  console.log('='.repeat(60));
  console.log(`📋 LECTURES WITHOUT AUDIO FILE (${lecturesWithoutAudio.length} found)`);
  console.log('='.repeat(60));

  if (lecturesWithoutAudio.length === 0) {
    console.log('\n✅ All lectures have audio files assigned!\n');
  } else {
    lecturesWithoutAudio.forEach((lecture, i) => {
      console.log(`\n${i + 1}. ${lecture.titleArabic}`);
      console.log(`   ID: ${lecture._id}`);
      if (lecture.sheikhId) {
        console.log(`   Sheikh: ${lecture.sheikhId.nameArabic}`);
      }
      if (lecture.seriesId) {
        console.log(`   Series: ${lecture.seriesId.titleArabic}`);
      }
      if (lecture.lectureNumber) {
        console.log(`   Lecture #: ${lecture.lectureNumber}`);
      }
      // Show expected filename from Excel import (key for matching!)
      if (lecture.metadata && lecture.metadata.excelFilename) {
        console.log(`   📁 Expected file: ${lecture.metadata.excelFilename}`);
      }
      if (lecture.dateRecordedHijri) {
        console.log(`   Date: ${lecture.dateRecordedHijri}`);
      }
    });
  }

  // List unassigned OCI files if requested
  if (listOci) {
    console.log('\n' + '='.repeat(60));
    console.log('☁️  CHECKING OCI FOR UNASSIGNED FILES');
    console.log('='.repeat(60));

    try {
      const { listObjects } = require('../utils/ociStorage');
      const ociFiles = await listObjects('', 500);

      // Get all assigned audioFileNames (filter out any null/undefined values)
      const assignedFiles = await Lecture.distinct('audioFileName', {
        audioFileName: { $exists: true, $ne: null, $ne: '' }
      });
      const assignedSet = new Set(
        assignedFiles
          .filter(f => f != null && typeof f === 'string')
          .map(f => f.toLowerCase())
      );

      // Find unassigned OCI files (filter out any with null names)
      const unassignedOci = ociFiles.filter(f =>
        f && f.name && typeof f.name === 'string' && !assignedSet.has(f.name.toLowerCase())
      );

      console.log(`\nTotal files in OCI: ${ociFiles.length}`);
      console.log(`Assigned to lectures: ${assignedFiles.length}`);
      console.log(`Unassigned (orphan) files: ${unassignedOci.length}`);

      if (unassignedOci.length > 0 && unassignedOci.length <= 50) {
        console.log('\nUnassigned files in OCI:');
        unassignedOci.forEach((f, i) => {
          const sizeMB = (f.size / 1024 / 1024).toFixed(2);
          console.log(`  ${i + 1}. ${f.name} (${sizeMB} MB)`);
        });
      } else if (unassignedOci.length > 50) {
        console.log(`\n(Too many to list - ${unassignedOci.length} files)`);
      }
    } catch (error) {
      console.log('\n⚠️  Could not list OCI files:', error.message);
    }
  }

  // Try to match lectures with files
  if (tryMatch && lecturesWithoutAudio.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('🔗 ATTEMPTING TO MATCH LECTURES WITH FILES');
    console.log('='.repeat(60));

    try {
      const { listObjects } = require('../utils/ociStorage');
      const ociFiles = await listObjects('', 500);
      // Filter out any files with null/undefined names
      const ociFileNames = ociFiles
        .filter(f => f && f.name && typeof f.name === 'string')
        .map(f => f.name);

      // Get assigned files to exclude them (filter out null values)
      const assignedFiles = await Lecture.distinct('audioFileName', {
        audioFileName: { $exists: true, $ne: null, $ne: '' }
      });
      const assignedSet = new Set(
        assignedFiles
          .filter(f => f != null && typeof f === 'string')
          .map(f => f.toLowerCase())
      );

      // Available files (not assigned)
      const availableFiles = ociFileNames.filter(f => !assignedSet.has(f.toLowerCase()));

      console.log(`\nAvailable unassigned files: ${availableFiles.length}`);

      if (availableFiles.length > 0) {
        console.log('\nMatching using metadata.excelFilename (same as bulk-upload page):');
        console.log('(You can use /admin/bulk-upload to upload matched files)\n');

        let matchedCount = 0;
        let unmatchedCount = 0;

        lecturesWithoutAudio.forEach((lecture, i) => {
          console.log(`${i + 1}. "${lecture.titleArabic}"`);

          // First: Try exact match with metadata.excelFilename (like bulk-upload page)
          let match = null;
          if (lecture.metadata && lecture.metadata.excelFilename) {
            const excelFilename = lecture.metadata.excelFilename.toLowerCase().replace(/\.(mp3|m4a|wav|ogg|flac)$/i, '');
            match = availableFiles.find(file => {
              const cleanFile = file.toLowerCase().replace(/\.(mp3|m4a|wav|ogg|flac)$/i, '');
              return cleanFile === excelFilename;
            });
            if (match) {
              console.log(`   ✅ EXACT MATCH: ${match}`);
              console.log(`      (matches metadata.excelFilename: ${lecture.metadata.excelFilename})`);
              matchedCount++;
              return;
            }
          }

          // Second: Try fuzzy match against title (like bulk-upload page)
          const cleanTitle = (lecture.titleArabic || '').toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\s]/gi, '');
          const titleWords = cleanTitle.split(/\s+/).filter(w => w.length > 3);

          let bestMatch = null;
          let bestScore = 0;

          availableFiles.forEach(file => {
            const cleanFile = file.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\s]/gi, '');
            let score = 0;
            titleWords.forEach(word => {
              if (cleanFile.includes(word)) {
                score += word.length;
              }
            });
            if (score > bestScore) {
              bestScore = score;
              bestMatch = file;
            }
          });

          if (bestScore > 10) {
            console.log(`   🔶 FUZZY MATCH: ${bestMatch} (score: ${bestScore})`);
            matchedCount++;
          } else {
            console.log(`   ❌ No match found`);
            if (lecture.metadata && lecture.metadata.excelFilename) {
              console.log(`      Expected file: ${lecture.metadata.excelFilename}`);
            }
            unmatchedCount++;
          }
        });

        console.log('\n' + '-'.repeat(40));
        console.log(`Summary: ${matchedCount} matched, ${unmatchedCount} unmatched`);
      }
    } catch (error) {
      console.log('\n⚠️  Could not match files:', error.message);
    }
  }

  // Print summary and instructions
  console.log('\n' + '='.repeat(60));
  console.log('💡 HOW TO FIX');
  console.log('='.repeat(60));
  console.log(`
To assign audio files to these lectures:

Option 1: Bulk Upload Page (Recommended)
  1. Go to /admin/bulk-upload
  2. Drag & drop audio files
  3. System auto-matches using metadata.excelFilename
  4. Click "Upload All Matched Files"

Option 2: Via Admin Panel (Single lecture)
  1. Go to /admin/lectures
  2. Click "Edit" on the lecture
  3. Set the "audioFileName" to the OCI file name
  4. Save

Option 3: Via MongoDB directly
  db.lectures.updateOne(
    { _id: ObjectId("LECTURE_ID") },
    { $set: {
        audioFileName: "filename.m4a",
        audioUrl: "https://objectstorage.me-jeddah-1.oraclecloud.com/n/NAMESPACE/b/BUCKET/o/filename.m4a"
    }}
  )
`);

  await mongoose.disconnect();
  console.log('\n✅ Done');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
