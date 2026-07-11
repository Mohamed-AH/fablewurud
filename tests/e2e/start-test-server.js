/**
 * Test Server Startup Script
 *
 * This script reads the MongoDB URI from either:
 * 1. The .mongo-uri file created by global-setup.js
 * 2. The MONGODB_URI environment variable (CI mode)
 *
 * And starts the server with the correct environment variables.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const MONGO_URI_FILE = path.join(__dirname, '.mongo-uri');

// Get MongoDB URI from file or environment
function getMongoUri(maxWaitMs = 30000) {
  return new Promise((resolve, reject) => {
    // First check if file already exists (global-setup already ran)
    if (fs.existsSync(MONGO_URI_FILE)) {
      const uri = fs.readFileSync(MONGO_URI_FILE, 'utf-8').trim();
      if (uri) {
        resolve(uri);
        return;
      }
    }

    // In CI or direct run, check environment variable
    if (process.env.MONGODB_URI) {
      resolve(process.env.MONGODB_URI);
      return;
    }

    // Wait for the file to be created by global-setup
    const startTime = Date.now();
    const check = () => {
      if (fs.existsSync(MONGO_URI_FILE)) {
        const uri = fs.readFileSync(MONGO_URI_FILE, 'utf-8').trim();
        if (uri) {
          resolve(uri);
          return;
        }
      }

      if (Date.now() - startTime > maxWaitMs) {
        reject(new Error(`Timeout waiting for MongoDB URI file: ${MONGO_URI_FILE}\nEnsure global-setup.js runs before this script, or set MONGODB_URI environment variable.`));
        return;
      }

      setTimeout(check, 100);
    };

    check();
  });
}

async function startServer() {
  try {
    const mongoUri = await getMongoUri();
    console.log(`Test server: Using MongoDB at ${mongoUri}`);

    // Set up environment for the server
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      MONGODB_URI: mongoUri,
      SESSION_SECRET: 'test-session-secret-for-e2e',
      PORT: '3000',
      // Disable OCI storage for tests (use mock or skip)
      OCI_DISABLED: 'true',
    };

    // Start the actual server
    const serverProcess = spawn('node', ['server.js'], {
      cwd: path.join(__dirname, '../..'),
      env,
      stdio: 'inherit',
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start test server:', err);
      process.exit(1);
    });

    serverProcess.on('exit', (code) => {
      process.exit(code || 0);
    });

    // Forward termination signals
    process.on('SIGTERM', () => serverProcess.kill('SIGTERM'));
    process.on('SIGINT', () => serverProcess.kill('SIGINT'));

  } catch (error) {
    console.error('Test server startup error:', error.message);
    process.exit(1);
  }
}

startServer();
