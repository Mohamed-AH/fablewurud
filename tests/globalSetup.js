/**
 * Jest Global Setup
 *
 * Starts a single MongoMemoryServer instance shared across all test suites.
 * This prevents port conflicts when multiple test files run in parallel.
 *
 * Uses file-based config sharing since globalSetup runs in a separate process.
 */

const fs = require('fs');
const path = require('path');

// Load .env.test BEFORE importing mongodb-memory-server
// This ensures MONGOMS_VERSION is set before the module reads it
require('dotenv').config({ path: '.env.test' });

// Fallback version if not set in .env.test
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.11';

const { MongoMemoryServer } = require('mongodb-memory-server');

const CONFIG_PATH = path.join(__dirname, '.mongo-config.json');

module.exports = async function globalSetup() {
  // Skip if MONGODB_URI is already set (CI environment with external MongoDB)
  if (process.env.MONGODB_URI) {
    // Write config so tests know to use external MongoDB
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ uri: process.env.MONGODB_URI, external: true, available: true }));
    return;
  }

  try {
    // Create a single MongoMemoryServer instance
    const mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();

    // Write URI to config file for test workers to read
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ uri, external: false, available: true }));

    // Store server instance globally for teardown
    global.__MONGO_SERVER__ = mongoServer;
  } catch (error) {
    // MongoMemoryServer failed to start (e.g., binary download blocked)
    // Write config so tests know MongoDB is unavailable
    console.warn('MongoMemoryServer failed to start:', error.message);
    console.warn('Tests requiring MongoDB will be skipped.');
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ uri: null, external: false, available: false, error: error.message }));
  }
};
