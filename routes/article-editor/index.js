/**
 * Article Editor Routes
 * For external contributors to edit article content (fix typos, grammar)
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Article, Admin } = require('../../models');
const { isArticleEditor, isArticleEditorAPI } = require('../../middleware/auth');
const { sanitizeArticleHtml } = require('../../utils/sanitizeHtml');
const { escapeRegex } = require('../../utils/validators');

// Helper to build article query - only include _id if valid ObjectId
function buildArticleQuery(idParam) {
  const query = { $or: [] };

  // Only add _id condition if it's a valid ObjectId
  if (mongoose.Types.ObjectId.isValid(idParam) && idParam.length === 24) {
    query.$or.push({ _id: idParam });
  }

  // Try as shortId (numeric)
  const shortId = parseInt(idParam);
  if (!isNaN(shortId)) {
    query.$or.push({ shortId: shortId });
  }

  // Try as slug
  query.$or.push({ slug: idParam });

  return query;
}

/**
 * GET /article-editor/login
 * Login page for article editors
 */
router.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/article-editor');
  }
  res.render('article-editor/login', {
    layout: false,
    title: 'تسجيل الدخول - محرر المقالات',
    error: req.query.error
  });
});

/**
 * GET /article-editor
 * Dashboard with article list
 */
router.get('/', isArticleEditor, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 50;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const filter = req.query.filter || 'all';

    // Base query for published articles
    const baseQuery = { isPublished: true };
    if (search) {
      const safe = escapeRegex(String(search));
      baseQuery.$or = [
        { title: { $regex: safe, $options: 'i' } },
        { summary: { $regex: safe, $options: 'i' } }
      ];
    }

    // Get stats for all filters (with search applied)
    const [totalAll, totalEdited, totalNotEdited] = await Promise.all([
      Article.countDocuments(baseQuery),
      Article.countDocuments({ ...baseQuery, lastEditedAt: { $exists: true, $ne: null } }),
      Article.countDocuments({ ...baseQuery, $or: [{ lastEditedAt: { $exists: false } }, { lastEditedAt: null }] })
    ]);

    // Build filtered query
    const query = { ...baseQuery };
    if (filter === 'edited') {
      query.lastEditedAt = { $exists: true, $ne: null };
    } else if (filter === 'not-edited') {
      query.$and = query.$and || [];
      query.$and.push({ $or: [{ lastEditedAt: { $exists: false } }, { lastEditedAt: null }] });
    }

    const [articles, totalCount] = await Promise.all([
      Article.find(query)
        .sort({ shortId: 1 }) // Sort by serial number for easier coordination
        .skip(skip)
        .limit(limit)
        .select('title summary type publishedAt lastEditedBy lastEditedAt shortId slug')
        .populate('lastEditedBy', 'displayName email')
        .lean(),
      Article.countDocuments(query)
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    res.render('article-editor/dashboard', {
      title: 'لوحة تحرير المقالات',
      articles,
      pagination: {
        page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      stats: {
        total: totalAll,
        edited: totalEdited,
        notEdited: totalNotEdited
      },
      filter,
      search,
      user: req.user
    });
  } catch (error) {
    console.error('Article editor dashboard error:', error);
    res.status(500).render('article-editor/error', {
      title: 'خطأ',
      message: 'حدث خطأ في تحميل المقالات'
    });
  }
});

/**
 * GET /article-editor/article/:id
 * Edit single article
 */
router.get('/article/:id', isArticleEditor, async (req, res) => {
  try {
    const query = buildArticleQuery(req.params.id);
    const article = await Article.findOne(query).lean();

    if (!article) {
      return res.status(404).render('article-editor/error', {
        title: 'غير موجود',
        message: 'المقال غير موجود'
      });
    }

    res.render('article-editor/edit', {
      title: `تحرير: ${article.title}`,
      article,
      user: req.user
    });
  } catch (error) {
    console.error('Article editor edit page error:', error);
    res.status(500).render('article-editor/error', {
      title: 'خطأ',
      message: 'حدث خطأ في تحميل المقال'
    });
  }
});

/**
 * POST /article-editor/article/:id
 * Save article changes with history tracking
 * Note: Article editors can ONLY modify title and content (body text)
 * Other fields (summary, slug, type, etc.) are admin-only
 */
router.post('/article/:id', isArticleEditorAPI, async (req, res) => {
  try {
    const { title, content, changeDescription } = req.body;

    const query = buildArticleQuery(req.params.id);
    const article = await Article.findOne(query).lean();

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'المقال غير موجود'
      });
    }

    // Track changes - only title and content allowed for editors
    const changes = [];
    const fieldsChanged = [];
    const updateFields = {};

    if (title !== undefined && title !== article.title) {
      changes.push({
        field: 'title',
        oldValue: article.title,
        newValue: title
      });
      fieldsChanged.push('title');
      updateFields.title = title;
    }

    const sanitizedContent = content !== undefined ? sanitizeArticleHtml(content) : undefined;
    if (sanitizedContent !== undefined && sanitizedContent !== article.content) {
      changes.push({
        field: 'content',
        oldValue: article.content,
        newValue: sanitizedContent
      });
      fieldsChanged.push('content');
      updateFields.content = sanitizedContent;
    }

    if (changes.length === 0) {
      return res.json({
        success: true,
        message: 'لا توجد تغييرات للحفظ',
        noChanges: true
      });
    }

    updateFields.lastEditedBy = req.user._id;
    updateFields.lastEditedAt = new Date();

    await Article.updateOne({ _id: article._id }, {
      $set: updateFields,
      $push: {
        editHistory: {
          editedBy: req.user._id,
          editedAt: new Date(),
          fieldsChanged,
          changes,
          changeDescription: changeDescription || ''
        }
      }
    });

    res.json({
      success: true,
      message: 'تم حفظ التغييرات بنجاح',
      fieldsChanged
    });
  } catch (error) {
    console.error('Article save error:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في حفظ التغييرات'
    });
  }
});

/**
 * GET /article-editor/article/:id/history
 * View edit history for an article
 */
router.get('/article/:id/history', isArticleEditor, async (req, res) => {
  try {
    const query = buildArticleQuery(req.params.id);
    const article = await Article.findOne(query)
      .select('title editHistory shortId slug')
      .populate('editHistory.editedBy', 'displayName email profilePhoto')
      .lean();

    if (!article) {
      return res.status(404).render('article-editor/error', {
        title: 'غير موجود',
        message: 'المقال غير موجود'
      });
    }

    // Sort history by date descending (most recent first)
    const history = (article.editHistory || []).sort((a, b) =>
      new Date(b.editedAt) - new Date(a.editedAt)
    );

    res.render('article-editor/history', {
      title: `سجل التعديلات: ${article.title}`,
      article,
      history,
      user: req.user
    });
  } catch (error) {
    console.error('Article history error:', error);
    res.status(500).render('article-editor/error', {
      title: 'خطأ',
      message: 'حدث خطأ في تحميل سجل التعديلات'
    });
  }
});

/**
 * GET /article-editor/logout
 * Logout and redirect to login
 */
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/article-editor/login');
  });
});

module.exports = router;
