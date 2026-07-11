# Automated Testing Guide for Duroos Platform

This guide explains how to run and maintain automated tests for the Duroos Islamic lectures platform.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Running Tests](#running-tests)
5. [Test Types](#test-types)
6. [Writing Tests](#writing-tests)
7. [Continuous Integration](#continuous-integration)
8. [Troubleshooting](#troubleshooting)

----

## Overview

The Duroos platform uses a comprehensive testing strategy with three types of tests:

1. **Unit Tests** - Test individual components (models, utilities)
2. **Integration Tests** - Test API endpoints and routes
3. **E2E Tests** - Test complete user workflows in a real browser

**Testing Stack:**
- **Jest** - Unit and integration testing framework
- **Supertest** - HTTP assertion library for API testing
- **MongoDB Memory Server** - In-memory database for tests
- **Playwright** - End-to-end testing in real browsers
- **GitHub Actions** - Continuous integration

---

## Prerequisites

Before running tests, ensure you have:

- Node.js >= 20.0.0
- npm >= 9.0.0
- Git

---

## Installation

### 1. Install Dependencies

```bash
# Install all dependencies (including test dependencies)
npm install
```

### 2. Install Playwright Browsers (for E2E tests)

```bash
# Install Playwright browsers
npx playwright install

# Or install only Chromium for faster setup
npx playwright install chromium
```

### 3. Create Test Environment File

```bash
# Copy test environment template
cp .env.test .env.test.local

# Edit if needed (usually defaults are fine)
nano .env.test.local
```

---

## Running Tests

### Quick Start - Run All Tests

```bash
# Run all unit and integration tests
npm test

# Run all tests with coverage report
npm test -- --coverage
```

### Run Specific Test Types

```bash
# Unit tests only (models, utilities)
npm run test:unit

# Integration tests only (API endpoints)
npm run test:integration

# E2E tests (browser-based)
npm run test:e2e

# E2E tests with interactive UI
npm run test:e2e:ui
```

### Run Tests in Watch Mode

```bash
# Watch mode - re-runs tests when files change
npm run test:watch
```

### Run Specific Test Files

```bash
# Run specific test file
npx jest tests/unit/models/lecture.test.js

# Run tests matching pattern
npx jest --testNamePattern="should create"

# Run E2E test file
npx playwright test tests/e2e/homepage.spec.js
```

### Run with Different Options

```bash
# Verbose output
npm test -- --verbose

# Show coverage summary
npm test -- --coverage

# Run in CI mode (no watch, exit after completion)
npm run test:ci

# Run only failed tests from last run
npx jest --onlyFailures
```

### Save Test Logs to File

Automatically save test output to timestamped log files:

```bash
# Run tests and save log (shows output + saves to file)
npm run test:log

# Run tests and save log (only saves to file, no console output)
npm run test:log:all

# Run unit tests and save log
npm run test:unit:log

# Run integration tests and save log
npm run test:integration:log

# Run E2E tests and save log
npm run test:e2e:log
```

**Log files are saved to:** `test-logs/`

**File naming format:** `test-YYYYMMDD-HHMMSS.log`

**Example:** `test-logs/test-20240127-143052.log`

**Manual logging:**
```bash
# Custom log filename
npm test 2>&1 | tee test-logs/my-custom-test.log

# Save to file only (no console output)
npm test > test-logs/my-test.log 2>&1

# Append to existing log
npm test 2>&1 | tee -a test-logs/existing.log
```

**View logs:**
```bash
# List all logs
ls -lh test-logs/

# View latest log
cat test-logs/test-*.log | tail -100

# Search for failures
grep -r "FAIL" test-logs/

# Clean up old logs (removes logs older than 14 days)
./scripts/clean-test-logs.sh
```

📖 **Detailed logging guide:** See `test-logs/README.md`

---

## Test Types

### 1. Unit Tests (`tests/unit/`)

Test individual components in isolation.

**Location:** `tests/unit/models/`

**What's tested:**
- Mongoose model schemas
- Model validations
- Required/optional fields
- Timestamps
- Data relationships

**Example:**

```javascript
// tests/unit/models/lecture.test.js
it('should create a valid lecture with required fields', async () => {
  const sheikh = await Sheikh.create({
    name: 'Test Sheikh',
    bio: 'Test bio'
  });

  const lecture = await Lecture.create({
    title: 'Test Lecture',
    sheikh: sheikh._id,
    audioFile: '/uploads/test.mp3',
    dateRecorded: new Date('2024-01-01')
  });

  expect(lecture.title).toBe('Test Lecture');
  expect(lecture.sheikh.toString()).toBe(sheikh._id.toString());
});
```

**Run unit tests:**
```bash
npm run test:unit
```

### 2. Integration Tests (`tests/integration/`)

Test how different parts of the application work together.

**Location:**
- `tests/integration/api/` - API endpoint tests
- `tests/integration/routes/` - Route handler tests
- `tests/integration/auth/` - Authentication tests

**What's tested:**
- API endpoints return correct responses
- Database queries work correctly
- Authentication and authorization
- Error handling
- Request/response validation

**Example:**

```javascript
// tests/integration/api/lectures.test.js
it('should return all lectures', async () => {
  const sheikh = await Sheikh.create({
    name: 'Test Sheikh',
    bio: 'Test bio'
  });

  await Lecture.create({
    title: 'Lecture 1',
    sheikh: sheikh._id,
    audioFile: '/uploads/test1.mp3'
  });

  const response = await request(app)
    .get('/api/lectures')
    .expect(200);

  expect(response.body).toHaveLength(1);
  expect(response.body[0]).toHaveProperty('title', 'Lecture 1');
});
```

**Run integration tests:**
```bash
npm run test:integration
```

### 3. End-to-End (E2E) Tests (`tests/e2e/`)

Test complete user workflows in real browsers.

**Location:** `tests/e2e/`

**What's tested:**
- Homepage loads correctly
- Tab switching works
- Search and filtering
- Date sorting (including the fixes we made!)
- Series expansion
- Lecture sorting within series
- Khutba sorting (bug fix verification)
- Audio player functionality
- Mobile responsiveness

**Example:**

```javascript
// tests/e2e/homepage.spec.js
test('should maintain cards visibility after sorting on Series tab', async ({ page }) => {
  await page.goto('/');

  // Switch to Series tab
  await page.click('text=سلاسل');
  await page.waitForTimeout(300);

  // Get initial card count
  const cardsBefore = page.locator('.series-card:visible');
  const countBefore = await cardsBefore.count();

  // Sort by newest
  await page.click('button:has-text("الأحدث أولاً")');
  await page.waitForTimeout(500);

  // Verify cards are still visible (this was the bug we fixed!)
  const cardsAfter = page.locator('.series-card:visible');
  const countAfter = await cardsAfter.count();

  expect(countAfter).toBe(countBefore);
  expect(countAfter).toBeGreaterThan(0);
});
```

**Run E2E tests:**
```bash
# Run all E2E tests
npm run test:e2e

# Run with interactive UI
npm run test:e2e:ui

# Run only on Chromium
npx playwright test --project=chromium

# Run specific test file
npx playwright test tests/e2e/homepage.spec.js

# Debug mode (opens browser with DevTools)
npx playwright test --debug
```

---

## Writing Tests

### Best Practices

1. **Descriptive Test Names**
   ```javascript
   // Good
   test('should maintain card visibility after sorting on Khutba tab', ...)

   // Bad
   test('test sorting', ...)
   ```

2. **Arrange-Act-Assert Pattern**
   ```javascript
   test('should filter by category', async () => {
     // Arrange - Set up test data
     const sheikh = await Sheikh.create({ name: 'Test' });

     // Act - Perform action
     const response = await request(app).get('/api/lectures?category=عقيدة');

     // Assert - Verify result
     expect(response.status).toBe(200);
   });
   ```

3. **Clean Up After Tests**
   ```javascript
   afterEach(async () => {
     await Lecture.deleteMany({});
     await Sheikh.deleteMany({});
   });
   ```

4. **Test Edge Cases**
   ```javascript
   test('should handle empty results', async () => {
     const response = await request(app).get('/api/lectures');
     expect(response.body).toEqual([]);
   });

   test('should return 404 for non-existent ID', async () => {
     const fakeId = new mongoose.Types.ObjectId();
     await request(app).get(`/api/lectures/${fakeId}`).expect(404);
   });
   ```

### Adding New Unit Tests

1. Create test file: `tests/unit/path/to/module.test.js`
2. Import module to test
3. Write test cases
4. Run: `npm run test:unit`

```javascript
// tests/unit/utils/dateUtils.test.js
const { formatHijriDate } = require('../../../utils/dateUtils');

describe('Date Utilities', () => {
  test('should format Hijri date correctly', () => {
    const result = formatHijriDate('1445/07/15');
    expect(result).toBeTruthy();
  });
});
```

### Adding New Integration Tests

1. Create test file: `tests/integration/api/endpoint.test.js`
2. Set up Express app and database
3. Write API tests using Supertest
4. Run: `npm run test:integration`

```javascript
// tests/integration/api/sheikhs.test.js
const request = require('supertest');
const app = require('../../../server'); // Your Express app

describe('Sheikh API', () => {
  test('GET /api/sheikhs should return all sheikhs', async () => {
    const response = await request(app)
      .get('/api/sheikhs')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });
});
```

### Adding New E2E Tests

1. Create test file: `tests/e2e/feature.spec.js`
2. Write user workflow tests
3. Run: `npm run test:e2e`

```javascript
// tests/e2e/admin.spec.js
const { test, expect } = require('@playwright/test');

test('admin can create new lecture', async ({ page }) => {
  await page.goto('/admin/lectures/new');
  await page.fill('input[name="title"]', 'New Lecture');
  await page.click('button[type="submit"]');

  await expect(page.locator('text=Lecture created successfully')).toBeVisible();
});
```

---

## Continuous Integration

Tests run automatically on GitHub Actions when you:
- Push to `main`, `develop`, or `claude/**` branches
- Create a pull request
- Manually trigger workflow

### Workflow Overview

The CI pipeline includes:

1. **Unit & Integration Tests** - Jest tests with coverage
2. **E2E Tests** - Playwright tests on Chromium
3. **Code Quality** - Check for console.logs and large files
4. **Security Audit** - npm audit for vulnerabilities
5. **Build Test** - Verify production build works

### View Test Results

1. Go to GitHub repository
2. Click "Actions" tab
3. Click on a workflow run
4. View test results and artifacts

### Test Artifacts

After E2E tests run, you can download:
- Playwright HTML report
- Screenshots of failed tests
- Videos of test runs
- Test result JSON

### Local CI Simulation

Run the same tests as CI locally:

```bash
# Run CI test suite
npm run test:ci

# This runs:
# - npm run test:unit
# - npm run test:integration
```

---

## Troubleshooting

### Common Issues

#### 1. MongoDB Connection Errors

**Problem:** Tests fail with "MongoError: Connection refused"

**Solution:**
```bash
# The tests use mongodb-memory-server (in-memory)
# No MongoDB installation needed!

# If still having issues, clear npm cache
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

#### 2. Playwright Browser Not Found

**Problem:** "Browser not found" or "chromium not installed"

**Solution:**
```bash
# Install Playwright browsers
npx playwright install chromium

# Or install all browsers
npx playwright install
```

#### 3. E2E Tests Timeout

**Problem:** E2E tests timeout waiting for page

**Solution:**
```bash
# Increase timeout in playwright.config.js
# Or run with specific timeout:
npx playwright test --timeout=60000
```

#### 4. Port Already in Use

**Problem:** "Port 3000 already in use"

**Solution:**
```bash
# Kill process on port 3000
npx kill-port 3000

# Or change test port in .env.test
PORT=3001
```

#### 5. Tests Pass Locally But Fail on CI

**Problem:** Tests work on your machine but not on GitHub Actions

**Possible causes:**
- Environment variables not set in GitHub Secrets
- Different Node.js version
- Timing issues (add wait statements)
- File system differences (case sensitivity)

**Solution:**
```bash
# Check Node.js version matches
node --version # Should be >= 20

# Run in CI mode locally
CI=true npm test

# Check for console errors in E2E tests
npx playwright test --headed
```

### Debug Mode

#### Jest Debug

```bash
# Run Jest in debug mode
node --inspect-brk node_modules/.bin/jest --runInBand

# Then open: chrome://inspect in Chrome
```

#### Playwright Debug

```bash
# Run with Playwright Inspector
npx playwright test --debug

# Run headed (see browser)
npx playwright test --headed

# Slow down actions
npx playwright test --headed --slow-mo=1000
```

### Test Coverage

```bash
# Generate coverage report
npm test -- --coverage

# View HTML coverage report
open coverage/lcov-report/index.html

# Coverage by file
npm test -- --coverage --verbose
```

---

## Test Metrics

### Current Test Coverage

- **Unit Tests:** 25+ tests across 3 models
- **Integration Tests:** 30+ tests across API endpoints
- **E2E Tests:** 40+ tests covering critical user workflows

### Coverage Goals

- **Statements:** > 70%
- **Branches:** > 60%
- **Functions:** > 70%
- **Lines:** > 70%

### Running Coverage

```bash
# Full coverage report
npm test -- --coverage

# Coverage for specific file
npx jest --coverage --collectCoverageFrom=models/Lecture.js
```

---

## Useful Commands Cheat Sheet

```bash
# Development
npm run test:watch              # Watch mode - auto-run tests
npm test -- --verbose           # Detailed output
npm test -- --silent            # Minimal output

# Specific tests
npx jest lecture.test.js        # Run one test file
npx jest --testNamePattern="should create"  # Run matching tests
npx playwright test homepage    # Run E2E tests matching "homepage"

# Coverage
npm test -- --coverage          # Generate coverage
npm test -- --coverage --watchAll=false  # Coverage without watch

# Debug
npx jest --debug                # Jest debug mode
npx playwright test --debug     # Playwright inspector
npx playwright test --headed    # Show browser

# CI
npm run test:ci                 # Run like CI pipeline
CI=true npm test                # Simulate CI environment

# Cleanup
npx jest --clearCache           # Clear Jest cache
rm -rf node_modules && npm install  # Fresh install
```

---

## Next Steps

1. **Run tests locally** to verify everything works
2. **Review test files** to understand coverage
3. **Add tests** for new features you develop
4. **Check CI results** after pushing code
5. **Maintain > 70% coverage** as you add features

---

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Playwright Documentation](https://playwright.dev/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [MongoDB Memory Server](https://github.com/nodkz/mongodb-memory-server)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

---

## Support

If you encounter issues with tests:

1. Check this guide's troubleshooting section
2. Review test output for specific errors
3. Check GitHub Actions logs for CI failures
4. Verify environment configuration in `.env.test`

---

**Happy Testing! 🧪**

Remember: **Good tests = confident deployments!**
