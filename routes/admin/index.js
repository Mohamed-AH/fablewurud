const express = require('express');
const router = express.Router();
const { isAdmin, isEditor, isSuperAdmin } = require('../../middleware/auth');
const { convertToHijri } = require('../../utils/dateUtils');
const { adminI18nMiddleware, invalidateNoticeBannerCache } = require('../../utils/i18n');
const cache = require('../../utils/cache');
const { sanitizeArticleHtml } = require('../../utils/sanitizeHtml');
const { withTransaction } = require('../../utils/dbTransaction');
const { escapeRegex } = require('../../utils/validators');

// Apply admin i18n middleware to all admin routes
router.use(adminI18nMiddleware);

// Helper function to invalidate homepage cache after admin changes
function invalidateHomepageCache() {
  cache.invalidatePattern('homepage:*');
  cache.invalidatePattern('search:*');
  cache.del('sitemap:xml');
}

// @route   GET /admin/login
// @desc    Admin login page
// @access  Public
router.get('/login', (req, res) => {
  // If already authenticated, redirect to dashboard
  if (req.isAuthenticated()) {
    return res.redirect('/admin/dashboard');
  }

  const error = req.query.error;
  let errorMessage = '';

  if (error === 'unauthorized') {
    errorMessage = 'Your email is not authorized to access the admin panel.';
  } else if (error === 'inactive') {
    errorMessage = 'Your admin account has been deactivated.';
  }

  res.render('admin/login', {
    layout: false,
    title: 'Admin Login',
    errorMessage
  });
});

// @route   GET /admin/dashboard
// @desc    Admin dashboard
// @access  Private (Admin only)
router.get('/dashboard', isAdmin, async (req, res) => {
  try {
    const { Lecture, Sheikh, Series, Article } = require('../../models');

    // Get statistics
    const stats = {
      totalLectures: await Lecture.countDocuments(),
      publishedLectures: await Lecture.countDocuments({ published: true }),
      totalSheikhs: await Sheikh.countDocuments(),
      totalSeries: await Series.countDocuments(),
      totalArticles: await Article.countDocuments(),
      totalPlays: await Lecture.aggregate([
        { $group: { _id: null, total: { $sum: '$playCount' } } }
      ]).then(result => result[0]?.total || 0),
      totalDownloads: await Lecture.aggregate([
        { $group: { _id: null, total: { $sum: '$downloadCount' } } }
      ]).then(result => result[0]?.total || 0)
    };

    // Get recent lectures
    const recentLectures = await Lecture.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('sheikhId', 'nameArabic nameEnglish')
      .populate('seriesId', 'titleArabic titleEnglish')
      .lean();

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      user: req.user,
      stats,
      recentLectures
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send('Error loading dashboard');
  }
});

// @route   GET /admin/upload
// @desc    Upload lecture page
// @access  Private (Admin only)
router.get('/upload', isAdmin, (req, res) => {
  res.render('admin/upload', {
    title: 'Upload Lecture',
    user: req.user
  });
});

// @route   GET /admin/bulk-upload
// @desc    Bulk upload audio files for existing lectures
// @access  Private (Admin only)
router.get('/bulk-upload', isAdmin, (req, res) => {
  res.render('admin/bulk-upload', {
    title: 'Bulk Upload Audio',
    user: req.user
  });
});

// @route   GET /admin/duration-status
// @desc    Duration verification status page
// @access  Private (Admin only)
router.get('/duration-status', isAdmin, async (req, res) => {
  try {
    const { Lecture } = require('../../models');

    // Get stats
    const total = await Lecture.countDocuments();
    const withAudio = await Lecture.countDocuments({ audioFileName: { $exists: true, $nin: [null, ''] } });
    const verified = await Lecture.countDocuments({ durationVerified: true });
    const noAudio = total - withAudio;
    const pending = withAudio - verified;

    const verifiedPercent = withAudio > 0 ? Math.round((verified / withAudio) * 100) : 0;
    const pendingPercent = withAudio > 0 ? Math.round((pending / withAudio) * 100) : 0;

    // Get pending lectures (with audio but not verified)
    const pendingLectures = await Lecture.find({
      audioFileName: { $exists: true, $nin: [null, ''] },
      $or: [
        { durationVerified: false },
        { durationVerified: { $exists: false } }
      ]
    })
      .select('_id titleArabic audioFileName duration seriesId')
      .populate('seriesId', 'titleArabic')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.render('admin/duration-status', {
      title: 'Duration Verification Status',
      user: req.user,
      stats: {
        total,
        withAudio,
        verified,
        noAudio,
        pending,
        verifiedPercent,
        pendingPercent
      },
      pendingLectures
    });
  } catch (error) {
    console.error('Duration status error:', error);
    res.status(500).send('Error loading duration status page');
  }
});

// @route   GET /admin/manage
// @desc    Manage lectures page
// @access  Private (Admin only)
router.get('/manage', isAdmin, async (req, res) => {
  try {
    const { Lecture, Series } = require('../../models');

    const lectures = await Lecture.find()
      .sort({ createdAt: -1 })
      .populate('sheikhId', 'nameArabic nameEnglish')
      .populate('seriesId', 'titleArabic titleEnglish')
      .lean();

    const series = await Series.find()
      .sort({ createdAt: -1 })
      .populate('sheikhId', 'nameArabic nameEnglish')
      .lean();

    res.render('admin/manage', {
      title: 'Manage Lectures',
      user: req.user,
      lectures,
      series
    });
  } catch (error) {
    console.error('Manage error:', error);
    res.status(500).send('Error loading manage page');
  }
});

// @route   GET /admin/lectures
// @desc    Search and list all lectures
// @access  Private (Admin only)
router.get('/lectures', isAdmin, async (req, res) => {
  try {
    const { Lecture, Series } = require('../../models');
    const { search, seriesId } = req.query;

    // Build query
    const query = {};

    if (search) {
      const safe = escapeRegex(String(search));
      query.$or = [
        { titleArabic: { $regex: safe, $options: 'i' } },
        { titleEnglish: { $regex: safe, $options: 'i' } },
        { slug: { $regex: safe, $options: 'i' } }
      ];
    }

    if (seriesId) {
      query.seriesId = seriesId;
    }

    const lectures = await Lecture.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('sheikhId', 'nameArabic nameEnglish')
      .populate('seriesId', 'titleArabic titleEnglish')
      .lean();

    const allSeries = await Series.find().sort({ titleArabic: 1 }).lean();

    res.render('admin/lectures-list', {
      title: 'إدارة المحاضرات',
      user: req.user,
      lectures,
      allSeries,
      search: search || '',
      selectedSeriesId: seriesId || ''
    });
  } catch (error) {
    console.error('Lectures list error:', error);
    res.status(500).send('Error loading lectures');
  }
});

// @route   POST /admin/lectures/:id/delete
// @desc    Delete a lecture
// @access  Private (Admin only)
router.post('/lectures/:id/delete', isAdmin, async (req, res) => {
  try {
    const { Lecture, Series, Sheikh } = require('../../models');
    const { deleteFromOCI } = require('../../utils/ociStorage');

    const lecture = await Lecture.findById(req.params.id);

    if (!lecture) {
      return res.status(404).json({ success: false, message: 'Lecture not found' });
    }

    // Atomic multi-document update: decrement counts + delete lecture together
    // so a partial failure can't drift lectureCount (see utils/sync-lecture-counts).
    await withTransaction(async (session) => {
      if (lecture.seriesId) {
        await Series.findByIdAndUpdate(lecture.seriesId, { $inc: { lectureCount: -1 } }, { session });
      }
      if (lecture.sheikhId) {
        await Sheikh.findByIdAndUpdate(lecture.sheikhId, { $inc: { lectureCount: -1 } }, { session });
      }
      await Lecture.findByIdAndDelete(req.params.id, { session });
    });

    // Delete audio from OCI AFTER the DB delete commits (avoids orphaning the
    // file if the transaction rolls back). Best-effort — file cleanup is not fatal.
    if (lecture.audioFileName) {
      try {
        await deleteFromOCI(lecture.audioFileName);
      } catch (ociError) {
        console.warn('Could not delete OCI file:', ociError.message);
      }
    }

    // Invalidate homepage cache
    invalidateHomepageCache();

    // Check if request expects JSON (AJAX) or redirect
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'Lecture deleted' });
    }

    // Redirect back to referrer or lectures list
    const returnUrl = req.body.returnUrl || '/admin/lectures';
    res.redirect(returnUrl);
  } catch (error) {
    console.error('Delete lecture error:', error);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, message: error.message });
    }
    res.status(500).send('Error deleting lecture');
  }
});

// @route   GET /admin/lectures/unpublished
// @desc    List unpublished lectures
// @access  Private (Admin only)
router.get('/lectures/unpublished', isAdmin, async (req, res) => {
  try {
    const { Lecture } = require('../../models');

    const unpublishedLectures = await Lecture.find({ published: false })
      .sort({ createdAt: -1 })
      .populate('sheikhId', 'nameArabic nameEnglish')
      .populate('seriesId', 'titleArabic titleEnglish')
      .lean();

    res.render('admin/unpublished-lectures', {
      title: 'Unpublished Lectures',
      user: req.user,
      lectures: unpublishedLectures
    });
  } catch (error) {
    console.error('Unpublished lectures error:', error);
    res.status(500).send('Error loading unpublished lectures');
  }
});

// @route   GET /admin/lectures/no-audio
// @desc    List lectures without audio files
// @access  Private (Admin only)
router.get('/lectures/no-audio', isAdmin, async (req, res) => {
  try {
    const { Lecture } = require('../../models');

    const noAudioLectures = await Lecture.find({
      $or: [
        { audioFileName: null },
        { audioFileName: '' }
      ]
    })
      .sort({ createdAt: -1 })
      .populate('sheikhId', 'nameArabic nameEnglish')
      .populate('seriesId', 'titleArabic titleEnglish')
      .lean();

    res.render('admin/no-audio-lectures', {
      title: 'Lectures Without Audio',
      user: req.user,
      lectures: noAudioLectures
    });
  } catch (error) {
    console.error('No audio lectures error:', error);
    res.status(500).send('Error loading lectures without audio');
  }
});

// @route   GET /admin/series/new
// @desc    Create new series page
// @access  Private (Admin only)
router.get('/series/new', isAdmin, async (req, res) => {
  try {
    const { Sheikh, Section } = require('../../models');

    const sheikhs = await Sheikh.find().sort({ nameArabic: 1 }).lean();
    const sections = await Section.find().sort({ displayOrder: 1 }).lean();

    res.render('admin/series-form', {
      title: 'Add New Series',
      user: req.user,
      series: null,
      sheikhs,
      sections,
      isEdit: false
    });
  } catch (error) {
    console.error('New series page error:', error);
    res.status(500).send('Error loading new series form');
  }
});

// @route   POST /admin/series/new
// @desc    Create new series
// @access  Private (Admin only)
router.post('/series/new', isAdmin, async (req, res) => {
  try {
    const { Series } = require('../../models');

    const {
      titleArabic,
      titleEnglish,
      descriptionArabic,
      descriptionEnglish,
      sheikhId,
      category,
      bookTitle,
      bookAuthor,
      isVisible,
      sectionId
    } = req.body;

    const series = new Series({
      titleArabic,
      titleEnglish: titleEnglish || undefined,
      descriptionArabic: descriptionArabic || undefined,
      descriptionEnglish: descriptionEnglish || undefined,
      sheikhId,
      category: category || 'Other',
      bookTitle: bookTitle || undefined,
      bookAuthor: bookAuthor || undefined,
      isVisible: isVisible === 'true' || isVisible === true,
      sectionId: sectionId || null
    });

    await series.save();
    invalidateHomepageCache();

    res.redirect(`/admin/series/${series._id}/edit`);
  } catch (error) {
    console.error('Create series error:', error);
    res.status(500).send('Error creating series: ' + error.message);
  }
});

