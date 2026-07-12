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

/**
 * Derive a release identifier for Sentry so errors can be attributed to a
 * deploy (enables regression detection + suspect commits). Prefer an explicit
 * env var set by CI; fall back to a git short-SHA; last resort the app version.
 */
function resolveRelease() {
  if (process.env.SENTRY_RELEASE) return process.env.SENTRY_RELEASE;
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT;
  if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT;
  try {
    return require('child_process')
      .execSync('git rev-parse --short HEAD', { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] })
      .trim();
  } catch {
    try { return `v${require('./package.json').version}`; } catch { return undefined; }
  }
}

if (!dsn) {
  console.warn('[Sentry] SENTRY_DSN not configured - error tracking disabled');
} else {
  const tracesSampleRate = parseFloat(process.env.SENTRY_TRACES_RATE) || 1.0;
  const profilesSampleRate = parseFloat(process.env.SENTRY_PROFILES_RATE) || 1.0;
  // Deploy environment (prod/staging/dev) — NOT the Grafana instance label.
  // METRIC_TAG is the instance id and is attached separately as a tag below.
  const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
  const release = resolveRelease();
  const instance = process.env.METRIC_TAG || 'default';

  Sentry.init({
    dsn: dsn,
    environment: environment,
    release: release,

    // PII (client IP, headers) off by default — opt in explicitly via env.
    // Avoids leaking visitor IPs/emails into a third-party service.
    sendDefaultPii: process.env.SENTRY_SEND_PII === 'true',

    // Distinguish server instances (stable/test) without conflating with environment
    initialScope: { tags: { app_instance: instance } },

    integrations: [
      nodeProfilingIntegration(),
      // Capture console.warn/error as Sentry logs. 'log' is intentionally EXCLUDED:
      // suppressConsoleInProduction() no-ops console.log in prod, so capturing it
      // here would be silently defeated. warn/error are preserved and captured.
      Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] }),
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

  console.warn(`[Sentry] Initialized - env: ${environment}, release: ${release || 'unknown'}, instance: ${instance}, traces: ${tracesSampleRate}`);
}

module.exports = { Sentry };
