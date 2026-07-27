/**
 * Admin publications (Sheikh Najmi PDF library) routes.
 * Extracted into its own module (mounted by the admin router) to keep
 * routes/admin/index.js focused — matches the articles.js split pattern.
 */
const express = require('express');
const router = express.Router();
const { isAdmin } = require('../../middleware/auth');
const cache = require('../../utils/cache');
const { captureException } = require('../../utils/errorReporter');

// Invalidate the caches whose content depends on publications (Najmi realm
// pages, the homepage, search and the sitemap). Mirrors the helper in
// routes/admin/index.js, which isn't exported — publications.js is a separate
// module, so calling the parent's function directly would be a ReferenceError.
function invalidateHomepageCache() {
  cache.invalidatePattern('homepage:*');
  cache.invalidatePattern('najmi:*');
  cache.invalidatePattern('search:*');
  cache.del('sitemap:xml');
}

// PUBLICATIONS (Sheikh Najmi PDF library) — admin CRUD
// ===========================================================================
const multer = require('multer');
// Reuse the resilient, guaranteed-writable staging dir from config/storage
// (falls back off an unwritable UPLOAD_DIR like /mnt/audio, and re-ensures the
// directory exists right before each write — prevents ENOENT on upload).
const { ensureUploadDir } = require('../../config/storage');
const pdfUpload = multer({
  storage: multer.diskStorage({
    destination: ensureUploadDir,
    filename: (req, file, cb) => {
      const ext = require('path').extname(file.originalname) || '.pdf';
      cb(null, `pub-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || require('path').extname(file.originalname).toLowerCase() === '.pdf';
    cb(ok ? null : new Error('Only PDF files are allowed'), ok);
  },
  limits: { fileSize: 100 * 1024 * 1024, files: 1 } // 100MB
});

const PUB_CATEGORIES = ['الكتب', 'التعليقات', 'الرسائل', 'من السيرة الذاتية'];

// Derive the R2 object key from a stored public fileUrl (for deletion)
function r2KeyFromUrl(fileUrl) {
  const base = process.env.R2_PUBLIC_URL;
  if (!base || !fileUrl || !fileUrl.startsWith(base)) return null;
  const rel = fileUrl.slice(base.replace(/\/$/, '').length + 1); // strip "base/"
  try { return decodeURIComponent(rel); } catch (_) { return rel; }
}

// @route   GET /admin/publications  — list with search / category / status filters
router.get('/publications', isAdmin, async (req, res) => {
  try {
    const { Publication } = require('../../models');
    const { search, category, status, sort, page = 1 } = req.query;
    const limit = 20;
    const skip = (parseInt(page) - 1) * limit;

    const query = {};
    if (search) query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { titleEnglish: { $regex: search, $options: 'i' } }
    ];
    if (category && category !== 'all') query.category = category;
    if (status === 'published') query.isPublished = true;
    else if (status === 'draft') query.isPublished = false;

    let sortOption = { createdAt: -1 };
    if (sort === 'title') sortOption = { title: 1 };
    else if (sort === 'pages') sortOption = { pageCount: -1 };
    else if (sort === 'downloads') sortOption = { downloadCount: -1 };

    // Single aggregation for all stat counts (avoids N+1 sequential countDocuments)
    const [publications, totalCount, statsAgg] = await Promise.all([
      Publication.find(query).sort(sortOption).skip(skip).limit(limit).lean(),
      Publication.countDocuments(query),
      Publication.aggregate([{
        $facet: {
          byCategory: [{ $group: { _id: '$category', count: { $sum: 1 } } }],
          byStatus: [{ $group: { _id: '$isPublished', count: { $sum: 1 } } }],
          total: [{ $count: 'n' }]
        }
      }])
    ]);

    const facet = statsAgg[0] || {};
    const byCat = {};
    PUB_CATEGORIES.forEach(c => { byCat[c] = 0; });
    (facet.byCategory || []).forEach(r => { if (r._id != null && byCat[r._id] !== undefined) byCat[r._id] = r.count; });
    let published = 0, draft = 0;
    (facet.byStatus || []).forEach(r => { if (r._id === true) published = r.count; else draft += r.count; });
    const total = (facet.total && facet.total[0] && facet.total[0].n) || 0;

    res.render('admin/publications-list', {
      title: 'Publications', user: req.user, activePage: 'publications',
      publications,
      categories: PUB_CATEGORIES,
      stats: { total, published, draft, byCat },
      filters: { search: search || '', category: category || 'all', status: status || 'all', sort: sort || 'newest' },
      pagination: {
        currentPage: parseInt(page), totalPages: Math.ceil(totalCount / limit), totalCount,
        hasNext: parseInt(page) * limit < totalCount, hasPrev: parseInt(page) > 1
      },
      success: req.query.success, error: req.query.error
    });
  } catch (error) {
    console.error('Publications list error:', error);
    captureException(error, req);
    res.status(500).send('Error loading publications');
  }
});

// @route   GET /admin/publications/new
router.get('/publications/new', isAdmin, (req, res) => {
  res.render('admin/publication-form', {
    title: 'New Publication', user: req.user, activePage: 'publications',
    isEdit: false, publication: {}, categories: PUB_CATEGORIES, error: req.query.error
  });
});

// @route   POST /admin/publications/new  — upload PDF to R2 + create doc
router.post('/publications/new', isAdmin, (req, res) => {
  pdfUpload.single('pdfFile')(req, res, async (err) => {
    const fs = require('fs');
    try {
      if (err) return res.redirect('/admin/publications/new?error=' + encodeURIComponent(err.message));
      const { Publication } = require('../../models');
      const { getNajmiSheikh } = require('../../utils/najmiSheikh');
      const { uploadToR2 } = require('../../utils/r2Storage');
      const { title, titleEnglish, category, pageCount, volumeCount, description } = req.body;

      const sheikh = await getNajmiSheikh();
      if (!sheikh) return res.redirect('/admin/publications/new?error=' + encodeURIComponent('Najmi sheikh not found'));
      if (!title || !req.file) return res.redirect('/admin/publications/new?error=' + encodeURIComponent('Title and PDF file are required'));

      // Upload to R2 under pdf/ with an inline disposition (open-in-tab friendly)
      const objectName = 'pdf/' + req.file.originalname.replace(/\s+/g, '-');
      const result = await uploadToR2(req.file.path, objectName, { contentType: 'application/pdf', disposition: 'inline' });
      fs.unlink(req.file.path, () => {});

      await new Publication({
        sheikhId: sheikh._id,
        title: title.trim(),
        titleEnglish: (titleEnglish || '').trim(),
        category: PUB_CATEGORIES.includes(category) ? category : 'الكتب',
        fileUrl: result.url,
        fileName: req.file.originalname,
        fileSize: result.size || 0,
        pageCount: parseInt(pageCount) || 0,
        volumeCount: parseInt(volumeCount) || 1,
        description: (description || '').trim(),
        isPublished: req.body.isPublished === 'on'
      }).save();

      invalidateHomepageCache();
      res.redirect('/admin/publications?success=created');
    } catch (e) {
      console.error('Create publication error:', e);
      if (req.file) fs.unlink(req.file.path, () => {});
      res.redirect('/admin/publications/new?error=' + encodeURIComponent('Create failed'));
    }
  });
});

// @route   GET /admin/publications/:id/edit
router.get('/publications/:id/edit', isAdmin, async (req, res) => {
  try {
    const { Publication } = require('../../models');
    const publication = await Publication.findById(req.params.id).lean();
    if (!publication) return res.status(404).send('Publication not found');
    res.render('admin/publication-form', {
      title: 'Edit Publication', user: req.user, activePage: 'publications',
      isEdit: true, publication, categories: PUB_CATEGORIES, error: req.query.error
    });
  } catch (error) {
    console.error('Edit publication load error:', error);
    captureException(error, req);
    res.status(500).send('Error loading publication');
  }
});

// @route   POST /admin/publications/:id/edit  — metadata only (not the file)
router.post('/publications/:id/edit', isAdmin, async (req, res) => {
  try {
    const { Publication } = require('../../models');
    const pub = await Publication.findById(req.params.id);
    if (!pub) return res.status(404).send('Publication not found');
    const { title, titleEnglish, category, pageCount, volumeCount, description } = req.body;
    if (title) pub.title = title.trim();
    pub.titleEnglish = (titleEnglish || '').trim();
    if (PUB_CATEGORIES.includes(category)) pub.category = category;
    pub.pageCount = parseInt(pageCount) || 0;
    pub.volumeCount = parseInt(volumeCount) || 1;
    pub.description = (description || '').trim();
    pub.isPublished = req.body.isPublished === 'on';
    await pub.save();
    invalidateHomepageCache();
    res.redirect('/admin/publications?success=updated');
  } catch (error) {
    console.error('Update publication error:', error);
    captureException(error, req);
    res.redirect('/admin/publications/' + req.params.id + '/edit?error=' + encodeURIComponent('Update failed'));
  }
});

// @route   POST /admin/publications/:id/toggle-published  (AJAX)
router.post('/publications/:id/toggle-published', isAdmin, async (req, res) => {
  try {
    const { Publication } = require('../../models');
    const pub = await Publication.findById(req.params.id);
    if (!pub) return res.status(404).json({ success: false });
    pub.isPublished = !pub.isPublished;
    await pub.save();
    invalidateHomepageCache();
    res.json({ success: true, isPublished: pub.isPublished });
  } catch (error) {
    console.error('Toggle publication error:', error);
    captureException(error, req);
    res.status(500).json({ success: false });
  }
});

// @route   POST /admin/publications/:id/delete  — remove R2 object + doc
router.post('/publications/:id/delete', isAdmin, async (req, res) => {
  try {
    const { Publication } = require('../../models');
    const { deleteFromR2, isR2Url } = require('../../utils/r2Storage');
    const pub = await Publication.findById(req.params.id);
    if (!pub) return res.status(404).send('Publication not found');

    if (isR2Url(pub.fileUrl)) {
      const key = r2KeyFromUrl(pub.fileUrl);
      if (key) {
        try { await deleteFromR2(key); }
        catch (e) { console.error('R2 delete failed (continuing):', e.message); }
      }
    }
    await Publication.deleteOne({ _id: pub._id });
    invalidateHomepageCache();
    res.redirect('/admin/publications?success=deleted');
  } catch (error) {
    console.error('Delete publication error:', error);
    captureException(error, req);
    res.redirect('/admin/publications?error=' + encodeURIComponent('Delete failed'));
  }
});

module.exports = router;
