const express = require('express');
const router = express.Router();
const { upload } = require('../../config/storage');
const { validateUploadedFile, handleMulterError } = require('../../middleware/fileValidation');
const { isAdminAPI } = require('../../middleware/auth');
const { extractAudioMetadata, isValidAudioFile } = require('../../utils/audioMetadata');
const fileManager = require('../../utils/fileManager');
const path = require('path');
const { Lecture, Sheikh, Series } = require('../../models');
const { convertToHijri } = require('../../utils/dateUtils');
const {
  lecturesQueryValidation,
  idParamValidation,
  verifyDurationValidation,
  playCountValidation,
  isValidObjectId
} = require('../../utils/validators');
const sentryMetrics = require('../../utils/sentryMetrics');

const isProduction = process.env.NODE_ENV === 'production';

// @route   POST /api/lectures
// @desc    Upload a new lecture with audio file
// @access  Private (Admin only)
router.post('/',
  isAdminAPI,
  upload.single('audioFile'),
  handleMulterError,
  validateUploadedFile,
  async (req, res) => {
    const uploadStart = Date.now();
    try {
      const file = req.file;

      // Validate audio file content
      const isValid = await isValidAudioFile(file.path);
      if (!isValid) {
        fileManager.deleteFile(file.filename);
        return res.status(400).json({
          success: false,
          message: 'Invalid audio file. File may be corrupted or not a valid audio format.'
        });
      }

      // Extract audio metadata
      const audioMetadata = await extractAudioMetadata(file.path);

      // Parse request body
      const {
        titleArabic,
        titleEnglish,
        descriptionArabic,
        descriptionEnglish,
        sheikhId,
        seriesId,
        lectureNumber,
        location,
        category,
        dateRecorded,
        dateRecordedHijri,
        published,
        featured
      } = req.body;

      // Validate required fields
      if (!titleArabic) {
        fileManager.deleteFile(file.filename);
        return res.status(400).json({
          success: false,
          message: 'Arabic title is required'
        });
      }

      if (!sheikhId) {
        fileManager.deleteFile(file.filename);
        return res.status(400).json({
          success: false,
          message: 'Sheikh is required'
        });
      }

      // Verify sheikh exists
      const sheikh = await Sheikh.findById(sheikhId);
      if (!sheikh) {
        fileManager.deleteFile(file.filename);
        return res.status(400).json({
          success: false,
          message: 'Sheikh not found'
        });
      }

      // Verify series exists (if provided)
      if (seriesId) {
        const series = await Series.findById(seriesId);
        if (!series) {
          fileManager.deleteFile(file.filename);
          return res.status(400).json({
            success: false,
            message: 'Series not found'
          });
        }
      }

      // Auto-convert Gregorian to Hijri (if not manually provided)
      const recordedDate = dateRecorded ? new Date(dateRecorded) : null;
      let hijriDate = dateRecordedHijri ? dateRecordedHijri.trim() : null;

      // If Hijri date not provided but Gregorian is, auto-convert
      if (!hijriDate && recordedDate) {
        hijriDate = convertToHijri(recordedDate);
      }

      // Create lecture document
      const lecture = await Lecture.create({
        audioFileName: file.filename,
        titleArabic: titleArabic.trim(),
        titleEnglish: titleEnglish ? titleEnglish.trim() : '',
        descriptionArabic: descriptionArabic ? descriptionArabic.trim() : '',
        descriptionEnglish: descriptionEnglish ? descriptionEnglish.trim() : '',
        sheikhId: sheikhId,
        seriesId: seriesId || null,
        lectureNumber: lectureNumber ? parseInt(lectureNumber) : null,
        duration: audioMetadata.duration,
        fileSize: audioMetadata.fileSize,
        location: location ? location.trim() : 'غير محدد',
        category: category || 'Other',
        dateRecorded: recordedDate,
        dateRecordedHijri: hijriDate,
        published: published === 'true' || published === true,
        featured: featured === 'true' || featured === true
      });

      // Update sheikh lecture count
      await Sheikh.findByIdAndUpdate(sheikhId, {
        $inc: { lectureCount: 1 }
      });

      // Update series lecture count (if applicable)
      if (seriesId) {
        await Series.findByIdAndUpdate(seriesId, {
          $inc: { lectureCount: 1 }
        });
      }

      // Populate references for response
      await lecture.populate('sheikhId', 'nameArabic nameEnglish honorific');
      await lecture.populate('seriesId', 'titleArabic titleEnglish');

      // Track upload latency metric
      sentryMetrics.uploadLatency(Date.now() - uploadStart);

      res.status(201).json({
        success: true,
        message: 'Lecture uploaded successfully',
        lecture: lecture,
        audioMetadata: {
          duration: audioMetadata.durationFormatted,
          fileSize: audioMetadata.fileSizeMB + ' MB',
          bitrate: audioMetadata.bitrate ? audioMetadata.bitrate + ' kbps' : null,
          format: audioMetadata.container
        }
      });

    } catch (error) {
      console.error('Lecture upload error:', error);

      // Clean up uploaded file on error
      if (req.file) {
        fileManager.deleteFile(req.file.filename);
      }

      res.status(500).json({
        success: false,
        message: 'Failed to upload lecture',
        error: isProduction ? undefined : error.message
      });
    }
  }
);