// @route   GET /admin/series/:id/edit
// @desc    Edit series page
// @access  Private (Admin only)
router.get('/series/:id/edit', isAdmin, async (req, res) => {
  try {
    const { Series, Sheikh, Lecture, Section } = require('../../models');

    const series = await Series.findById(req.params.id)
      .populate('sheikhId', 'nameArabic nameEnglish')
      .lean();

    if (!series) {
      return res.status(404).send('Series not found');
    }

    const sheikhs = await Sheikh.find().sort({ nameArabic: 1 }).lean();
    const sections = await Section.find().sort({ displayOrder: 1 }).lean();

    // Get lectures in this series, ordered by sortOrder
    // Use aggregation to handle null/undefined sortOrder values consistently
    const mongoose = require('mongoose');
    const lectures = await Lecture.aggregate([
      {
        $match: { seriesId: new mongoose.Types.ObjectId(req.params.id) }
      },
      {
        $sort: {
          sortOrder: 1,
          lectureNumber: 1,
          createdAt: 1
        }
      },
      {
        $project: {
          titleArabic: 1,
          lectureNumber: 1,
          sortOrder: 1,
          dateRecorded: 1,
          published: 1,
          audioUrl: 1,
          durationSeconds: 1
        }
      }
    ]);

    res.render('admin/edit-series', {
      title: 'Edit Series',
      user: req.user,
      series,
      sheikhs,
      sections,
      lectures,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    console.error('Edit series error:', error);
    res.status(500).send('Error loading edit series page');
  }
});

// @route   POST /admin/series/:id/edit
// @desc    Update series
// @access  Private (Admin only)
router.post('/series/:id/edit', isAdmin, async (req, res) => {
  try {
    const { Series } = require('../../models');
    const mongoose = require('mongoose');
    const {
      titleArabic, titleEnglish, category, descriptionArabic, descriptionEnglish,
      tags, bookAuthor, isVisible, parentSeriesId,
      // Display options for search/filter
      showSearch, showYearFilter, showSortOptions, minLecturesForSearch, minLecturesForYearFilter,
      defaultSortOrder
    } = req.body;

    // Handle tags - can be a string (single tag) or array (multiple tags)
    let tagsArray = [];
    if (tags) {
      tagsArray = Array.isArray(tags) ? tags : [tags];
    }

    // Ensure category is valid, default to 'Other' if not
    const validCategories = ['Aqeedah', 'Fiqh', 'Tafsir', 'Hadith', 'Seerah', 'Akhlaq', 'Other'];
    const validCategory = validCategories.includes(category) ? category : 'Other';

    // Handle visibility - checkbox sends 'on' when checked, undefined when not
    const isVisibleBool = isVisible === 'on' || isVisible === 'true' || isVisible === true;

    // Validate parentSeriesId
    let validParentId = null;
    if (parentSeriesId && parentSeriesId !== '' && parentSeriesId !== req.params.id) {
      // Ensure parent exists and is a top-level series
      const parentSeries = await Series.findById(parentSeriesId);
      if (parentSeries && !parentSeries.parentSeriesId) {
        validParentId = new mongoose.Types.ObjectId(parentSeriesId);
      }
    }

    // Handle display options for search/filter
    const displayOptions = {
      showSearch: showSearch === 'on' || showSearch === 'true' || showSearch === true,
      showYearFilter: showYearFilter === 'on' || showYearFilter === 'true' || showYearFilter === true,
      showSortOptions: showSortOptions === 'on' || showSortOptions === 'true' || showSortOptions === true,
      minLecturesForSearch: parseInt(minLecturesForSearch) || 15,
      minLecturesForYearFilter: parseInt(minLecturesForYearFilter) || 15,
      defaultSortOrder: defaultSortOrder === 'newest' ? 'newest' : 'oldest'
    };

    console.log(`[Series Edit] ID: ${req.params.id}, Category: ${category} -> ${validCategory}, isVisible: ${isVisibleBool}, parentSeriesId: ${validParentId}, Tags: ${JSON.stringify(tagsArray)}, DisplayOptions: ${JSON.stringify(displayOptions)}`);

    await Series.findByIdAndUpdate(req.params.id, {
      titleArabic,
      titleEnglish,
      category: validCategory,
      descriptionArabic,
      descriptionEnglish,
      tags: tagsArray,
      bookAuthor: bookAuthor || null,
      isVisible: isVisibleBool,
      parentSeriesId: validParentId,
      displayOptions
    });

    // Invalidate homepage cache
    invalidateHomepageCache();

    res.redirect(`/admin/series/${req.params.id}/edit?success=updated`);
  } catch (error) {
    console.error('Update series error:', error);
    res.status(500).send('Error updating series');
  }
});

// @route   POST /admin/series/:id/reorder-lectures
// @desc    Reorder lectures in a series
// @access  Private (Admin only)
router.post('/series/:id/reorder-lectures', isAdmin, async (req, res) => {
  try {
    const { Lecture } = require('../../models');
    const mongoose = require('mongoose');
    const { lectureIds } = req.body;

    if (!lectureIds || !Array.isArray(lectureIds)) {
      return res.status(400).json({ error: 'Invalid lecture order data' });
    }

    const seriesObjectId = new mongoose.Types.ObjectId(req.params.id);

    // Update sortOrder for each lecture based on new order
    const updates = lectureIds.map((lectureId, index) =>
      Lecture.updateOne(
        { _id: new mongoose.Types.ObjectId(lectureId), seriesId: seriesObjectId },
        { $set: { sortOrder: index } }
      )
    );

    const results = await Promise.all(updates);

    // Log how many were actually updated
    const updatedCount = results.reduce((sum, r) => sum + r.modifiedCount, 0);
    console.log(`Reorder: Updated ${updatedCount} of ${lectureIds.length} lectures for series ${req.params.id}`);

    res.json({ success: true, message: 'Lecture order updated successfully', updatedCount });
  } catch (error) {
    console.error('Reorder lectures error:', error);
    res.status(500).json({ error: 'Error reordering lectures' });
  }
});

// @route   GET /admin/series/:id/quick-add-lecture
// @desc    Quick add lecture form (minimal form)
// @access  Private (Admin only)
router.get('/series/:id/quick-add-lecture', isAdmin, async (req, res) => {
  try {
    const { Series, Lecture } = require('../../models');

    const series = await Series.findById(req.params.id)
      .populate('sheikhId', 'nameArabic nameEnglish')
      .lean();

    if (!series) {
      return res.status(404).send('Series not found');
    }

    // Get the highest lecture number in this series
    const lastLecture = await Lecture.findOne({ seriesId: series._id })
      .sort({ lectureNumber: -1 })
      .select('lectureNumber')
      .lean();

    const nextLectureNumber = (lastLecture?.lectureNumber || 0) + 1;

    // Get total lecture count for sortOrder
    const lectureCount = await Lecture.countDocuments({ seriesId: series._id });

    res.render('admin/quick-add-lecture', {
      title: 'إضافة درس سريع',
      user: req.user,
      series,
      nextLectureNumber,
      nextSortOrder: lectureCount,
      today: new Date().toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Quick add lecture page error:', error);
    res.status(500).send('Error loading quick add page');
  }
});

// @route   POST /admin/series/:id/quick-add-lecture
// @desc    Create lecture with minimal data
// @access  Private (Admin only)
router.post('/series/:id/quick-add-lecture', isAdmin, async (req, res) => {
  try {
    const { Series, Lecture } = require('../../models');
    const { generateSlug } = require('../../utils/slugify');

    const series = await Series.findById(req.params.id)
      .populate('sheikhId')
      .lean();

    if (!series) {
      return res.status(404).send('Series not found');
    }

    const { lectureNumber, dateRecorded, titleSuffix, notes } = req.body;

    // Build title: Series Title - الدرس X (or with suffix)
    let titleArabic = `${series.titleArabic} - الدرس ${lectureNumber}`;
    if (titleSuffix && titleSuffix.trim()) {
      titleArabic += ` - ${titleSuffix.trim()}`;
    }

    // Generate slug and ensure uniqueness
    let baseSlug = generateSlug(titleArabic);
    let slug = baseSlug;
    let suffix = 1;

    // Check for existing slug and append suffix if needed
    while (await Lecture.exists({ slug })) {
      suffix++;
      slug = `${baseSlug}-${suffix}`;
    }

    // Generate suggested audio filename (series-slug-lesson-N.m4a)
    const seriesSlug = generateSlug(series.titleArabic);
    const suggestedFilename = `${seriesSlug}-${lectureNumber}.m4a`;

    // Create the lecture with auto Hijri conversion
    const recordedDate = dateRecorded ? new Date(dateRecorded) : new Date();
    const hijriDate = convertToHijri(recordedDate);

    const lecture = new Lecture({
      titleArabic,
      titleEnglish: series.titleEnglish ? `${series.titleEnglish} - Lesson ${lectureNumber}` : '',
      seriesId: series._id,
      sheikhId: series.sheikhId._id,
      category: series.category || 'Other',
      lectureNumber: parseInt(lectureNumber),
      sortOrder: parseInt(req.body.sortOrder) || 0,
      dateRecorded: recordedDate,
      dateRecordedHijri: hijriDate,
      notes: notes || '',
      slug,
      // Store suggested filename in metadata for later audio upload
      metadata: { suggestedFilename },
      published: false // Default to unpublished until audio is added
    });

    await lecture.save();

    // Update series lecture count
    await Series.findByIdAndUpdate(series._id, { $inc: { lectureCount: 1 } });

    // Invalidate homepage cache
    invalidateHomepageCache();

    // Redirect back to series edit page with success message
    res.redirect(`/admin/series/${series._id}/edit?success=lecture_added&lectureId=${lecture._id}`);
  } catch (error) {
    console.error('Quick add lecture error:', error);
    res.redirect(`/admin/series/${req.params.id}/edit?error=add_failed`);
  }
});

// @route   GET /admin/lectures/:id/edit
// @desc    Edit lecture page
// @access  Private (Admin only)
router.get('/lectures/:id/edit', isAdmin, async (req, res) => {
  try {
    const { Lecture, Sheikh, Series } = require('../../models');

    const lecture = await Lecture.findById(req.params.id)
      .populate('sheikhId', 'nameArabic nameEnglish')
      .populate('seriesId', 'titleArabic titleEnglish')
      .lean();

    if (!lecture) {
      return res.status(404).send('Lecture not found');
    }

    const sheikhs = await Sheikh.find().sort({ nameArabic: 1 }).lean();
    const series = await Series.find().sort({ titleArabic: 1 }).lean();

    res.render('admin/edit-lecture', {
      title: 'Edit Lecture',
      user: req.user,
      lecture,
      sheikhs,
      series,
      success: req.query.success
    });
  } catch (error) {
    console.error('Edit lecture error:', error);
    res.status(500).send('Error loading edit lecture page');
  }
});

// @route   POST /admin/lectures/:id/edit
// @desc    Update lecture
// @access  Private (Admin only)
router.post('/lectures/:id/edit', isAdmin, async (req, res) => {
  try {
    const { Lecture } = require('../../models');
    const {
      titleArabic,
      titleEnglish,
      descriptionArabic,
      descriptionEnglish,
      lectureNumber,
      category,
      seriesId,
      published,
      featured,
      location,
      dateRecorded,
      tags
    } = req.body;

    // Handle tags - can be a string (single tag) or array (multiple tags)
    let tagsArray = [];
    if (tags) {
      tagsArray = Array.isArray(tags) ? tags : [tags];
    }

    // Auto-convert Gregorian to Hijri
    const recordedDate = dateRecorded ? new Date(dateRecorded) : null;
    const hijriDate = recordedDate ? convertToHijri(recordedDate) : null;

    await Lecture.findByIdAndUpdate(req.params.id, {
      titleArabic,
      titleEnglish,
      descriptionArabic,
      descriptionEnglish,
      lectureNumber: lectureNumber ? parseInt(lectureNumber) : null,
      category,
      seriesId: seriesId || null,
      published: published === 'true',
      featured: featured === 'true',
      location: location || 'غير محدد',
      dateRecorded: recordedDate,
      dateRecordedHijri: hijriDate,
      tags: tagsArray
    });

    // Invalidate homepage cache
    invalidateHomepageCache();

    res.redirect('/admin/manage?success=lecture-updated');
  } catch (error) {
    console.error('Update lecture error:', error);
    res.status(500).send('Error updating lecture');
  }
});

// @route   POST /admin/lectures/:id/upload-audio
// @desc    Upload audio file to OCI and link to lecture
// @access  Private (Admin only)
router.post('/lectures/:id/upload-audio', isAdmin, async (req, res) => {
  const { upload } = require('../../config/storage');
  const { uploadToOCI } = require('../../utils/ociStorage');
  const { Lecture } = require('../../models');
  const fs = require('fs');
  const path = require('path');

  // Use multer middleware
  upload.single('audioFile')(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).send(`خطأ في الرفع: ${err.message}`);
    }

    if (!req.file) {
      return res.status(400).send('لم يتم اختيار ملف');
    }

    try {
      const lecture = await Lecture.findById(req.params.id);
      if (!lecture) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(404).send('المحاضرة غير موجودة');
      }

      // Generate OCI object name from lecture slug or title
      const ext = path.extname(req.file.originalname).toLowerCase();
      const objectName = lecture.slug
        ? `${lecture.slug}${ext}`
        : `lecture-${lecture._id}${ext}`;

      console.log(`[Audio Upload] Uploading ${req.file.originalname} as ${objectName}`);

      // Upload to OCI
      const result = await uploadToOCI(req.file.path, objectName);

      // Update lecture with audio URL (use findByIdAndUpdate to avoid lean plugin issue)
      await Lecture.findByIdAndUpdate(req.params.id, {
        audioUrl: result.url,
        audioFileName: objectName,
        fileSize: result.size
      });

      console.log(`[Audio Upload] Success: ${objectName} -> ${result.url}`);

      // Clean up local temp file
      fs.unlinkSync(req.file.path);

      // Redirect back to edit page with success
      res.redirect(`/admin/lectures/${req.params.id}/edit?success=audio-uploaded`);
    } catch (error) {
      console.error('OCI upload error:', error);

      // Clean up local temp file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).send(`خطأ في الرفع إلى السحابة: ${error.message}`);
    }
  });
});

