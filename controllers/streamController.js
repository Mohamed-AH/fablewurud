const fs = require('fs');
const path = require('path');
const https = require('https');
const { Lecture } = require('../models');
const { getFilePath, fileExists } = require('../utils/fileManager');
const { getMimeType, handleRangeRequest } = require('../middleware/streamHandler');
const { getPublicUrl, isConfigured: isOciConfigured, createPreAuthenticatedRequest } = require('../utils/ociStorage');
const { isValidObjectId } = require('../utils/validators');
const { recordAudioPlay } = require('../utils/metrics');
const sentryMetrics = require('../utils/sentryMetrics');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Generate a clean download filename from lecture metadata
 */
const generateDownloadFilename = (lecture, ext) => {
  let filename = '';

  if (lecture.seriesId && lecture.lectureNumber) {
    // Series lecture: "SeriesTitle - Part X - LectureTitle"
    const seriesTitle = lecture.seriesId.titleArabic || lecture.seriesId.titleEnglish;
    const lectureTitle = lecture.titleArabic || lecture.titleEnglish;
    filename = `${seriesTitle} - الدرس ${lecture.lectureNumber} - ${lectureTitle}`;
  } else {
    // Standalone lecture: "SheikhName - LectureTitle"
    const sheikhName = lecture.sheikhId?.nameArabic || lecture.sheikhId?.nameEnglish || 'Unknown';
    const lectureTitle = lecture.titleArabic || lecture.titleEnglish;
    filename = `${sheikhName} - ${lectureTitle}`;
  }

  // Sanitize filename
  return filename
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim() + ext;
};

/**
 * Proxy download from OCI with proper Content-Disposition header
 */
const proxyOciDownload = (ociUrl, res, filename, mimeType) => {
  return new Promise((resolve, reject) => {
    // Parse URL to handle encoded characters properly
    const parsedUrl = new URL(ociUrl);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET'
    };

    https.get(options, (ociResponse) => {
      if (ociResponse.statusCode === 200) {
        res.set({
          'Content-Type': mimeType || 'audio/mp4',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          'Content-Length': ociResponse.headers['content-length'],
          'Cache-Control': 'public, max-age=31536000'
        });

        ociResponse.pipe(res);
        ociResponse.on('end', resolve);
        ociResponse.on('error', reject);
      } else if (ociResponse.statusCode >= 300 && ociResponse.statusCode < 400) {
        // Handle redirect
        const redirectUrl = ociResponse.headers.location;
        if (redirectUrl) {
          proxyOciDownload(redirectUrl, res, filename, mimeType).then(resolve).catch(reject);
        } else {
          reject(new Error('Redirect without location header'));
        }
      } else {
        reject(new Error(`OCI returned status ${ociResponse.statusCode}`));
      }
    }).on('error', reject);
  });
};

/**
 * Stream audio file with Range request support
 * Supports both local files and OCI Object Storage
 * @route GET /stream/:id
 */
