/**
 * Push-based Prometheus metrics for Grafana Cloud
 *
 * High-detail tracking for low-traffic site (<10 visitors/day).
 * Pushes to Grafana Cloud every 15 seconds using Influx line protocol.
 *
 * Custom Metrics:
 * - wurud_audio_play_total{audio_title} - Track every play
 * - wurud_users_online - Real-time unique visitor count
 * - wurud_search_term_hit{term} - Track search queries
 * - wurud_search_latency_ms - Atlas Search response times
 * - wurud_search_empty{term} - Track terms with 0 results
 * - wurud_http_errors_total{path,status} - 4xx/5xx errors
 * - wurud_memory_rss_bytes - Memory usage (from default metrics)
 * - wurud_event_loop_lag_ms - Event loop lag (from default metrics)
 *
 * Environment variables:
 * - GRAFANA_URL: Grafana Cloud push endpoint
 * - GRAFANA_USER_ID: Grafana Cloud user ID
 * - GRAFANA_API_TOKEN: Grafana Cloud API token
 * - METRIC_TAG: Instance identifier for app_instance label (e.g., "stable", "test")
 */

const https = require('https');
const { URL } = require('url');

const isProduction = process.env.NODE_ENV === 'production';
const PUSH_INTERVAL_MS = 15000; // 15 seconds
const VISITOR_TTL_MS = 5 * 60 * 1000; // 5 minutes for "online" status

// Environment configuration
const GRAFANA_URL = process.env.GRAFANA_URL;
const GRAFANA_USER_ID = process.env.GRAFANA_USER_ID;
const GRAFANA_API_TOKEN = process.env.GRAFANA_API_TOKEN;
const METRIC_TAG = process.env.METRIC_TAG || 'default';

let client = null;
let metricsInitialized = false;

/**
 * Singleton metrics store for high-detail tracking
 * Cleared after each push to keep memory footprint near zero
 */
const metricsStore = {
  // Counter: {label_key: count}
  audioPlays: {},        // {audio_title: count}
  searchTerms: {},       // {term: count}
  searchEmpty: {},       // {term: count}
  httpErrors: {},        // {"path|status": count}

  // Histogram: array of values
  searchLatencies: [],
  requestLatencies: [],  // HTTP request durations (ms) — all requests
  dbLatencies: [],       // MongoDB command durations (ms)

  // Gauge: visitor tracking with timestamps
  visitors: {}           // {visitorId: lastSeenTimestamp}
};

/**
 * Compute summary statistics (avg/min/max/p95/count) for a latency array.
 * Returns null for an empty array.
 */
function summarizeLatencies(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return {
    avg: sum / sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95: sorted[p95Index],
    count: sorted.length
  };
}

/**
 * Escape special characters for Influx line protocol
 * Tags: escape comma, equals, space
 * Field values (string): escape quote, backslash
 */
function escapeTag(value) {
  return String(value)
    .replace(/,/g, '\\,')
    .replace(/=/g, '\\=')
    .replace(/ /g, '\\ ');
}

/**
 * Record an audio play event
 * @param {string} audioTitle - The filename or title of the audio
 */
function recordAudioPlay(audioTitle) {
  const key = escapeTag(audioTitle || 'unknown');
  metricsStore.audioPlays[key] = (metricsStore.audioPlays[key] || 0) + 1;
}

/**
 * Record a search term hit
 * @param {string} term - The search query
 * @param {number} resultCount - Number of results returned
 * @param {number} latencyMs - Search latency in milliseconds
 */
function recordSearch(term, resultCount, latencyMs) {
  const key = escapeTag(term || 'empty');

  // Record the term hit
  metricsStore.searchTerms[key] = (metricsStore.searchTerms[key] || 0) + 1;

  // Record empty search if no results
  if (resultCount === 0) {
    metricsStore.searchEmpty[key] = (metricsStore.searchEmpty[key] || 0) + 1;
  }

  // Record latency
  if (typeof latencyMs === 'number' && latencyMs >= 0) {
    metricsStore.searchLatencies.push(latencyMs);
  }
}

/**
 * Record an HTTP error (4xx or 5xx)
 * @param {string} path - The request path
 * @param {number} status - HTTP status code
 */
function recordHttpError(path, status) {
  // Normalize path to avoid high cardinality (remove IDs)
  const normalizedPath = path
    .replace(/\/[a-f0-9]{24}/gi, '/:id')  // MongoDB ObjectIds
    .replace(/\/\d+/g, '/:num');           // Numeric IDs
  const key = `${escapeTag(normalizedPath)}|${status}`;
  metricsStore.httpErrors[key] = (metricsStore.httpErrors[key] || 0) + 1;
}

