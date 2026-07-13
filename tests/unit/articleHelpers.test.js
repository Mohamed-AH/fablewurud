/**
 * Unit Tests for article helper functions
 * Tests sanitizeArticleHtml and ensureHtmlParagraphs from routes/articles.js
 */

// Mock dependencies so requiring the router doesn't crash
jest.mock('../../models', () => ({
  Article: {
    find: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([])
    }),
    countDocuments: jest.fn().mockResolvedValue(0)
  }
}));
jest.mock('../../utils/cache', () => ({
  get: jest.fn(),
  set: jest.fn()
}));

const router = require('../../routes/articles');
const { _sanitizeArticleHtml: sanitize, _ensureHtmlParagraphs: ensureParagraphs } = router;

describe('sanitizeArticleHtml()', () => {
  it('should return empty string for falsy input', () => {
    expect(sanitize('')).toBe('');
    expect(sanitize(null)).toBe('');
    expect(sanitize(undefined)).toBe('');
  });

  it('should strip script tags and content', () => {
    expect(sanitize('<p>Safe</p><script>alert("xss")</script>'))
      .toBe('<p>Safe</p>');
  });

  it('should strip style tags and content', () => {
    expect(sanitize('<p>Safe</p><style>.x{color:red}</style>'))
      .toBe('<p>Safe</p>');
  });

  it('should strip inline event handlers (double quotes)', () => {
    const result = sanitize('<p onclick="alert(1)">Text</p>');
    expect(result).not.toContain('onclick');
    expect(result).toContain('Text');
  });

  it('should strip inline event handlers (single quotes)', () => {
    const result = sanitize("<p onmouseover='hack()'>Text</p>");
    expect(result).not.toContain('onmouseover');
    expect(result).toContain('Text');
  });

  it('should strip iframe tags', () => {
    expect(sanitize('<p>Before</p><iframe src="evil.com"></iframe><p>After</p>'))
      .toBe('<p>Before</p><p>After</p>');
  });

  it('should strip object tags', () => {
    expect(sanitize('<object data="malware.swf"></object><p>Safe</p>'))
      .toBe('<p>Safe</p>');
  });

  it('should strip embed tags', () => {
    expect(sanitize('<embed src="flash.swf"><p>Safe</p>'))
      .toBe('<p>Safe</p>');
  });

  it('should strip form tags', () => {
    expect(sanitize('<form action="/steal"><input></form><p>Safe</p>'))
      .toBe('<p>Safe</p>');
  });

  it('should preserve safe HTML', () => {
    const safe = '<p><strong>Bold</strong> and <span class="quran">verse</span></p>';
    expect(sanitize(safe)).toBe(safe);
  });

  it('should handle multiple dangerous elements', () => {
    const dirty = '<script>bad</script><p>Safe</p><iframe></iframe><style>.x{}</style>';
    expect(sanitize(dirty)).toBe('<p>Safe</p>');
  });

  // Regression tests for the stored-XSS bypasses that the old regex blacklist
  // allowed through (code audit finding C1).
  it('should strip UNQUOTED inline event handlers', () => {
    const result = sanitize('<img src=x onerror=alert(document.cookie)>');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('<img');
  });

  it('should strip javascript: URIs on links', () => {
    const result = sanitize('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
    expect(result).toContain('click');
  });

  it('should strip svg-based handlers', () => {
    const result = sanitize('<svg onload=alert(1)>');
    expect(result).not.toContain('onload');
    expect(result).not.toContain('<svg');
  });

  it('should only allow the semantic classes', () => {
    const result = sanitize('<span class="quran">v</span><span class="evil">x</span>');
    expect(result).toContain('class="quran"');
    expect(result).not.toContain('evil');
  });

  // Structure-preservation guarantees — articles rely on HTML for layout, so
  // these must survive sanitization untouched.
  it('should preserve headings h1-h6', () => {
    expect(sanitize('<h2>A</h2><h5>B</h5><h6>C</h6>')).toBe('<h2>A</h2><h5>B</h5><h6>C</h6>');
  });

  it('should preserve semantic classes on headings and blockquotes', () => {
    expect(sanitize('<h3 class="section-header">T</h3>')).toBe('<h3 class="section-header">T</h3>');
    expect(sanitize('<blockquote class="hadith">H</blockquote>')).toBe('<blockquote class="hadith">H</blockquote>');
  });

  it('should preserve lists, blockquotes, and inline emphasis', () => {
    const html = '<ul><li>one</li><li>two</li></ul><blockquote>q</blockquote><p><strong>b</strong><em>i</em></p>';
    expect(sanitize(html)).toBe(html);
  });

  it('should preserve RTL direction attributes', () => {
    expect(sanitize('<p dir="rtl">نص عربي</p>')).toBe('<p dir="rtl">نص عربي</p>');
  });

  it('should preserve tables', () => {
    const html = '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>d</td></tr></tbody></table>';
    expect(sanitize(html)).toBe(html);
  });

  it('should keep safe links but neutralize javascript: and add rel', () => {
    expect(sanitize('<a href="https://example.com">ok</a>')).toContain('href="https://example.com"');
    expect(sanitize('<a href="https://example.com">ok</a>')).toContain('rel="noopener noreferrer"');
    expect(sanitize('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:');
  });
});

describe('ensureHtmlParagraphs()', () => {
  it('should return empty string for falsy input', () => {
    expect(ensureParagraphs('')).toBe('');
    expect(ensureParagraphs(null)).toBe('');
    expect(ensureParagraphs(undefined)).toBe('');
  });

  it('should wrap newline-separated text in p tags', () => {
    const input = 'Line one\nLine two\nLine three';
    const result = ensureParagraphs(input);
    expect(result).toBe('<p>Line one</p>\n<p>Line two</p>\n<p>Line three</p>');
  });

  it('should skip empty lines', () => {
    const input = 'Line one\n\n\nLine two';
    const result = ensureParagraphs(input);
    expect(result).toBe('<p>Line one</p>\n<p>Line two</p>');
  });

  it('should not modify content that already has p tags', () => {
    const input = '<p>Already wrapped</p><p>Second paragraph</p>';
    expect(ensureParagraphs(input)).toBe(input);
  });

  it('should detect p tags with attributes', () => {
    const input = '<p class="intro">Styled paragraph</p>';
    expect(ensureParagraphs(input)).toBe(input);
  });

  it('should trim whitespace from lines', () => {
    const input = '  Spaced line  \n  Another  ';
    const result = ensureParagraphs(input);
    expect(result).toBe('<p>Spaced line</p>\n<p>Another</p>');
  });

  it('should handle single line without newlines', () => {
    const input = 'Single line of text';
    const result = ensureParagraphs(input);
    expect(result).toBe('<p>Single line of text</p>');
  });

  it('should handle whitespace-only lines', () => {
    const input = 'Line one\n   \nLine two';
    const result = ensureParagraphs(input);
    expect(result).toBe('<p>Line one</p>\n<p>Line two</p>');
  });
});
