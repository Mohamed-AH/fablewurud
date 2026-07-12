const { Admin } = require('../models');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Middleware to check if user is authenticated
 * Use this for routes that require any logged-in user
 */
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }

  // Redirect to login page
  res.redirect('/admin/login');
};

/**
 * Middleware to check if user is an active admin
 * Use this for admin-only routes
 * Only allows 'admin' and 'editor' roles (NOT articleEditor)
 */
const isAdmin = async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.redirect('/admin/login');
    }

    // Check if user exists and is active - query fresh from DB
    const admin = await Admin.findById(req.user._id).select('+role').lean();

    if (!admin || !admin.isActive) {
      req.logout((err) => {
        if (err && !isProduction) {
          console.error('Logout error:', err);
        }
        res.redirect('/admin/login?error=inactive');
      });
      return;
    }

    // Check role - only admin and editor can access admin panel
    // articleEditor role should use /article-editor routes instead
    if (admin.role !== 'admin' && admin.role !== 'editor') {
      return res.redirect('/article-editor');
    }

    // User is authorized admin
    next();
  } catch (error) {
    if (!isProduction) {
      console.error('Admin auth middleware error:', error);
    }
    res.status(500).send('Authentication error');
  }
};

/**
 * Middleware for API routes - returns JSON instead of redirecting
 */
const isAuthenticatedAPI = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }

  res.status(401).json({
    success: false,
    message: 'Authentication required'
  });
};

/**
 * Middleware for admin API routes - returns JSON instead of redirecting
 * Only allows 'admin' and 'editor' roles (NOT articleEditor)
 */
const isAdminAPI = async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const admin = await Admin.findById(req.user._id);

    if (!admin || !admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'User is not an active admin'
      });
    }

    // Check role - only admin and editor can access admin API
    if (admin.role !== 'admin' && admin.role !== 'editor') {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  } catch (error) {
    if (!isProduction) {
      console.error('Admin API auth middleware error:', error);
    }
    res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

/**
 * Middleware to check if user is an editor or admin
 * Use this for content management routes (lectures, series, sheikhs)
 */
const isEditor = async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.redirect('/admin/login');
    }

    const admin = await Admin.findById(req.user._id);

    if (!admin || !admin.isActive) {
      req.logout((err) => {
        if (err && !isProduction) {
          console.error('Logout error:', err);
        }
        res.redirect('/admin/login?error=inactive');
      });
      return;
    }

    // Check role - both admin and editor can access
    if (admin.role !== 'admin' && admin.role !== 'editor') {
      return res.status(403).send('Insufficient permissions');
    }

    next();
  } catch (error) {
    if (!isProduction) {
      console.error('Editor auth middleware error:', error);
    }
    res.status(500).send('Authentication error');
  }
};

/**
 * Middleware to check if user can edit articles
 * Allows: admin, editor, articleEditor roles
 * Use this for article editing routes
 */
const isArticleEditor = async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.redirect('/article-editor/login');
    }

    const admin = await Admin.findById(req.user._id);

    if (!admin || !admin.isActive) {
      req.logout((err) => {
        if (err && !isProduction) {
          console.error('Logout error:', err);
        }
        res.redirect('/article-editor/login?error=inactive');
      });
      return;
    }

    // Check role - admin, editor, and articleEditor can access
    if (!['admin', 'editor', 'articleEditor'].includes(admin.role)) {
      return res.status(403).send('Insufficient permissions');
    }

    next();
  } catch (error) {
    if (!isProduction) {
      console.error('Article editor auth middleware error:', error);
    }
    res.status(500).send('Authentication error');
  }
};

/**
 * API version of isArticleEditor - returns JSON
 */
const isArticleEditorAPI = async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const admin = await Admin.findById(req.user._id);

    if (!admin || !admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'User is not active'
      });
    }

    if (!['admin', 'editor', 'articleEditor'].includes(admin.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions for article editing'
      });
    }

    next();
  } catch (error) {
    if (!isProduction) {
      console.error('Article editor API auth middleware error:', error);
    }
    res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

/**
 * Middleware to check if user is a super admin (admin role)
 * Use this for admin/editor management routes only
 */
const isSuperAdmin = async (req, res, next) => {
  try {
    if (!req.isAuthenticated()) {
      return res.redirect('/admin/login');
    }

    const admin = await Admin.findById(req.user._id);

    if (!admin || !admin.isActive || admin.role !== 'admin') {
      return res.status(403).send('Only super admins can access this page');
    }

    next();
  } catch (error) {
    if (!isProduction) {
      console.error('Super admin auth middleware error:', error);
    }
    res.status(500).send('Authentication error');
  }
};

module.exports = {
  isAuthenticated,
  isAdmin,
  isEditor,
  isArticleEditor,
  isSuperAdmin,
  isAuthenticatedAPI,
  isAdminAPI,
  isArticleEditorAPI
};
