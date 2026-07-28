const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Resolve a WRITABLE upload staging directory.
 *
 * Uploaded files are only staged on local disk briefly before being pushed to
 * OCI / Cloudflare R2 and deleted, so any writable directory works. Preferring
 * UPLOAD_DIR but falling back keeps uploads working when the configured path
 * isn't writable — e.g. a non-root process against a root-owned mount like
 * /mnt/audio (the ENOENT/EACCES upload failures). Order:
 *   1. UPLOAD_DIR (if set and writable)
 *   2. <app>/uploads   (the Dockerfile chowns this to the runtime user)
 *   3. <os.tmpdir>/wurud-uploads  (guaranteed writable)
 */
function resolveUploadDir() {
  const candidates = [
    process.env.UPLOAD_DIR,
    path.join(__dirname, '..', 'uploads'),
    path.join(os.tmpdir(), 'wurud-uploads')
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch (_) { /* not usable — try the next candidate */ }
  }
  return os.tmpdir(); // last resort
}

const uploadDir = resolveUploadDir();
if (process.env.UPLOAD_DIR && uploadDir !== process.env.UPLOAD_DIR) {
  console.warn(`⚠️ UPLOAD_DIR "${process.env.UPLOAD_DIR}" is not writable; staging uploads in "${uploadDir}" instead.`);
} else {
  console.warn(`📁 Upload staging directory: ${uploadDir}`);
}

/**
 * multer destination that (re)ensures the staging dir exists right before a write,
 * so a transient/missing directory can never cause an ENOENT mid-upload.
 */
function ensureUploadDir(req, file, cb) {
  fs.mkdir(uploadDir, { recursive: true }, (err) => cb(err, uploadDir));
}

// Configure storage
const storage = multer.diskStorage({
  destination: ensureUploadDir,
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
  uploadDir,
  ensureUploadDir
};
