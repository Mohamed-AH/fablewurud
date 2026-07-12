const express = require('express');
const router = express.Router();
const { Article } = require('../models');
const cache = require('../utils/cache');
const { sanitizeArticleHtml } = require('../utils/sanitizeHtml');
const { asyncHandler } = require('../utils/errorReporter');

function ensureHtmlParagraphs(content) {
  if (!content) return '';
  if (/<p[\s>]/i.test(content)) return content;
  return content
    .split(/\n/)
    .filter(line => line.trim())
    .map(line => `<p>${line.trim()}</p>`)
    .join('\n');
}

const CACHE_TTL = {
  ARTICLES_LIST: 600,
  ARTICLE_DETAIL: 1800
};

// @route   GET /articles
// @desc    List all articles
// @access  Public
router.get('/', asyncHandler(async (req, res) => {
    const locale = res.locals.locale || 'ar';
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const cacheKey = `articles:list:page${page}`;

    const fetchArticles = async () => {
      const [articles, total] = await Promise.all([
        Article.find({ isPublished: true })
          .sort({ publishedAt: -1 })
          .skip(skip)
          .limit(limit)
          .select('shortId type publishedAt sourceUrl title summary slug slug_ar')
          .lean(),
        Article.countDocuments({ isPublished: true })
      ]);
      return { articles, total };
    };

    const { articles, total } = await cache.getOrSet(cacheKey, fetchArticles, CACHE_TTL.ARTICLES_LIST);

    const totalPages = Math.ceil(total / limit);

    res.render('public/articles', {
      title: locale === 'ar' ? 'المقالات' : 'Articles',
      metaDescription: locale === 'ar'
        ? 'مقالات ومواضيع علمية مختارة للشيخ حسن بن محمد منصور الدغريري'
        : 'Selected scholarly articles by Sheikh Hasan bin Mohammed Mansour Dhaghriri',
      canonicalPath: page > 1 ? `/articles?page=${page}` : '/articles',
      articles,
      currentPage: page,
      totalPages,
      total
    });
}));

// @route   GET /articles/:slugOrId
// @desc    Single article page
// @access  Public
router.get('/:slugOrId', asyncHandler(async (req, res) => {
    const locale = res.locals.locale || 'ar';
    const { slugOrId } = req.params;

    const cacheKey = `article:${slugOrId}`;

    const fetchArticle = async () => {
      let article;

      // Try shortId first (numeric)
      if (/^\d+$/.test(slugOrId)) {
        article = await Article.findOne({ shortId: parseInt(slugOrId), isPublished: true }).lean();
      }

      // Try slug
      if (!article) {
        article = await Article.findOne({ slug: slugOrId, isPublished: true }).lean();
      }

      // Try _id
      if (!article && /^[a-f\d]{24}$/i.test(slugOrId)) {
        article = await Article.findOne({ _id: slugOrId, isPublished: true }).lean();
      }

      return article;
    };

    const article = await cache.getOrSet(cacheKey, fetchArticle, CACHE_TTL.ARTICLE_DETAIL);

    if (!article) {
      return res.status(404).send(locale === 'ar' ? 'المقال غير موجود' : 'Article not found');
    }

    // Fetch related articles (same type or recent)
    const relatedArticles = await Article.find({
      _id: { $ne: article._id },
      isPublished: true,
      type: article.type
    })
      .sort({ publishedAt: -1 })
      .limit(3)
      .select('shortId title summary slug publishedAt')
      .lean();

    // Wrap plain-text content in <p> tags, then sanitize for safe rendering
    article.content = sanitizeArticleHtml(ensureHtmlParagraphs(article.content));

    // Generate meta description (summary or first 160 chars of content)
    let metaDescription = article.summary;
    if (!metaDescription && article.content) {
      metaDescription = article.content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().substring(0, 160);
      if (article.content.replace(/<[^>]+>/g, '').length > 160) metaDescription += '...';
    }
    metaDescription = metaDescription || article.title;

    // Build canonical URL
    const articleSlug = article.slug || article.shortId || article._id;
    const canonicalPath = `/articles/${articleSlug}`;

    res.render('public/article-detail', {
      title: article.title,
      metaDescription,
      canonicalPath,
      article,
      relatedArticles,
      // Article-specific SEO
      ogType: 'article',
      publishedTime: article.publishedAt ? new Date(article.publishedAt).toISOString() : null,
      modifiedTime: article.updatedAt ? new Date(article.updatedAt).toISOString() : null
    });
}));

router._sanitizeArticleHtml = sanitizeArticleHtml;
router._ensureHtmlParagraphs = ensureHtmlParagraphs;
module.exports = router;
