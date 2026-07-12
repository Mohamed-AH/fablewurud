/**
 * Error reporting helpers (code-audit finding C2).
 *
 * The app's route handlers each `try/catch`, log to console, and return a 500 —
 * which means Sentry's Express error handler never sees the error. These helpers
 * make errors reach Sentry with request context:
 *
 *   - `asyncHandler(fn)`  wrap a handler so rejections forward to next(err),
 *                         letting the central error middleware + Sentry capture it.
 *                         Preferred for new/refactored routes.
 *   - `captureException(error, req)`  report an error to Sentry with route/method/
 *                         user context from inside an existing catch block, without
 *                         changing the handler's response. Drop-in for legacy catches.
 *
 * Sentry is loaded lazily and treated as optional (no-op when DSN unset).
 */

let Sentry = null;
function getSentry() {
  if (Sentry === null) {
    if (!process.env.SENTRY_DSN) return null;
    try {
      Sentry = require('@sentry/node');
    } catch {
      Sentry = false;
    }
  }
  return Sentry || null;
}

/**
 * Report an error to Sentry with request context. Safe to call from any catch.
 * @param {Error} error
 * @param {import('express').Request} [req]
 */
function captureException(error, req) {
  const sentry = getSentry();
  if (!sentry) return;
  sentry.withScope((scope) => {
    if (req) {
      scope.setTag('route', req.route?.path || req.path);
      scope.setTag('method', req.method);
      scope.setContext('request', {
        path: req.originalUrl || req.url,
        method: req.method,
        params: req.params,
        query: req.query
      });
      const userId = req.user?._id;
      if (userId) scope.setUser({ id: String(userId) });
    }
    sentry.captureException(error);
  });
}

/**
 * Wrap an async Express handler so thrown/rejected errors propagate to next().
 * @param {Function} fn
 * @returns {Function}
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler, captureException };
