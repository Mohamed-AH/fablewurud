/**
 * Article HTML sanitizer (allowlist-based).
 *
 * Articles rely on HTML for structure (paragraphs, headings, lists, semantic
 * Quran/Hadith/section spans, RTL text), so this preserves the full set of
 * structural/formatting tags. It strips only what is actually dangerous:
 * <script>/<style>/<iframe>/<object>/<embed>/<form>/<svg> and their content,
 * inline event handlers (on*), and unsafe URL schemes (javascript:, data:,
 * vbscript:). Class names are limited to the semantic set the stylesheet uses.
 *
 * Apply BOTH on write (admin/editor save, HTML paste import) and on render
 * (defense-in-depth for any legacy content already in the database).
 *
 * Semantic classes preserved: .quran, .hadith, .section-header
 * (see article-detail.ejs styling).
 */

const sanitizeHtml = require('sanitize-html');

const SEMANTIC_CLASSES = ['quran', 'hadith', 'section-header'];

// Tags that may carry a semantic class
const CLASSED_TAGS = ['span', 'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'];

const allowedClasses = {};
const classAttr = {};
for (const t of CLASSED_TAGS) {
  allowedClasses[t] = SEMANTIC_CLASSES;
  classAttr[t] = ['class'];
}

const ARTICLE_CONFIG = {
  allowedTags: [
    'p', 'br', 'span', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'b', 'i', 'u', 's', 'small', 'mark', 'sub', 'sup',
    'ul', 'ol', 'li',
    'blockquote', 'a', 'hr', 'pre', 'code',
    'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'td', 'th'
  ],
  allowedAttributes: {
    a: ['href', 'rel', 'target'],
    '*': ['dir', 'lang'], // preserve RTL/LTR direction on any element
    ...classAttr
  },
  // Only the stylesheet's semantic classes survive — arbitrary classes are dropped
  allowedClasses,
  // Safe URL schemes only — blocks javascript:, data:, vbscript:
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  // Force safe rel on any anchor that survives
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' })
  },
  // Drop the CONTENT of these tags entirely (not just the tag)
  nonTextTags: ['script', 'style', 'textarea', 'noscript', 'iframe', 'object', 'embed', 'form', 'svg', 'math']
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