const streamAudio = async (req, res) => {
  try {
    const lectureId = req.params.id;

    // Validate ID format
    if (!isValidObjectId(lectureId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lecture ID format'
      });
    }

    // Find lecture
    const lecture = await Lecture.findById(lectureId);

    if (!lecture) {
      return res.status(404).json({
        success: false,
        message: 'Lecture not found'
      });
    }

    // Check if lecture has an OCI URL (stored in audioUrl field)
    if (lecture.audioUrl && lecture.audioUrl.includes('objectstorage')) {
      // Increment play count (async, don't wait)
      Lecture.updateOne({ _id: lecture._id }, { $inc: { playCount: 1 } }).catch(err => {
        console.error('Error incrementing play count:', err);
      });

      // Record audio play metric
      recordAudioPlay(lecture.audioFileName || lecture.titleArabic || 'unknown');
      sentryMetrics.audioPlay('oci');

      // Redirect to OCI Object Storage URL
      return res.redirect(lecture.audioUrl);
    }

    // Check if OCI is configured and file exists there
    if (isOciConfigured() && lecture.audioFileName) {
      const ociUrl = getPublicUrl(lecture.audioFileName);

      // Increment play count (async, don't wait)
      Lecture.updateOne({ _id: lecture._id }, { $inc: { playCount: 1 } }).catch(err => {
        console.error('Error incrementing play count:', err);
      });

      // Record audio play metric
      recordAudioPlay(lecture.audioFileName || lecture.titleArabic || 'unknown');
      sentryMetrics.audioPlay('oci');

      // Redirect to OCI
      return res.redirect(ociUrl);
    }

    // Fallback to local file streaming
    const filePath = getFilePath(lecture.audioFileName);

    if (!fileExists(lecture.audioFileName)) {
      console.error(`Audio file not found: ${lecture.audioFileName}`);
      return res.status(404).json({
        success: false,
        message: 'Audio file not found on server'
      });
    }

    // Get file stats
    const stat = fs.statSync(filePath);

    // Increment play count (async, don't wait)
    Lecture.updateOne({ _id: lecture._id }, { $inc: { playCount: 1 } }).catch(err => {
      console.error('Error incrementing play count:', err);
    });

    // Record audio play metric
    recordAudioPlay(lecture.audioFileName || lecture.titleArabic || 'unknown');
    sentryMetrics.audioPlay('local');

    // Get MIME type
    const mimeType = getMimeType(lecture.audioFileName);

    // Set file info for stream handler
    req.filePath = filePath;
    req.fileStat = stat;
    req.mimeType = mimeType;

    // Set Content-Disposition header for inline playback
    res.set({
      'Content-Disposition': `inline; filename="${encodeURIComponent(lecture.titleEnglish || lecture.titleArabic)}.${path.extname(lecture.audioFileName)}"`,
      'X-Content-Type-Options': 'nosniff'
    });

    // Handle range request
    handleRangeRequest(req, res);

  } catch (error) {
    console.error('Stream error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stream audio',
      error: isProduction ? undefined : error.message
    });
  }
};

/**
 * Download audio file with forced "Save As" dialog
 * Uses PAR redirect for fast OCI downloads (~250ms vs ~5s with proxy)
 * OCI objects have Content-Disposition: attachment header set
 * Falls back to local file streaming if OCI is not configured
 * @route GET /download/:id
 */