// @route   POST /admin/api/lectures/:id/upload-audio
// @desc    AJAX upload audio file to OCI with JSON response
// @access  Private (Admin only)
router.post('/api/lectures/:id/upload-audio', isAdmin, async (req, res) => {
  const { upload } = require('../../config/storage');
  const { uploadToOCI, objectExists } = require('../../utils/ociStorage');
  const { Lecture } = require('../../models');
  const fs = require('fs');
  const path = require('path');

  // Use multer middleware
  upload.single('audioFile')(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({
        success: false,
        error: `خطأ في الرفع: ${err.message}`
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'لم يتم اختيار ملف'
      });
    }

    try {
      const lecture = await Lecture.findById(req.params.id);
      if (!lecture) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({
          success: false,
          error: 'المحاضرة غير موجودة'
        });
      }

      // Generate OCI object name from lecture slug or title
      const ext = path.extname(req.file.originalname).toLowerCase();
      const objectName = lecture.slug
        ? `${lecture.slug}${ext}`
        : `lecture-${lecture._id}${ext}`;

      console.log(`[Audio Upload API] Uploading ${req.file.originalname} as ${objectName}`);

      // Upload to OCI
      const result = await uploadToOCI(req.file.path, objectName);

      // Verify upload succeeded by checking object exists
      const verified = await objectExists(objectName);
      if (!verified) {
        throw new Error('فشل التحقق من الملف في السحابة');
      }

      // Update lecture with audio URL (use findByIdAndUpdate to avoid lean plugin issue)
      await Lecture.findByIdAndUpdate(req.params.id, {
        audioUrl: result.url,
        audioFileName: objectName,
        fileSize: result.size,
        durationVerified: false
      });

      console.log(`[Audio Upload API] Success: ${objectName} -> ${result.url}`);

      // Clean up local temp file
      fs.unlinkSync(req.file.path);

      res.json({
        success: true,
        audioUrl: result.url,
        audioFileName: objectName,
        fileSize: result.size,
        verified: true,
        message: 'تم رفع الملف بنجاح'
      });
    } catch (error) {
      console.error('OCI upload error:', error);

      // Clean up local temp file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(500).json({
        success: false,
        error: `خطأ في الرفع إلى السحابة: ${error.message}`
      });
    }
  });
});

// @route   POST /admin/lectures/:id/toggle-published
// @desc    Toggle lecture published status
// @access  Private (Admin only)
router.post('/lectures/:id/toggle-published', isAdmin, async (req, res) => {
  try {
    const { Lecture } = require('../../models');

    const lecture = await Lecture.findById(req.params.id);
    if (!lecture) {
      return res.status(404).json({ success: false, message: 'Lecture not found' });
    }

    const newPublished = !lecture.published;
    await Lecture.findByIdAndUpdate(req.params.id, { published: newPublished });

    // Invalidate homepage cache
    invalidateHomepageCache();

    res.json({
      success: true,
      published: newPublished
    });
  } catch (error) {
    console.error('Toggle published error:', error);
    res.status(500).json({ success: false, message: 'Error toggling published status' });
  }
});

// @route   POST /admin/lectures/:id/remove-from-series
// @desc    Remove lecture from series (doesn't delete the lecture)
// @access  Private (Admin only)
router.post('/lectures/:id/remove-from-series', isAdmin, async (req, res) => {
  try {
    const { Lecture, Series } = require('../../models');

    const lecture = await Lecture.findById(req.params.id);
    if (!lecture) {
      return res.status(404).json({ success: false, error: 'Lecture not found' });
    }

    const previousSeriesId = lecture.seriesId;

    // Remove from series (use findByIdAndUpdate to avoid lean plugin issue)
    await Lecture.findByIdAndUpdate(req.params.id, { seriesId: null });

    // Decrement lecture count on the previous series
    if (previousSeriesId) {
      await Series.findByIdAndUpdate(previousSeriesId, {
        $inc: { lectureCount: -1 }
      });
    }

    console.log(`[Remove from Series] Lecture ${lecture._id} removed from series ${previousSeriesId}`);

    res.json({ success: true });
  } catch (error) {
    console.error('Remove from series error:', error);
    res.status(500).json({ success: false, error: 'Error removing lecture from series' });
  }
});

// @route   GET /admin/api/unassociated-lectures
// @desc    Get lectures not associated with any series
// @access  Private (Admin only)
router.get('/api/unassociated-lectures', isAdmin, async (req, res) => {
  try {
    const { Lecture } = require('../../models');

    const lectures = await Lecture.find({ seriesId: null })
      .select('_id titleArabic titleEnglish slug audioFileName duration lectureNumber createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      count: lectures.length,
      lectures
    });
  } catch (error) {
    console.error('Get unassociated lectures error:', error);
    res.status(500).json({ success: false, error: 'Error fetching unassociated lectures' });
  }
});

// @route   POST /admin/api/series/create
// @desc    Create a new series (quick create from unassociated lectures)
// @access  Private (Admin only)
router.post('/api/series/create', isAdmin, async (req, res) => {
  try {
    const { Series, Sheikh } = require('../../models');
    const { generateSlug } = require('../../utils/slugify');

    const { titleArabic, titleEnglish, sheikhId, category, tags } = req.body;

    if (!titleArabic || !sheikhId) {
      return res.status(400).json({
        success: false,
        error: 'Title (Arabic) and Sheikh are required'
      });
    }

    // Verify sheikh exists
    const sheikh = await Sheikh.findById(sheikhId);
    if (!sheikh) {
      return res.status(404).json({ success: false, error: 'Sheikh not found' });
    }

    // Generate slug
    let baseSlug = generateSlug(titleArabic);
    let slug = baseSlug;
    let suffix = 1;
    while (await Series.exists({ slug })) {
      suffix++;
      slug = `${baseSlug}-${suffix}`;
    }

    // Create series
    const series = new Series({
      titleArabic,
      titleEnglish: titleEnglish || '',
      sheikhId: sheikh._id,
      category: category || 'Other',
      tags: tags || [],
      slug,
      lectureCount: 0
    });

    await series.save();

    console.log(`[Create Series] New series created: ${series._id} - ${titleArabic}`);

    res.json({
      success: true,
      series: {
        _id: series._id,
        titleArabic: series.titleArabic,
        titleEnglish: series.titleEnglish,
        slug: series.slug,
        category: series.category
      }
    });
  } catch (error) {
    console.error('Create series error:', error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'A series with this title already exists for this sheikh'
      });
    }

    res.status(500).json({ success: false, error: 'Error creating series' });
  }
});

// @route   GET /admin/api/sheikhs
// @desc    Get all sheikhs for dropdown
// @access  Private (Admin only)
router.get('/api/sheikhs', isAdmin, async (req, res) => {
  try {
    const { Sheikh } = require('../../models');

    const sheikhs = await Sheikh.find()
      .select('_id nameArabic nameEnglish')
      .sort({ nameArabic: 1 })
      .lean();

    res.json({ success: true, sheikhs });
  } catch (error) {
    console.error('Get sheikhs error:', error);
    res.status(500).json({ success: false, error: 'Error fetching sheikhs' });
  }
});

// =============================================================================
// TRANSCRIPT EDITING API ROUTES
// =============================================================================

// @route   GET /admin/api/lectures/:id/transcript
// @desc    Get transcript segments for editing
// @access  Private (Admin only)
router.get('/api/lectures/:id/transcript', isAdmin, async (req, res) => {
  try {
    const { Lecture, Transcript } = require('../../models');

    const lecture = await Lecture.findById(req.params.id).select('shortId titleArabic').lean();
    if (!lecture) {
      return res.status(404).json({ success: false, error: 'Lecture not found' });
    }

    if (!Transcript) {
      return res.status(503).json({ success: false, error: 'Transcript service not available' });
    }

    // Fetch transcript by shortId from searchdb
    const segments = await Transcript.find({ shortId: lecture.shortId })
      .sort({ startTimeSec: 1 })
      .lean();

    res.json({
      success: true,
      lectureId: lecture._id,
      shortId: lecture.shortId,
      title: lecture.titleArabic,
      segments: segments.map(seg => ({
        _id: seg._id,
        text: seg.text,
        speaker: seg.speaker || '',
        startTimeSec: seg.startTimeSec,
        startTimeMs: seg.startTimeMs,
        endTimeMs: seg.endTimeMs
      })),
      count: segments.length
    });
  } catch (error) {
    console.error('Get transcript error:', error);
    res.status(500).json({ success: false, error: 'Error fetching transcript' });
  }
});

