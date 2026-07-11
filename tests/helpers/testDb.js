/**
 * Test Database Helper
 *
 * Provides MongoDB connection for tests.
 * The MongoMemoryServer is started once in globalSetup.js and shared across all tests.
 * MONGODB_URI environment variable is set by globalSetup.js (local) or CI environment.
 */

// Production guard: prevent this module from being loaded in production
if (process.env.NODE_ENV === 'production') {
  throw new Error(
    'Test database helper should never be loaded in production. ' +
    'Ensure devDependencies are not installed (use npm ci --omit=dev).'
  );
}

const mongoose = require('mongoose');

let connectionPromise = null;

/**
 * Check if MongoDB is available
 */
function isAvailable() {
  return process.env.MONGODB_UNAVAILABLE !== 'true' && !!process.env.MONGODB_URI;
}

/**
 * Connect to test database
 * Uses MONGODB_URI env var set by globalSetup.js or CI environment
 */
async function connect() {
  // Check if MongoDB is available
  if (!isAvailable()) {
    throw new Error(
      'MongoDB is not available. MongoMemoryServer failed to start (binary download may be blocked). ' +
      'Tests requiring MongoDB will be skipped.'
    );
  }

  // Reuse existing connection if available
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // If already connecting, wait for that
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error(
        'MONGODB_URI not set. Ensure Jest globalSetup is configured correctly.'
      );
    }

    await mongoose.connect(mongoUri);
    return mongoose.connection;
  })();

  return connectionPromise;
}

/**
 * Disconnect from database
 * Note: MongoMemoryServer cleanup is handled by globalTeardown.js
 */
async function disconnect() {
  connectionPromise = null;

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

/**
 * Clear all collections in the database
 * Useful for cleaning up between tests
 */
async function clearDatabase() {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

/**
 * Drop the database entirely
 * Use with caution - only for test cleanup
 */
async function dropDatabase() {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  await mongoose.connection.db.dropDatabase();
}

module.exports = {
  isAvailable,
  connect,
  disconnect,
  clearDatabase,
  dropDatabase
};
