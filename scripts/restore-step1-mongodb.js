#!/usr/bin/env node
/**
 * Step 1: Export Audio Filenames from MongoDB
 * Run this on Google Cloud VM where MongoDB is accessible
 *
 * Usage: node scripts/restore-step1-mongodb.js [--env .env] [--output filenames.json]
 *
 * Output: JSON file with all audioFileName records to transfer to local PC
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const fs = require('fs');
const mongoose = require('mongoose');

// Parse arguments
const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
const OUTPUT_FILE = outputIndex !== -1 ? args[outputIndex + 1] : 'audio-filenames.json';

async function exportFilenames() {
  console.log('\n📊 Step 1: Export Audio Filenames from MongoDB');
  console.log('==============================================\n');

  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');

    // Define schema inline (standalone)
    const lectureSchema = new mongoose.Schema({
      audioFileName: String,
      titleArabic: String,
      titleEnglish: String,
      shortId: Number
    }, { collection: 'lectures', strict: false });

    const Lecture = mongoose.model('Lecture', lectureSchema);

    // Fetch all lectures with audioFileName
    console.log('Fetching lecture records...');
    const lectures = await Lecture.find(
      { audioFileName: { $exists: true, $ne: null, $ne: '' } },
      'audioFileName titleArabic titleEnglish shortId'
    ).lean();

    console.log(`Found ${lectures.length} lectures with audio files\n`);

    // Prepare export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      totalRecords: lectures.length,
      records: lectures.map(l => ({
        audioFileName: l.audioFileName,
        titleArabic: l.titleArabic || '',
        titleEnglish: l.titleEnglish || '',
        shortId: l.shortId
      }))
    };

    // Write to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(exportData, null, 2));
    console.log(`✅ Exported to: ${OUTPUT_FILE}`);
    console.log(`   Total records: ${lectures.length}`);

    // Also create a simple text list for quick reference
    const textFile = OUTPUT_FILE.replace('.json', '.txt');
    const textContent = lectures.map(l => l.audioFileName).join('\n');
    fs.writeFileSync(textFile, textContent);
    console.log(`   Text list: ${textFile}\n`);

    // Show sample
    console.log('Sample records:');
    lectures.slice(0, 5).forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.audioFileName}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Done! Transfer the JSON file to your local PC.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

exportFilenames();
