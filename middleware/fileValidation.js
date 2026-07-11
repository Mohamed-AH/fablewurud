const path = require('path');
const fs = require('fs');
const multer = require('multer');

/**
 * Validate uploaded file after Multer processing
 * This adds extra security checks beyond Multer's fileFilter
 */
const validateUploadedFile = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded'
    });
  }

  const file = req.file;

  // 1. Check file exists on disk
  if (!fs.existsSync(file.path)) {
    return res.status(500).json({
      success: false,
      message: 'File upload failed - file not found on server'
    });
  }

  // 2. Check actual file size
  const stats = fs.statSync(file.path);
  const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 62914560; // 60MB

  if (stats.size > maxSize) {
    // Delete the file
    fs.unlinkSync(file.path);
    return res.status(400).json({
      success: false,
      message: `File too large. Maximum size is ${(maxSize / 1024 / 1024).toFixed(0)}MB`
    });
  }

  // 3. Check minimum file size (prevent empty files)
  if (stats.size < 1024) { // Less than 1KB
    fs.unlinkSync(file.path);
    return res.status(400).json({
      success: false,
      message: 'File too small. Invalid audio file.'
    });
  }

  // 4. Verify file extension matches MIME type
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeToExt = {
    'audio/mpeg': ['.mp3'],
    'audio/mp3': ['.mp3'],
    'audio/mp4': ['.m4a', '.mp4'],
    'audio/x-m4a': ['.m4a'],
    'audio/wav': ['.wav'],
    'audio/wave': ['.wav'],
    'audio/x-wav': ['.wav'],
    'audio/ogg': ['.ogg'],
    'audio/webm': ['.webm'],
    'audio/aac': ['.aac'],
    'audio/flac': ['.flac']
  };

  const expectedExts = mimeToExt[file.mimetype];
  if (!expectedExts || !expectedExts.includes(ext)) {
    fs.unlinkSync(file.path);
    return res.status(400).json({
      success: false,
      message: 'File extension does not match MIME type. Possible security risk.'
    });
  }

  // 5. Check for path traversal attempts in original filename
  const basename = path.basename(file.originalname);
  if (basename !== file.originalname || file.originalname.includes('..')) {
    fs.unlinkSync(file.path);
    return res.status(400).json({
      success: false,
      message: 'Invalid filename detected'
    });
  }

  // All validations passed
  next();
};

/**
 * Validate multiple uploaded files
 */
const validateUploadedFiles = (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No files uploaded'
    });
  }

  const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 62914560;
  const errors = [];

  // Validate each file
  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];

    // Check file exists
    if (!fs.existsSync(file.path)) {
      errors.push(`File ${i + 1}: Upload failed`);
      continue;
    }

    // Check size
    const stats = fs.statSync(file.path);
    if (stats.size > maxSize) {
      fs.unlinkSync(file.path);
      errors.push(`File ${i + 1}: Too large (max ${(maxSize / 1024 / 1024).toFixed(0)}MB)`);
      continue;
    }

    if (stats.size < 1024) {
      fs.unlinkSync(file.path);
      errors.push(`File ${i + 1}: Too small (invalid audio)`);
      continue;
    }
  }

  if (errors.length > 0) {
    // Clean up all files on any error
    req.files.forEach(file => {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    });

    return res.status(400).json({
      success: false,
      message: 'File validation failed',
      errors: errors
    });
  }

  next();
};

/**
 * Handle Multer errors
 */
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${(parseInt(process.env.MAX_FILE_SIZE) / 1024 / 1024).toFixed(0)}MB`
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 10 files at once.'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name in upload'
      });
    }

    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  }

  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  next();
};

module.exports = {
  validateUploadedFile,
  validateUploadedFiles,
  handleMulterError
};
