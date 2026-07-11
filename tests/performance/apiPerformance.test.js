/**
 * Performance Tests for API Endpoints
 * Tests response time and concurrent request handling
 */

const request = require('supertest');
const express = require('express');
const { Lecture, Sheikh, Series } = require('../../models');
const testDb = require('../helpers/testDb');

let app;

// Performance thresholds (in milliseconds)
const PERFORMANCE_THRESHOLDS = {
  simpleQuery: 100,    // Simple queries should complete in <100ms
  complexQuery: 500,   // Complex queries with joins should complete in <500ms
  listQuery: 200,      // List queries with pagination should complete in <200ms
  searchQuery: 300,    // Search queries should complete in <300ms
};

describe('API Performance Tests', () => {
  beforeAll(async () => {
    await testDb.connect();

    // Create test data
    const sheikh = await Sheikh.create({
      nameArabic: 'الشيخ محمد',
      nameEnglish: 'Sheikh Mohammed'
    });

    const series = await Series.create({
      titleArabic: 'شرح العقيدة',
      titleEnglish: 'Explanation of Aqeedah',
      sheikhId: sheikh._id,
      category: 'Aqeedah'
    });

    // Create 50 test lectures
    const lectures = [];
    for (let i = 0; i < 50; i++) {
      lectures.push({
        titleArabic: `محاضرة ${i + 1}`,
        titleEnglish: `Lecture ${i + 1}`,
        sheikhId: sheikh._id,
        seriesId: series._id,
        lectureNumber: i + 1,
        category: 'Aqeedah',
        published: true,
        playCount: Math.floor(Math.random() * 1000)
      });
    }
    await Lecture.insertMany(lectures);

    // Setup Express app
    app = express();
    app.use(express.json());

    // API routes for testing
    app.get('/api/lectures', async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      const lectures = await Lecture.find({ published: true })
        .populate('sheikhId', 'nameArabic nameEnglish')
        .populate('seriesId', 'titleArabic titleEnglish')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      res.json({ success: true, lectures });
    });

    app.get('/api/lectures/search', async (req, res) => {
      const query = req.query.q || '';
      const lectures = await Lecture.find({
        $or: [
          { titleArabic: { $regex: query, $options: 'i' } },
          { titleEnglish: { $regex: query, $options: 'i' } }
        ],
        published: true
      })
        .populate('sheikhId', 'nameArabic')
        .limit(20)
        .lean();

      res.json({ success: true, lectures });
    });

    app.get('/api/series', async (req, res) => {
      const series = await Series.find()
        .populate('sheikhId', 'nameArabic nameEnglish')
        .lean();

      res.json({ success: true, series });
    });

    app.get('/api/lectures/:id', async (req, res) => {
      const lecture = await Lecture.findById(req.params.id)
        .populate('sheikhId')
        .populate('seriesId')
        .lean();

      res.json({ success: true, lecture });
    });
  });

  afterAll(async () => {
    await Lecture.deleteMany({});
    await Sheikh.deleteMany({});
    await Series.deleteMany({});
    await testDb.disconnect();
  });

  describe('Response Time Tests', () => {
    it('should return lectures list within threshold', async () => {
      const start = Date.now();

      const response = await request(app)
        .get('/api/lectures')
        .query({ page: 1, limit: 20 })
        .expect(200);

      const duration = Date.now() - start;

      expect(response.body.success).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.listQuery);

      console.log(`Lectures list query: ${duration}ms`);
    });

    it('should return series list within threshold', async () => {
      const start = Date.now();

      const response = await request(app)
        .get('/api/series')
        .expect(200);

      const duration = Date.now() - start;

      expect(response.body.success).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.simpleQuery);

      console.log(`Series list query: ${duration}ms`);
    });

    it('should handle search queries within threshold', async () => {
      const start = Date.now();

      const response = await request(app)
        .get('/api/lectures/search')
        .query({ q: 'محاضرة' })
        .expect(200);

      const duration = Date.now() - start;

      expect(response.body.success).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.searchQuery);

      console.log(`Search query: ${duration}ms`);
    });

    it('should return single lecture within threshold', async () => {
      const lecture = await Lecture.findOne();
      const start = Date.now();

      const response = await request(app)
        .get(`/api/lectures/${lecture._id}`)
        .expect(200);

      const duration = Date.now() - start;

      expect(response.body.success).toBe(true);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.simpleQuery);

      console.log(`Single lecture query: ${duration}ms`);
    });
  });

  describe('Concurrent Request Tests', () => {
    it('should handle 10 concurrent requests', async () => {
      const concurrentRequests = 10;
      const start = Date.now();

      const requests = Array(concurrentRequests).fill().map(() =>
        request(app).get('/api/lectures').query({ page: 1, limit: 10 })
      );

      const responses = await Promise.all(requests);
      const duration = Date.now() - start;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Average time per request should be reasonable
      const avgTime = duration / concurrentRequests;
      console.log(`10 concurrent requests: ${duration}ms total, ${avgTime}ms avg`);

      // Total time should be reasonable (not 10x sequential time)
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.listQuery * 5);
    });

    it('should handle 20 concurrent search requests', async () => {
      const concurrentRequests = 20;
      const searchTerms = ['محاضرة', 'Lecture', '1', '2', '3'];
      const start = Date.now();

      const requests = Array(concurrentRequests).fill().map((_, i) =>
        request(app)
          .get('/api/lectures/search')
          .query({ q: searchTerms[i % searchTerms.length] })
      );

      const responses = await Promise.all(requests);
      const duration = Date.now() - start;

      const successCount = responses.filter(r => r.status === 200).length;
      console.log(`20 concurrent search requests: ${duration}ms total, ${successCount}/${concurrentRequests} successful`);

      expect(successCount).toBe(concurrentRequests);
    });

    it('should handle mixed concurrent requests', async () => {
      const lecture = await Lecture.findOne();
      const start = Date.now();

      const requests = [
        request(app).get('/api/lectures'),
        request(app).get('/api/series'),
        request(app).get('/api/lectures/search').query({ q: 'test' }),
        request(app).get(`/api/lectures/${lecture._id}`),
        request(app).get('/api/lectures').query({ page: 2 }),
      ];

      const responses = await Promise.all(requests);
      const duration = Date.now() - start;

      const successCount = responses.filter(r => r.status === 200).length;
      console.log(`Mixed concurrent requests: ${duration}ms total, ${successCount}/5 successful`);

      expect(successCount).toBe(5);
    });
  });

  describe('Pagination Performance Tests', () => {
    it('should handle first page efficiently', async () => {
      const start = Date.now();

      await request(app)
        .get('/api/lectures')
        .query({ page: 1, limit: 20 })
        .expect(200);

      const duration = Date.now() - start;
      console.log(`First page: ${duration}ms`);

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.listQuery);
    });

    it('should handle deep pagination', async () => {
      const start = Date.now();

      await request(app)
        .get('/api/lectures')
        .query({ page: 3, limit: 20 })
        .expect(200);

      const duration = Date.now() - start;
      console.log(`Deep pagination (page 3): ${duration}ms`);

      // Deep pagination may be slightly slower but should still be acceptable
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.listQuery * 2);
    });

    it('should handle small page sizes efficiently', async () => {
      const start = Date.now();

      await request(app)
        .get('/api/lectures')
        .query({ page: 1, limit: 5 })
        .expect(200);

      const duration = Date.now() - start;
      console.log(`Small page size: ${duration}ms`);

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.simpleQuery);
    });
  });

  describe('Memory Efficiency Tests', () => {
    it('should not leak memory with repeated requests', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 50;

      for (let i = 0; i < iterations; i++) {
        await request(app)
          .get('/api/lectures')
          .query({ page: 1, limit: 10 });
      }

      // Allow for garbage collection
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024; // MB

      console.log(`Memory growth after ${iterations} requests: ${memoryGrowth.toFixed(2)}MB`);

      // Memory growth should be minimal (less than 50MB)
      expect(memoryGrowth).toBeLessThan(50);
    });
  });
});

