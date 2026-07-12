/**
 * Unit tests for isMongoError classifier (code-audit finding H6).
 * Guards against re-widening the classifier to bare substrings like
 * 'connection'/'timeout', which would misclassify unrelated errors as DB
 * errors and let uncaughtException keep the process alive unsafely.
 */

const { isMongoError } = require('../../middleware/dbHealth');

describe('isMongoError()', () => {
  it('returns false for falsy input', () => {
    expect(isMongoError(null)).toBe(false);
    expect(isMongoError(undefined)).toBe(false);
  });

  describe('classifies real MongoDB errors as true', () => {
    it('by driver error name', () => {
      expect(isMongoError({ name: 'MongoNetworkError' })).toBe(true);
      expect(isMongoError({ name: 'MongoServerSelectionError' })).toBe(true);
      expect(isMongoError({ name: 'MongoNotConnectedError' })).toBe(true);
    });

    it('by network error code', () => {
      expect(isMongoError({ code: 'ECONNREFUSED' })).toBe(true);
      expect(isMongoError({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isMongoError({ code: 'ECONNRESET' })).toBe(true);
    });

    it('by specific Mongo/Mongoose availability phrases', () => {
      expect(isMongoError({ message: 'Operation buffering timed out after 10000ms' })).toBe(true);
      expect(isMongoError({ name: 'MongooseError', message: 'Server selection timed out' })).toBe(true);
      expect(isMongoError({ message: 'connection pool cleared' })).toBe(true);
      expect(isMongoError({ message: 'topology was destroyed' })).toBe(true);
    });
  });

  describe('does NOT misclassify unrelated errors (the H6 fix)', () => {
    it('generic message containing "connection"', () => {
      expect(isMongoError({ name: 'TypeError', message: 'Cannot read property connection of undefined' })).toBe(false);
    });

    it('generic message containing bare "timeout"', () => {
      expect(isMongoError({ name: 'Error', message: 'request timeout' })).toBe(false);
      expect(isMongoError({ name: 'Error', message: 'socket timeout waiting for upstream' })).toBe(false);
    });

    it('ordinary application errors', () => {
      expect(isMongoError({ name: 'ValidationError', message: 'Path `title` is required' })).toBe(false);
      expect(isMongoError(new TypeError('x is not a function'))).toBe(false);
    });
  });
});
