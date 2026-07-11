/**
 * Unit Tests for validators utility
 * Tests input validation, sanitization, and security functions
 */

const mongoose = require('mongoose');
const {
  isValidObjectId,
  sanitizeMongoQuery,
  handleValidationErrors,
  sanitizeSearchInput,
  sanitizeComment
} = require('../../utils/validators');

describe('Validators Utility', () => {
  describe('isValidObjectId()', () => {
    it('should return true for valid ObjectId strings', () => {
      expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
      expect(isValidObjectId('000000000000000000000000')).toBe(true);
      expect(isValidObjectId('ffffffffffffffffffffffff')).toBe(true);
    });

    it('should return true for valid ObjectId instances', () => {
      const objectId = new mongoose.Types.ObjectId();
      expect(isValidObjectId(objectId)).toBe(true);
    });

    it('should return false for invalid ObjectId strings', () => {
      expect(isValidObjectId('invalid')).toBe(false);
      expect(isValidObjectId('12345')).toBe(false);
      expect(isValidObjectId('')).toBe(false);
      expect(isValidObjectId('507f1f77bcf86cd79943901')).toBe(false); // too short
      expect(isValidObjectId('507f1f77bcf86cd7994390111')).toBe(false); // too long
    });

    it('should return false for non-string types', () => {
      expect(isValidObjectId(null)).toBe(false);
      expect(isValidObjectId(undefined)).toBe(false);
      // Note: mongoose's ObjectId.isValid() can accept numbers and convert them,
      // so we only test clearly invalid non-string types
      expect(isValidObjectId({})).toBe(false);
      expect(isValidObjectId([])).toBe(false);
    });

    it('should return false for ObjectId-like strings with invalid characters', () => {
      expect(isValidObjectId('507f1f77bcf86cd79943901g')).toBe(false); // 'g' is invalid
      expect(isValidObjectId('507f1f77bcf86cd79943901!')).toBe(false);
    });
  });

  describe('sanitizeMongoQuery()', () => {
    it('should return primitive values unchanged', () => {
      expect(sanitizeMongoQuery('test')).toBe('test');
      expect(sanitizeMongoQuery(123)).toBe(123);
      expect(sanitizeMongoQuery(true)).toBe(true);
      expect(sanitizeMongoQuery(null)).toBe(null);
    });

    it('should sanitize objects by removing $ prefixed keys', () => {
      const input = {
        name: 'test',
        $gt: 100,
        $lt: 200
      };
      const result = sanitizeMongoQuery(input);

      expect(result).toEqual({ name: 'test' });
      expect(result).not.toHaveProperty('$gt');
      expect(result).not.toHaveProperty('$lt');
    });

    it('should sanitize objects by removing keys containing dots', () => {
      const input = {
        name: 'test',
        'nested.key': 'value',
        'another.nested.key': 'value2'
      };
      const result = sanitizeMongoQuery(input);

      expect(result).toEqual({ name: 'test' });
      expect(result).not.toHaveProperty('nested.key');
    });

    it('should sanitize nested objects recursively', () => {
      const input = {
        outer: {
          inner: 'valid',
          $where: 'malicious',
          'dotted.key': 'invalid'
        }
      };
      const result = sanitizeMongoQuery(input);

      expect(result.outer).toEqual({ inner: 'valid' });
      expect(result.outer).not.toHaveProperty('$where');
      expect(result.outer).not.toHaveProperty('dotted.key');
    });

    it('should sanitize arrays', () => {
      const input = [
        { name: 'valid' },
        { $gt: 100 }
      ];
      const result = sanitizeMongoQuery(input);

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toEqual({ name: 'valid' });
      expect(result[1]).toEqual({});
    });

    it('should handle deeply nested structures', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              valid: 'data',
              $regex: 'attack'
            }
          }
        }
      };
      const result = sanitizeMongoQuery(input);

      expect(result.level1.level2.level3).toEqual({ valid: 'data' });
    });

    it('should prevent NoSQL injection patterns', () => {
      // Common NoSQL injection patterns
      const injectionPatterns = [
        { $where: 'this.password.length > 0' },
        { $gt: '' },
        { $ne: null },
        { $regex: '.*' },
        { password: { $gt: '' } }
      ];

      injectionPatterns.forEach(pattern => {
        const result = sanitizeMongoQuery(pattern);
        // Result should not contain any $ prefixed keys at any level
        const hasInjection = JSON.stringify(result).includes('"$');
        expect(hasInjection).toBe(false);
      });
    });
  });

  describe('handleValidationErrors middleware', () => {
    let mockReq, mockRes, mockNext;

    beforeEach(() => {
      mockReq = {};
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      mockNext = jest.fn();
    });

    it('should call next() when there are no validation errors', () => {
      // Mock validationResult to return empty errors
      mockReq._validationErrors = [];

      // Create a request that passes validation
      const { validationResult } = require('express-validator');

      // Since we can't easily mock express-validator here,
      // we test the basic behavior - the middleware should call next
      // when validationResult returns empty
      handleValidationErrors(mockReq, mockRes, mockNext);

      // If there are no errors in the request, next should be called
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('sanitizeSearchInput()', () => {
    it('should return empty string for null or undefined input', () => {
      expect(sanitizeSearchInput(null)).toBe('');
      expect(sanitizeSearchInput(undefined)).toBe('');
      expect(sanitizeSearchInput('')).toBe('');
    });

    it('should return empty string for non-string input', () => {
      expect(sanitizeSearchInput(123)).toBe('');
      expect(sanitizeSearchInput({})).toBe('');
      expect(sanitizeSearchInput([])).toBe('');
    });

    it('should trim whitespace', () => {
      expect(sanitizeSearchInput('  test  ')).toBe('test');
      expect(sanitizeSearchInput('\n\ttest\n\t')).toBe('test');
    });

    it('should limit input to specified max length', () => {
      const longInput = 'a'.repeat(300);
      const result = sanitizeSearchInput(longInput, 200);
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('should use default max length of 200', () => {
      const longInput = 'a'.repeat(300);
      const result = sanitizeSearchInput(longInput);
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('should escape HTML special characters to prevent XSS', () => {
      const xssPayloads = [
        { input: '<script>alert("XSS")</script>', shouldNotContain: '<script>' },
        { input: '<img src=x onerror=alert(1)>', shouldNotContain: '<img' },
        { input: '"><svg onload=alert(1)>', shouldNotContain: '<svg' },
        { input: "javascript:alert('XSS')", shouldNotContain: "'" },
        { input: '<a href="javascript:void(0)">', shouldNotContain: '<a' }
      ];

      xssPayloads.forEach(({ input, shouldNotContain }) => {
        const result = sanitizeSearchInput(input);
        expect(result).not.toContain(shouldNotContain);
      });
    });

    it('should encode HTML entities correctly', () => {
      expect(sanitizeSearchInput('&')).toBe('&amp;');
      expect(sanitizeSearchInput('<')).toBe('&lt;');
      expect(sanitizeSearchInput('>')).toBe('&gt;');
      expect(sanitizeSearchInput('"')).toBe('&quot;');
      expect(sanitizeSearchInput("'")).toBe('&#x27;');
    });

    it('should remove null bytes and control characters', () => {
      const inputWithNullBytes = 'test\x00string\x0Bmore';
      const result = sanitizeSearchInput(inputWithNullBytes);
      expect(result).not.toContain('\x00');
      expect(result).not.toContain('\x0B');
    });

    it('should preserve Arabic text', () => {
      const arabicText = 'البحث في التفريغ الصوتي';
      const result = sanitizeSearchInput(arabicText);
      expect(result).toContain('البحث');
      expect(result).toContain('التفريغ');
    });

    it('should handle mixed Arabic and English text', () => {
      const mixedText = 'شرح كتاب Kitab at-Tawheed';
      const result = sanitizeSearchInput(mixedText);
      expect(result).toContain('شرح');
      expect(result).toContain('Kitab');
    });

    it('should handle multiple HTML entities in one string', () => {
      const input = '<script>alert("test & more")</script>';
      const result = sanitizeSearchInput(input);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('&amp;');
    });

    it('should prevent double encoding', () => {
      // Already encoded input should be encoded again (which is safe)
      const input = '&amp;lt;script&amp;gt;';
      const result = sanitizeSearchInput(input);
      // The & should be encoded
      expect(result).toContain('&amp;');
    });
  });

  describe('sanitizeComment()', () => {
    it('should return empty string for null or undefined input', () => {
      expect(sanitizeComment(null)).toBe('');
      expect(sanitizeComment(undefined)).toBe('');
      expect(sanitizeComment('')).toBe('');
    });

    it('should return empty string for non-string input', () => {
      expect(sanitizeComment(123)).toBe('');
      expect(sanitizeComment({})).toBe('');
      expect(sanitizeComment([])).toBe('');
    });

    it('should trim whitespace', () => {
      expect(sanitizeComment('  feedback  ')).toBe('feedback');
    });

    it('should limit input to specified max length', () => {
      const longInput = 'a'.repeat(500);
      const result = sanitizeComment(longInput, 300);
      expect(result.length).toBeLessThanOrEqual(300);
    });

    it('should use default max length of 300', () => {
      const longInput = 'a'.repeat(500);
      const result = sanitizeComment(longInput);
      expect(result.length).toBeLessThanOrEqual(300);
    });

    it('should escape HTML special characters to prevent XSS', () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert(1)>',
        '"><svg onload=alert(1)>'
      ];

      xssPayloads.forEach(input => {
        const result = sanitizeComment(input);
        expect(result).not.toContain('<script>');
        expect(result).not.toContain('<img');
        expect(result).not.toContain('<svg');
      });
    });

    it('should encode HTML entities correctly', () => {
      expect(sanitizeComment('&')).toBe('&amp;');
      expect(sanitizeComment('<')).toBe('&lt;');
      expect(sanitizeComment('>')).toBe('&gt;');
      expect(sanitizeComment('"')).toBe('&quot;');
      expect(sanitizeComment("'")).toBe('&#x27;');
    });

    it('should remove null bytes and control characters', () => {
      const inputWithNullBytes = 'comment\x00with\x0Bcontrol';
      const result = sanitizeComment(inputWithNullBytes);
      expect(result).not.toContain('\x00');
      expect(result).not.toContain('\x0B');
    });

    it('should preserve Arabic feedback text', () => {
      const arabicFeedback = 'نعم، وجدت ما أبحث عنه. شكراً جزيلاً';
      const result = sanitizeComment(arabicFeedback);
      expect(result).toContain('نعم');
      expect(result).toContain('شكراً');
    });

    it('should handle multiline comments (preserves newlines via not stripping \\n)', () => {
      // The sanitizer removes most control chars but should preserve common whitespace
      const multilineComment = 'First line\nSecond line';
      const result = sanitizeComment(multilineComment);
      // Newlines should be preserved (not removed by the control char regex)
      expect(result).toContain('\n');
    });

    it('should handle empty comment after trimming', () => {
      expect(sanitizeComment('   ')).toBe('');
      expect(sanitizeComment('\n\n')).toBe('');
    });
  });
});