// @route   GET /api/lectures
// @desc    Get all lectures (with pagination and filters)
// @access  Public
router.get('/', lecturesQueryValidation, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sheikhId,
      seriesId,
      category,
      published,
      featured,
      search,
      sort = '-createdAt'
    } = req.query;

    // Sanitize pagination parameters (already validated by middleware)
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

    // Build query
    const query = {};

    // Only add ID filters if they're valid ObjectIds
    if (sheikhId && isValidObjectId(sheikhId)) query.sheikhId = sheikhId;
    if (seriesId && isValidObjectId(seriesId)) query.seriesId = seriesId;
    if (category) query.category = category;
    if (published !== undefined) query.published = published === 'true';
    if (featured !== undefined) query.featured = featured === 'true';

    // Text search (sanitized by validator)
    if (search && search.trim()) {
      query.$text = { $search: search.trim().substring(0, 200) };
    }

    // Execute query with pagination
    const lectures = await Lecture.find(query)
      .populate('sheikhId', 'nameArabic nameEnglish honorific')
      .populate('seriesId', 'titleArabic titleEnglish')
      .sort(sort)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    // Get total count for pagination
    const total = await Lecture.countDocuments(query);

    res.json({
      success: true,
      lectures: lectures,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: total,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Get lectures error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lectures',
      error: isProduction ? undefined : error.message
    });
  }
});

// @route   GET /api/lectures/:id
// @desc    Get single lecture by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const lecture = await Lecture.findById(req.params.id)
      .populate('sheikhId', 'nameArabic nameEnglish honorific bioArabic bioEnglish')
      .populate('seriesId', 'titleArabic titleEnglish descriptionArabic descriptionEnglish')
      .lean();

    if (!lecture) {
      return res.status(404).json({
        success: false,
        message: 'Lecture not found'
      });
    }

    res.json({
      success: true,
      lecture: lecture
    });

  } catch (error) {
    console.error('Get lecture error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lecture',
      error: isProduction ? undefined : error.message
    });
  }
});

