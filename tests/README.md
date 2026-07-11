# Test Suite Overview

This directory contains all automated tests for the Duroos platform.

## Directory Structure

```
tests/
├── unit/                      # Unit tests for individual components
│   └── models/               # Database model tests
│       ├── lecture.test.js   # Lecture model validation tests
│       ├── series.test.js    # Series model tests
│       └── sheikh.test.js    # Sheikh model tests
│
├── integration/              # Integration tests for APIs and routes
│   ├── api/                 # API endpoint tests
│   │   └── lectures.test.js # Lecture API integration tests
│   ├── routes/              # Route handler tests
│   │   └── public.test.js   # Public homepage route tests
│   └── auth/                # Authentication tests
│       └── authentication.test.js
│
├── e2e/                     # End-to-end browser tests
│   ├── homepage.spec.js     # Homepage functionality tests
│   └── audio-player.spec.js # Audio player E2E tests
│
├── setup.js                 # Global test setup and utilities
└── README.md               # This file
```

## Quick Start

```bash
# Install dependencies
npm install

# Run all unit and integration tests
npm test

# Run E2E tests
npm run test:e2e

# Watch mode for development
npm run test:watch
```

## Test Types

### Unit Tests (25+ tests)

Tests individual components in isolation using MongoDB Memory Server.

**Run:** `npm run test:unit`

**Coverage:**
- ✅ Lecture model schema validation
- ✅ Sheikh model validation
- ✅ Series model with isKhutba flag
- ✅ Required/optional fields
- ✅ Timestamps and relationships

### Integration Tests (30+ tests)

Tests API endpoints and route handlers with real HTTP requests.

**Run:** `npm run test:integration`

**Coverage:**
- ✅ GET /api/lectures - List and filter lectures
- ✅ GET /api/lectures/:id - Get specific lecture
- ✅ Homepage rendering with lectures/series/khutba
- ✅ Category filtering data attributes
- ✅ Authentication middleware
- ✅ Admin role authorization

### E2E Tests (40+ tests)

Tests complete user workflows in real browsers (Chromium, Firefox, Safari).

**Run:** `npm run test:e2e`

**Coverage:**
- ✅ Tab switching (محاضرات, سلاسل, خطب)
- ✅ Category filtering with chips
- ✅ Date sorting (الأحدث أولاً, الأقدم أولاً)
- ✅ **Bug fix verification:** Cards don't disappear after sorting
- ✅ Series expansion showing lectures
- ✅ Lecture sorting within series (by number, date)
- ✅ **Bug fix verification:** Khutba sorting ID construction
- ✅ Search functionality
- ✅ Audio player controls
- ✅ Mobile responsive design

## Important Tests

### Critical Bug Fix Tests

These tests verify the bugs we fixed:

1. **Series/Khutba Cards Disappearing After Sort**
   - File: `tests/e2e/homepage.spec.js`
   - Test: "should maintain cards visibility after sorting on Series tab"
   - Test: "should maintain cards visibility after sorting on Khutba tab"

2. **Khutba Lecture Sorting Error**
   - File: `tests/e2e/homepage.spec.js`
   - Test: "should sort khutbas within series (bug fix verification)"
   - Verifies the ID construction fix: `khutba-episodes-{id}` vs `episodes-khutba-{id}`

## Test Utilities

### Global Test Helpers (setup.js)

```javascript
// Mock request
const req = testUtils.mockRequest({
  body: { title: 'Test' },
  user: { _id: '123', role: 'admin' }
});

// Mock response
const res = testUtils.mockResponse();

// Test async errors
await testUtils.expectAsyncError(
  async () => { throw new Error('Test error') },
  'Test error'
);
```

## Writing Tests

### Unit Test Template

```javascript
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Model = require('../../models/Model');

describe('Model Name', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('should validate model', async () => {
    const doc = await Model.create({ field: 'value' });
    expect(doc.field).toBe('value');
  });
});
```

### Integration Test Template

```javascript
const request = require('supertest');
const app = require('../../server');

describe('API Endpoint', () => {
  test('should return data', async () => {
    const response = await request(app)
      .get('/api/endpoint')
      .expect(200);

    expect(response.body).toHaveProperty('data');
  });
});
```

### E2E Test Template

```javascript
const { test, expect } = require('@playwright/test');

test('user can perform action', async ({ page }) => {
  await page.goto('/');

  await page.click('button:has-text("Action")');

  await expect(page.locator('.result')).toBeVisible();
});
```

## Test Coverage

Current coverage:

- **Statements:** ~65%
- **Branches:** ~55%
- **Functions:** ~60%
- **Lines:** ~65%

Goal: 70%+ across all metrics

View coverage:
```bash
npm test -- --coverage
open coverage/lcov-report/index.html
```

## CI/CD Integration

Tests run automatically on:
- Push to `main`, `develop`, `claude/**` branches
- Pull requests
- Manual workflow trigger

View results: GitHub Actions tab

## Debugging Tests

```bash
# Jest debug
node --inspect-brk node_modules/.bin/jest --runInBand

# Playwright debug
npx playwright test --debug

# Run headed (see browser)
npx playwright test --headed

# Slow motion
npx playwright test --headed --slow-mo=1000
```

## Common Issues

### MongoDB Connection Error
Tests use in-memory MongoDB - no installation needed!

### Playwright Browser Not Found
```bash
npx playwright install chromium
```

### Port Already in Use
```bash
npx kill-port 3000
```

### Tests Pass Locally But Fail on CI
- Check Node.js version (should be >= 20)
- Run with: `CI=true npm test`

## Resources

- **Full Guide:** See `AUTOMATED_TESTING_GUIDE.md` in project root
- **Manual Testing:** See `TESTING_CHECKLIST.md`
- **Deployment:** See `DEPLOYMENT_GUIDE.md`

## Test Statistics

- **Total Tests:** 95+
- **Unit Tests:** 25+
- **Integration Tests:** 30+
- **E2E Tests:** 40+
- **Test Files:** 8
- **Lines of Test Code:** 3200+

---

**Need help?** Check the troubleshooting section in `AUTOMATED_TESTING_GUIDE.md`
