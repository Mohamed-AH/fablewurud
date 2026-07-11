/**
 * Playwright Global Teardown - Cleans up the test database after E2E tests.
 * Stops the mongodb-memory-server instance started in global-setup.
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Path where the MongoDB URI was stored
const MONGO_URI_FILE = path.join(__dirname, '.mongo-uri');

async function globalTeardown() {
  try {
    // Read the MongoDB URI from the file
    let mongoUri;
    if (fs.existsSync(MONGO_URI_FILE)) {
      mongoUri = fs.readFileSync(MONGO_URI_FILE, 'utf-8').trim();
    } else {
      mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wurud_test';
    }

    // Clean up the database
    await mongoose.connect(mongoUri);

    const { Sheikh, Series, Lecture, Schedule, PageView, SiteSettings } = require('../../models');

    await Sheikh.deleteMany({});
    await Series.deleteMany({});
    await Lecture.deleteMany({});
    // Clean up optional models if they exist
    if (Schedule) await Schedule.deleteMany({});
    if (PageView) await PageView.deleteMany({});
    if (SiteSettings) await SiteSettings.deleteMany({});

    await mongoose.disconnect();

    // Clean up the URI files
    if (fs.existsSync(MONGO_URI_FILE)) {
      fs.unlinkSync(MONGO_URI_FILE);
    }
    if (fs.existsSync(MONGO_URI_FILE + '.json')) {
      fs.unlinkSync(MONGO_URI_FILE + '.json');
    }

    console.log('E2E global teardown: Database cleaned up and MongoDB Memory Server stopped');
  } catch (error) {
    console.error('E2E global teardown error:', error.message);
  }
}

module.exports = globalTeardown;
