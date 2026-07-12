/**
 * Article HTML sanitizer (allowlist-based).
 *
 * Replaces the previous regex-blacklist approach, which was bypassable
 * (unquoted event handlers like `<img src=x onerror=...>`, `javascript:` URIs,
 * `<svg onload=...>` all survived). This uses `sanitize-html` with a strict
 * allowlist of only the tags/classes the article design needs.
 *
 * Apply BOTH on write (admin/editor save) and on render (defense-in-depth for
 * any legacy unsanitized content still in the database).
 *
 * Semantic classes preserved: .quran, .hadith, .section-header
 * (see article-detail.ejs styling).
 */

const sanitizeHtml = require('sanitize-html');

const SEMANTIC_CLASSES = ['quran', 'hadith', 'section-header'];

const ARTICLE_CONFIG = {
  allowedTags: [
    'p', 'br', 'span', 'div',
    'h1', 'h2', 'h3', 'h4',
    'strong', 'em', 'b', 'i', 'u',
    'ul', 'ol', 'li',
    'blockquote', 'a'
  ],
  allowedAttributes: {
    a: ['href', 'rel', 'target'],
    span: ['class'],
    div: ['class'],
    p: ['class']
  },
  allowedClasses: {
    span: SEMANTIC_CLASSES,
    div: SEMANTIC_CLASSES,
    p: SEMANTIC_CLASSES
  },
  // Only safe URL schemes on links — blocks javascript:, data:, vbscript:
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  // Force safe rel on any anchor that survives
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' })
  },
  // Drop the contents of disallowed script-like tags entirely
  nonTextTags: ['script', 'style', 'textarea', 'noscript', 'iframe', 'object', 'embed', 'form']
};

/**
 * Sanitize article HTML content against an allowlist.
 * @param {string} html - Raw HTML content.
 * @returns {string} Sanitized HTML safe to render with <%- %>.
 */
function sanitizeArticleHtml(html) {
  if (!html) return '';
  return sanitizeHtml(html, ARTICLE_CONFIG);
}

module.exports = { sanitizeArticleHtml, ARTICLE_CONFIG };
