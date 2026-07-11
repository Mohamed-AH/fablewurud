#!/usr/bin/env node
/**
 * Fix Audio URLs for specific lectures
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Lecture = require('../models/Lecture');

const updates = [
  {
    id: '69881e54549b2171ebd7bb76',
    audioUrl: 'https://objectstorage.me-jeddah-1.oraclecloud.com/n/axnhmvvtw4ep/b/wurud-audio/o/%25D9%2583%25D8%25AA%25D8%25A7%25D8%25A8_%25D8%25A7%25D9%2584%25D8%25B5%25D9%258A%25D8%25A7%25D9%2585_%25D8%25A2%25D8%25AF%25D8%25A7%25D8%25A8_%25D8%25A7%25D9%2584%25D9%2585%25D8%25B4%25D9%258A_%25D8%25B9%25D9%2584%25D9%2589_%25D8%25A7%25D9%2584%25D8%25B5%25D9%2584%25D8%25A7%25D8%25A9_01.m4a'
  },
  {
    id: '69881e54549b2171ebd7bb7a',
    audioUrl: 'https://objectstorage.me-jeddah-1.oraclecloud.com/n/axnhmvvtw4ep/b/wurud-audio/o/%25D9%2583%25D8%25AA%25D8%25A7%25D8%25A8__%2523%25D8%25A7%25D9%2584%25D8%25B5%25D9%258A%25D8%25A7%25D9%2585_%25D9%2585%25D9%2586_%25D8%25A2%25D8%25AF%25D8%25A7%25D8%25A8_%25D8%25A7%25D9%2584%25D9%2585%25D8%25B4%25D9%258A_%25D8%25A5%25D9%2584%25D9%2589_%25D8%25A7%25D9%2584%25D8%25B5%25D9%2584%25D8%25A7%25D8%25A9.m4a'
  },
  {
    id: '69881e54549b2171ebd7bb7e',
    audioUrl: 'https://objectstorage.me-jeddah-1.oraclecloud.com/n/axnhmvvtw4ep/b/wurud-audio/o/%25D9%2583%25D8%25AA%25D8%25A7%25D8%25A8_%25D8%25A7%25D9%2584%25D8%25B5%25D9%258A%25D8%25A7%25D9%2585_%25D8%25A2%25D8%25AF%25D8%25A7%25D8%25A8_%25D8%25A7%25D9%2584%25D9%2585%25D8%25B4%25D9%258A_%25D8%25A5%25D9%2584%25D9%2589_%25D8%25A7%25D9%2584%25D8%25B5%25D9%2584%25D8%25A7%25D8%25A9_03.m4a'
  },
  {
    id: '69881e54549b2171ebd7bb82',
    audioUrl: 'https://objectstorage.me-jeddah-1.oraclecloud.com/n/axnhmvvtw4ep/b/wurud-audio/o/%25D9%2583%25D8%25AA%25D8%25A7%25D8%25A8_%25D8%25A7%25D9%2584%25D8%25B5%25D9%258A%25D8%25A7%25D9%2585_%25D8%25A2%25D8%25AF%25D8%25A7%25D8%25A8_%25D8%25A7%25D9%2584%25D9%2585%25D8%25B4%25D9%258A_%25D8%25A5%25D9%2584%25D9%2589_%25D8%25A7%25D9%2584%25D8%25B5%25D9%2584%25D8%25A7%25D8%25A9_04.m4a'
  },
  {
    id: '69881e54549b2171ebd7bb86',
    audioUrl: 'https://objectstorage.me-jeddah-1.oraclecloud.com/n/axnhmvvtw4ep/b/wurud-audio/o/%25D9%2583%25D8%25AA%25D8%25A7%25D8%25A8_%25D8%25A7%25D9%2584%25D8%25B5%25D9%258A%25D8%25A7%25D9%2585_%25D9%2583%25D8%25AA%25D8%25A7%25D8%25A8_%25D8%25A2%25D8%25AF%25D8%25A7%25D8%25A8_%25D8%25A7%25D9%2584%25D9%2585%25D8%25B4%25D9%258A_%25D8%25A5%25D9%2584%25D9%2589_%25D8%25A7%25D9%2584%25D8%25B5%25D9%2584%25D8%25A7%25D8%25A9_05.m4a'
  },
  {
    id: '69881e55549b2171ebd7bb8a',
    audioUrl: 'https://objectstorage.me-jeddah-1.oraclecloud.com/n/axnhmvvtw4ep/b/wurud-audio/o/%25D9%2583%25D8%25AA%25D8%25A7%25D8%25A8_%25D8%25A7%25D9%2584%25D8%25B5%25D9%258A%25D8%25A7%25D9%2585_%25D9%2583%25D8%25AA%25D8%25A7%25D8%25A8_%25D8%25A2%25D8%25AF%25D8%25A7%25D8%25A8_%25D8%25A7%25D9%2584%25D9%2585%25D8%25B4%25D9%258A_%25D8%25A5%25D9%2584%25D9%2589_%25D8%25A7%25D9%2584%25D8%25B5%25D9%2584%25D8%25A7%25D8%25A9_06.m4a'
  }
];

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected\n');

  let updated = 0;
  let notFound = 0;

  for (const { id, audioUrl } of updates) {
    const result = await Lecture.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { $set: { audioUrl } }
    );

    if (result.matchedCount > 0) {
      console.log(`Updated: ${id}`);
      updated++;
    } else {
      console.log(`NOT FOUND: ${id}`);
      notFound++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Not found: ${notFound}`);
  await mongoose.connection.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
