/**
 * Jest Global Teardown
 *
 * Stops the shared MongoMemoryServer instance after all tests complete.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '.mongo-config.json');

module.exports = async function globalTeardown() {
  // Stop the server if it was created by globalSetup
  if (global.__MONGO_SERVER__) {
    await global.__MONGO_SERVER__.stop();
  }

  // Clean up config file
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
};
