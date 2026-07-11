/**
 * Automated Asset Management & Caching
 *
 * Generates a unique deployment identifier (hash or timestamp) that can be
 * appended to asset URLs as a query string (e.g., ?v=abc123) for cache busting.
 *
 * Strategy:
 * - In production: Uses a combination of deployment timestamp and git commit hash (if available)
 * - In development: Uses a timestamp that changes on server restart
 */

const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Generate a unique asset version identifier
 * This is computed once at server startup and remains constant until restart
 */
function generateAssetVersion() {
  // Try to get git commit hash first
  let gitHash = '';
  try {
    gitHash = execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (e) {
    // Git not available or not a git repo - no problem
  }

  // Get server startup timestamp
  const timestamp = Date.now();

  // Create a combined identifier
  if (gitHash) {
    // Production: Use git hash + shortened timestamp for uniqueness
    return `${gitHash}-${Math.floor(timestamp / 1000) % 100000}`;
  }

  // Fallback: Use a hash of the timestamp
  return crypto.createHash('md5')
    .update(timestamp.toString())
    .digest('hex')
    .substring(0, 10);
}

// Generate version identifier once at module load (server startup)
const ASSET_VERSION = generateAssetVersion();

/**
 * Get the current asset version identifier
 * @returns {string} The version identifier
 */
function getAssetVersion() {
  return ASSET_VERSION;
}

/**
 * Append version query parameter to an asset URL
 * @param {string} url - The asset URL
 * @returns {string} URL with version query parameter
 */
function versionedUrl(url) {
  if (!url) return url;

  // Handle URLs that already have query parameters
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${ASSET_VERSION}`;
}

/**
 * Express middleware to inject asset version into res.locals
 * This makes the version available to all templates
 */
function assetVersionMiddleware(req, res, next) {
  // Make version available to templates
  res.locals.assetVersion = ASSET_VERSION;

  // Helper function to create versioned URLs in templates
  res.locals.versionedUrl = versionedUrl;

  // Shorthand for templates: ?v=VERSION
  res.locals.v = `?v=${ASSET_VERSION}`;

  next();
}

/**
 * Generate cache control headers based on file type
 * @param {string} filePath - Path to the file
 * @returns {object} Cache control settings
 */
function getCacheHeaders(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  // Static assets get long-term caching (1 year) - version query string handles busting
  const staticExtensions = ['.js', '.css', '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif'];

  if (staticExtensions.includes(ext)) {
    return {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Vary': 'Accept-Encoding'
    };
  }

  // HTML and other dynamic content - no caching
  return {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
}

/**
 * Express middleware to set appropriate cache headers for HTML pages
 * Use this on routes that serve HTML content
 */
function noCacheMiddleware(req, res, next) {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  next();
}

module.exports = {
  ASSET_VERSION,
  getAssetVersion,
  versionedUrl,
  assetVersionMiddleware,
  getCacheHeaders,
  noCacheMiddleware
};
