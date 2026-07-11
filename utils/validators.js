/**
 * Input validation utilities for API endpoints
 * Uses express-validator for sanitization and validation
 */
const { query, param, body, validationResult } = require('express-validator');
const mongoose = require('mongoose');

/**
 * Middleware to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

/**
 * Validate MongoDB ObjectId
 * Returns true only for valid 24-character hex strings or ObjectId instances
 */
const isValidObjectId = (value) => {
  // Reject null, undefined, objects, and arrays explicitly
  if (value === null || value === undefined) return false;
  if (typeof value === 'object' && !(value instanceof mongoose.Types.ObjectId)) {
    return false;
  }
  // For ObjectId instances
  if (value instanceof mongoose.Types.ObjectId) return true;
  // For strings, check format
  if (typeof value === 'string') {
    return /^[0-9a-fA-F]{24}$/.test(value);
  }
  return false;
};

/**
 * Validation rules for GET /api/lectures query parameters
 */
const lecturesQueryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Page must be a positive integer (max 10000)')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('sheikhId')
    .optional()
    .custom(isValidObjectId)
    .withMessage('Invalid sheikh ID format'),
  query('seriesId')
    .optional()
    .custom(isValidObjectId)
    .withMessage('Invalid series ID format'),
  query('category')
    .optional()
    .isIn(['Aqeedah', 'Fiqh', 'Tafsir', 'Hadith', 'Seerah', 'Akhlaq', 'Other'])
    .withMessage('Invalid category'),
  query('published')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('Published must be true or false'),
  query('featured')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('Featured must be true or false'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Search query too long (max 200 characters)')
    .escape(),
  query('sort')
    .optional()
    .matches(/^-?(createdAt|playCount|titleArabic|titleEnglish|lectureNumber)$/)
    .withMessage('Invalid sort field'),
  handleValidationErrors
];

/**
 * Validation rules for ID parameters
 */
const idParamValidation = [
  param('id')
    .custom((value) => {
      // Accept either ObjectId or slug format
      if (isValidObjectId(value)) return true;
      // Slug format: alphanumeric, hyphens, underscores, Arabic chars
      if (/^[\w\u0600-\u06FF-]+$/.test(value) && value.length <= 200) return true;
      return false;
    })
    .withMessage('Invalid ID or slug format'),
  handleValidationErrors
];

/**
 * Validation rules for verify-duration endpoint
 */
const verifyDurationValidation = [
  param('id')
    .custom(isValidObjectId)
    .withMessage('Invalid lecture ID'),
  body('duration')
    .isFloat({ min: 0.1, max: 86400 })
    .withMessage('Duration must be between 0.1 and 86400 seconds')
    .toFloat(),
  handleValidationErrors
];

/**
 * Validation rules for play count increment
 */
const playCountValidation = [
  param('id')
    .custom(isValidObjectId)
    .withMessage('Invalid lecture ID'),
  handleValidationErrors
];

/**
 * Validation rules for lecture upload/creation
 */
const lectureUploadValidation = [
  body('titleArabic')
    .trim()
    .notEmpty()
    .withMessage('Arabic title is required')
    .isLength({ max: 500 })
    .withMessage('Arabic title too long (max 500 characters)'),
  body('titleEnglish')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('English title too long (max 500 characters)'),
  body('descriptionArabic')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Arabic description too long (max 5000 characters)'),
  body('descriptionEnglish')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('English description too long (max 5000 characters)'),
  body('sheikhId')
    .custom(isValidObjectId)
    .withMessage('Invalid sheikh ID'),
  body('seriesId')
    .optional()
    .custom((value) => !value || isValidObjectId(value))
    .withMessage('Invalid series ID'),
  body('lectureNumber')
    .optional()
    .isInt({ min: 1, max: 9999 })
    .withMessage('Lecture number must be between 1 and 9999'),
  body('location')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Location too long (max 200 characters)'),
  body('category')
    .optional()
    .isIn(['Aqeedah', 'Fiqh', 'Tafsir', 'Hadith', 'Seerah', 'Akhlaq', 'Other'])
    .withMessage('Invalid category'),
  body('dateRecorded')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format'),
  body('dateRecordedHijri')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Hijri date too long'),
  body('published')
    .optional()
    .isIn(['true', 'false', true, false])
    .withMessage('Published must be boolean'),
  body('featured')
    .optional()
    .isIn(['true', 'false', true, false])
    .withMessage('Featured must be boolean'),
  handleValidationErrors
];

/**
 * Validation for search queries
 */
const searchValidation = [
  query('q')
    .optional()
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Search query must be 2-200 characters')
    .escape(),
  handleValidationErrors
];

/**
 * Sanitize search input - removes potential XSS and normalizes input
 * Use this for all user-provided search strings
 */
const sanitizeSearchInput = (input, maxLength = 200) => {
  if (!input || typeof input !== 'string') return '';

  // Trim and limit length
  let sanitized = input.trim().substring(0, maxLength);

  // Remove null bytes and control characters (except newlines/tabs for comments)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // HTML entity encode dangerous characters to prevent XSS
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  return sanitized;
};

/**
 * Sanitize comment input - allows more characters but still prevents XSS
 */
const sanitizeComment = (input, maxLength = 300) => {
  if (!input || typeof input !== 'string') return '';

  // Trim and limit length
  let sanitized = input.trim().substring(0, maxLength);

  // Remove null bytes and most control characters but keep newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // HTML entity encode dangerous characters
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  return sanitized;
};

/**
 * Sanitize user input to prevent NoSQL injection
 * Removes $ and . from object keys
 */
const sanitizeMongoQuery = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const sanitized = Array.isArray(obj) ? [] : {};

  for (const key of Object.keys(obj)) {
    // Skip keys that start with $ or contain .
    if (key.startsWith('$') || key.includes('.')) {
      continue;
    }
    sanitized[key] = sanitizeMongoQuery(obj[key]);
  }

  return sanitized;
};

module.exports = {
  handleValidationErrors,
  isValidObjectId,
  lecturesQueryValidation,
  idParamValidation,
  verifyDurationValidation,
  playCountValidation,
  lectureUploadValidation,
  searchValidation,
  sanitizeMongoQuery,
  sanitizeSearchInput,
  sanitizeComment
};
