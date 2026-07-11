/**
 * Sentry Metrics Utility
 *
 * Domain-specific helpers for tracking business and performance metrics.
 * Uses lazy Sentry loading to avoid circular dependencies.
 *
 * Metrics naming convention: wurud.<domain>.<metric>
 * Tags use low cardinality values only (source: oci|local, mode: atlas|local)
 */

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

const sentryMetrics = {
  /**
   * Track audio stream play event
   * @param {string} source - 'oci' or 'local'
   */
  audioPlay: (source) => {
    const sentry = getSentry();
    if (sentry) {
      sentry.metrics.count('wurud.audio.play', 1, { tags: { source } });
    }
  },

  /**
   * Track audio download event with file size
   * @param {string} source - 'oci' or 'local'
   * @param {number} sizeMB - File size in megabytes
   */
  audioDownload: (source, sizeMB) => {
    const sentry = getSentry();
    if (sentry) {
      sentry.metrics.count('wurud.audio.download', 1, { tags: { source } });
      if (sizeMB && sizeMB > 0) {
        sentry.metrics.distribution('wurud.audio.download.size', sizeMB, { tags: { source } });
      }
    }
  },

  /**
   * Track search latency and result count
   * @param {number} latencyMs - Search latency in milliseconds
   * @param {string} mode - 'atlas' or 'local'
   * @param {number} resultCount - Number of results returned
   */
  searchLatency: (latencyMs, mode, resultCount) => {
    const sentry = getSentry();
    if (sentry) {
      sentry.metrics.distribution('wurud.search.latency', latencyMs, {
        tags: { mode, has_results: resultCount > 0 ? 'yes' : 'no' }
      });
    }
  },

  /**
   * Track empty search result event
   * @param {string} mode - 'atlas' or 'local'
   */
  searchEmpty: (mode) => {
    const sentry = getSentry();
    if (sentry) {
      sentry.metrics.count('wurud.search.empty', 1, { tags: { mode } });
    }
  },

  /**
   * Track cache hit event
   * @param {string} key - Cache key (will be normalized for low cardinality)
   */
  cacheHit: (key) => {
    const sentry = getSentry();
    if (sentry) {
      // Normalize key to category for low cardinality
      const category = normalizeCacheKey(key);
      sentry.metrics.count('wurud.cache.hit', 1, { tags: { category } });
    }
  },

  /**
   * Track cache miss event
   * @param {string} key - Cache key (will be normalized for low cardinality)
   */
  cacheMiss: (key) => {
    const sentry = getSentry();
    if (sentry) {
      // Normalize key to category for low cardinality
      const category = normalizeCacheKey(key);
      sentry.metrics.count('wurud.cache.miss', 1, { tags: { category } });
    }
  },

  /**
   * Track upload latency (admin operations)
   * @param {number} latencyMs - Upload latency in milliseconds
   */
  uploadLatency: (latencyMs) => {
    const sentry = getSentry();
    if (sentry) {
      sentry.metrics.distribution('wurud.upload.latency', latencyMs);
    }
  }
};

/**
 * Normalize cache key to a category for low cardinality tagging
 * @param {string} key - Raw cache key
 * @returns {string} Normalized category
 */
function normalizeCacheKey(key) {
  if (!key) return 'unknown';

  // Extract category from common key patterns
  if (key.startsWith('lecture:') || key.startsWith('lectures:')) return 'lectures';
  if (key.startsWith('series:')) return 'series';
  if (key.startsWith('search:')) return 'search';
  if (key.startsWith('scholar:') || key.startsWith('scholars:')) return 'scholars';
  if (key.startsWith('stats:') || key.startsWith('statistics:')) return 'stats';
  if (key.startsWith('home:') || key === 'homepage') return 'home';

  // Fallback: use first segment before colon or full key
  const firstSegment = key.split(':')[0];
  return firstSegment.length <= 20 ? firstSegment : 'other';
}

module.exports = sentryMetrics;
