/**
 * Sentry Instrumentation - MUST be imported before all other modules
 *
 * This file initializes Sentry error tracking and performance monitoring
 * as early as possible in the application lifecycle.
 */

require('dotenv').config();
const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

const dsn = process.env.SENTRY_DSN;

if (!dsn) {
  console.warn('[Sentry] SENTRY_DSN not configured - error tracking disabled');
} else {
  const tracesSampleRate = parseFloat(process.env.SENTRY_TRACES_RATE) || 1.0;
  const profilesSampleRate = parseFloat(process.env.SENTRY_PROFILES_RATE) || 1.0;
  const environment = process.env.METRIC_TAG || 'development';

  Sentry.init({
    dsn: dsn,
    environment: environment,

    // Setting this option to true will send default PII data to Sentry
    // For example, automatic IP address collection on events
    sendDefaultPii: true,

    integrations: [
      nodeProfilingIntegration(),
      // Capture console.log, console.warn, console.error as Sentry logs
      Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
      // Enable spans for outbound HTTP requests (OCI, external APIs)
      Sentry.httpIntegration({
        spans: true,
        breadcrumbs: true,
      }),
    ],

    // Sample rates (configurable via env)
    tracesSampleRate: tracesSampleRate,
    profilesSampleRate: profilesSampleRate,

    // Memory guard for 512MB servers
    maxBreadcrumbs: 50,

    // Enable Sentry logs
    _experiments: {
      enableLogs: true,
    },
  });

  console.warn(`[Sentry] Initialized - env: ${environment}, traces: ${tracesSampleRate}, profiles: ${profilesSampleRate}`);
}

module.exports = { Sentry };