// @route   PUT /admin/api/lectures/:id/transcript/:segmentId
// @desc    Update a single transcript segment
// @access  Private (Admin only)
router.put('/api/lectures/:id/transcript/:segmentId', isAdmin, async (req, res) => {
  try {
    const { Transcript } = require('../../models');

    if (!Transcript) {
      return res.status(503).json({ success: false, error: 'Transcript service not available' });
    }

    const { text, speaker } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'Text is required' });
    }

    const segment = await Transcript.findByIdAndUpdate(
      req.params.segmentId,
      {
        text: text.trim(),
        speaker: speaker ? speaker.trim() : undefined
      },
      { new: true }
    );

    if (!segment) {
      return res.status(404).json({ success: false, error: 'Segment not found' });
    }

    res.json({
      success: true,
      message: 'Segment updated',
      segment: {
        _id: segment._id,
        text: segment.text,
        speaker: segment.speaker,
        startTimeSec: segment.startTimeSec
      }
    });
  } catch (error) {
    console.error('Update transcript segment error:', error);
    res.status(500).json({ success: false, error: 'Error updating segment' });
  }
});

// @route   PUT /admin/api/lectures/:id/transcript
// @desc    Bulk update transcript segments
// @access  Private (Admin only)
// Optimized: Uses bulkWrite with chunking instead of N individual updates
router.put('/api/lectures/:id/transcript', isAdmin, async (req, res) => {
  try {
    const { Lecture, Transcript } = require('../../models');

    const lecture = await Lecture.findById(req.params.id).select('shortId').lean();
    if (!lecture) {
      return res.status(404).json({ success: false, error: 'Lecture not found' });
    }

    if (!Transcript) {
      return res.status(503).json({ success: false, error: 'Transcript service not available' });
    }

    const { segments } = req.body;

    if (!Array.isArray(segments)) {
      return res.status(400).json({ success: false, error: 'Segments array is required' });
    }

    // Build bulk operations
    const bulkOps = segments
      .filter(seg => seg._id && seg.text)
      .map(seg => ({
        updateOne: {
          filter: { _id: seg._id },
          update: {
            $set: {
              text: seg.text.trim(),
              ...(seg.speaker ? { speaker: seg.speaker.trim() } : {})
            }
          }
        }
      }));

    if (bulkOps.length === 0) {
      return res.json({
        success: true,
        message: 'No valid segments to update',
        results: []
      });
    }

    // Chunked bulkWrite to prevent memory spikes on large updates
    const CHUNK_SIZE = 100;
    let modifiedCount = 0;

    for (let i = 0; i < bulkOps.length; i += CHUNK_SIZE) {
      const chunk = bulkOps.slice(i, i + CHUNK_SIZE);
      const result = await Transcript.bulkWrite(chunk);
      modifiedCount += result.modifiedCount || 0;
    }

    res.json({
      success: true,
      message: `Updated ${modifiedCount} of ${segments.length} segments`
    });
  } catch (error) {
    console.error('Bulk update transcript error:', error);
    res.status(500).json({ success: false, error: 'Error updating transcript' });
  }
});

// @route   DELETE /admin/api/lectures/:id/transcript/:segmentId
// @desc    Delete a transcript segment
// @access  Private (Admin only)
router.delete('/api/lectures/:id/transcript/:segmentId', isAdmin, async (req, res) => {
  try {
    const { Transcript } = require('../../models');

    if (!Transcript) {
      return res.status(503).json({ success: false, error: 'Transcript service not available' });
    }

    const segment = await Transcript.findByIdAndDelete(req.params.segmentId);

    if (!segment) {
      return res.status(404).json({ success: false, error: 'Segment not found' });
    }

    res.json({
      success: true,
      message: 'Segment deleted'
    });
  } catch (error) {
    console.error('Delete transcript segment error:', error);
    res.status(500).json({ success: false, error: 'Error deleting segment' });
  }
});

// @route   GET /admin/api/lectures/:id/transcript/export-csv
// @desc    Download transcript as CSV file
// @access  Private (Admin only)
router.get('/api/lectures/:id/transcript/export-csv', isAdmin, async (req, res) => {
  try {
    const { Lecture, Transcript } = require('../../models');

    const lecture = await Lecture.findById(req.params.id).select('shortId titleArabic').lean();
    if (!lecture) {
      return res.status(404).send('Lecture not found');
    }

    if (!Transcript) {
      return res.status(503).send('Transcript service not available');
    }

    // Fetch transcript segments
    const segments = await Transcript.find({ shortId: lecture.shortId })
      .sort({ startTimeSec: 1 })
      .lean();

    if (segments.length === 0) {
      return res.status(404).send('No transcript found');
    }

    // Format time helper
    const formatTime = (seconds) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.round((seconds % 1) * 1000);
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    };

    // Build CSV content
    const csvRows = ['Start,End,Text,Speaker'];
    segments.forEach((seg, index) => {
      const startTime = formatTime(seg.startTimeSec + (seg.startTimeMs ? seg.startTimeMs / 1000 : 0));
      const nextSeg = segments[index + 1];
      const endTime = nextSeg
        ? formatTime(nextSeg.startTimeSec + (nextSeg.startTimeMs ? nextSeg.startTimeMs / 1000 : 0))
        : formatTime(seg.startTimeSec + 5);

      const text = seg.text.replace(/"/g, '""');
      const speaker = (seg.speaker || '').replace(/"/g, '""');

      csvRows.push(`${startTime},${endTime},"${text}","${speaker}"`);
    });

    const csvContent = '\ufeff' + csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=transcript-${lecture.shortId}.csv`);
    res.send(csvContent);
  } catch (error) {
    console.error('Export transcript CSV error:', error);
    res.status(500).send('Error exporting transcript');
  }
});

// @route   POST /admin/api/lectures/:id/transcript/export-csv
// @desc    Export transcript to CSV file (save to server)
// @access  Private (Admin only)
router.post('/api/lectures/:id/transcript/export-csv', isAdmin, async (req, res) => {
  try {
    const { Lecture, Transcript } = require('../../models');
    const fs = require('fs');
    const path = require('path');

    const lecture = await Lecture.findById(req.params.id).select('shortId titleArabic').lean();
    if (!lecture) {
      return res.status(404).json({ success: false, error: 'Lecture not found' });
    }

    if (!Transcript) {
      return res.status(503).json({ success: false, error: 'Transcript service not available' });
    }

    // Fetch transcript segments
    const segments = await Transcript.find({ shortId: lecture.shortId })
      .sort({ startTimeSec: 1 })
      .lean();

    if (segments.length === 0) {
      return res.status(404).json({ success: false, error: 'No transcript found' });
    }

    // Format time helper
    const formatTime = (seconds) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.round((seconds % 1) * 1000);
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    };

    // Build CSV content
    const csvRows = ['Start,End,Text,Speaker'];
    segments.forEach((seg, index) => {
      const startTime = formatTime(seg.startTimeSec + (seg.startTimeMs ? seg.startTimeMs / 1000 : 0));
      // Use next segment's start as end, or add 5 seconds
      const nextSeg = segments[index + 1];
      const endTime = nextSeg
        ? formatTime(nextSeg.startTimeSec + (nextSeg.startTimeMs ? nextSeg.startTimeMs / 1000 : 0))
        : formatTime(seg.startTimeSec + 5);

      // Escape CSV fields
      const text = seg.text.replace(/"/g, '""');
      const speaker = (seg.speaker || '').replace(/"/g, '""');

      csvRows.push(`${startTime},${endTime},"${text}","${speaker}"`);
    });

    const csvContent = '\ufeff' + csvRows.join('\n'); // BOM for UTF-8

    // Option to save to file or return as download
    if (req.body.saveToFile) {
      const transcriptsDir = path.join(__dirname, '../../data/transcripts');
      if (!fs.existsSync(transcriptsDir)) {
        fs.mkdirSync(transcriptsDir, { recursive: true });
      }

      const filename = `transcript-${lecture.shortId}.csv`;
      const filepath = path.join(transcriptsDir, filename);
      fs.writeFileSync(filepath, csvContent, 'utf8');

      // Update sourceCsv field for all segments
      await Transcript.updateMany(
        { shortId: lecture.shortId },
        { sourceCsv: filename }
      );

      res.json({
        success: true,
        message: 'CSV exported',
        filename,
        path: filepath,
        segmentCount: segments.length
      });
    } else {
      // Return as downloadable file
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=transcript-${lecture.shortId}.csv`);
      res.send(csvContent);
    }
  } catch (error) {
    console.error('Export transcript CSV error:', error);
    res.status(500).json({ success: false, error: 'Error exporting transcript' });
  }
});

// @route   POST /admin/api/lectures/:id/transcript/add-segment
// @desc    Add a new transcript segment
// @access  Private (Admin only)
router.post('/api/lectures/:id/transcript/add-segment', isAdmin, async (req, res) => {
  try {
    const { Lecture, Transcript } = require('../../models');

    const lecture = await Lecture.findById(req.params.id).select('shortId').lean();
    if (!lecture) {
      return res.status(404).json({ success: false, error: 'Lecture not found' });
    }

    if (!Transcript) {
      return res.status(503).json({ success: false, error: 'Transcript service not available' });
    }

    const { text, speaker, startTimeSec, startTimeMs, endTimeMs } = req.body;

    if (!text || startTimeSec === undefined) {
      return res.status(400).json({ success: false, error: 'Text and startTimeSec are required' });
    }

    const segment = new Transcript({
      lectureId: req.params.id,
      shortId: lecture.shortId,
      text: text.trim(),
      speaker: speaker ? speaker.trim() : undefined,
      startTimeSec: parseFloat(startTimeSec),
      startTimeMs: startTimeMs ? parseInt(startTimeMs) : undefined,
      endTimeMs: endTimeMs ? parseInt(endTimeMs) : undefined
    });

    await segment.save();

    res.json({
      success: true,
      message: 'Segment added',
      segment: {
        _id: segment._id,
        text: segment.text,
        speaker: segment.speaker,
        startTimeSec: segment.startTimeSec
      }
    });
  } catch (error) {
    console.error('Add transcript segment error:', error);
    res.status(500).json({ success: false, error: 'Error adding segment' });
  }
});

// =============================================================================

// @route   POST /admin/lectures/:id/assign-to-series
// @desc    Assign a lecture to a series
// @access  Private (Admin only)
router.post('/lectures/:id/assign-to-series', isAdmin, async (req, res) => {
  try {
    const { Lecture, Series } = require('../../models');
    const { generateSlug } = require('../../utils/slugify');

    const { seriesId, lectureNumber } = req.body;

    if (!seriesId) {
      return res.status(400).json({ success: false, error: 'Series ID is required' });
    }

    const lecture = await Lecture.findById(req.params.id);
    if (!lecture) {
      return res.status(404).json({ success: false, error: 'Lecture not found' });
    }

    const series = await Series.findById(seriesId);
    if (!series) {
      return res.status(404).json({ success: false, error: 'Series not found' });
    }

    // Store previous series ID if any
    const previousSeriesId = lecture.seriesId;

    // Prepare update data
    const updateData = {
      seriesId: series._id,
      sheikhId: series.sheikhId,
      category: series.category
    };

    if (lectureNumber) {
      updateData.lectureNumber = parseInt(lectureNumber);
    }

    // Regenerate slug to include series name
    const lectureNum = lectureNumber ? parseInt(lectureNumber) : lecture.lectureNumber || 'x';
    const baseSlug = generateSlug(`${series.titleArabic}-الدرس-${lectureNum}`);
    let slug = baseSlug;
    let suffix = 1;
    while (await Lecture.exists({ slug, _id: { $ne: lecture._id } })) {
      suffix++;
      slug = `${baseSlug}-${suffix}`;
    }
    updateData.slug = slug;

    // Update lecture (use findByIdAndUpdate to avoid lean plugin issue)
    await Lecture.findByIdAndUpdate(req.params.id, updateData);

    // Update lecture counts
    if (previousSeriesId) {
      await Series.findByIdAndUpdate(previousSeriesId, { $inc: { lectureCount: -1 } });
    }
    await Series.findByIdAndUpdate(series._id, { $inc: { lectureCount: 1 } });

    console.log(`[Assign to Series] Lecture ${lecture._id} assigned to series ${series._id}`);

    res.json({
      success: true,
      lecture: {
        _id: lecture._id,
        titleArabic: lecture.titleArabic,
        slug: lecture.slug,
        seriesId: lecture.seriesId
      }
    });
  } catch (error) {
    console.error('Assign to series error:', error);
    res.status(500).json({ success: false, error: 'Error assigning lecture to series' });
  }
});

