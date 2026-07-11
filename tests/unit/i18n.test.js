/**
 * Unit Tests for i18n (internationalization) utility
 */

// Mock SiteSettings to prevent database connection
jest.mock('../../models/SiteSettings', () => ({
  getSettings: jest.fn().mockResolvedValue({
    noticeBanner: {
      enabled: true,
      messageAr: 'رسالة اختبار',
      messageEn: 'Test message',
      linkUrl: 'https://example.com',
      linkTextAr: 'رابط',
      linkTextEn: 'Link'
    }
  })
}));

const {
  t,
  i18nMiddleware,
  translations,
  translateCategory,
  categoryMap,
  toArabicNumerals,
  formatHijriDate
} = require('../../utils/i18n');

describe('i18n Utility', () => {
  describe('t() - translation function', () => {
    it('should return Arabic translation for valid key', () => {
      expect(t('ar', 'nav_home')).toBe('الرئيسية');
    });

    it('should return English translation for valid key', () => {
      expect(t('en', 'nav_home')).toBe('Home');
    });

    it('should return key if locale is invalid', () => {
      expect(t('fr', 'nav_home')).toBe('nav_home');
    });

    it('should return key if key does not exist', () => {
      expect(t('ar', 'nonexistent_key')).toBe('nonexistent_key');
    });

    it('should translate all category keys in Arabic', () => {
      expect(t('ar', 'category_aqeedah')).toBe('العقيدة');
      expect(t('ar', 'category_fiqh')).toBe('الفقه');
      expect(t('ar', 'category_tafsir')).toBe('التفسير');
      expect(t('ar', 'category_hadith')).toBe('الحديث');
      expect(t('ar', 'category_seerah')).toBe('السيرة');
      expect(t('ar', 'category_other')).toBe('أخرى');
    });

    it('should translate all category keys in English', () => {
      expect(t('en', 'category_aqeedah')).toBe('Aqeedah');
      expect(t('en', 'category_fiqh')).toBe('Fiqh');
      expect(t('en', 'category_tafsir')).toBe('Tafsir');
      expect(t('en', 'category_hadith')).toBe('Hadith');
      expect(t('en', 'category_seerah')).toBe('Seerah');
    });
  });

  describe('translations object', () => {
    it('should have ar and en locales', () => {
      expect(translations).toHaveProperty('ar');
      expect(translations).toHaveProperty('en');
    });

    it('should have matching keys for both locales', () => {
      const arKeys = Object.keys(translations.ar).sort();
      const enKeys = Object.keys(translations.en).sort();
      expect(arKeys).toEqual(enKeys);
    });
  });

  describe('translateCategory()', () => {
    it('should translate category to Arabic', () => {
      expect(translateCategory('Aqeedah', 'ar')).toBe('العقيدة');
      expect(translateCategory('Fiqh', 'ar')).toBe('الفقه');
      expect(translateCategory('Hadith', 'ar')).toBe('الحديث');
    });

    it('should translate category to English', () => {
      expect(translateCategory('Aqeedah', 'en')).toBe('Aqeedah');
      expect(translateCategory('Fiqh', 'en')).toBe('Fiqh');
    });

    it('should return empty string for null/undefined', () => {
      expect(translateCategory(null, 'ar')).toBe('');
      expect(translateCategory(undefined, 'en')).toBe('');
    });

    it('should return original string for unknown category', () => {
      expect(translateCategory('UnknownCategory', 'ar')).toBe('UnknownCategory');
    });

    it('should translate Khutbah category', () => {
      expect(translateCategory('Khutbah', 'ar')).toBe('خطب');
      expect(translateCategory('Khutbah', 'en')).toBe('Khutbah');
    });

    it('should fallback to English if locale not found in mapping', () => {
      expect(translateCategory('Aqeedah', 'fr')).toBe('Aqeedah');
    });
  });

  describe('categoryMap', () => {
    it('should have all expected categories', () => {
      expect(categoryMap).toHaveProperty('Aqeedah');
      expect(categoryMap).toHaveProperty('Fiqh');
      expect(categoryMap).toHaveProperty('Tafsir');
      expect(categoryMap).toHaveProperty('Hadith');
      expect(categoryMap).toHaveProperty('Seerah');
      expect(categoryMap).toHaveProperty('General');
      expect(categoryMap).toHaveProperty('Other');
      expect(categoryMap).toHaveProperty('Khutbah');
    });

    it('should have ar and en for each category', () => {
      for (const [key, val] of Object.entries(categoryMap)) {
        expect(val).toHaveProperty('ar');
        expect(val).toHaveProperty('en');
      }
    });
  });

  describe('toArabicNumerals()', () => {
    it('should convert single digits', () => {
      expect(toArabicNumerals(0)).toBe('٠');
      expect(toArabicNumerals(1)).toBe('١');
      expect(toArabicNumerals(9)).toBe('٩');
    });

    it('should convert multi-digit numbers', () => {
      expect(toArabicNumerals(123)).toBe('١٢٣');
      expect(toArabicNumerals(1447)).toBe('١٤٤٧');
    });

    it('should handle string input', () => {
      expect(toArabicNumerals('2024')).toBe('٢٠٢٤');
    });

    it('should return empty string for null/undefined', () => {
      expect(toArabicNumerals(null)).toBe('');
      expect(toArabicNumerals(undefined)).toBe('');
    });

    it('should preserve non-digit characters', () => {
      expect(toArabicNumerals('12/07/1447')).toBe('١٢/٠٧/١٤٤٧');
    });
  });

  describe('formatHijriDate()', () => {
    it('should format DD/MM/YYYY in Arabic', () => {
      const result = formatHijriDate('28/7/1447', 'ar');
      expect(result).toBe('٢٨ / ٧ / ١٤٤٧');
    });

    it('should format DD/MM/YYYY in English', () => {
      const result = formatHijriDate('28/7/1447', 'en');
      expect(result).toBe('28/7/1447');
    });

    it('should format YYYY-MM-DD (ISO-like) in Arabic', () => {
      const result = formatHijriDate('1447-07-28', 'ar');
      expect(result).toBe('٢٨ / ٠٧ / ١٤٤٧');
    });

    it('should format YYYY-MM-DD in English', () => {
      const result = formatHijriDate('1447-07-28', 'en');
      expect(result).toBe('28/07/1447');
    });

    it('should format YYYY/MM/DD (convertToHijri output) in Arabic', () => {
      const result = formatHijriDate('1447/07/28', 'ar');
      expect(result).toBe('٢٨ / ٠٧ / ١٤٤٧');
    });

    it('should format YYYY/MM/DD (convertToHijri output) in English', () => {
      const result = formatHijriDate('1447/07/28', 'en');
      expect(result).toBe('28/07/1447');
    });

    it('should return empty string for null/undefined', () => {
      expect(formatHijriDate(null, 'ar')).toBe('');
      expect(formatHijriDate(undefined, 'en')).toBe('');
      expect(formatHijriDate('', 'ar')).toBe('');
    });

    it('should return original string for unparseable format in English', () => {
      expect(formatHijriDate('some-text', 'en')).toBe('some-text');
    });

    it('should convert unparseable format to Arabic numerals in Arabic locale', () => {
      expect(formatHijriDate('12345', 'ar')).toBe('١٢٣٤٥');
    });
  });

  describe('i18nMiddleware()', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        query: {},
        cookies: {},
        path: '/test'
      };
      res = {
        locals: {}
      };
      next = jest.fn();
    });

    it('should default to Arabic locale', async () => {
      await i18nMiddleware(req, res, next);

      expect(res.locals.locale).toBe('ar');
      expect(res.locals.isRTL).toBe(true);
      expect(next).toHaveBeenCalled();
    });

    it('should use query param lang if provided', async () => {
      req.query.lang = 'en';

      await i18nMiddleware(req, res, next);

      expect(res.locals.locale).toBe('en');
      expect(res.locals.isRTL).toBe(false);
    });

    it('should use cookie locale if no query param', async () => {
      req.cookies = { locale: 'en' };

      await i18nMiddleware(req, res, next);

      expect(res.locals.locale).toBe('en');
    });

    it('should fallback to Arabic for invalid locale', async () => {
      req.query.lang = 'fr';

      await i18nMiddleware(req, res, next);

      expect(res.locals.locale).toBe('ar');
    });

    it('should set currentPath', async () => {
      req.path = '/lectures/123';

      await i18nMiddleware(req, res, next);

      expect(res.locals.currentPath).toBe('/lectures/123');
    });

    it('should inject t() function', async () => {
      await i18nMiddleware(req, res, next);

      expect(typeof res.locals.t).toBe('function');
      expect(res.locals.t('nav_home')).toBe('الرئيسية');
    });

    it('should inject translateCategory function', async () => {
      await i18nMiddleware(req, res, next);

      expect(typeof res.locals.translateCategory).toBe('function');
      expect(res.locals.translateCategory('Aqeedah')).toBe('العقيدة');
    });

    it('should inject formatHijriDate function', async () => {
      await i18nMiddleware(req, res, next);

      expect(typeof res.locals.formatHijriDate).toBe('function');
    });

    it('should inject toArabicNumerals function', async () => {
      await i18nMiddleware(req, res, next);

      expect(res.locals.toArabicNumerals).toBe(toArabicNumerals);
    });

    it('should inject translations object for client-side use', async () => {
      await i18nMiddleware(req, res, next);

      expect(res.locals.translations).toBe(translations.ar);
    });

    it('should handle missing cookies gracefully', async () => {
      req.cookies = undefined;

      await i18nMiddleware(req, res, next);

      expect(res.locals.locale).toBe('ar');
      expect(next).toHaveBeenCalled();
    });
  });
});
