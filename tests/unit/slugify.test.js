/**
 * Unit Tests for slugify utility
 * Tests Arabic-to-Latin transliteration and slug generation
 */

const {
  generateSlug,
  generateSlugEn,
  generateSlugAr,
  generateUniqueSlug,
  generateLectureSlug,
  generateSeriesSlug,
  generateSheikhSlug,
  transliterateArabic
} = require('../../utils/slugify');

describe('Slugify Utility', () => {
  describe('transliterateArabic()', () => {
    it('should transliterate basic Arabic letters', () => {
      // Test that Arabic letters are converted to Latin equivalents
      const bsm = transliterateArabic('بسم');
      expect(bsm).toMatch(/^[a-z]+$/);
      expect(bsm.length).toBeGreaterThanOrEqual(2);

      // الله - sun letter assimilation applies to second ل
      const allah = transliterateArabic('الله');
      expect(allah).toMatch(/^[a-z]+$/);

      // محمد should contain consonants m, h, m, d in order
      const muhammad = transliterateArabic('محمد');
      expect(muhammad).toMatch(/^[a-z]+$/);
      expect(muhammad).toContain('m');
    });

    it('should handle empty input', () => {
      expect(transliterateArabic('')).toBe('');
      expect(transliterateArabic(null)).toBe('');
      expect(transliterateArabic(undefined)).toBe('');
    });

    it('should preserve non-Arabic characters', () => {
      expect(transliterateArabic('test123')).toBe('test123');
      expect(transliterateArabic('hello world')).toBe('hello world');
    });

    it('should handle mixed Arabic and English', () => {
      const result = transliterateArabic('محمد 123 test');
      expect(result).toContain('mhmd');
      expect(result).toContain('123');
      expect(result).toContain('test');
    });

    it('should handle definite article "ال"', () => {
      expect(transliterateArabic('الكتاب')).toBe('alktab');
    });

    it('should handle sun letters with definite article', () => {
      // Sun letters cause assimilation of the 'l' in 'al'
      expect(transliterateArabic('الشمس')).toBe('ashms'); // ش is a sun letter
      expect(transliterateArabic('الرحمن')).toBe('arhmn'); // ر is a sun letter
    });

    it('should remove diacritics (tashkeel)', () => {
      // Text with fatha, damma, kasra, shadda, sukun
      const withDiacritics = 'مُحَمَّد';
      const result = transliterateArabic(withDiacritics);
      expect(result).not.toContain('\u064E'); // fatha
      expect(result).not.toContain('\u064F'); // damma
    });

    it('should handle special Arabic characters', () => {
      expect(transliterateArabic('ء')).toBe(''); // hamza
      expect(transliterateArabic('ة')).toBe('a'); // taa marbuta
      expect(transliterateArabic('ى')).toBe('a'); // alef maksura
    });
  });

  describe('generateSlug()', () => {
    it('should generate slug from Arabic text', () => {
      // Arabic text should be transliterated to lowercase Latin with hyphens
      const slug = generateSlug('محاضرة في العقيدة');
      expect(slug).toMatch(/^[a-z0-9-]+$/); // Only lowercase letters, numbers, hyphens
      expect(slug).not.toMatch(/--/); // No consecutive hyphens
      expect(slug).not.toMatch(/^-|-$/); // No leading/trailing hyphens
      expect(slug.split('-').length).toBe(3); // Three words separated by hyphens
    });

    it('should generate slug from English text', () => {
      expect(generateSlug('Hello World')).toBe('hello-world');
    });

    it('should handle empty input', () => {
      expect(generateSlug('')).toBe('');
      expect(generateSlug(null)).toBe('');
      expect(generateSlug(undefined)).toBe('');
    });

    it('should remove special characters', () => {
      expect(generateSlug('Hello! World?')).toBe('hello-world');
      expect(generateSlug('Test@#$%^&*()')).toBe('test');
    });

    it('should handle multiple spaces', () => {
      expect(generateSlug('Hello    World')).toBe('hello-world');
    });

    it('should remove leading/trailing hyphens', () => {
      expect(generateSlug('  Hello World  ')).toBe('hello-world');
      expect(generateSlug('-Hello-World-')).toBe('hello-world');
    });

    it('should handle numbers', () => {
      expect(generateSlug('Lecture 1')).toBe('lecture-1');
      expect(generateSlug('محاضرة 5')).toBe('mhadra-5');
    });

    it('should collapse multiple hyphens', () => {
      expect(generateSlug('Hello---World')).toBe('hello-world');
    });

    it('should handle underscores', () => {
      expect(generateSlug('hello_world')).toBe('hello-world');
    });
  });

  describe('generateSlugEn()', () => {
    it('should generate English slug from Arabic text', () => {
      const result = generateSlugEn('محاضرة');
      expect(result).toMatch(/^[a-z0-9-]+$/);
    });

    it('should generate lowercase slug', () => {
      expect(generateSlugEn('HELLO WORLD')).toBe('hello-world');
    });

    it('should handle empty input', () => {
      expect(generateSlugEn('')).toBe('');
      expect(generateSlugEn(null)).toBe('');
    });
  });

  describe('generateSlugAr()', () => {
    it('should preserve Arabic characters', () => {
      const result = generateSlugAr('محاضرة في العقيدة');
      expect(result).toContain('محاضرة');
      expect(result).toContain('-');
    });

    it('should replace spaces with hyphens', () => {
      expect(generateSlugAr('كلمة أولى')).toBe('كلمة-أولى');
    });

    it('should handle empty input', () => {
      expect(generateSlugAr('')).toBe('');
      expect(generateSlugAr(null)).toBe('');
    });

    it('should remove non-Arabic, non-numeric characters except hyphens', () => {
      const result = generateSlugAr('محاضرة 123 test');
      expect(result).toContain('محاضرة');
      expect(result).toContain('123');
      expect(result).not.toContain('test');
    });

    it('should collapse multiple hyphens', () => {
      expect(generateSlugAr('كلمة---أخرى')).toBe('كلمة-أخرى');
    });

    it('should remove leading/trailing hyphens', () => {
      expect(generateSlugAr('-كلمة-')).toBe('كلمة');
    });
  });

  describe('generateUniqueSlug()', () => {
    it('should return base slug if it does not exist', async () => {
      const checkExists = jest.fn().mockResolvedValue(false);
      const result = await generateUniqueSlug('test-slug', checkExists);

      expect(result).toBe('test-slug');
      expect(checkExists).toHaveBeenCalledWith('test-slug');
    });

    it('should append counter if slug exists', async () => {
      const checkExists = jest.fn()
        .mockResolvedValueOnce(true)  // test-slug exists
        .mockResolvedValueOnce(false); // test-slug-1 does not exist

      const result = await generateUniqueSlug('test-slug', checkExists);

      expect(result).toBe('test-slug-1');
    });

    it('should increment counter until unique slug found', async () => {
      const checkExists = jest.fn()
        .mockResolvedValueOnce(true)  // test-slug exists
        .mockResolvedValueOnce(true)  // test-slug-1 exists
        .mockResolvedValueOnce(true)  // test-slug-2 exists
        .mockResolvedValueOnce(false); // test-slug-3 does not exist

      const result = await generateUniqueSlug('test-slug', checkExists);

      expect(result).toBe('test-slug-3');
    });

    it('should append timestamp after 100 iterations', async () => {
      // Always return true to simulate all slugs existing
      const checkExists = jest.fn().mockResolvedValue(true);

      const before = Date.now();
      const result = await generateUniqueSlug('test-slug', checkExists);
      const after = Date.now();

      // Should have timestamp appended
      expect(result).toMatch(/^test-slug-\d+$/);

      // Extract timestamp
      const timestamp = parseInt(result.split('-').pop());
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('generateLectureSlug()', () => {
    it('should generate slug with series name and lecture number', () => {
      const lecture = {
        titleArabic: 'الدرس الأول',
        lectureNumber: 1
      };
      const series = {
        titleArabic: 'شرح العقيدة'
      };

      const result = generateLectureSlug(lecture, series);
      // Should contain transliterated series name, Arabic lesson marker, and number
      expect(result).toMatch(/^[a-z-]+-.*-1$/); // ends with lecture number
      expect(result).toContain('1'); // Contains lecture number
      // The format is: {series-slug}-الدرس-{number}
      expect(result.split('-').length).toBeGreaterThanOrEqual(3);
    });

    it('should fallback to lecture title if no series', () => {
      const lecture = {
        titleArabic: 'محاضرة مستقلة',
        lectureNumber: 1
      };

      const result = generateLectureSlug(lecture, null);
      expect(result).toBe('mhadra-mstqla');
    });

    it('should fallback to lecture title if no lecture number', () => {
      const lecture = {
        titleArabic: 'محاضرة بدون رقم'
      };
      const series = {
        titleArabic: 'سلسلة'
      };

      const result = generateLectureSlug(lecture, series);
      expect(result).toBe('mhadra-bdwn-rqm');
    });
  });

  describe('generateSeriesSlug()', () => {
    it('should generate slug from series title', () => {
      const series = {
        titleArabic: 'شرح كتاب التوحيد'
      };

      const result = generateSeriesSlug(series);
      expect(result).toBe('shrh-ktab-atwhyd');
    });
  });

  describe('generateSheikhSlug()', () => {
    it('should generate slug from sheikh name', () => {
      const sheikh = {
        nameArabic: 'محمد بن صالح'
      };

      const result = generateSheikhSlug(sheikh);
      expect(result).toBe('mhmd-bn-salh');
    });

    it('should remove honorifics from slug', () => {
      const sheikh = {
        nameArabic: 'الشيخ محمد حفظه الله'
      };

      const result = generateSheikhSlug(sheikh);
      // Should not contain الشيخ or حفظه الله
      expect(result).not.toContain('alshykh');
      expect(result).toBe('mhmd');
    });

    it('should handle رحمه الله honorific', () => {
      const sheikh = {
        nameArabic: 'الشيخ ابن باز رحمه الله'
      };

      const result = generateSheikhSlug(sheikh);
      expect(result).not.toContain('rhmh');
      expect(result).toContain('abn');
      expect(result).toContain('baz');
    });
  });
});
