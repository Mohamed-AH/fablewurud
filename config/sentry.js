/**
 * Sentry Error Tracking & Performance Monitoring Configuration
 *
 * Features:
 * - 100% tracing/profiling for low-traffic deep debugging
 * - Smart 404 deduplication to protect error quota
 * - Bot shield to filter vulnerability scanners
 * - Memory-efficient breadcrumb limit
 */

const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

// In-memory Set for 404 deduplication (prevents quota exhaustion from bots)
const seen404Paths = new Set();
const SEEN_404_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Track when paths were added for TTL cleanup
const seen404Timestamps = new Map();

// Bot target paths to ignore (common vulnerability scanner targets)
const BOT_TARGET_PATHS = [
  '/wp-admin',
  '/wp-login.php',
  '/wp-content',
  '/wp-includes',
  '/.env',
  '/.git',
  '/xmlrpc.php',
  '/phpinfo.php',
  '/admin.php',
  '/administrator',
  '/config.php',
  '/phpmyadmin',
  '/.htaccess',
  '/web.config'
];

// Files to ignore (common bot/browser requests)
const IGNORED_FILES = [
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'apple-touch-icon.png',
  'apple-touch-icon-precomposed.png'
];

/**
 * Check if a 404 path has already been seen (deduplication)
 * @param {string} path - The request path
 * @returns {boolean} - True if duplicate, false if first occurrence
 */
function is404Duplicate(path) {
  if (!path) return false;

  // Normalize path (remove query string)
  const normalizedPath = path.split('?')[0];

  if (seen404Paths.has(normalizedPath)) {
    return true;
  }

  seen404Paths.add(normalizedPath);
  seen404Timestamps.set(normalizedPath, Date.now());
  return false;
}

/**
 * Clean up old 404 paths (called periodically)
 */
function cleanup404Paths() {
  const now = Date.now();
  for (const [path, timestamp] of seen404Timestamps) {
    if (now - timestamp > SEEN_404_TTL_MS) {
      seen404Paths.delete(path);
      seen404Timestamps.delete(path);
    }
  }
}

/**
 * Check if path matches bot targets or ignored files
 * @param {string} path - The request path
 * @returns {boolean} - True if should be ignored
 */
function shouldIgnorePath(path) {
  if (!path) return false;

  const lowerPath = path.toLowerCase();

  // Check bot targets
  for (const target of BOT_TARGET_PATHS) {
    if (lowerPath.includes(target.toLowerCase())) {
      return true;
    }
  }

  // Check ignored files
  for (const file of IGNORED_FILES) {
    if (lowerPath.endsWith(file.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Initialize Sentry with Express app
 * @param {Express} app - Express application instance
 */
function initSentry(app) {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.warn('[Sentry] SENTRY_DSN not configured - error tracking disabled');
    return;
  }

  const tracesSampleRate = parseFloat(process.env.SENTRY_TRACES_RATE) || 1.0;
  const profilesSampleRate = parseFloat(process.env.SENTRY_PROFILES_RATE) || 1.0;
  const environment = process.env.METRIC_TAG || 'development';

  Sentry.init({
    dsn: dsn,
    environment: environment,
    integrations: [
      nodeProfilingIntegration(),
      // Capture console.log, console.warn, console.error as Sentry logs
      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
      // Enable spans for outbound HTTP requests (OCI, external APIs)
      Sentry.httpIntegration({
        spans: true, // Enables "Outbound API Requests" dashboard
        breadcrumbs: true, // Ensures [oci] logs appear in timeline
      }),
    ],

    // Sample rates (configurable via env)
    tracesSampleRate: tracesSampleRate,
    profilesSampleRate: profilesSampleRate,

    // Memory guard for 512MB servers
    maxBreadcrumbs: 50,

    // Enable IP/header tracking for visitor journey identification
    sendDefaultPii: true,

    // Enable Sentry logs
    enableLogs: true,

    // Filter events before sending
    beforeSend(event, hint) {
      const request = event.request;
      const path = request?.url;

      // Ignore bot targets
      if (path && shouldIgnorePath(path)) {
        return null;
      }

      // Smart 404 deduplication - only send first occurrence
      const statusCode = event.contexts?.response?.status_code ||
                         hint?.originalException?.status ||
                         event.tags?.['http.status_code'];

      if (statusCode === 404 || statusCode === '404') {
        if (path && is404Duplicate(path)) {
          return null;
        }
      }

      return event;
    }
  });

  // Start periodic cleanup of 404 paths
  setInterval(cleanup404Paths, CLEANUP_INTERVAL_MS);

  console.warn(`[Sentry] Initialized - env: ${environment}, traces: ${tracesSampleRate}, profiles: ${profilesSampleRate}`);
}

/**
 * Get Sentry error handler middleware for Express
 * Must be added after all routes, before generic error handler
 * @returns {Function} Express error handler middleware
 */
function getSentryErrorHandler() {
  return Sentry.setupExpressErrorHandler
    ? Sentry.setupExpressErrorHandler
    : (app) => {}; // No-op if not available
}

module.exports = {
  initSentry,
  getSentryErrorHandler,
  Sentry,
  // Exported for testing
  is404Duplicate,
  shouldIgnorePath,
  cleanup404Paths
};