// @route   POST /api/lectures/bulk-upload-audio
// @desc    Upload audio file for existing lecture (bulk upload)
// @access  Private (Admin only)
router.post('/bulk-upload-audio', [isAdminAPI, upload.single('audioFile')], async (req, res) => {
  try {
    const { lectureId } = req.body;

    console.log('📤 Bulk upload request:');
    console.log('   Lecture ID:', lectureId);
    if (req.file) {
      console.log('   ✅ File:', req.file.filename);
      console.log('   📁 Path:', req.file.path);
      console.log('   📦 Size:', (req.file.size / 1024 / 1024).toFixed(2), 'MB');
    }

    if (!lectureId) {
      return res.status(400).json({
        success: false,
        message: 'Lecture ID is required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Audio file is required'
      });
    }

    // Find the lecture
    const lecture = await Lecture.findById(lectureId);

    if (!lecture) {
      // Clean up uploaded file
      fileManager.deleteFile(req.file.filename);
      return res.status(404).json({
        success: false,
        message: 'Lecture not found'
      });
    }

    // If lecture already has audio, delete the old file
    if (lecture.audioFileName) {
      fileManager.deleteFile(lecture.audioFileName);
    }

    // Extract audio metadata
    const metadata = await extractAudioMetadata(req.file.path);

    // Update lecture with audio file info (use findByIdAndUpdate to avoid lean plugin issue)
    const updatedLecture = await Lecture.findByIdAndUpdate(
      lectureId,
      {
        audioFileName: req.file.filename,
        duration: Math.floor(metadata.duration || 0),
        fileSize: req.file.size,
        bitrate: metadata.bitrate || null,
        format: metadata.format || path.extname(req.file.filename).substring(1)
      },
      { new: true }
    );

    res.json({
      success: true,
      message: 'Audio file uploaded successfully',
      lecture: updatedLecture
    });

  } catch (error) {
    console.error('Bulk upload audio error:', error);

    // Clean up uploaded file on error
    if (req.file) {
      fileManager.deleteFile(req.file.filename);
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload audio file',
      error: isProduction ? undefined : error.message
    });
  }
});

// @route   PUT /api/lectures/:id
// @desc    Update lecture
// @access  Private (Admin only)
router.put('/:id', isAdminAPI, async (req, res) => {
  try {
    const {
      titleArabic,
      titleEnglish,
      descriptionArabic,
      descriptionEnglish,
      published,
      featured
    } = req.body;

    const lecture = await Lecture.findByIdAndUpdate(
      req.params.id,
      {
        titleArabic,
        titleEnglish,
        descriptionArabic,
        descriptionEnglish,
        published,
        featured
      },
      { new: true, runValidators: true }
    ).populate('sheikhId', 'nameArabic nameEnglish')
     .populate('seriesId', 'titleArabic titleEnglish');

    if (!lecture) {
      return res.status(404).json({
        success: false,
        message: 'Lecture not found'
      });
    }

    res.json({
      success: true,
      message: 'Lecture updated successfully',
      lecture: lecture
    });
  } catch (error) {
    console.error('Update lecture error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update lecture',
      error: isProduction ? undefined : error.message
    });
  }
});

// @route   DELETE /api/lectures/:id
// @desc    Delete lecture
// @access  Private (Admin only)
router.delete('/:id', isAdminAPI, async (req, res) => {
  try {
    const lecture = await Lecture.findById(req.params.id);

    if (!lecture) {
      return res.status(404).json({
        success: false,
        message: 'Lecture not found'
      });
    }

    // Delete the audio file
    fileManager.deleteFile(lecture.audioFileName);

    // Decrement sheikh lecture count
    await Sheikh.findByIdAndUpdate(lecture.sheikhId, {
      $inc: { lectureCount: -1 }
    });

    // Decrement series lecture count (if applicable)
    if (lecture.seriesId) {
      await Series.findByIdAndUpdate(lecture.seriesId, {
        $inc: { lectureCount: -1 }
      });
    }

    // Delete lecture from database
    await Lecture.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Lecture deleted successfully'
    });
  } catch (error) {
    console.error('Delete lecture error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete lecture',
      error: isProduction ? undefined : error.message
    });
  }
});