describe('Cache Performance Tests', () => {
  const cache = require('../../utils/cache');

  beforeEach(() => {
    cache.clear();
  });

  it('should significantly improve repeated query performance', async () => {
    const expensiveOperation = async () => {
      // Simulate database query
      await new Promise(resolve => setTimeout(resolve, 50));
      return { data: 'expensive result' };
    };

    // First call - cache miss
    const start1 = Date.now();
    await cache.getOrSet('test:key', expensiveOperation, 60);
    const duration1 = Date.now() - start1;

    // Second call - cache hit
    const start2 = Date.now();
    await cache.getOrSet('test:key', expensiveOperation, 60);
    const duration2 = Date.now() - start2;

    console.log(`Cache miss: ${duration1}ms, Cache hit: ${duration2}ms`);

    // Cache hit should be significantly faster
    expect(duration2).toBeLessThan(duration1 / 10);
  });

  it('should handle high cache throughput', async () => {
    const iterations = 1000;
    const start = Date.now();

    for (let i = 0; i < iterations; i++) {
      cache.set(`key:${i}`, { value: i });
      cache.get(`key:${i % 100}`); // Mix of new keys and existing keys
    }

    const duration = Date.now() - start;
    const opsPerSecond = (iterations * 2) / (duration / 1000);

    console.log(`Cache operations: ${opsPerSecond.toFixed(0)} ops/sec`);

    // Should handle at least 10,000 operations per second
    expect(opsPerSecond).toBeGreaterThan(10000);
  });
});