const downloadAudio = async (req, res) => {
  try {
    const lectureId = req.params.id;

    // Validate ID format
    if (!isValidObjectId(lectureId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lecture ID format'
      });
    }

    // Find lecture
    const lecture = await Lecture.findById(lectureId)
      .populate('sheikhId', 'nameArabic nameEnglish')
      .populate('seriesId', 'titleArabic titleEnglish');

    if (!lecture) {
      return res.status(404).json({
        success: false,
        message: 'Lecture not found'
      });
    }

    // Determine file extension for mime type
    const ext = lecture.audioFileName
      ? path.extname(lecture.audioFileName)
      : (lecture.audioUrl?.includes('.m4a') ? '.m4a' : '.mp3');
    const mimeType = getMimeType(lecture.audioFileName || 'audio.m4a');
    const downloadFilename = generateDownloadFilename(lecture, ext);

    // Check if OCI is configured and lecture has audioFileName - use PAR redirect
    if (isOciConfigured() && lecture.audioFileName) {
      try {
        // Generate presigned URL with 1-hour expiry for authenticated access
        const parUrl = await createPreAuthenticatedRequest(lecture.audioFileName, 1);

        // Redirect to PAR URL - OCI object has Content-Disposition: attachment header
        // This triggers "Save As" dialog and avoids server proxy latency (~5s -> ~250ms)
        res.redirect(302, parUrl);

        // Increment download count AFTER redirect sent (fire-and-forget)
        Lecture.updateOne({ _id: lecture._id }, { $inc: { downloadCount: 1 } }).catch(err => {
          console.error('Error incrementing download count:', err);
        });

        // Record metrics (fire-and-forget)
        sentryMetrics.audioDownload('oci', lecture.fileSize ? lecture.fileSize / 1024 / 1024 : 0);
        return;
      } catch (err) {
        console.error('Download error:', err);
        return res.status(500).json({
          success: false,
          message: 'Download failed from cloud storage'
        });
      }
    }

    // Fallback: If lecture has direct OCI URL but no audioFileName, use PAR redirect
    if (lecture.audioUrl && lecture.audioUrl.includes('objectstorage')) {
      try {
        // Try to create PAR for authenticated access with Content-Disposition
        const urlMatch = lecture.audioUrl.match(/\/o\/(.+)$/);
        if (urlMatch && isOciConfigured()) {
          const objectName = decodeURIComponent(urlMatch[1]);
          const parUrl = await createPreAuthenticatedRequest(objectName, 1);
          res.redirect(302, parUrl);
        } else {
          // No PAR available, redirect to direct URL
          res.redirect(302, lecture.audioUrl);
        }

        Lecture.updateOne({ _id: lecture._id }, { $inc: { downloadCount: 1 } }).catch(err => {
          console.error('Error incrementing download count:', err);
        });

        sentryMetrics.audioDownload('oci', lecture.fileSize ? lecture.fileSize / 1024 / 1024 : 0);
        return;
      } catch (err) {
        console.error('Download error for URL:', err);
        return res.status(500).json({
          success: false,
          message: 'Download failed from cloud storage'
        });
      }
    }

    // Fallback to local file download
    const filePath = getFilePath(lecture.audioFileName);

    if (!fileExists(lecture.audioFileName)) {
      console.error(`Audio file not found: ${lecture.audioFileName}`);
      return res.status(404).json({
        success: false,
        message: 'Audio file not found on server'
      });
    }

    // Set headers for download
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`,
      'Content-Length': lecture.fileSize,
      'Cache-Control': 'public, max-age=31536000'
    });

    // Stream file to response
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    // Increment download count after starting stream (fire-and-forget)
    Lecture.updateOne({ _id: lecture._id }, { $inc: { downloadCount: 1 } }).catch(err => {
      console.error('Error incrementing download count:', err);
    });

    // Track download metric
    sentryMetrics.audioDownload('local', lecture.fileSize ? lecture.fileSize / 1024 / 1024 : 0);

    fileStream.on('error', (err) => {
      console.error('Download stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Download failed'
        });
      }
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download audio',
      error: isProduction ? undefined : error.message
    });
  }
};

/**
 * Get streaming info (for testing/debugging)
 * @route GET /stream/:id/info
 */
const getStreamInfo = async (req, res) => {
  try {
    const lectureId = req.params.id;

    // Validate ID format
    if (!isValidObjectId(lectureId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lecture ID format'
      });
    }

    const lecture = await Lecture.findById(lectureId)
      .populate('sheikhId', 'nameArabic nameEnglish')
      .populate('seriesId', 'titleArabic titleEnglish')
      .lean();

    if (!lecture) {
      return res.status(404).json({
        success: false,
        message: 'Lecture not found'
      });
    }

    const filePathExists = fileExists(lecture.audioFileName);
    const filePath = getFilePath(lecture.audioFileName);
    let fileStats = null;

    if (filePathExists) {
      fileStats = fs.statSync(filePath);
    }

    res.json({
      success: true,
      lecture: {
        id: lecture._id,
        titleArabic: lecture.titleArabic,
        titleEnglish: lecture.titleEnglish,
        sheikh: lecture.sheikhId?.nameArabic || 'Unknown',
        series: lecture.seriesId?.titleArabic || null,
        duration: lecture.durationFormatted,
        fileSize: lecture.fileSizeMB + ' MB',
        playCount: lecture.playCount,
        downloadCount: lecture.downloadCount
      },
      file: {
        fileName: lecture.audioFileName,
        exists: filePathExists,
        size: fileStats ? fileStats.size : null,
        mimeType: getMimeType(lecture.audioFileName)
      },
      urls: {
        stream: `/stream/${lectureId}`,
        download: `/download/${lectureId}`
      }
    });

  } catch (error) {
    console.error('Stream info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get stream info',
      error: isProduction ? undefined : error.message
    });
  }
};

module.exports = {
  streamAudio,
  downloadAudio,
  getStreamInfo
};