// @route   GET /admin/sheikhs
// @desc    Manage sheikhs page
// @access  Private (Admin only)
// Optimized: Bulk count lectures per sheikh in ONE aggregation (N -> 2 queries)
router.get('/sheikhs', isAdmin, async (req, res) => {
  try {
    const { Sheikh, Lecture } = require('../../models');

    const sheikhs = await Sheikh.find()
      .sort({ nameArabic: 1 })
      .lean();

    // Bulk count lectures per sheikh in ONE query
    const sheikhIds = sheikhs.map(s => s._id);
    const lectureCounts = await Lecture.aggregate([
      { $match: { sheikhId: { $in: sheikhIds }, published: true } },
      { $group: { _id: '$sheikhId', count: { $sum: 1 } } }
    ]);

    const countMap = new Map(lectureCounts.map(c => [c._id.toString(), c.count]));
    sheikhs.forEach(sheikh => {
      sheikh.actualLectureCount = countMap.get(sheikh._id.toString()) || 0;
    });

    res.render('admin/sheikhs', {
      title: 'Manage Sheikhs',
      user: req.user,
      sheikhs
    });
  } catch (error) {
    console.error('Sheikhs page error:', error);
    res.status(500).send('Error loading sheikhs page');
  }
});

// @route   GET /admin/sheikhs/new
// @desc    Add new sheikh page
// @access  Private (Admin only)
router.get('/sheikhs/new', isAdmin, (req, res) => {
  res.render('admin/sheikh-form', {
    title: 'Add New Sheikh',
    user: req.user,
    sheikh: null,
    isEdit: false
  });
});

// @route   POST /admin/sheikhs
// @desc    Create new sheikh
// @access  Private (Admin only)
router.post('/sheikhs', isAdmin, async (req, res) => {
  try {
    const { Sheikh } = require('../../models');
    const {
      nameArabic,
      nameEnglish,
      honorific,
      bioArabic,
      bioEnglish,
      photoUrl
    } = req.body;

    const sheikh = new Sheikh({
      nameArabic,
      nameEnglish,
      honorific: honorific || 'حفظه الله',
      bioArabic,
      bioEnglish,
      photoUrl
    });

    await sheikh.save();

    res.redirect('/admin/sheikhs?success=sheikh-created');
  } catch (error) {
    console.error('Create sheikh error:', error);
    res.status(500).send('Error creating sheikh');
  }
});

// @route   GET /admin/sheikhs/:id/edit
// @desc    Edit sheikh page
// @access  Private (Admin only)
router.get('/sheikhs/:id/edit', isAdmin, async (req, res) => {
  try {
    const { Sheikh } = require('../../models');

    const sheikh = await Sheikh.findById(req.params.id).lean();

    if (!sheikh) {
      return res.status(404).send('Sheikh not found');
    }

    res.render('admin/sheikh-form', {
      title: 'Edit Sheikh',
      user: req.user,
      sheikh,
      isEdit: true
    });
  } catch (error) {
    console.error('Edit sheikh error:', error);
    res.status(500).send('Error loading edit sheikh page');
  }
});

// @route   POST /admin/sheikhs/:id/edit
// @desc    Update sheikh
// @access  Private (Admin only)
router.post('/sheikhs/:id/edit', isAdmin, async (req, res) => {
  try {
    const { Sheikh } = require('../../models');
    const {
      nameArabic,
      nameEnglish,
      honorific,
      bioArabic,
      bioEnglish,
      photoUrl
    } = req.body;

    await Sheikh.findByIdAndUpdate(req.params.id, {
      nameArabic,
      nameEnglish,
      honorific: honorific || 'حفظه الله',
      bioArabic,
      bioEnglish,
      photoUrl
    });

    res.redirect('/admin/sheikhs?success=sheikh-updated');
  } catch (error) {
    console.error('Update sheikh error:', error);
    res.status(500).send('Error updating sheikh');
  }
});

