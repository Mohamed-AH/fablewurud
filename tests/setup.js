/**
 * Jest Test Setup (setupFilesAfterEnv)
 *
 * This file runs after Jest is loaded but before each test suite.
 * Environment variables are configured earlier in envSetup.js (setupFiles).
 */

// Increase timeout for MongoDB operations
jest.setTimeout(30000);

// Check if MongoDB is available
global.mongoDbAvailable = process.env.MONGODB_UNAVAILABLE !== 'true';

// Helper to skip tests that require MongoDB when it's not available
global.describeWithMongo = global.mongoDbAvailable ? describe : describe.skip;
global.itWithMongo = global.mongoDbAvailable ? it : it.skip;

// Global test utilities
global.testUtils = {
  // Helper to create mock request
  mockRequest: (options = {}) => ({
    body: {},
    params: {},
    query: {},
    headers: {},
    user: null,
    session: {},
    ...options
  }),

  // Helper to create mock response
  mockResponse: () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    res.render = jest.fn().mockReturnValue(res);
    res.redirect = jest.fn().mockReturnValue(res);
    res.cookie = jest.fn().mockReturnValue(res);
    res.clearCookie = jest.fn().mockReturnValue(res);
    return res;
  },

  // Helper for async error testing
  expectAsyncError: async (fn, errorMessage) => {
    try {
      await fn();
      throw new Error('Expected function to throw an error');
    } catch (error) {
      if (errorMessage) {
        expect(error.message).toMatch(errorMessage);
      }
    }
  }
};

// Suppress console logs during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };
