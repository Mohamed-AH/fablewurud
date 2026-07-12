/**
 * Request context middleware (code-audit finding M7).
 *
 * - Assigns each request a stable id (from an inbound X-Request-Id if present,
 *   else generated) and echoes it back as a response header.
 * - Tags the Sentry scope with the request id so an error Issue can be joined
 *   to the structured request log for the same request.
 * - Emits a structured JSON completion log (method, path, status, duration).
 *
 * Static assets are skipped to keep log volume down.
 */

const crypto = require('crypto');
const log = require('../utils/structuredLogger');

let Sentry = null;
function getSentry() {
  if (Sentry === null) {
    if (!process.env.SENTRY_DSN) return null;
    try { Sentry = require('@sentry/node'); } catch { Sentry = false; }
  }
  return Sentry || null;
}

const STATIC_EXT = /\.(js|css|woff2?|ttf|eot|otf|png|jpe?g|gif|svg|ico|webp|avif|mp3|wav|ogg|map)$/i;

function requestContext(req, res, next) {
  const requestId = req.get('X-Request-Id') || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const sentry = getSentry();
  if (sentry && typeof sentry.getCurrentScope === 'function') {
    try { sentry.getCurrentScope().setTag('request_id', requestId); } catch { /* noop */ }
  }

  if (STATIC_EXT.test(req.path)) {
    return next();
  }

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : (res.statusCode >= 400 ? 'warn' : 'info');
    log[level]('request.complete', {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      ip: req.ip
    });
  });

  next();
}

module.exports = { requestContext };