// @route   POST /admin/sheikhs/:id/delete
// @desc    Delete sheikh
// @access  Private (Admin only)
router.post('/sheikhs/:id/delete', isAdmin, async (req, res) => {
  try {
    const { Sheikh, Lecture, Series } = require('../../models');

    // Check if sheikh has any lectures or series
    const lectureCount = await Lecture.countDocuments({ sheikhId: req.params.id });
    const seriesCount = await Series.countDocuments({ sheikhId: req.params.id });

    if (lectureCount > 0 || seriesCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete sheikh. ${lectureCount} lectures and ${seriesCount} series are associated with this sheikh.`
      });
    }

    await Sheikh.findByIdAndDelete(req.params.id);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete sheikh error:', error);
    res.status(500).json({ success: false, message: 'Error deleting sheikh' });
  }
});

// ========================================
// USER MANAGEMENT ROUTES (Super Admin Only)
// ========================================

// @route   GET /admin/users
// @desc    Manage admins and editors
// @access  Private (Super Admin only)
router.get('/users', isSuperAdmin, async (req, res) => {
  try {
    const { Admin } = require('../../models');

    const users = await Admin.find()
      .sort({ createdAt: -1 })
      .lean();

    res.render('admin/users', {
      title: 'Manage Users',
      user: req.user,
      users
    });
  } catch (error) {
    console.error('Users page error:', error);
    res.status(500).send('Error loading users page');
  }
});

// @route   POST /admin/users/add
// @desc    Add a new editor/admin user
// @access  Private (Super Admin only)
router.post('/users/add', isSuperAdmin, async (req, res) => {
  try {
    const { Admin } = require('../../models');
    const { email, displayName, role } = req.body;

    // Validate input
    if (!email || !displayName) {
      return res.status(400).json({
        success: false,
        message: 'Email and display name are required'
      });
    }

    if (role !== 'admin' && role !== 'editor') {
      return res.status(400).json({
        success: false,
        message: 'Invalid role'
      });
    }

    // Check if user already exists
    const existingUser = await Admin.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists'
      });
    }

    // Create new user
    const newUser = new Admin({
      email,
      displayName,
      username: email.split('@')[0], // Use email prefix as username
      role,
      isActive: true,
      googleId: null, // Will be set when they login with Google OAuth
      profilePhoto: null
    });

    await newUser.save();

    res.json({
      success: true,
      message: 'User added successfully'
    });
  } catch (error) {
    console.error('Add user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding user: ' + error.message
    });
  }
});

// @route   POST /admin/users/:id/role
// @desc    Update user role
// @access  Private (Super Admin only)
router.post('/users/:id/role', isSuperAdmin, async (req, res) => {
  try {
    const { Admin } = require('../../models');
    const { role } = req.body;

    // Prevent changing own role
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change your own role'
      });
    }

    if (role !== 'admin' && role !== 'editor') {
      return res.status(400).json({
        success: false,
        message: 'Invalid role'
      });
    }

    await Admin.findByIdAndUpdate(req.params.id, { role });

    res.json({ success: true });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ success: false, message: 'Error updating role' });
  }
});

// @route   POST /admin/users/:id/toggle-active
// @desc    Toggle user active status
// @access  Private (Super Admin only)
router.post('/users/:id/toggle-active', isSuperAdmin, async (req, res) => {
  try {
    const { Admin } = require('../../models');

    // Prevent deactivating own account
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account'
      });
    }

    const user = await Admin.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const newIsActive = !user.isActive;
    await Admin.findByIdAndUpdate(req.params.id, { isActive: newIsActive });

    res.json({
      success: true,
      isActive: newIsActive
    });
  } catch (error) {
    console.error('Toggle active error:', error);
    res.status(500).json({ success: false, message: 'Error toggling active status' });
  }
});

// @route   POST /admin/users/:id/delete
// @desc    Permanently delete a user
// @access  Private (Super Admin only)
router.post('/users/:id/delete', isSuperAdmin, async (req, res) => {
  try {
    const { Admin } = require('../../models');

    // Prevent deleting own account
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const user = await Admin.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await Admin.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'User permanently deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Error deleting user' });
  }
});

// ==========================================
// Schedule Management Routes
// ==========================================

// @route   GET /admin/schedule
// @desc    List all schedule items
// @access  Private (Admin only)
router.get('/schedule', isAdmin, async (req, res) => {
  try {
    const { Schedule, Series } = require('../../models');

    const scheduleItems = await Schedule.find()
      .populate('seriesId', 'titleArabic titleEnglish')
      .sort({ sortOrder: 1 })
      .lean();

    // Sort by day order
    const dayOrder = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
    scheduleItems.sort((a, b) => dayOrder.indexOf(a.dayOfWeek) - dayOrder.indexOf(b.dayOfWeek));

    res.render('admin/schedule', {
      title: 'Weekly Schedule',
      user: req.user,
      scheduleItems
    });
  } catch (error) {
    console.error('Schedule list error:', error);
    res.status(500).send('Error loading schedule');
  }
});

// @route   GET /admin/schedule/add
// @desc    Add new schedule item form
// @access  Private (Admin only)
router.get('/schedule/add', isAdmin, async (req, res) => {
  try {
    const { Series } = require('../../models');

    const seriesList = await Series.find()
      .sort({ titleArabic: 1 })
      .lean();

    res.render('admin/schedule-edit', {
      title: 'Add Schedule Item',
      user: req.user,
      scheduleItem: null,
      seriesList,
      isEdit: false
    });
  } catch (error) {
    console.error('Schedule add form error:', error);
    res.status(500).send('Error loading form');
  }
});

// @route   POST /admin/schedule/add
// @desc    Create new schedule item
// @access  Private (Admin only)
router.post('/schedule/add', isAdmin, async (req, res) => {
  try {
    const { Schedule } = require('../../models');

    const {
      dayOfWeek,
      dayOfWeekEnglish,
      time,
      timeEnglish,
      seriesId,
      location,
      locationEnglish,
      isActive,
      sortOrder,
      notes
    } = req.body;

    const scheduleItem = new Schedule({
      dayOfWeek,
      dayOfWeekEnglish: dayOfWeekEnglish || undefined,
      time,
      timeEnglish: timeEnglish || undefined,
      seriesId,
      location: location || 'جامع الورود',
      locationEnglish: locationEnglish || 'Masjid Al-Wurud',
      isActive: isActive === 'on' || isActive === true,
      sortOrder: parseInt(sortOrder) || 0,
      notes: notes || undefined
    });

    await scheduleItem.save();

    // Invalidate homepage cache (schedule affects homepage)
    invalidateHomepageCache();

    res.redirect('/admin/schedule?success=created');
  } catch (error) {
    console.error('Schedule create error:', error);
    res.redirect('/admin/schedule?error=create_failed');
  }
});

// @route   GET /admin/schedule/:id/edit
// @desc    Edit schedule item form
// @access  Private (Admin only)
router.get('/schedule/:id/edit', isAdmin, async (req, res) => {
  try {
    const { Schedule, Series } = require('../../models');

    const scheduleItem = await Schedule.findById(req.params.id).lean();
    if (!scheduleItem) {
      return res.redirect('/admin/schedule?error=not_found');
    }

    const seriesList = await Series.find()
      .sort({ titleArabic: 1 })
      .lean();

    res.render('admin/schedule-edit', {
      title: 'Edit Schedule Item',
      user: req.user,
      scheduleItem,
      seriesList,
      isEdit: true
    });
  } catch (error) {
    console.error('Schedule edit form error:', error);
    res.status(500).send('Error loading form');
  }
});

// @route   POST /admin/schedule/:id/edit
// @desc    Update schedule item
// @access  Private (Admin only)
router.post('/schedule/:id/edit', isAdmin, async (req, res) => {
  try {
    const { Schedule } = require('../../models');

    const {
      dayOfWeek,
      dayOfWeekEnglish,
      time,
      timeEnglish,
      seriesId,
      location,
      locationEnglish,
      isActive,
      sortOrder,
      notes
    } = req.body;

    await Schedule.findByIdAndUpdate(req.params.id, {
      dayOfWeek,
      dayOfWeekEnglish: dayOfWeekEnglish || undefined,
      time,
      timeEnglish: timeEnglish || undefined,
      seriesId,
      location: location || 'جامع الورود',
      locationEnglish: locationEnglish || 'Masjid Al-Wurud',
      isActive: isActive === 'on' || isActive === true,
      sortOrder: parseInt(sortOrder) || 0,
      notes: notes || undefined
    });

    // Invalidate homepage cache
    invalidateHomepageCache();

    res.redirect('/admin/schedule?success=updated');
  } catch (error) {
    console.error('Schedule update error:', error);
    res.redirect('/admin/schedule?error=update_failed');
  }
});

// @route   POST /admin/schedule/:id/delete
// @desc    Delete schedule item
// @access  Private (Admin only)
router.post('/schedule/:id/delete', isAdmin, async (req, res) => {
  try {
    const { Schedule } = require('../../models');

    await Schedule.findByIdAndDelete(req.params.id);

    // Invalidate homepage cache
    invalidateHomepageCache();

    res.redirect('/admin/schedule?success=deleted');
  } catch (error) {
    console.error('Schedule delete error:', error);
    res.redirect('/admin/schedule?error=delete_failed');
  }
});

// ============================================
// Analytics Routes
// ============================================

// @route   GET /admin/analytics
// @desc    Analytics dashboard
// @access  Private (Admin only)
router.get('/analytics', isAdmin, async (req, res) => {
  try {
    const { getAnalyticsSummary, getTopLectures, getTopDownloads } = require('../../middleware/analytics');
    const { PageView, SiteSettings } = require('../../models');

    const [summary, topLectures, topDownloads, topPages, settings] = await Promise.all([
      getAnalyticsSummary(),
      getTopLectures(10),
      getTopDownloads(10),
      PageView.getTopPages(10),
      SiteSettings.getSettings()
    ]);

    // Get last 30 days of page views for chart
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dailyViews = await PageView.getViewsInRange(thirtyDaysAgo, new Date());

    res.render('admin/analytics', {
      title: 'Analytics',
      user: req.user,
      summary,
      topLectures,
      topDownloads,
      topPages,
      dailyViews,
      settings: settings.analytics,
      shouldShowPublic: settings.shouldShowPublicStats()
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).send('Error loading analytics');
  }
});

// @route   POST /admin/analytics/settings
// @desc    Update analytics visibility settings
// @access  Private (Admin only)
router.post('/analytics/settings', isAdmin, async (req, res) => {
  try {
    const { SiteSettings } = require('../../models');

    const settings = await SiteSettings.getSettings();

    // Update settings
    settings.analytics.showPublicStats = req.body.showPublicStats === 'on';
    settings.analytics.minPlaysToDisplay = parseInt(req.body.minPlaysToDisplay) || 1000;
    settings.analytics.minDownloadsToDisplay = parseInt(req.body.minDownloadsToDisplay) || 500;
    settings.analytics.minPageViewsToDisplay = parseInt(req.body.minPageViewsToDisplay) || 5000;

    await settings.save();

    // Update cached stats
    await SiteSettings.updateCachedStats();

    res.redirect('/admin/analytics?success=settings_updated');
  } catch (error) {
    console.error('Analytics settings error:', error);
    res.redirect('/admin/analytics?error=settings_failed');
  }
});

// @route   POST /admin/analytics/refresh-stats
// @desc    Manually refresh cached statistics
// @access  Private (Admin only)
router.post('/analytics/refresh-stats', isAdmin, async (req, res) => {
  try {
    const { SiteSettings } = require('../../models');

    await SiteSettings.updateCachedStats();

    res.redirect('/admin/analytics?success=stats_refreshed');
  } catch (error) {
    console.error('Stats refresh error:', error);
    res.redirect('/admin/analytics?error=refresh_failed');
  }
});

// ============================================
// SECTION MANAGEMENT ROUTES (Task 3.16)
// ============================================

// @route   GET /admin/sections
// @desc    List all sections
// @access  Private (Admin only)
// Optimized: Bulk count series per section in ONE aggregation (N -> 2 queries)
router.get('/sections', isAdmin, async (req, res) => {
  try {
    const { Section, Series } = require('../../models');

    // Get all sections
    const sections = await Section.find().sort({ displayOrder: 1 }).lean();
    const sectionIds = sections.map(s => s._id);

    // Bulk count series per section in ONE aggregation
    const seriesCounts = await Series.aggregate([
      { $match: { sectionId: { $in: sectionIds } } },
      { $group: { _id: '$sectionId', count: { $sum: 1 } } }
    ]);

    const countMap = new Map(seriesCounts.map(c => [c._id?.toString(), c.count]));
    const sectionsWithCounts = sections.map(s => ({
      ...s,
      seriesCount: countMap.get(s._id.toString()) || 0
    }));

    // Get count of unassigned series
    const unassignedCount = await Series.countDocuments({ sectionId: null });

    res.render('admin/sections', {
      title: 'Manage Sections',
      user: req.user,
      sections: sectionsWithCounts,
      unassignedCount,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    console.error('Sections list error:', error);
    res.status(500).send('Error loading sections');
  }
});

// @route   GET /admin/sections/new
// @desc    Create section form
// @access  Private (Admin only)
router.get('/sections/new', isAdmin, (req, res) => {
  res.render('admin/section-form', {
    title: 'Create Section',
    user: req.user,
    section: null,
    isEdit: false
  });
});

// @route   POST /admin/sections/new
// @desc    Create a new section
// @access  Private (Admin only)
router.post('/sections/new', isAdmin, async (req, res) => {
  try {
    const { Section } = require('../../models');

    const { titleAr, titleEn, descriptionAr, descriptionEn, icon, maxVisible, collapsedByDefault } = req.body;

    // Get the highest displayOrder
    const lastSection = await Section.findOne().sort({ displayOrder: -1 });
    const displayOrder = lastSection ? lastSection.displayOrder + 1 : 0;

    const section = new Section({
      title: { ar: titleAr, en: titleEn },
      description: { ar: descriptionAr, en: descriptionEn },
      icon: icon || '📚',
      maxVisible: parseInt(maxVisible) || 5,
      collapsedByDefault: collapsedByDefault === 'on',
      displayOrder
    });

    await section.save();
    invalidateHomepageCache();

    res.redirect('/admin/sections?success=section_created');
  } catch (error) {
    console.error('Create section error:', error);
    res.redirect('/admin/sections?error=create_failed');
  }
});

// @route   POST /admin/sections/reorder
// @desc    Reorder sections (AJAX)
// @access  Private (Admin only)
router.post('/sections/reorder', isAdmin, async (req, res) => {
  try {
    const { Section } = require('../../models');

    const { order } = req.body; // Array of { id, order }

    if (!Array.isArray(order)) {
      return res.status(400).json({ success: false, message: 'Invalid order data' });
    }

    await Section.reorder(order);
    invalidateHomepageCache();

    res.json({ success: true });
  } catch (error) {
    console.error('Reorder sections error:', error);
    res.status(500).json({ success: false, message: 'Reorder failed' });
  }
});

// @route   GET /admin/sections/:id/edit
// @desc    Edit section form
// @access  Private (Admin only)
router.get('/sections/:id/edit', isAdmin, async (req, res) => {
  try {
    const { Section } = require('../../models');

    const section = await Section.findById(req.params.id).lean();
    if (!section) {
      return res.redirect('/admin/sections?error=not_found');
    }

    res.render('admin/section-form', {
      title: 'Edit Section',
      user: req.user,
      section,
      isEdit: true
    });
  } catch (error) {
    console.error('Edit section form error:', error);
    res.redirect('/admin/sections?error=load_failed');
  }
});

// @route   POST /admin/sections/:id
// @desc    Update a section
// @access  Private (Admin only)
router.post('/sections/:id', isAdmin, async (req, res) => {
  try {
    const { Section } = require('../../models');

    const { titleAr, titleEn, descriptionAr, descriptionEn, icon, maxVisible, collapsedByDefault, isVisible } = req.body;

    const section = await Section.findById(req.params.id);
    if (!section) {
      return res.redirect('/admin/sections?error=not_found');
    }

    // Update section (use findByIdAndUpdate to avoid lean plugin issue)
    await Section.findByIdAndUpdate(req.params.id, {
      title: { ar: titleAr, en: titleEn },
      description: { ar: descriptionAr, en: descriptionEn },
      icon: icon || '📚',
      maxVisible: parseInt(maxVisible) || 5,
      collapsedByDefault: collapsedByDefault === 'on',
      isVisible: isVisible === 'on'
    });
    invalidateHomepageCache();

    res.redirect('/admin/sections?success=section_updated');
  } catch (error) {
    console.error('Update section error:', error);
    res.redirect('/admin/sections?error=update_failed');
  }
});

// @route   POST /admin/sections/:id/delete
// @desc    Delete a section (reassign series to null)
// @access  Private (Admin only)
router.post('/sections/:id/delete', isAdmin, async (req, res) => {
  try {
    const { Section, Series } = require('../../models');

    const section = await Section.findById(req.params.id);
    if (!section) {
      return res.redirect('/admin/sections?error=not_found');
    }

    // Prevent deleting default sections
    if (section.isDefault) {
      return res.redirect('/admin/sections?error=cannot_delete_default');
    }

    // Unassign all series from this section
    await Series.updateMany({ sectionId: section._id }, { $set: { sectionId: null, sectionOrder: 0 } });

    await Section.findByIdAndDelete(req.params.id);
    invalidateHomepageCache();

    res.redirect('/admin/sections?success=section_deleted');
  } catch (error) {
    console.error('Delete section error:', error);
    res.redirect('/admin/sections?error=delete_failed');
  }
});

// @route   GET /admin/sections/:id/series
// @desc    Manage series in a section
// @access  Private (Admin only)
router.get('/sections/:id/series', isAdmin, async (req, res) => {
  try {
    const { Section, Series } = require('../../models');

    const section = await Section.findById(req.params.id).lean();
    if (!section) {
      return res.redirect('/admin/sections?error=not_found');
    }

    // Get series in this section
    const seriesInSection = await Series.find({ sectionId: section._id })
      .populate('sheikhId', 'nameArabic nameEnglish')
      .sort({ sectionOrder: 1 })
      .lean();

    // Get unassigned series for the "Add" dropdown
    const unassignedSeries = await Series.find({ sectionId: null })
      .populate('sheikhId', 'nameArabic nameEnglish')
      .sort({ titleArabic: 1 })
      .lean();

    res.render('admin/section-series', {
      title: `Manage: ${section.title.en}`,
      user: req.user,
      section,
      seriesInSection,
      unassignedSeries,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    console.error('Section series error:', error);
    res.redirect('/admin/sections?error=load_failed');
  }
});

// @route   POST /admin/sections/:id/series/add
// @desc    Add a series to a section
// @access  Private (Admin only)
router.post('/sections/:id/series/add', isAdmin, async (req, res) => {
  try {
    const { Section, Series } = require('../../models');

    const section = await Section.findById(req.params.id);
    if (!section) {
      return res.redirect('/admin/sections?error=not_found');
    }

    const { seriesId } = req.body;
    const series = await Series.findById(seriesId);
    if (!series) {
      return res.redirect(`/admin/sections/${req.params.id}/series?error=series_not_found`);
    }

    // Get highest sectionOrder in this section
    const lastSeries = await Series.findOne({ sectionId: section._id }).sort({ sectionOrder: -1 });
    const sectionOrder = lastSeries ? lastSeries.sectionOrder + 1 : 0;

    // Update series (use findByIdAndUpdate to avoid lean plugin issue)
    await Series.findByIdAndUpdate(seriesId, {
      sectionId: section._id,
      sectionOrder: sectionOrder
    });
    invalidateHomepageCache();

    res.redirect(`/admin/sections/${req.params.id}/series?success=series_added`);
  } catch (error) {
    console.error('Add series to section error:', error);
    res.redirect(`/admin/sections/${req.params.id}/series?error=add_failed`);
  }
});

// @route   POST /admin/sections/:id/series/:seriesId/remove
// @desc    Remove a series from a section
// @access  Private (Admin only)
router.post('/sections/:id/series/:seriesId/remove', isAdmin, async (req, res) => {
  try {
    const { Series } = require('../../models');

    await Series.findByIdAndUpdate(req.params.seriesId, {
      $set: { sectionId: null, sectionOrder: 0 }
    });
    invalidateHomepageCache();

    res.redirect(`/admin/sections/${req.params.id}/series?success=series_removed`);
  } catch (error) {
    console.error('Remove series from section error:', error);
    res.redirect(`/admin/sections/${req.params.id}/series?error=remove_failed`);
  }
});

// @route   POST /admin/sections/:id/series/reorder
// @desc    Reorder series within a section (AJAX)
// @access  Private (Admin only)
router.post('/sections/:id/series/reorder', isAdmin, async (req, res) => {
  try {
    const { Series } = require('../../models');

    const { order } = req.body; // Array of { id, order }

    if (!Array.isArray(order)) {
      return res.status(400).json({ success: false, message: 'Invalid order data' });
    }

    const bulkOps = order.map(({ id, order: sectionOrder }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { sectionOrder } }
      }
    }));

    await Series.bulkWrite(bulkOps);
    invalidateHomepageCache();

    res.json({ success: true });
  } catch (error) {
    console.error('Reorder series error:', error);
    res.status(500).json({ success: false, message: 'Reorder failed' });
  }
});

// @route   POST /admin/series/:id/assign-section
// @desc    Assign a series to a section (from series edit page)
// @access  Private (Admin only)
router.post('/series/:id/assign-section', isAdmin, async (req, res) => {
  try {
    const { Section, Series } = require('../../models');

    const series = await Series.findById(req.params.id);
    if (!series) {
      return res.redirect('/admin/manage?error=series_not_found');
    }

    const { sectionId } = req.body;

    let updateData;
    if (sectionId && sectionId !== '') {
      // Verify section exists
      const section = await Section.findById(sectionId);
      if (!section) {
        return res.redirect(`/admin/series/${req.params.id}/edit?error=section_not_found`);
      }

      // Get highest sectionOrder in this section
      const lastSeries = await Series.findOne({ sectionId: section._id }).sort({ sectionOrder: -1 });
      const sectionOrder = lastSeries ? lastSeries.sectionOrder + 1 : 0;

      updateData = { sectionId: section._id, sectionOrder: sectionOrder };
    } else {
      updateData = { sectionId: null, sectionOrder: 0 };
    }

    // Update series (use findByIdAndUpdate to avoid lean plugin issue)
    await Series.findByIdAndUpdate(req.params.id, updateData);
    invalidateHomepageCache();

    res.redirect(`/admin/series/${req.params.id}/edit?success=section_assigned`);
  } catch (error) {
    console.error('Assign section error:', error);
    res.redirect(`/admin/series/${req.params.id}/edit?error=assign_failed`);
  }
});

// ============================================
// HOMEPAGE CONFIGURATION ROUTES
// ============================================

// @route   GET /admin/homepage-config
// @desc    Homepage configuration page
// @access  Private (Admin only)
router.get('/homepage-config', isAdmin, async (req, res) => {
  try {
    const { SiteSettings } = require('../../models');

    const settings = await SiteSettings.getSettings();

    res.render('admin/homepage-config', {
      title: 'Homepage Configuration',
      user: req.user,
      settings: settings.homepage || {},
      seriesStatsSettings: settings.seriesStats || { minPlaysToShow: 100, showDuration: false },
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    console.error('Homepage config error:', error);
    res.status(500).send('Error loading homepage configuration');
  }
});

// @route   POST /admin/homepage-config
// @desc    Update homepage configuration
// @access  Private (Admin only)
router.post('/homepage-config', isAdmin, async (req, res) => {
  try {
    const { SiteSettings } = require('../../models');

    const settings = await SiteSettings.getSettings();

    settings.homepage = {
      showSchedule: req.body.showSchedule === 'on',
      scheduleLayout: req.body.scheduleLayout || 'cards',
      showSeriesTab: req.body.showSeriesTab === 'on',
      showStandaloneTab: req.body.showStandaloneTab === 'on',
      showKhutbasTab: req.body.showKhutbasTab === 'on'
    };

    // Series detail page stats settings
    settings.seriesStats = {
      minPlaysToShow: parseInt(req.body.minPlaysToShow, 10) || 100,
      showDuration: req.body.showDuration === 'on'
    };

    await settings.save();
    invalidateHomepageCache();

    res.redirect('/admin/homepage-config?success=settings_updated');
  } catch (error) {
    console.error('Homepage config update error:', error);
    res.redirect('/admin/homepage-config?error=update_failed');
  }
});

// ============================================
// MAINTENANCE MODE CONFIGURATION ROUTES
// ============================================

// @route   GET /admin/maintenance-mode
// @desc    Maintenance mode configuration page
// @access  Private (Admin only)
router.get('/maintenance-mode', isAdmin, async (req, res) => {
  try {
    const { SiteSettings } = require('../../models');

    const siteSettings = await SiteSettings.getSettings();

    res.render('admin/maintenance-mode', {
      title: 'Maintenance Mode',
      user: req.user,
      settings: siteSettings.maintenanceMode || {},
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    console.error('Maintenance mode config error:', error);
    res.status(500).send('Error loading maintenance mode configuration');
  }
});

// @route   POST /admin/maintenance-mode
// @desc    Update maintenance mode configuration
// @access  Private (Admin only)
router.post('/maintenance-mode', isAdmin, async (req, res) => {
  try {
    const { SiteSettings } = require('../../models');
    const { invalidateMaintenanceModeCache } = require('../../utils/i18n');

    const settings = await SiteSettings.getSettings();

    settings.maintenanceMode = {
      enabled: req.body.enabled === 'on',
      titleAr: req.body.titleAr || '',
      titleEn: req.body.titleEn || '',
      messageAr: req.body.messageAr || '',
      messageEn: req.body.messageEn || '',
      telegramUrl: req.body.telegramUrl || '',
      telegramTextAr: req.body.telegramTextAr || '',
      telegramTextEn: req.body.telegramTextEn || ''
    };

    await settings.save();
    invalidateMaintenanceModeCache();

    res.redirect('/admin/maintenance-mode?success=settings_updated');
  } catch (error) {
    console.error('Maintenance mode config update error:', error);
    res.redirect('/admin/maintenance-mode?error=update_failed');
  }
});

// ============================================
// NOTICE BANNER CONFIGURATION ROUTES
// ============================================

// @route   GET /admin/notice-banner
// @desc    Notice banner configuration page
// @access  Private (Admin only)
router.get('/notice-banner', isAdmin, async (req, res) => {
  try {
    const { SiteSettings } = require('../../models');

    const siteSettings = await SiteSettings.getSettings();

    res.render('admin/notice-banner', {
      title: 'Notice Banner',
      user: req.user,
      settings: siteSettings.noticeBanner || {},
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    console.error('Notice banner config error:', error);
    res.status(500).send('Error loading notice banner configuration');
  }
});

// @route   POST /admin/notice-banner
// @desc    Update notice banner configuration
// @access  Private (Admin only)
router.post('/notice-banner', isAdmin, async (req, res) => {
  try {
    const { SiteSettings } = require('../../models');

    const settings = await SiteSettings.getSettings();

    settings.noticeBanner = {
      enabled: req.body.enabled === 'on',
      messageAr: req.body.messageAr || '',
      messageEn: req.body.messageEn || '',
      linkUrl: req.body.linkUrl || '',
      linkTextAr: req.body.linkTextAr || '',
      linkTextEn: req.body.linkTextEn || ''
    };

    await settings.save();
    invalidateNoticeBannerCache();

    res.redirect('/admin/notice-banner?success=settings_updated');
  } catch (error) {
    console.error('Notice banner config update error:', error);
    res.redirect('/admin/notice-banner?error=update_failed');
  }
});

// ============================================
// ARTICLES MANAGEMENT ROUTES
// ============================================

// @route   GET /admin/articles
// @desc    List all articles with pagination, search, filters
// @access  Private (Admin only)
router.get('/articles', isAdmin, async (req, res) => {
  try {
    const { Article } = require('../../models');
    const { search, type, status, sort, page = 1 } = req.query;
    const limit = 20;
    const skip = (parseInt(page) - 1) * limit;

    // Build query
    const query = {};

    if (search) {
      const safe = escapeRegex(String(search));
      query.$or = [
        { title: { $regex: safe, $options: 'i' } },
        { summary: { $regex: safe, $options: 'i' } }
      ];
    }

    if (type && type !== 'all') {
      query.type = type;
    }

    if (status === 'published') {
      query.isPublished = true;
    } else if (status === 'draft') {
      query.isPublished = false;
    }

    // Sort options
    let sortOption = { publishedAt: -1 }; // default: newest first
    if (sort === 'oldest') {
      sortOption = { publishedAt: 1 };
    } else if (sort === 'title') {
      sortOption = { title: 1 };
    } else if (sort === 'updated') {
      sortOption = { updatedAt: -1 };
    }

    // Get articles with pagination
    const [articles, totalCount] = await Promise.all([
      Article.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
      Article.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    // Get stats
    const stats = {
      total: await Article.countDocuments(),
      published: await Article.countDocuments({ isPublished: true }),
      draft: await Article.countDocuments({ isPublished: false }),
      asdaa: await Article.countDocuments({ type: 'Asdaa' }),
      telegram: await Article.countDocuments({ type: 'TelegramArticle' })
    };

    res.render('admin/articles-list', {
      title: 'Article Management',
      user: req.user,
      articles,
      stats,
      filters: { search, type, status, sort },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCount,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      },
      activePage: 'articles',
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    console.error('Articles list error:', error);
    res.status(500).send('Error loading articles');
  }
});

// @route   POST /admin/articles/import-from-url
// @desc    Fetch and extract article from Asdaa URL (AJAX)
// @access  Private (Admin only)
router.post('/articles/import-from-url', isAdmin, async (req, res) => {
  try {
    const { Article } = require('../../models');
    const { extractFromUrl } = require('../../utils/asdaaExtractor');
    const { url } = req.body;

    if (!url || !url.trim()) {
      return res.status(400).json({ success: false, message: 'الرابط مطلوب' });
    }

    const trimmedUrl = url.trim();

    if (!trimmedUrl.includes('asdaa-alsaa.com')) {
      return res.status(400).json({ success: false, message: 'يجب أن يكون الرابط من موقع أصداء (asdaa-alsaa.com)' });
    }

    const existing = await Article.findOne({
      sourceUrl: { $regex: new RegExp(trimmedUrl.replace(/\/$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
    }).select('shortId title isPublished').lean();

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `هذا المقال تم استيراده مسبقاً (#${existing.shortId}: ${existing.title})`,
        existing: { shortId: existing.shortId, title: existing.title, isPublished: existing.isPublished }
      });
    }

    const result = await extractFromUrl(trimmedUrl);

    res.json({
      success: true,
      data: {
        title: result.title,
        content: result.content,
        publishedAt: result.publishedAt ? result.publishedAt.toISOString().split('T')[0] : null,
        stats: result.stats
      }
    });
  } catch (error) {
    console.error('Import from URL error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'فشل في استيراد المقال من الرابط'
    });
  }
});

