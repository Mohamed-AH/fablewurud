/**
 * Admin article management routes (extracted from routes/admin/index.js — H7).
 *
 * Mounted by the admin router, so these paths resolve under /admin/* and inherit
 * the parent's adminI18nMiddleware. Each route keeps its own isAdmin guard.
 */

const express = require('express');
const router = express.Router();
const { isAdmin } = require('../../middleware/auth');
const cache = require('../../utils/cache');
const { sanitizeArticleHtml } = require('../../utils/sanitizeHtml');
const { escapeRegex } = require('../../utils/validators');
const { captureException } = require('../../utils/errorReporter');

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
    captureException(error, req);
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
    captureException(error, req);
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
    captureException(error, req);
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
    captureException(error, req);
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
    captureException(error, req);
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
    captureException(error, req);
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
    captureException(error, req);
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
    captureException(error, req);
    res.status(500).json({ success: false, message: 'Error performing bulk action' });
  }
});

module.exports = router;
