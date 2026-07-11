const mongoose = require('mongoose');
const path = require('path');

// Database health state - start unhealthy until connection confirmed
let dbHealthy = false;
let lastHealthCheck = Date.now();
let consecutiveFailures = 0;
let initialConnectionAttempted = false;

// Configuration
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const MAX_CONSECUTIVE_FAILURES = 2; // Fail-fast after 2 consecutive failures
const RECOVERY_CHECK_INTERVAL = 60000; // Check for recovery every 60 seconds

/**
 * Check if MongoDB connection is healthy
 */
function isDbHealthy() {
  const state = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  return state === 1;
}

/**
 * Update health status based on connection state
 */
function updateHealthStatus(healthy) {
  initialConnectionAttempted = true;

  if (healthy) {
    if (!dbHealthy) {
      console.warn('✅ Database connection recovered');
    }
    dbHealthy = true;
    consecutiveFailures = 0;
  } else {
    consecutiveFailures++;
    // Fail fast on initial connection failure or after threshold
    if (!dbHealthy || consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      if (dbHealthy) {
        console.error('❌ Database connection failed - entering maintenance mode');
      }
      dbHealthy = false;
    }
  }
  lastHealthCheck = Date.now();
}

/**
 * Check if an error is a MongoDB connection/timeout error
 */
function isMongoError(err) {
  if (!err) return false;

  const mongoErrorNames = [
    'MongoNetworkError',
    'MongoNetworkTimeoutError',
    'MongoServerSelectionError',
    'MongoTimeoutError',
    'MongoWriteConcernError'
  ];

  const mongoErrorCodes = [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ENETUNREACH'
  ];

  // Check error name
  if (mongoErrorNames.includes(err.name)) {
    return true;
  }

  // Check error code
  if (err.code && mongoErrorCodes.includes(err.code)) {
    return true;
  }

  // Check for timeout in message
  if (err.message && (
    err.message.includes('timed out') ||
    err.message.includes('timeout') ||
    err.message.includes('buffering timed out') ||
    err.message.includes('Server selection timed out') ||
    err.message.includes('connection')
  )) {
    return true;
  }

  // Check for Mongoose-specific timeout
  if (err.name === 'MongooseError' && err.message.includes('buffering timed out')) {
    return true;
  }

  return false;
}

/**
 * Middleware to check database health before processing requests
 * Redirects to maintenance page if DB is unhealthy
 */
function dbHealthMiddleware(req, res, next) {
  // Always allow access to static assets, health endpoint, and maintenance page
  const bypassPaths = [
    '/maintenance',
    '/health',
    '/favicon',
    '/fonts',
    '/css',
    '/js',
    '/images'
  ];

  if (bypassPaths.some(p => req.path.startsWith(p))) {
    return next();
  }

  // Periodic health check based on connection state
  if (Date.now() - lastHealthCheck > HEALTH_CHECK_INTERVAL) {
    updateHealthStatus(isDbHealthy());
  }

  // If database is unhealthy, redirect to maintenance
  if (!dbHealthy) {
    // For API requests, return JSON error
    if (req.path.startsWith('/api/')) {
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable',
        maintenance: true
      });
    }

    // For HTML requests, render maintenance page
    return res.status(503).render('public/maintenance', { layout: false });
  }

  next();
}

/**
 * Error handler middleware for MongoDB errors
 * Should be used as Express error handler
 */
function dbErrorHandler(err, req, res, next) {
  // Check if this is a MongoDB error
  if (isMongoError(err)) {
    console.error('❌ MongoDB Error detected:', err.message);
    updateHealthStatus(false);

    // For API requests, return JSON error
    if (req.path.startsWith('/api/')) {
      return res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable',
        maintenance: true
      });
    }

    // For HTML requests, render maintenance page
    return res.status(503).render('public/maintenance', { layout: false });
  }

  // Pass non-MongoDB errors to default handler
  next(err);
}

/**
 * Setup mongoose connection event listeners for health tracking
 */
function setupDbHealthListeners() {
  // Check if already connected (in case listeners set up after connection)
  if (isDbHealthy()) {
    updateHealthStatus(true);
  }

  mongoose.connection.on('connected', () => {
    updateHealthStatus(true);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected - entering maintenance mode');
    updateHealthStatus(false);
  });

  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err.message);
    updateHealthStatus(false);
  });

  // Periodic recovery check when in maintenance mode
  setInterval(() => {
    if (!dbHealthy) {
      const currentlyHealthy = isDbHealthy();
      if (currentlyHealthy) {
        console.warn('🔄 Database connection recovered');
        updateHealthStatus(true);
      }
    }
  }, RECOVERY_CHECK_INTERVAL);
}

/**
 * Get current health status (for health endpoint)
 */
function getHealthStatus() {
  return {
    database: dbHealthy ? 'healthy' : 'degraded',
    connectionState: mongoose.connection.readyState,
    lastCheck: new Date(lastHealthCheck).toISOString(),
    consecutiveFailures
  };
}

/**
 * Manually set maintenance mode (for testing or manual intervention)
 */
function setMaintenanceMode(enabled) {
  dbHealthy = !enabled;
  if (enabled) {
    console.warn('⚠️ Maintenance mode manually enabled');
  } else {
    console.warn('✅ Maintenance mode manually disabled');
  }
}

module.exports = {
  dbHealthMiddleware,
  dbErrorHandler,
  setupDbHealthListeners,
  getHealthStatus,
  setMaintenanceMode,
  isMongoError
};