/**
 * Track a visitor (for online count gauge)
 * @param {string} visitorId - Unique visitor identifier (IP or session)
 */
function trackVisitor(visitorId) {
  metricsStore.visitors[visitorId] = Date.now();
}

/**
 * Get current count of online visitors (seen in last 5 minutes)
 */
function getOnlineVisitorCount() {
  const now = Date.now();
  const cutoff = now - VISITOR_TTL_MS;
  let count = 0;

  for (const id in metricsStore.visitors) {
    if (metricsStore.visitors[id] >= cutoff) {
      count++;
    } else {
      // Clean up expired visitors
      delete metricsStore.visitors[id];
    }
  }

  return count;
}

/**
 * Express middleware to track requests via res.on('finish')
 * Captures: response time, status code, path
 */
function requestTrackingMiddleware(req, res, next) {
  const startTime = Date.now();

  // Track visitor by IP (or session ID if available)
  const visitorId = req.ip || req.connection?.remoteAddress || 'unknown';
  trackVisitor(visitorId);

  // Capture metrics when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    const path = req.path;

    // Record request latency for percentile/latency dashboards (bounded buffer)
    if (metricsStore.requestLatencies.length < 5000) {
      metricsStore.requestLatencies.push(duration);
    }

    // Record HTTP errors (4xx and 5xx)
    if (status >= 400) {
      recordHttpError(path, status);
    }
  });

  next();
}

/**
 * Record a MongoDB command duration (ms). Wired via command monitoring.
 * @param {number} ms
 */
function recordDbLatency(ms) {
  if (typeof ms === 'number' && ms >= 0 && metricsStore.dbLatencies.length < 5000) {
    metricsStore.dbLatencies.push(ms);
  }
}

/**
 * Attach MongoDB command monitoring to a mongoose connection so command
 * durations flow into Grafana. Requires the connection to be opened with
 * `monitorCommands: true`. Safe to call once after connect.
 */
function attachDbMonitoring(connection) {
  if (!connection) return;
  const client = connection.getClient ? connection.getClient() : null;
  if (!client || typeof client.on !== 'function') return;
  client.on('commandSucceeded', (e) => recordDbLatency(e.duration));
  client.on('commandFailed', (e) => recordDbLatency(e.duration));
}

/**
 * Initialize prom-client with default Node.js metrics
 * Called only once to avoid duplicate metric registration
 */
function setupMetricsCollection() {
  if (metricsInitialized) return;

  client = require('prom-client');

  // Set default label for all metrics to differentiate server instances
  // This allows stable and test servers to be uniquely identified in Grafana
  client.register.setDefaultLabels({
    app_instance: METRIC_TAG
  });

  // Collect default Node.js metrics with wurud_ prefix
  // Includes: memory (RSS, heap), CPU, event loop lag, GC
  client.collectDefaultMetrics({
    prefix: 'wurud_',
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
  });

  metricsInitialized = true;
}

/**
 * Convert prom-client metrics to Influx line protocol format
 * Format: measurement,tag=value field=value timestamp
 */
async function convertToInfluxLineProtocol() {
  const metrics = await client.register.getMetricsAsJSON();
  const lines = [];
  const timestamp = Date.now() * 1000000; // nanoseconds

  for (const metric of metrics) {
    const name = metric.name;

    for (const value of metric.values) {
      // Build tag set from labels
      const tags = Object.entries(value.labels || {})
        .map(([k, v]) => `${k}=${escapeTag(v)}`)
        .join(',');

      const tagStr = tags ? `,${tags}` : '';

      // Influx line protocol: measurement,tags field=value timestamp
      lines.push(`${name}${tagStr} value=${value.value} ${timestamp}`);
    }
  }

  return lines;
}

/**
 * Convert custom metricsStore to Influx line protocol
 */
