const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || './uploads';

// Create upload directory if it doesn't exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`📁 Created upload directory: ${uploadDir}`);
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '-') // Keep alphanumeric and Arabic chars
      .substring(0, 50); // Limit length

    const filename = `${basename}-${uniqueSuffix}${ext}`;
    cb(null, filename);
  }
});

// File filter - only allow audio files
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'audio/mpeg',      // .mp3
    'audio/mp3',
    'audio/mp4',       // .m4a
    'audio/x-m4a',
    'audio/wav',       // .wav
    'audio/wave',
    'audio/x-wav',
    'audio/ogg',       // .ogg
    'audio/webm',      // .webm
    'audio/aac',       // .aac
    'audio/flac'       // .flac
  ];

  const allowedExtensions = ['.mp3', '.m4a', '.wav', '.ogg', '.webm', '.aac', '.flac'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only audio files are allowed (${allowedExtensions.join(', ')})`), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 62914560, // 60MB default
    files: 1 // Single file upload
  }
});

// Multer for multiple files (for batch upload)
const uploadMultiple = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 62914560,
    files: 10 // Max 10 files at once
  }
});

module.exports = {
  upload,
  uploadMultiple,
  uploadDir
};
