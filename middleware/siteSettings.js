/**
 * Site Settings Middleware
 * Attaches site settings to res.locals for use in views
 */

const { SiteSettings } = require('../models');
const cache = require('../utils/cache');

const CACHE_KEY = 'middleware:siteSettings';
const CACHE_TTL = 300; // 5 minutes

/**
 * Middleware to attach site settings to res.locals
 */
const attachSiteSettings = async (req, res, next) => {
  try {
    // Get cached settings or fetch from database
    const settings = await cache.getOrSet(
      CACHE_KEY,
      () => SiteSettings.getSettings(),
      CACHE_TTL
    );

    // Attach to res.locals for use in views
    res.locals.siteSettings = settings;
  } catch (error) {
    // Don't fail the request if settings can't be loaded
    console.error('Failed to load site settings:', error.message);
    res.locals.siteSettings = null;
  }

  next();
};

/**
 * Invalidate cached settings (call after updating settings)
 */
const invalidateCache = () => {
  cache.del(CACHE_KEY);
};

module.exports = {
  attachSiteSettings,
  invalidateCache
};
