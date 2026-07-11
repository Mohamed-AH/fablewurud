/**
 * Jest Environment Setup
 *
 * This file runs BEFORE test files are imported (via setupFiles).
 * Configure environment variables here that must be available
 * before any test modules are loaded.
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.test
require('dotenv').config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Configure MongoMemoryServer version BEFORE any test imports it
// This prevents download failures when default versions are unavailable
// for the CI platform (e.g., ubuntu2204)
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.11';

// Read MongoDB URI from globalSetup config file
// This ensures all test workers use the same MongoMemoryServer instance
const CONFIG_PATH = path.join(__dirname, '.mongo-config.json');
if (fs.existsSync(CONFIG_PATH)) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  if (config.available && config.uri) {
    process.env.MONGODB_URI = config.uri;
  } else {
    // MongoDB is not available - tests requiring it will be skipped
    process.env.MONGODB_UNAVAILABLE = 'true';
  }
}