function convertCustomMetricsToInflux() {
  const lines = [];
  const timestamp = Date.now() * 1000000; // nanoseconds
  const instanceTag = `app_instance=${escapeTag(METRIC_TAG)}`;

  // Audio plays counter
  for (const [audioTitle, count] of Object.entries(metricsStore.audioPlays)) {
    lines.push(`wurud_audio_play_total,${instanceTag},audio_title=${audioTitle} value=${count} ${timestamp}`);
  }

  // Search term hits counter
  for (const [term, count] of Object.entries(metricsStore.searchTerms)) {
    lines.push(`wurud_search_term_hit,${instanceTag},term=${term} value=${count} ${timestamp}`);
  }

  // Empty search results counter
  for (const [term, count] of Object.entries(metricsStore.searchEmpty)) {
    lines.push(`wurud_search_empty,${instanceTag},term=${term} value=${count} ${timestamp}`);
  }

  // HTTP errors counter
  for (const [key, count] of Object.entries(metricsStore.httpErrors)) {
    const [path, status] = key.split('|');
    lines.push(`wurud_http_errors_total,${instanceTag},path=${path},status=${status} value=${count} ${timestamp}`);
  }

  // Latency summaries (avg/min/max/p95/count) for search, HTTP requests, and DB
  const latencyMetrics = {
    wurud_search_latency_ms: summarizeLatencies(metricsStore.searchLatencies),
    wurud_http_latency_ms: summarizeLatencies(metricsStore.requestLatencies),
    wurud_db_latency_ms: summarizeLatencies(metricsStore.dbLatencies)
  };

  for (const [name, s] of Object.entries(latencyMetrics)) {
    if (!s) continue;
    lines.push(`${name}_avg,${instanceTag} value=${s.avg.toFixed(2)} ${timestamp}`);
    lines.push(`${name}_p95,${instanceTag} value=${s.p95} ${timestamp}`);
    lines.push(`${name}_max,${instanceTag} value=${s.max} ${timestamp}`);
    lines.push(`${name}_min,${instanceTag} value=${s.min} ${timestamp}`);
    lines.push(`${name}_count,${instanceTag} value=${s.count} ${timestamp}`);
  }

  // Online visitors gauge
  const onlineCount = getOnlineVisitorCount();
  lines.push(`wurud_users_online,${instanceTag} value=${onlineCount} ${timestamp}`);

  return lines;
}

/**
 * Clear the metrics store after a successful push
 * Keeps memory footprint at zero between cycles
 */
function clearMetricsStore() {
  metricsStore.audioPlays = {};
  metricsStore.searchTerms = {};
  metricsStore.searchEmpty = {};
  metricsStore.httpErrors = {};
  metricsStore.searchLatencies = [];
  metricsStore.requestLatencies = [];
  metricsStore.dbLatencies = [];
  // Note: visitors are cleaned by TTL, not cleared entirely
}

/**
 * Push metrics to Grafana Cloud using native https module
 * Uses Influx line protocol format via /api/v1/push/influx/write endpoint
 */
async function pushMetrics() {
  if (!client) return;

  try {
    // Collect both prom-client metrics and custom metrics
    const promClientLines = await convertToInfluxLineProtocol();
    const customLines = convertCustomMetricsToInflux();

    const allLines = [...promClientLines, ...customLines];
    const metricsData = allLines.join('\n');

    if (!metricsData) return;

    const parsedUrl = new URL(GRAFANA_URL);

    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Authorization': `Basic ${Buffer.from(`${GRAFANA_USER_ID}:${GRAFANA_API_TOKEN}`).toString('base64')}`,
        'Content-Length': Buffer.byteLength(metricsData)
      }
    };

    await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        // Consume response to free memory
        res.on('data', () => {});
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            // Clear store after successful push
            clearMetricsStore();
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);

      // Write in chunks to minimize memory usage
      req.write(metricsData);
      req.end();
    });
  } catch (err) {
    // Silent failure in production - metrics are non-critical
    if (!isProduction) {
      console.error('Metrics push failed:', err.message);
    }
  }
}

/**
 * Initialize metrics collection and push worker
 * Only runs in production with valid Grafana configuration
 */
function initMetrics() {
  // Skip in non-production environments
  if (!isProduction) {
    console.log('Metrics: Skipping in development mode');
    return;
  }

  // Validate configuration
  if (!GRAFANA_URL || !GRAFANA_USER_ID || !GRAFANA_API_TOKEN) {
    console.warn('Metrics: Missing Grafana configuration (GRAFANA_URL, GRAFANA_USER_ID, GRAFANA_API_TOKEN)');
    return;
  }

  // Initialize prom-client
  setupMetricsCollection();

  // Start background push worker
  const pushInterval = setInterval(pushMetrics, PUSH_INTERVAL_MS);

  // Don't let the timer prevent process exit
  pushInterval.unref();

  console.warn(`Metrics: Push worker started (${PUSH_INTERVAL_MS / 1000}s interval)`);
}

module.exports = {
  initMetrics,
  requestTrackingMiddleware,
  recordAudioPlay,
  recordSearch,
  recordHttpError,
  recordDbLatency,
  attachDbMonitoring,
  trackVisitor
};
