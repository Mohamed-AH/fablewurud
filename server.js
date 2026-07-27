// IMPORTANT: Import instrument.js at the very top - initializes Sentry before everything else
require('./instrument.js');

const Sentry = require('@sentry/node');
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');
const connectMongo = require('connect-mongo');
const MongoStore = connectMongo.default || connectMongo;
const cookieParser = require('cookie-parser');
const expressLayouts = require('express-ejs-layouts');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');
const { connectSearchDB } = require('./config/searchDatabase');
const { initSearchModels } = require('./models');
const passport = require('./config/passport');
const { i18nMiddleware } = require('./utils/i18n');
const { trackPageView } = require('./middleware/analytics');
const { attachSiteSettings } = require('./middleware/siteSettings');
const { suppressConsoleInProduction } = require('./utils/logger');
const { assetVersionMiddleware, noCacheMiddleware, ASSET_VERSION } = require('./utils/assetVersion');
const { dbHealthMiddleware, dbErrorHandler, setupDbHealthListeners, getHealthStatus, isMongoError } = require('./middleware/dbHealth');
const { initMetrics, requestTrackingMiddleware } = require('./utils/metrics');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Global error handlers to prevent crashes during DB outages
process.on('unhandledRejection', (reason, promise) => {
  // Check if it's a MongoDB error - log but don't crash
  if (isMongoError(reason)) {
    console.error('⚠️ Unhandled MongoDB rejection (server continues in maintenance mode):', reason.message);
    return;
  }
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  // Check if it's a MongoDB error - log but don't crash
  if (isMongoError(error)) {
    console.error('⚠️ Uncaught MongoDB exception (server continues in maintenance mode):', error.message);
    return;
  }
  // For non-MongoDB errors, log and exit (unsafe to continue)
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Suppress non-essential console output in production
suppressConsoleInProduction();

// Validate environment: fail fast on missing required vars, warn on optional ones
require('./config/env').validateEnv();

// Setup database health listeners immediately (before connection attempt)
setupDbHealthListeners();

// Initialize Prometheus metrics push (production only)
initMetrics();

// Connect to MongoDB (main database)
connectDB();

// Connect to Search MongoDB (separate database for transcripts)
connectSearchDB().then(searchConn => {
  if (searchConn) {
    initSearchModels(searchConn);
  }
});

// Trust proxy - required when behind reverse proxy (Render, Heroku, etc.)
// This ensures rate limiting and secure cookies work correctly
if (isProduction) {
  app.set('trust proxy', 1);
}

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
//app.set('layout extractScripts', true);
//app.set('layout extractStyles', true);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com", "https://apis.google.com", "https://unpkg.com", "https://cdn.quilljs.com", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow onclick handlers
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.quilljs.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      mediaSrc: ["'self'", "https://objectstorage.me-jeddah-1.oraclecloud.com", "https://*.r2.dev"],
      connectSrc: ["'self'", "https://objectstorage.me-jeddah-1.oraclecloud.com", "https://*.r2.dev", "https://unpkg.com", "https://cdn.quilljs.com", "https://cdn.jsdelivr.net"],
      frameSrc: ["https://accounts.google.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // Required for audio streaming
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window per IP
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per window for API
  message: { error: 'Too many API requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 login attempts per hour
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
app.use('/api/', apiLimiter);
app.use('/auth/', authLimiter);

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request tracking middleware (metrics: HTTP errors, visitor count)
app.use(requestTrackingMiddleware);

// Request context: assigns request id, Sentry correlation, structured completion log
const { requestContext } = require('./middleware/requestContext');
app.use(requestContext);

// Create session store with error handling (falls back to memory store on DB failure)
let sessionStore;
if (process.env.MONGODB_URI) {
  try {
    // Reuse the mongoose connection's client instead of opening a second pool
    // (memory win on 512MB; avoids a duplicate connection to the same cluster).
    const mongoose = require('mongoose');
    sessionStore = MongoStore.create({
      clientPromise: mongoose.connection.asPromise().then(conn => conn.getClient()),
      touchAfter: 24 * 3600, // Lazy update: only update session once per 24 hours unless data changes
      ttl: 7 * 24 * 60 * 60, // Session TTL: 7 days (matches cookie maxAge)
      crypto: {
        secret: process.env.SESSION_SECRET || 'dev-secret-local-only'
      },
      autoRemove: 'native'
    });
    // Catch session store errors to prevent crashes
    sessionStore.on('error', (error) => {
      console.error('⚠️ Session store error (sessions may not persist):', error.message);
    });
  } catch (err) {
    console.warn('⚠️ Failed to create MongoDB session store, using memory store');
    sessionStore = undefined;
  }
}

// Session middleware with MongoDB store (saves RAM on free tier)
app.use(session({
  secret: process.env.SESSION_SECRET || (isProduction ? undefined : 'dev-secret-local-only'),
  resave: false,
  saveUninitialized: false,
  name: 'wurud.sid', // Custom session name (avoid default 'connect.sid')
  store: sessionStore, // Uses memory store if undefined
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax', // CSRF protection for cookies
  }
}));

// Passport middleware (must be after session)
app.use(passport.initialize());
app.use(passport.session());

// Static files with cache headers
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isProduction ? '1y' : 0, // 1 year cache in production
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Set immutable for versioned assets
    if (isProduction) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Cookie parser (for locale storage)
app.use(cookieParser());

// i18n middleware (must be before routes)
app.use(i18nMiddleware);

// Site settings middleware (makes settings available to all templates)
app.use(attachSiteSettings);

// Asset version middleware (makes version available to all templates)
app.use(assetVersionMiddleware);

// Realm middleware (sets res.locals.realm = 'najmi' | 'hasan' for two-realm theming)
app.use(require('./middleware/realm'));

// Expose the sheikh-name formatter to all templates (handles mixed title storage)
app.locals.sheikhName = require('./utils/sheikhName').formatSheikhName;

// No-cache headers for HTML pages (ensures users always get latest version)
// Applied to all routes except static files (handled separately above)
app.use((req, res, next) => {
  // Skip for static file requests (they have their own caching)
  const staticExtensions = ['.js', '.css', '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif', '.mp3', '.wav', '.ogg'];
  const hasStaticExt = staticExtensions.some(ext => req.path.endsWith(ext));

  if (!hasStaticExt) {
    // Set no-cache headers for HTML entry points
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
  }
  next();
});

// Analytics tracking middleware (non-blocking)
app.use(trackPageView);

// Health check route (includes database status)
app.get('/health', (req, res) => {
  const dbStatus = getHealthStatus();
  const isHealthy = dbStatus.database === 'healthy';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus
  });
});

// Sentry verification route - intentional error for testing
// Gated to non-production so it can't be used to flood Sentry / probe error handling.
if (!isProduction) {
  app.get('/debug-sentry', function mainHandler(req, res) {
    throw new Error('My first Sentry error!');
  });
}

// Maintenance page route (always accessible)
app.get('/maintenance', (req, res) => {
  res.render('public/maintenance', { layout: false });
});

// Database health middleware (fail-fast for DB issues)
app.use(dbHealthMiddleware);

// Routes
const publicRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const lecturesApiRoutes = require('./routes/api/lectures');
const sheikhsApiRoutes = require('./routes/api/sheikhs');
const seriesApiRoutes = require('./routes/api/series');
const homepageApiRoutes = require('./routes/api/homepage');
const streamRoutes = require('./routes/stream');
const downloadRoutes = require('./routes/download');
const searchApiRoutes = require('./routes/search');
const articlesRoutes = require('./routes/articles');
const contactApiRoutes = require('./routes/api/contact');
const articleEditorRoutes = require('./routes/article-editor');
const najmiRoutes = require('./routes/najmi');

app.use('/', publicRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/api/lectures', lecturesApiRoutes);
app.use('/api/sheikhs', sheikhsApiRoutes);
app.use('/api/series', seriesApiRoutes);
app.use('/api/homepage', homepageApiRoutes);
app.use('/stream', streamRoutes);
app.use('/download', downloadRoutes);
app.use('/search', searchApiRoutes);
app.use('/articles', articlesRoutes);
app.use('/api/contact', contactApiRoutes);
app.use('/article-editor', articleEditorRoutes);
app.use('/najmi', najmiRoutes);

// The Sentry error handler must be registered before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app);

// 404 handler
app.use((req, res) => {
  res.status(404).send('Page not found');
});

// Database error handler (fail-fast for MongoDB issues)
app.use(dbErrorHandler);

// Central error handler — runs after Sentry's Express handler (which captures
// errors forwarded via next(err), e.g. from asyncHandler-wrapped routes).
// Responds with JSON for API/XHR requests and HTML otherwise.
app.use(function onError(err, req, res, next) {
  console.error(err.stack || err);

  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || err.statusCode || 500;
  const wantsJson = req.path.startsWith('/api/') ||
    req.xhr ||
    (req.headers.accept || '').includes('application/json');

  if (wantsJson) {
    return res.status(status).json({
      success: false,
      message: 'Internal server error',
      // Sentry event id (if available) helps users reference an error in support
      reference: res.sentry || undefined,
      error: isProduction ? undefined : (err.message || String(err))
    });
  }

  res.status(status).send('Something went wrong. Please try again later.');
});

// Start server
app.listen(PORT, () => {
  const { uploadDir } = require('./config/storage');
  const absoluteUploadPath = path.resolve(uploadDir);

  // Use console.warn for startup messages (preserved in production for critical info)
  console.warn(`🚀 Duroos server running on http://localhost:${PORT}`);
  console.warn(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.warn(`📁 Upload directory: ${absoluteUploadPath}`);
  console.warn(`🔖 Asset version: ${ASSET_VERSION}`);
});
