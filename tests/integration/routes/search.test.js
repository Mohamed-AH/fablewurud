/**
 * Integration Tests for Search Routes
 * Tests search functionality, sanitization, and feedback collection
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

// Mock ObjectId generator
const mockObjectId = () => new mongoose.Types.ObjectId();

// Mock data
const mockSearchLogId = mockObjectId();
const mockLectureId = mockObjectId();

// Build chainable mock for Mongoose queries
function buildChainableMock(resolveValue) {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(resolveValue)
  };
  return chain;
}

// Mock the models
jest.mock('../../../models', () => {
  return {
    Transcript: {
      find: jest.fn(),
      aggregate: jest.fn()
    },
    SearchLog: {
      create: jest.fn(),
      findByIdAndUpdate: jest.fn()
    }
  };
});

const { Transcript, SearchLog } = require('../../../models');

// Get cache for testing
const cache = require('../../../utils/cache');

// Set up app with the search router
let app;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Mock render function for EJS templates
  app.use((req, res, next) => {
    res.render = (view, data) => {
      res.json({ view, ...data });
    };
    next();
  });

  const searchRouter = require('../../../routes/search');
  app.use('/search', searchRouter);
});

beforeEach(() => {
  jest.clearAllMocks();

  // Clear cache before each test
  cache.clear();

  // Default mock for SearchLog.create
  SearchLog.create.mockResolvedValue({
    _id: mockSearchLogId,
    query: 'test',
    normalizedQuery: 'test',
    resultCount: 0,
    topLectureIds: [],
    searchMode: 'atlas'
  });

  // Default mock for SearchLog.findByIdAndUpdate
  SearchLog.findByIdAndUpdate.mockResolvedValue({
    _id: mockSearchLogId,
    relevant: true,
    relevantAt: new Date(),
    comment: 'Test comment'
  });

  // Default mock for Transcript.aggregate (Atlas search)
  Transcript.aggregate.mockResolvedValue([]);

  // Default mock for Transcript.find (used in enrichWithContext)
  Transcript.find.mockReturnValue(buildChainableMock([]));
});

afterEach(async () => {
  // Wait for any pending setImmediate callbacks (async logging)
  await new Promise(resolve => setImmediate(resolve));
});

// ============================================================
// GET /search - Search Page (Decommissioned - Redirects to Homepage)
// ============================================================
describe('GET /search', () => {
  it('should redirect to homepage (search consolidated on homepage)', async () => {
    const res = await request(app)
      .get('/search')
      .expect(301);

    expect(res.headers.location).toBe('/');
  });

  it('should redirect to homepage with search query parameter', async () => {
    const res = await request(app)
      .get('/search')
      .query({ q: 'test query' })
      .expect(301);

    expect(res.headers.location).toBe('/?search=test%20query');
  });
});

// ============================================================
// GET /search/results - Search Results (Decommissioned - Redirects to Homepage)
// ============================================================
describe('GET /search/results', () => {
  it('should redirect to homepage with search query', async () => {
    const res = await request(app)
      .get('/search/results')
      .query({ q: 'test query' })
      .expect(301);

    expect(res.headers.location).toBe('/?search=test%20query');
  });

  it('should redirect to homepage for empty query', async () => {
    const res = await request(app)
      .get('/search/results')
      .query({ q: '' })
      .expect(301);

    expect(res.headers.location).toBe('/');
  });

  it('should redirect Arabic queries correctly', async () => {
    const arabicQuery = 'البحث في التفريغ';

    const res = await request(app)
      .get('/search/results')
      .query({ q: arabicQuery })
      .expect(301);

    // Should redirect with URL-encoded Arabic query
    expect(res.headers.location).toContain('?search=');
  });
});

// ============================================================
// GET /search/api - JSON Search API
// ============================================================
describe('GET /search/api', () => {
  it('should return JSON response', async () => {
    Transcript.aggregate.mockResolvedValue([]);

    const res = await request(app)
      .get('/search/api')
      .query({ q: 'test' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.results).toBeDefined();
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('should sanitize search query to prevent XSS', async () => {
    const xssPayload = '<script>alert("XSS")</script>';

    const res = await request(app)
      .get('/search/api')
      .query({ q: xssPayload })
      .expect(200);

    expect(res.body.query).not.toContain('<script>');
    expect(res.body.query).toContain('&lt;script&gt;');
  });

  it('should handle empty query gracefully', async () => {
    const res = await request(app)
      .get('/search/api')
      .query({ q: '' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.results).toEqual([]);
    expect(res.body.searchLogId).toBeNull();
  });

  it('should return searchLogId for logging', async () => {
    Transcript.aggregate.mockResolvedValue([]);

    const res = await request(app)
      .get('/search/api')
      .query({ q: 'test' })
      .expect(200);

    expect(res.body.searchLogId).toBeDefined();
  });

  it('should include resultCount in response', async () => {
    const mockResults = [
      { _id: mockLectureId, lectureId: mockLectureId, startTimeSec: 100, text: 'Test result', lectureTitle: 'Test Lecture' }
    ];
    Transcript.aggregate.mockResolvedValue(mockResults);

    const res = await request(app)
      .get('/search/api')
      .query({ q: 'test' })
      .expect(200);

    expect(res.body.resultCount).toBeDefined();
  });
});

// ============================================================
// POST /search/feedback - Feedback Submission
// ============================================================
describe('POST /search/feedback', () => {
  it('should accept valid feedback with relevant=true', async () => {
    const res = await request(app)
      .post('/search/feedback')
      .send({
        logId: mockSearchLogId.toString(),
        relevant: true
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(SearchLog.findByIdAndUpdate).toHaveBeenCalledWith(
      mockSearchLogId.toString(),
      expect.objectContaining({ relevant: true }),
      { new: true }
    );
  });

  it('should accept valid feedback with relevant=false', async () => {
    const res = await request(app)
      .post('/search/feedback')
      .send({
        logId: mockSearchLogId.toString(),
        relevant: false
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(SearchLog.findByIdAndUpdate).toHaveBeenCalledWith(
      mockSearchLogId.toString(),
      expect.objectContaining({ relevant: false }),
      { new: true }
    );
  });

  it('should accept string boolean values for relevant', async () => {
    const res = await request(app)
      .post('/search/feedback')
      .send({
        logId: mockSearchLogId.toString(),
        relevant: 'true'
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(SearchLog.findByIdAndUpdate).toHaveBeenCalledWith(
      mockSearchLogId.toString(),
      expect.objectContaining({ relevant: true }),
      { new: true }
    );
  });

  it('should sanitize comment to prevent XSS', async () => {
    const xssComment = '<script>alert("XSS")</script>';

    const res = await request(app)
      .post('/search/feedback')
      .send({
        logId: mockSearchLogId.toString(),
        relevant: true,
        comment: xssComment
      })
      .expect(200);

    expect(res.body.success).toBe(true);

    // Check that the comment passed to update was sanitized
    const updateCall = SearchLog.findByIdAndUpdate.mock.calls[0];
    const updateData = updateCall[1];
    expect(updateData.comment).not.toContain('<script>');
    expect(updateData.comment).toContain('&lt;script&gt;');
  });

  it('should truncate overly long comments', async () => {
    const longComment = 'أ'.repeat(500);

    const res = await request(app)
      .post('/search/feedback')
      .send({
        logId: mockSearchLogId.toString(),
        relevant: true,
        comment: longComment
      })
      .expect(200);

    expect(res.body.success).toBe(true);

    const updateCall = SearchLog.findByIdAndUpdate.mock.calls[0];
    const updateData = updateCall[1];
    expect(updateData.comment.length).toBeLessThanOrEqual(300);
  });

  it('should reject invalid logId format', async () => {
    const res = await request(app)
      .post('/search/feedback')
      .send({
        logId: 'invalid-id',
        relevant: true
      })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  it('should reject missing logId', async () => {
    const res = await request(app)
      .post('/search/feedback')
      .send({
        relevant: true
      })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  it('should reject missing relevant field', async () => {
    const res = await request(app)
      .post('/search/feedback')
      .send({
        logId: mockSearchLogId.toString()
      })
      .expect(400);

    expect(res.body.error).toBeDefined();
  });

  it('should handle optional comment field', async () => {
    const res = await request(app)
      .post('/search/feedback')
      .send({
        logId: mockSearchLogId.toString(),
        relevant: true
        // No comment
      })
      .expect(200);

    expect(res.body.success).toBe(true);

    const updateCall = SearchLog.findByIdAndUpdate.mock.calls[0];
    const updateData = updateCall[1];
    expect(updateData.comment).toBeUndefined();
  });

  it('should preserve Arabic feedback comments', async () => {
    const arabicComment = 'نعم، النتائج مفيدة جداً. شكراً لكم';

    const res = await request(app)
      .post('/search/feedback')
      .send({
        logId: mockSearchLogId.toString(),
        relevant: true,
        comment: arabicComment
      })
      .expect(200);

    expect(res.body.success).toBe(true);

    const updateCall = SearchLog.findByIdAndUpdate.mock.calls[0];
    const updateData = updateCall[1];
    expect(updateData.comment).toContain('نعم');
    expect(updateData.comment).toContain('شكراً');
  });

  it('should handle empty comment string', async () => {
    const res = await request(app)
      .post('/search/feedback')
      .send({
        logId: mockSearchLogId.toString(),
        relevant: true,
        comment: ''
      })
      .expect(200);

    expect(res.body.success).toBe(true);

    const updateCall = SearchLog.findByIdAndUpdate.mock.calls[0];
    const updateData = updateCall[1];
    // Empty string after trim becomes undefined
    expect(updateData.comment).toBeUndefined();
  });

  it('should set relevantAt timestamp', async () => {
    const res = await request(app)
      .post('/search/feedback')
      .send({
        logId: mockSearchLogId.toString(),
        relevant: true
      })
      .expect(200);

    const updateCall = SearchLog.findByIdAndUpdate.mock.calls[0];
    const updateData = updateCall[1];
    expect(updateData.relevantAt).toBeInstanceOf(Date);
  });

  it('should handle database errors gracefully', async () => {
    SearchLog.findByIdAndUpdate.mockRejectedValue(new Error('DB connection failed'));

    const res = await request(app)
      .post('/search/feedback')
      .send({
        logId: mockSearchLogId.toString(),
        relevant: true
      })
      .expect(500);

    expect(res.body.error).toBeDefined();
  });
});

// ============================================================
// Security Tests
// ============================================================
describe('Search Security', () => {
  describe('XSS Prevention', () => {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert(1)>',
      '"><svg onload=alert(1)>',
      "javascript:alert('XSS')",
      '<iframe src="javascript:alert(1)">',
      '<body onload=alert(1)>',
      '<input onfocus=alert(1) autofocus>',
      '{{constructor.constructor("alert(1)")()}}',
      '${alert(1)}'
    ];

    xssPayloads.forEach(payload => {
      it(`should sanitize XSS payload in search: ${payload.substring(0, 30)}...`, async () => {
        const res = await request(app)
          .get('/search/api')
          .query({ q: payload })
          .expect(200);

        // HTML tags should be encoded - the key security feature
        expect(res.body.query).not.toContain('<script');
        expect(res.body.query).not.toContain('<img');
        expect(res.body.query).not.toContain('<svg');
        expect(res.body.query).not.toContain('<iframe');
        expect(res.body.query).not.toContain('<body');
        expect(res.body.query).not.toContain('<input');
      });
    });

    xssPayloads.forEach(payload => {
      it(`should sanitize XSS payload in feedback comment: ${payload.substring(0, 30)}...`, async () => {
        await request(app)
          .post('/search/feedback')
          .send({
            logId: mockSearchLogId.toString(),
            relevant: true,
            comment: payload
          })
          .expect(200);

        const updateCall = SearchLog.findByIdAndUpdate.mock.calls[0];
        const updateData = updateCall[1];
        // HTML tags should be encoded - the key security feature
        expect(updateData.comment).not.toContain('<script');
        expect(updateData.comment).not.toContain('<img');
        expect(updateData.comment).not.toContain('<svg');
        expect(updateData.comment).not.toContain('<iframe');
        expect(updateData.comment).not.toContain('<body');
        expect(updateData.comment).not.toContain('<input');
      });
    });
  });

  describe('Input Validation', () => {
    it('should reject ObjectId injection attempts in feedback', async () => {
      const injectionAttempts = [
        { $gt: '' },
        { $ne: null },
        '{"$gt": ""}',
        '../../../etc/passwd'
      ];

      for (const attempt of injectionAttempts) {
        const res = await request(app)
          .post('/search/feedback')
          .send({
            logId: attempt,
            relevant: true
          })
          .expect(400);

        expect(res.body.error).toBeDefined();
      }
    });

    it('should handle null bytes in search query', async () => {
      const queryWithNullBytes = 'test\x00string';

      const res = await request(app)
        .get('/search/api')
        .query({ q: queryWithNullBytes })
        .expect(200);

      expect(res.body.query).not.toContain('\x00');
    });

    it('should handle control characters in comment', async () => {
      const commentWithControlChars = 'test\x00\x0B\x0Cstring';

      await request(app)
        .post('/search/feedback')
        .send({
          logId: mockSearchLogId.toString(),
          relevant: true,
          comment: commentWithControlChars
        })
        .expect(200);

      const updateCall = SearchLog.findByIdAndUpdate.mock.calls[0];
      const updateData = updateCall[1];
      expect(updateData.comment).not.toContain('\x00');
      expect(updateData.comment).not.toContain('\x0B');
    });
  });
});

// ============================================================
// Cache Behavior Tests
// ============================================================
describe('Search Cache', () => {
  it('should cache search results and return from cache on second request', async () => {
    const mockResults = [
      { _id: mockLectureId, lectureId: mockLectureId, startTimeSec: 100, text: 'Test result', lectureTitle: 'Test Lecture' }
    ];
    Transcript.aggregate.mockResolvedValue(mockResults);

    // First request - should hit database (2 aggregate calls: search + enrichWithContext)
    const res1 = await request(app)
      .get('/search/api')
      .query({ q: 'cache test' })
      .expect(200);

    expect(res1.body.success).toBe(true);
    const firstCallCount = Transcript.aggregate.mock.calls.length;
    expect(firstCallCount).toBeGreaterThanOrEqual(1);

    // Second request with same query - should hit cache
    const res2 = await request(app)
      .get('/search/api')
      .query({ q: 'cache test' })
      .expect(200);

    expect(res2.body.success).toBe(true);
    // Should have same call count (cache hit, no new DB query)
    expect(Transcript.aggregate).toHaveBeenCalledTimes(firstCallCount);
  });

  it('should cache normalized query (case insensitive)', async () => {
    Transcript.aggregate.mockResolvedValue([]);

    // First request with mixed case
    await request(app)
      .get('/search/api')
      .query({ q: 'Test Query' })
      .expect(200);

    const firstCallCount = Transcript.aggregate.mock.calls.length;
    expect(firstCallCount).toBeGreaterThanOrEqual(1);

    // Second request different case - should hit cache
    await request(app)
      .get('/search/api')
      .query({ q: 'test query' })
      .expect(200);

    // Should have same call count (cache hit)
    expect(Transcript.aggregate).toHaveBeenCalledTimes(firstCallCount);
  });

  it('should return different searchLogId for each request (even cached)', async () => {
    Transcript.aggregate.mockResolvedValue([]);

    const res1 = await request(app)
      .get('/search/api')
      .query({ q: 'unique log test' })
      .expect(200);

    const res2 = await request(app)
      .get('/search/api')
      .query({ q: 'unique log test' })
      .expect(200);

    // Each request should have a different searchLogId for accurate analytics
    expect(res1.body.searchLogId).toBeDefined();
    expect(res2.body.searchLogId).toBeDefined();
    expect(res1.body.searchLogId).not.toBe(res2.body.searchLogId);
  });

  it('should have valid ObjectId format for searchLogId', async () => {
    Transcript.aggregate.mockResolvedValue([]);

    const res = await request(app)
      .get('/search/api')
      .query({ q: 'objectid test' })
      .expect(200);

    expect(res.body.searchLogId).toBeDefined();
    expect(mongoose.Types.ObjectId.isValid(res.body.searchLogId)).toBe(true);
  });

  it('should not cache empty queries', async () => {
    const res = await request(app)
      .get('/search/api')
      .query({ q: '' })
      .expect(200);

    expect(res.body.results).toEqual([]);
    expect(res.body.searchLogId).toBeNull();
    // Ensure we didn't try to cache or search
    expect(Transcript.aggregate).not.toHaveBeenCalled();
  });
});

// ============================================================
// Async Logging Tests
// ============================================================
describe('Async Search Logging', () => {
  it('should create search log with pre-generated ObjectId', async () => {
    Transcript.aggregate.mockResolvedValue([]);

    const res = await request(app)
      .get('/search/api')
      .query({ q: 'async log test' })
      .expect(200);

    // Wait for setImmediate to complete
    await new Promise(resolve => setImmediate(resolve));

    expect(SearchLog.create).toHaveBeenCalled();
    const createCall = SearchLog.create.mock.calls[0][0];

    // Verify pre-generated _id was passed
    expect(createCall._id).toBeDefined();
    expect(createCall._id.toString()).toBe(res.body.searchLogId);
  });

  it('should log search asynchronously without blocking response', async () => {
    // Make SearchLog.create slow to verify response isn't blocked
    SearchLog.create.mockImplementation(() =>
      new Promise(resolve => setTimeout(() => resolve({ _id: mockSearchLogId }), 100))
    );

    Transcript.aggregate.mockResolvedValue([]);

    const startTime = Date.now();
    const res = await request(app)
      .get('/search/api')
      .query({ q: 'async test' })
      .expect(200);
    const responseTime = Date.now() - startTime;

    expect(res.body.success).toBe(true);
    // Response should return quickly (not wait for 100ms SearchLog.create)
    expect(responseTime).toBeLessThan(100);
  });

  it('should handle SearchLog.create failure gracefully', async () => {
    SearchLog.create.mockRejectedValue(new Error('DB connection failed'));
    Transcript.aggregate.mockResolvedValue([]);

    // Should not throw - error is caught in setImmediate
    const res = await request(app)
      .get('/search/api')
      .query({ q: 'error test' })
      .expect(200);

    expect(res.body.success).toBe(true);

    // Wait for setImmediate to complete (where error is caught)
    await new Promise(resolve => setImmediate(resolve));
  });

  it('should log correct normalized query', async () => {
    const mockResults = [
      { _id: mockLectureId, lectureId: mockLectureId, startTimeSec: 100, text: 'Test', lectureTitle: 'Test' }
    ];
    Transcript.aggregate.mockResolvedValue(mockResults);

    await request(app)
      .get('/search/api')
      .query({ q: 'الشيخ ابن باز' })  // Arabic query with sheikh prefix
      .expect(200);

    // Wait for async logging
    await new Promise(resolve => setImmediate(resolve));

    expect(SearchLog.create).toHaveBeenCalled();
    const createCall = SearchLog.create.mock.calls[0][0];

    // Normalized query should have sheikh prefix stripped
    expect(createCall.normalizedQuery).toBe('ابن باز');
  });

  it('should include topLectureIds in search log', async () => {
    const lectureId1 = mockObjectId();
    const lectureId2 = mockObjectId();
    const mockResults = [
      { _id: mockObjectId(), lectureId: lectureId1, startTimeSec: 100, text: 'Result 1' },
      { _id: mockObjectId(), lectureId: lectureId2, startTimeSec: 200, text: 'Result 2' }
    ];
    Transcript.aggregate.mockResolvedValue(mockResults);

    await request(app)
      .get('/search/api')
      .query({ q: 'multi result test' })
      .expect(200);

    // Wait for async logging
    await new Promise(resolve => setImmediate(resolve));

    expect(SearchLog.create).toHaveBeenCalled();
    const createCall = SearchLog.create.mock.calls[0][0];

    expect(createCall.topLectureIds).toContain(lectureId1.toString());
    expect(createCall.topLectureIds).toContain(lectureId2.toString());
  });
});
