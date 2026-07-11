/**
 * Production Logging Utility
 *
 * Suppresses non-essential console output (log, debug, info) in production.
 * Only error and warn messages are preserved in production for critical diagnostics.
 *
 * Also provides Sentry breadcrumb methods for structured logging:
 * - logger.db(message, data)     - Database operations
 * - logger.oci(message, data)    - OCI storage operations
 * - logger.auth(message, data)   - Authentication events
 * - logger.search(message, data) - Search operations
 * - logger.audio(message, data)  - Audio processing
 * - logger.user(message, data)   - User actions
 */

const isProduction = process.env.NODE_ENV === 'production';

// Sentry is loaded lazily to avoid circular dependencies
let Sentry = null;

/**
 * Get Sentry instance (lazy load)
 * @returns {object|null} Sentry instance or null if not configured
 */
function getSentry() {
  if (Sentry === null && process.env.SENTRY_DSN) {
    try {
      Sentry = require('@sentry/node');
    } catch (e) {
      Sentry = false; // Mark as unavailable
    }
  }
  return Sentry || null;
}

/**
 * Add a breadcrumb to Sentry with proper structured format
 * @param {string} category - Category: 'db', 'oci', 'auth', 'search', 'audio', 'user'
 * @param {string} message - Human-readable message
 * @param {object} data - Additional context data
 * @param {string} level - Level: 'debug', 'info', 'warning', 'error'
 */
function addBreadcrumb(category, message, data = {}, level = 'info') {
  const sentry = getSentry();
  if (sentry) {
    sentry.addBreadcrumb({
      category: category,
      message: message,
      level: level,
      data: data
    });
  }
}

// Store original console methods
const originalConsole = {
  log: console.log,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error
};

/**
 * Logger object with environment-aware output
 * - In production: suppresses log, debug, info
 * - In development: all output enabled
 */
const logger = {
  /**
   * General logging - suppressed in production
   */
  log: isProduction
    ? () => {}
    : (...args) => originalConsole.log(...args),

  /**
   * Debug messages - suppressed in production
   */
  debug: isProduction
    ? () => {}
    : (...args) => originalConsole.debug('[DEBUG]', ...args),

  /**
   * Informational messages - suppressed in production
   */
  info: isProduction
    ? () => {}
    : (...args) => originalConsole.info('[INFO]', ...args),

  /**
   * Warning messages - always enabled (important for diagnostics)
   */
  warn: (...args) => originalConsole.warn('[WARN]', ...args),

  /**
   * Error messages - always enabled (critical for debugging)
   */
  error: (...args) => originalConsole.error('[ERROR]', ...args),

  // ===========================================
  // Sentry Breadcrumb Methods
  // ===========================================

  /**
   * Log database operation as Sentry breadcrumb
   * @param {string} message - Operation description
   * @param {object} data - Additional context (query, collection, etc.)
   */
  db: (message, data = {}) => {
    addBreadcrumb('db', message, data, 'info');
    if (!isProduction) originalConsole.log('[DB]', message, Object.keys(data).length ? data : '');
  },

  /**
   * Log OCI storage operation as Sentry breadcrumb
   * @param {string} message - Operation description
   * @param {object} data - Additional context (bucket, objectName, etc.)
   */
  oci: (message, data = {}) => {
    addBreadcrumb('oci', message, data, 'info');
    if (!isProduction) originalConsole.log('[OCI]', message, Object.keys(data).length ? data : '');
  },

  /**
   * Log authentication event as Sentry breadcrumb
   * @param {string} message - Event description
   * @param {object} data - Additional context (userId, method, etc.)
   */
  auth: (message, data = {}) => {
    addBreadcrumb('auth', message, data, 'info');
    if (!isProduction) originalConsole.log('[Auth]', message, Object.keys(data).length ? data : '');
  },

  /**
   * Log search operation as Sentry breadcrumb
   * @param {string} message - Operation description
   * @param {object} data - Additional context (query, resultCount, latencyMs, etc.)
   */
  search: (message, data = {}) => {
    addBreadcrumb('search', message, data, 'info');
    if (!isProduction) originalConsole.log('[Search]', message, Object.keys(data).length ? data : '');
  },

  /**
   * Log audio processing operation as Sentry breadcrumb
   * @param {string} message - Operation description
   * @param {object} data - Additional context (filename, duration, etc.)
   */
  audio: (message, data = {}) => {
    addBreadcrumb('audio', message, data, 'info');
    if (!isProduction) originalConsole.log('[Audio]', message, Object.keys(data).length ? data : '');
  },

  /**
   * Log user action as Sentry breadcrumb
   * @param {string} message - Action description
   * @param {object} data - Additional context (action, details, etc.)
   */
  user: (message, data = {}) => {
    addBreadcrumb('user', message, data, 'info');
    if (!isProduction) originalConsole.log('[User]', message, Object.keys(data).length ? data : '');
  },

  /**
   * Log warning with Sentry breadcrumb
   * @param {string} category - Breadcrumb category
   * @param {string} message - Warning message
   * @param {object} data - Additional context
   */
  warnBreadcrumb: (category, message, data = {}) => {
    addBreadcrumb(category, message, data, 'warning');
    originalConsole.warn(`[${category.toUpperCase()}]`, message, Object.keys(data).length ? data : '');
  },

  /**
   * Log error with Sentry breadcrumb
   * @param {string} category - Breadcrumb category
   * @param {string} message - Error message
   * @param {object} data - Additional context
   */
  errorBreadcrumb: (category, message, data = {}) => {
    addBreadcrumb(category, message, data, 'error');
    originalConsole.error(`[${category.toUpperCase()}]`, message, Object.keys(data).length ? data : '');
  }
};

/**
 * Override global console methods to suppress non-essential output in production
 * Call this once at application startup to globally suppress console output
 */
function suppressConsoleInProduction() {
  if (!isProduction) {
    return; // No-op in development
  }

  // Suppress log, debug, info in production
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};

  // Keep warn and error for critical diagnostics
  // console.warn and console.error remain unchanged
}

/**
 * Restore original console methods (useful for testing)
 */
function restoreConsole() {
  console.log = originalConsole.log;
  console.debug = originalConsole.debug;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}

module.exports = {
  logger,
  suppressConsoleInProduction,
  restoreConsole,
  isProduction,
  addBreadcrumb
};