// @route   POST /api/lectures/:id/verify-duration
// @desc    Verify and update lecture duration from client playback
// @access  Public
router.post('/:id/verify-duration', verifyDurationValidation, async (req, res) => {
  try {
    const { duration } = req.body;
    const lectureId = req.params.id;

    // Additional realistic duration validation (max 12 hours)
    const MAX_DURATION = 12 * 60 * 60; // 12 hours in seconds
    if (duration > MAX_DURATION) {
      return res.status(400).json({
        success: false,
        message: 'Duration exceeds maximum allowed value'
      });
    }
    const roundedDuration = Math.round(duration);

    // Find the lecture
    const lecture = await Lecture.findById(lectureId);

    if (!lecture) {
      return res.status(404).json({
        success: false,
        message: 'Lecture not found'
      });
    }

    // Skip if already verified
    if (lecture.durationVerified) {
      return res.json({
        success: true,
        message: 'Duration already verified',
        skipped: true
      });
    }

    // Check if duration differs (allow 2 second tolerance)
    const currentDuration = lecture.duration || 0;
    const difference = Math.abs(currentDuration - roundedDuration);

    if (difference > 2) {
      // Duration mismatch - update it
      console.log(`📊 Duration mismatch for lecture ${lectureId}:`);
      console.log(`   Stored: ${currentDuration}s, Actual: ${roundedDuration}s (diff: ${difference}s)`);

      await Lecture.updateOne(
        { _id: lectureId },
        {
          $set: {
            duration: roundedDuration,
            durationVerified: true
          }
        }
      );

      return res.json({
        success: true,
        message: 'Duration updated',
        updated: true,
        oldDuration: currentDuration,
        newDuration: roundedDuration
      });
    }

    // Duration matches - just mark as verified
    await Lecture.updateOne(
      { _id: lectureId },
      { $set: { durationVerified: true } }
    );

    return res.json({
      success: true,
      message: 'Duration verified',
      verified: true
    });

  } catch (error) {
    console.error('Verify duration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify duration',
      error: isProduction ? undefined : error.message
    });
  }
});

// @route   POST /api/lectures/:id/play
// @desc    Increment play count
// @access  Public
router.post('/:id/play', playCountValidation, async (req, res) => {
  try {
    const lecture = await Lecture.findByIdAndUpdate(
      req.params.id,
      { $inc: { playCount: 1 } },
      { new: true }
    );

    if (!lecture) {
      return res.status(404).json({
        success: false,
        message: 'Lecture not found'
      });
    }

    res.json({
      success: true,
      playCount: lecture.playCount
    });
  } catch (error) {
    console.error('Increment play count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to increment play count',
      error: isProduction ? undefined : error.message
    });
  }
});

// @route   GET /api/lectures/:id/transcript
// @desc    Get transcript for a lecture
// @access  Public
router.get('/:id/transcript', idParamValidation, async (req, res) => {
  try {
    const { id } = req.params;
    const models = require('../../models');
    const Transcript = models.Transcript;

    if (!Transcript) {
      return res.status(503).json({
        success: false,
        message: 'Transcript service unavailable'
      });
    }

    // Find lecture first to validate it exists and is published
    let lecture;
    if (isValidObjectId(id)) {
      lecture = await Lecture.findOne({ _id: id, published: true }).select('_id shortId').lean();
    }

    // Also try shortId if numeric
    if (!lecture && /^\d+$/.test(id)) {
      lecture = await Lecture.findOne({ shortId: parseInt(id, 10), published: true }).select('_id shortId').lean();
    }

    if (!lecture) {
      return res.status(404).json({
        success: false,
        message: 'Lecture not found'
      });
    }

    // Fetch transcript segments by shortId from searchdb
    const transcripts = await Transcript.find({ shortId: lecture.shortId })
      .sort({ startTimeSec: 1 })
      .select('text speaker startTimeSec startTimeMs')
      .lean();

    // Debug: Log transcript fetch result
    console.log(`📝 API transcript fetch for lecture shortId ${lecture.shortId}: ${transcripts ? transcripts.length : 0} segments found`);

    if (!transcripts || transcripts.length === 0) {
      console.log(`⚠️ No transcript found for shortId: ${lecture.shortId}`);
      return res.status(404).json({
        success: false,
        message: 'No transcript available for this lecture'
      });
    }

    // Format timestamps
    const formatTime = (seconds) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const formattedTranscripts = transcripts.map(t => ({
      text: t.text,
      speaker: t.speaker,
      startTimeSec: t.startTimeSec,
      formattedTime: formatTime(t.startTimeSec)
    }));

    res.json({
      success: true,
      lectureId: lecture._id,
      segmentCount: formattedTranscripts.length,
      transcript: formattedTranscripts
    });
  } catch (error) {
    console.error('Fetch transcript error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transcript',
      error: isProduction ? undefined : error.message
    });
  }
});

module.exports = router;
