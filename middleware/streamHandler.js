const fs = require('fs');

/**
 * Middleware to handle HTTP Range requests for audio streaming
 * Enables seeking in audio players by serving partial content
 */
const handleRangeRequest = (req, res, next) => {
  const filePath = req.filePath; // Should be set by route handler
  const stat = req.fileStat; // Should be set by route handler

  if (!filePath || !stat) {
    return res.status(500).json({
      success: false,
      message: 'File path or stats not provided'
    });
  }

  const fileSize = stat.size;
  const range = req.headers.range;

  // If no range header, serve the entire file
  if (!range) {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': req.mimeType || 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
    };

    res.writeHead(200, head);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);

    stream.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).end('Stream error');
      }
    });

    return;
  }

  // Parse range header
  const parts = range.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

  // Validate range
  if (start >= fileSize || end >= fileSize) {
    res.writeHead(416, {
      'Content-Range': `bytes */${fileSize}`
    });
    return res.end();
  }

  const chunkSize = (end - start) + 1;

  const head = {
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': req.mimeType || 'audio/mpeg',
    'Cache-Control': 'public, max-age=31536000',
  };

  // 206 Partial Content
  res.writeHead(206, head);

  const stream = fs.createReadStream(filePath, { start, end });
  stream.pipe(res);

  stream.on('error', (err) => {
    console.error('Stream error:', err);
    if (!res.headersSent) {
      res.status(500).end('Stream error');
    }
  });
};

/**
 * Get MIME type from file extension
 */
const getMimeType = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();

  const mimeTypes = {
    'mp3': 'audio/mpeg',
    'm4a': 'audio/mp4',
    'mp4': 'audio/mp4',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'webm': 'audio/webm',
    'aac': 'audio/aac',
    'flac': 'audio/flac'
  };

  return mimeTypes[ext] || 'audio/mpeg';
};

/**
 * Middleware to set cache headers for static audio files
 */
const setCacheHeaders = (req, res, next) => {
  // Cache audio files for 1 year (they don't change)
  res.set({
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Expires': new Date(Date.now() + 31536000000).toUTCString()
  });
  next();
};

/**
 * Middleware to prevent caching (for dynamic content)
 */
const preventCache = (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Expires': '0',
    'Pragma': 'no-cache'
  });
  next();
};

module.exports = {
  handleRangeRequest,
  getMimeType,
  setCacheHeaders,
  preventCache
};
