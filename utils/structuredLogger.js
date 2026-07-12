/**
 * Structured JSON logger (code-audit finding M7).
 *
 * Emits one JSON object per line to stdout/stderr — the format OCI Logging and
 * Grafana Loki ingest and query natively (unlike the emoji-prefixed plain-text
 * console output used elsewhere). Writes directly to the streams so it is NOT
 * suppressed by suppressConsoleInProduction() and NOT re-captured by Sentry's
 * console integration (avoids a feedback loop).
 *
 * Usage:
 *   const log = require('./utils/structuredLogger');
 *   log.info('request.complete', { requestId, status, durationMs });
 *   log.error('oci.delete_failed', { objectName, err: err.message });
 *
 * Level via LOG_LEVEL env (error|warn|info|debug); defaults to info in
 * production, debug otherwise.
 */

const isProduction = process.env.NODE_ENV === 'production';

const LEVELS = { error: 50, warn: 40, info: 30, debug: 20 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL] || (isProduction ? LEVELS.info : LEVELS.debug);
const SERVICE = process.env.METRIC_TAG || 'wurud';

function emit(level, event, fields) {
  if (LEVELS[level] < MIN_LEVEL) return;
  let payload;
  try {
    payload = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service: SERVICE,
      event: event,
      ...fields
    });
  } catch (e) {
    // Circular or non-serializable fields — fall back to a minimal record
    payload = JSON.stringify({ ts: new Date().toISOString(), level, service: SERVICE, event, note: 'unserializable-fields' });
  }
  (level === 'error' ? process.stderr : process.stdout).write(payload + '\n');
}

module.exports = {
  error: (event, fields = {}) => emit('error', event, fields),
  warn: (event, fields = {}) => emit('warn', event, fields),
  info: (event, fields = {}) => emit('info', event, fields),
  debug: (event, fields = {}) => emit('debug', event, fields),
  LEVELS
};