// @route   GET /admin/articles/new
// @desc    Create article form
// @access  Private (Admin only)
router.get('/articles/new', isAdmin, (req, res) => {
  res.render('admin/article-form', {
    title: 'Add Article',
    user: req.user,
    article: null,
    isEdit: false,
    activePage: 'articles'
  });
});

// @route   POST /admin/articles/new
// @desc    Create a new article
// @access  Private (Admin only)
router.post('/articles/new', isAdmin, async (req, res) => {
  try {
    const { Article } = require('../../models');

    const { title, summary, content, type, publishedAt, sourceUrl, isPublished } = req.body;

    const article = new Article({
      title,
      summary: summary || '',
      content: sanitizeArticleHtml(content || ''),
      type: type || 'Asdaa',
      publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
      sourceUrl: sourceUrl || '',
      isPublished: isPublished === 'on'
    });

    await article.save();

    // Invalidate articles cache
    cache.invalidatePattern('articles:*');
    cache.invalidatePattern('homepage:*');

    res.redirect('/admin/articles?success=article_created');
  } catch (error) {
    console.error('Create article error:', error);
    res.redirect('/admin/articles/new?error=create_failed');
  }
});

// @route   GET /admin/articles/:id/edit
// @desc    Edit article form
// @access  Private (Admin only)
router.get('/articles/:id/edit', isAdmin, async (req, res) => {
  try {
    const { Article } = require('../../models');

    const article = await Article.findById(req.params.id).lean();
    if (!article) {
      return res.redirect('/admin/articles?error=not_found');
    }

    res.render('admin/article-form', {
      title: 'Edit Article',
      user: req.user,
      article,
      isEdit: true,
      activePage: 'articles'
    });
  } catch (error) {
    console.error('Edit article form error:', error);
    res.redirect('/admin/articles?error=load_failed');
  }
});

