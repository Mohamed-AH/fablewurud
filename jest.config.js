/**
 * Jest Configuration for Duroos Platform
 *
 * This configuration sets up Jest for unit and integration testing
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Coverage configuration
  collectCoverageFrom: [
    'models/**/*.js',
    'routes/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    'config/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**'
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 5,
      functions: 5,
      lines: 10,
      statements: 10
    }
  },

  // Test match patterns - exclude E2E tests (run separately with Playwright)
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/integration/**/*.test.js'
  ],

  // Transform ignore patterns for ESM modules
  transformIgnorePatterns: [
    'node_modules/(?!(music-metadata|strtok3|token-types|peek-readable|file-type)/)'
  ],

  // Setup files (runs before test files are imported - for env config)
  setupFiles: ['<rootDir>/tests/envSetup.js'],

  // Setup files after env (runs after Jest is loaded - for Jest-specific config)
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Timeout for tests (30 seconds)
  testTimeout: 30000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,

  // Coverage directory
  coverageDirectory: 'coverage',

  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/'
  ],

  // Module paths
  moduleDirectories: ['node_modules', '<rootDir>'],

  // Global setup/teardown - starts a single MongoMemoryServer shared across all tests
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
};
