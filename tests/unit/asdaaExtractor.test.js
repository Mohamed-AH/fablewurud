/**
 * Unit Tests for Asdaa Article Extractor
 * Tests HTML extraction, color-to-class conversion, and content cleaning
 */

const {
  extractContent,
  extractTitle,
  extractPublishedDate
} = require('../../utils/asdaaExtractor');

// Access internal functions via the module for testing
// Since convertColorToClass and cleanHtml are not exported, we test them through extractContent

describe('Asdaa Extractor', () => {
  describe('extractTitle()', () => {
    it('should extract title from post-title h1', () => {
      const html = '<h1 class="post-title entry-title">وجوب تعلم المسائل الثلاث</h1>';
      expect(extractTitle(html)).toBe('وجوب تعلم المسائل الثلاث');
    });

    it('should strip inner HTML tags from title', () => {
      const html = '<h1 class="post-title"><span>Some <strong>Bold</strong> Title</span></h1>';
      expect(extractTitle(html)).toBe('Some Bold Title');
    });

    it('should return null when no title found', () => {
      const html = '<h2>Not a title</h2>';
      expect(extractTitle(html)).toBeNull();
    });

    it('should trim whitespace from title', () => {
      const html = '<h1 class="post-title">  Spaced Title  </h1>';
      expect(extractTitle(html)).toBe('Spaced Title');
    });

    it('should handle post-title with additional classes', () => {
      const html = '<h1 class="entry-title post-title single-title">Title Here</h1>';
      expect(extractTitle(html)).toBe('Title Here');
    });
  });

  describe('extractPublishedDate()', () => {
    it('should extract date from time element with entry-date class', () => {
      const html = '<time class="entry-date published" datetime="2024-03-15T10:00:00+00:00">March 15</time>';
      const date = extractPublishedDate(html);
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(2); // March = 2
      expect(date.getDate()).toBe(15);
    });

    it('should extract date from article:published_time meta tag', () => {
      const html = '<meta property="article:published_time" content="2023-12-01T08:30:00+03:00">';
      const date = extractPublishedDate(html);
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2023);
    });

    it('should prefer time element over meta tag', () => {
      const html = `
        <time class="entry-date" datetime="2024-06-01T00:00:00+00:00">June</time>
        <meta property="article:published_time" content="2023-01-01T00:00:00+00:00">
      `;
      const date = extractPublishedDate(html);
      expect(date.getFullYear()).toBe(2024);
    });

    it('should return null when no date found', () => {
      const html = '<div>No date here</div>';
      expect(extractPublishedDate(html)).toBeNull();
    });

    it('should return null for invalid datetime', () => {
      const html = '<time class="entry-date" datetime="not-a-date">Bad</time>';
      expect(extractPublishedDate(html)).toBeNull();
    });
  });

  describe('extractContent()', () => {
    function wrapInEntryContent(inner) {
      return `<div class="entry-content">${inner}</div><!-- .entry-content -->`;
    }

    it('should extract paragraphs from entry-content div', () => {
      const html = wrapInEntryContent('<p>First paragraph</p><p>Second paragraph</p>');
      const result = extractContent(html);
      expect(result).toContain('<p>First paragraph</p>');
      expect(result).toContain('<p>Second paragraph</p>');
    });

    it('should return null when no entry-content div found', () => {
      const html = '<div class="other-content"><p>Text</p></div>';
      expect(extractContent(html)).toBeNull();
    });

    it('should return null when no paragraphs found', () => {
      const html = wrapInEntryContent('<img src="test.jpg">');
      expect(extractContent(html)).toBeNull();
    });

    it('should strip empty paragraphs', () => {
      const html = wrapInEntryContent('<p>Real content</p><p>  </p><p></p>');
      const result = extractContent(html);
      expect(result).toBe('<p>Real content</p>');
    });

    it('should skip author attribution paragraph', () => {
      const html = wrapInEntryContent('<p>الدغريري</p><p>Actual content here</p>');
      const result = extractContent(html);
      expect(result).toBe('<p>Actual content here</p>');
    });

    it('should not skip long first paragraphs even with author name', () => {
      const longText = 'الدغريري ' + 'x'.repeat(50);
      const html = wrapInEntryContent(`<p>${longText}</p><p>Second</p>`);
      const result = extractContent(html);
      expect(result).toContain(longText);
    });

    it('should convert green color spans to quran class', () => {
      const html = wrapInEntryContent(
        '<p><span style="color: #008000;">بسم الله الرحمن الرحيم</span></p>'
      );
      const result = extractContent(html);
      expect(result).toContain('class="quran"');
      expect(result).not.toContain('style=');
    });

    it('should convert blue color spans to hadith class', () => {
      const html = wrapInEntryContent(
        '<p><span style="color: #0000ff;">قال رسول الله</span></p>'
      );
      const result = extractContent(html);
      expect(result).toContain('class="hadith"');
    });

    it('should convert red color spans to section-header class', () => {
      const html = wrapInEntryContent(
        '<p><span style="color: #ff0000;">العنوان الفرعي</span></p>'
      );
      const result = extractContent(html);
      expect(result).toContain('class="section-header"');
    });

    it('should handle multiple green color codes', () => {
      const greens = ['#008000', '#339966', '#006600', '#009933'];
      greens.forEach(color => {
        const html = wrapInEntryContent(
          `<p><span style="color: ${color};">verse</span></p>`
        );
        const result = extractContent(html);
        expect(result).toContain('class="quran"');
      });
    });

    it('should handle multiple blue color codes', () => {
      const blues = ['#0000ff', '#3366ff', '#666699', '#0000cc', '#000099'];
      blues.forEach(color => {
        const html = wrapInEntryContent(
          `<p><span style="color: ${color};">hadith</span></p>`
        );
        const result = extractContent(html);
        expect(result).toContain('class="hadith"');
      });
    });

    it('should strip unknown color spans but keep text', () => {
      const html = wrapInEntryContent(
        '<p><span style="color: #purple;">Some text</span></p>'
      );
      const result = extractContent(html);
      expect(result).toContain('Some text');
      expect(result).not.toContain('style=');
    });

    it('should preserve bold tags', () => {
      const html = wrapInEntryContent('<p><strong>Bold text</strong> normal</p>');
      const result = extractContent(html);
      expect(result).toContain('<strong>Bold text</strong>');
    });

    it('should strip script tags', () => {
      const html = wrapInEntryContent('<script>alert("xss")</script><p>Safe text</p>');
      const result = extractContent(html);
      expect(result).not.toContain('script');
      expect(result).toContain('Safe text');
    });

    it('should strip style tags', () => {
      const html = wrapInEntryContent('<style>.x{color:red}</style><p>Text</p>');
      const result = extractContent(html);
      expect(result).not.toContain('style');
      expect(result).toContain('Text');
    });

    it('should strip image tags', () => {
      const html = wrapInEntryContent('<p>Before</p><img src="test.jpg"><p>After</p>');
      const result = extractContent(html);
      expect(result).not.toContain('img');
    });

    it('should strip link tags but keep text', () => {
      const html = wrapInEntryContent('<p><a href="http://example.com">Link text</a></p>');
      const result = extractContent(html);
      expect(result).toContain('Link text');
      expect(result).not.toContain('<a');
    });

    it('should decode HTML entities', () => {
      const html = wrapInEntryContent('<p>A &amp; B &lt; C &gt; D</p>');
      const result = extractContent(html);
      expect(result).toContain('A & B');
    });

    it('should stop at post-bottom div', () => {
      const html = '<div class="entry-content">' +
        '<p>Article content</p>' +
        '<div class="post-bottom"><p>Tags and stuff</p></div>' +
        '</div>';
      const result = extractContent(html);
      expect(result).toContain('Article content');
      expect(result).not.toContain('Tags and stuff');
    });

    it('should handle entry-content with extra classes', () => {
      const html = '<div class="entry-content clearfix"><p>Content</p></div>';
      const result = extractContent(html);
      expect(result).toBe('<p>Content</p>');
    });
  });
});