// @route   POST /admin/articles/:id/edit
// @desc    Update an article
// @access  Private (Admin only)
router.post('/articles/:id/edit', isAdmin, async (req, res) => {
  try {
    const { Article } = require('../../models');

    const article = await Article.findById(req.params.id);
    if (!article) {
      return res.redirect('/admin/articles?error=not_found');
    }

    const { title, summary, content, type, publishedAt, sourceUrl, isPublished, slug } = req.body;

    await Article.findByIdAndUpdate(req.params.id, {
      title,
      summary: summary || '',
      content: sanitizeArticleHtml(content || ''),
      type: type || 'Asdaa',
      publishedAt: publishedAt ? new Date(publishedAt) : article.publishedAt,
      sourceUrl: sourceUrl || '',
      isPublished: isPublished === 'on',
      slug: slug || article.slug
    });

    // Invalidate articles cache
    cache.invalidatePattern('articles:*');
    cache.invalidatePattern('homepage:*');

    res.redirect('/admin/articles?success=article_updated');
  } catch (error) {
    console.error('Update article error:', error);
    res.redirect(`/admin/articles/${req.params.id}/edit?error=update_failed`);
  }
});

// @route   POST /admin/articles/:id/delete
// @desc    Delete an article
// @access  Private (Admin only)
router.post('/articles/:id/delete', isAdmin, async (req, res) => {
  try {
    const { Article } = require('../../models');

    const article = await Article.findById(req.params.id);
    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    await Article.findByIdAndDelete(req.params.id);

    // Invalidate articles cache
    cache.invalidatePattern('articles:*');
    cache.invalidatePattern('homepage:*');

    // Check if request expects JSON (AJAX) or redirect
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'Article deleted' });
    }

    res.redirect('/admin/articles?success=article_deleted');
  } catch (error) {
    console.error('Delete article error:', error);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, message: error.message });
    }
    res.redirect('/admin/articles?error=delete_failed');
  }
});

// @route   POST /admin/articles/:id/toggle-published
// @desc    Toggle article published status
// @access  Private (Admin only)
router.post('/articles/:id/toggle-published', isAdmin, async (req, res) => {
  try {
    const { Article } = require('../../models');

    const article = await Article.findById(req.params.id);
    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    const newPublished = !article.isPublished;
    await Article.findByIdAndUpdate(req.params.id, { isPublished: newPublished });

    // Invalidate articles cache
    cache.invalidatePattern('articles:*');
    cache.invalidatePattern('homepage:*');

    res.json({
      success: true,
      isPublished: newPublished
    });
  } catch (error) {
    console.error('Toggle published error:', error);
    res.status(500).json({ success: false, message: 'Error toggling published status' });
  }
});

// @route   POST /admin/articles/bulk
// @desc    Bulk operations on articles (delete, publish, unpublish)
// @access  Private (Admin only)
router.post('/articles/bulk', isAdmin, async (req, res) => {
  try {
    const { Article } = require('../../models');

    const { action, articleIds } = req.body;

    if (!articleIds || !Array.isArray(articleIds) || articleIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No articles selected' });
    }

    let result;
    switch (action) {
      case 'delete':
        result = await Article.deleteMany({ _id: { $in: articleIds } });
        break;
      case 'publish':
        result = await Article.updateMany(
          { _id: { $in: articleIds } },
          { $set: { isPublished: true } }
        );
        break;
      case 'unpublish':
        result = await Article.updateMany(
          { _id: { $in: articleIds } },
          { $set: { isPublished: false } }
        );
        break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    // Invalidate articles cache
    cache.invalidatePattern('articles:*');
    cache.invalidatePattern('homepage:*');

    res.json({
      success: true,
      message: `${action} completed`,
      affected: result.modifiedCount || result.deletedCount || 0
    });
  } catch (error) {
    console.error('Bulk action error:', error);
    res.status(500).json({ success: false, message: 'Error performing bulk action' });
  }
});

// ========================================
// ARTICLE EDITORS MANAGEMENT ROUTES
// ========================================

// @route   GET /admin/article-editors
// @desc    Manage article editors
// @access  Private (Super Admin only)
router.get('/article-editors', isSuperAdmin, async (req, res) => {
  try {
    const { Admin, SiteSettings } = require('../../models');

    // Get all article editors
    const editors = await Admin.find({ role: 'articleEditor' })
      .sort({ createdAt: -1 })
      .lean();

    // Get site settings for login link toggle
    const settings = await SiteSettings.getSettings();

    res.render('admin/article-editors', {
      title: 'Article Editors',
      editors,
      showLoginLink: settings.articleEditor?.showLoginLink ?? true,
      user: req.user
    });
  } catch (error) {
    console.error('Article editors list error:', error);
    res.status(500).send('Error loading article editors');
  }
});

// @route   POST /admin/article-editors/add
// @desc    Add a new article editor
// @access  Private (Super Admin only)
router.post('/article-editors/add', isSuperAdmin, async (req, res) => {
  try {
    const { Admin } = require('../../models');
    const { email, displayName } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists (read-only first to avoid overwriting admins)
    const existingUser = await Admin.findOne({ email: normalizedEmail }, null, { lean: false });

    if (existingUser) {
      // Don't downgrade admins or editors
      if (existingUser.role === 'admin' || existingUser.role === 'editor') {
        return res.status(400).json({
          success: false,
          message: `This user is already a ${existingUser.role}. Cannot downgrade to article editor.`
        });
      }

      // Already an article editor - just reactivate if needed
      if (existingUser.role === 'articleEditor') {
        if (existingUser.isActive) {
          return res.status(400).json({ success: false, message: 'This user is already an article editor' });
        }
        // Reactivate
        await Admin.findByIdAndUpdate(existingUser._id, { isActive: true });
        return res.json({ success: true, message: 'Article editor reactivated' });
      }
    }

    // Create new article editor
    // Use a unique placeholder for googleId since the index is not sparse
    // This gets replaced with the real Google ID when they first log in
    const { randomUUID } = require('crypto');
    const adminCollection = Admin.collection;
    await adminCollection.insertOne({
      googleId: `pending_${randomUUID()}`,
      email: normalizedEmail,
      displayName: displayName || normalizedEmail.split('@')[0],
      role: 'articleEditor',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    res.json({ success: true, message: 'Article editor added successfully' });
  } catch (error) {
    console.error('Add article editor error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'This email is already registered' });
    }
    res.status(500).json({ success: false, message: 'Error adding article editor' });
  }
});

// @route   POST /admin/article-editors/:id/remove
// @desc    Remove article editor access (deactivate)
// @access  Private (Super Admin only)
router.post('/article-editors/:id/remove', isSuperAdmin, async (req, res) => {
  try {
    const { Admin } = require('../../models');

    const user = await Admin.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Deactivate the user
    user.isActive = false;
    await user.save();

    res.json({ success: true, message: 'Article editor access removed' });
  } catch (error) {
    console.error('Remove article editor error:', error);
    res.status(500).json({ success: false, message: 'Error removing article editor' });
  }
});

// @route   POST /admin/article-editors/:id/reactivate
// @desc    Reactivate article editor
// @access  Private (Super Admin only)
router.post('/article-editors/:id/reactivate', isSuperAdmin, async (req, res) => {
  try {
    const { Admin } = require('../../models');

    const user = await Admin.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isActive = true;
    await user.save();

    res.json({ success: true, message: 'Article editor reactivated' });
  } catch (error) {
    console.error('Reactivate article editor error:', error);
    res.status(500).json({ success: false, message: 'Error reactivating article editor' });
  }
});

// @route   POST /admin/article-editors/:id/delete
// @desc    Permanently delete article editor from database
// @access  Private (Super Admin only)
router.post('/article-editors/:id/delete', isSuperAdmin, async (req, res) => {
  try {
    const { Admin } = require('../../models');

    const user = await Admin.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Only allow deleting articleEditor role users (safety check)
    if (user.role !== 'articleEditor') {
      return res.status(403).json({
        success: false,
        message: 'Can only delete articleEditor accounts from this page'
      });
    }

    await Admin.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Article editor permanently deleted' });
  } catch (error) {
    console.error('Delete article editor error:', error);
    res.status(500).json({ success: false, message: 'Error deleting article editor' });
  }
});

// @route   POST /admin/article-editors/toggle-login
// @desc    Toggle article editor login link visibility
// @access  Private (Super Admin only)
router.post('/article-editors/toggle-login', isSuperAdmin, async (req, res) => {
  try {
    const { SiteSettings } = require('../../models');
    const { invalidateCache } = require('../../middleware/siteSettings');

    const settings = await SiteSettings.getSettings();
    const currentValue = settings.articleEditor?.showLoginLink ?? true;

    // Toggle the value
    settings.articleEditor = settings.articleEditor || {};
    settings.articleEditor.showLoginLink = !currentValue;
    await settings.save();

    // Invalidate cached settings
    invalidateCache();

    res.json({
      success: true,
      showLoginLink: settings.articleEditor.showLoginLink,
      message: settings.articleEditor.showLoginLink
        ? 'Login link is now visible'
        : 'Login link is now hidden'
    });
  } catch (error) {
    console.error('Toggle login link error:', error);
    res.status(500).json({ success: false, message: 'Error toggling login link' });
  }
});

module.exports = router;
