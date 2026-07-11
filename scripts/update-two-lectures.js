#!/usr/bin/env node
/**
 * One-off script to update two specific lectures with OCI audio URLs
 */

require('dotenv').config();
const mongoose = require('mongoose');

const updates = [
  {
    id: '6975bc106613f0950b9cc225',
    audioFileName: 'AUD-20260103-WA0003.m4a',
    audioUrl: 'https://objectstorage.me-jeddah-1.oraclecloud.com/n/axnhmvvtw4ep/b/wurud-audio/o/AUD-20260103-WA0003.m4a'
  },
  {
    id: '6975bc116613f0950b9cc237',
    audioFileName: 'AUD-20260103-WA0003fadhl.m4a',
    audioUrl: 'https://objectstorage.me-jeddah-1.oraclecloud.com/n/axnhmvvtw4ep/b/wurud-audio/o/AUD-20260103-WA0003fadhl.m4a'
  }
];

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected\n');

  const { Lecture } = require('../models');

  for (const update of updates) {
    const lecture = await Lecture.findById(update.id);
    if (!lecture) {
      console.log(`❌ Lecture not found: ${update.id}`);
      continue;
    }

    console.log(`Updating: ${lecture.titleArabic}`);
    console.log(`  ID: ${update.id}`);
    console.log(`  audioFileName: ${update.audioFileName}`);

    await Lecture.updateOne(
      { _id: update.id },
      { $set: { audioFileName: update.audioFileName, audioUrl: update.audioUrl } }
    );

    console.log(`  ✅ Updated!\n`);
  }

  await mongoose.disconnect();
  console.log('Done!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
