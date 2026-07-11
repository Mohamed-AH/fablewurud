/**
 * Integration Tests for Rate Limiting
 * Tests API rate limiting and auth rate limiting behavior
 */

const request = require('supertest');
const express = require('express');
const rateLimit = require('express-rate-limit');

describe('Rate Limiting Integration Tests', () => {
  let app;

  describe('API Rate Limiter', () => {
    beforeEach(() => {
      app = express();
      app.use(express.json());

      // Apply a test-friendly rate limiter (low limits for testing)
      const apiLimiter = rateLimit({
        windowMs: 1000, // 1 second window for testing
        max: 3, // 3 requests per second
        message: { error: 'Too many API requests, please try again later' },
        standardHeaders: true,
        legacyHeaders: false,
      });

      app.use('/api/', apiLimiter);

      app.get('/api/test', (req, res) => {
        res.json({ success: true, message: 'API response' });
      });
    });

    it('should allow requests under the limit', async () => {
      const response = await request(app)
        .get('/api/test')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should include rate limit headers', async () => {
      const response = await request(app)
        .get('/api/test')
        .expect(200);

      // Standard rate limit headers
      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
    });

    it('should block requests over the limit', async () => {
      // Make 3 requests (the limit)
      for (let i = 0; i < 3; i++) {
        await request(app).get('/api/test').expect(200);
      }

      // 4th request should be blocked
      const response = await request(app)
        .get('/api/test')
        .expect(429);

      expect(response.body.error).toBe('Too many API requests, please try again later');
    });

    it('should reset limit after window expires', async () => {
      // Exhaust the limit
      for (let i = 0; i < 3; i++) {
        await request(app).get('/api/test');
      }

      // Verify blocked
      await request(app).get('/api/test').expect(429);

      // Wait for window to reset
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should work again
      const response = await request(app)
        .get('/api/test')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Auth Rate Limiter', () => {
    beforeEach(() => {
      app = express();
      app.use(express.json());

      // Stricter rate limiter for auth (simulating auth endpoint)
      const authLimiter = rateLimit({
        windowMs: 1000, // 1 second for testing
        max: 2, // Only 2 attempts per second
        message: { error: 'Too many login attempts, please try again later' },
        standardHeaders: true,
        legacyHeaders: false,
      });

      app.use('/auth/', authLimiter);

      app.post('/auth/login', (req, res) => {
        res.json({ success: true, message: 'Login successful' });
      });
    });

    it('should have stricter limits for auth endpoints', async () => {
      // Make 2 requests (the limit)
      await request(app).post('/auth/login').expect(200);
      await request(app).post('/auth/login').expect(200);

      // 3rd request should be blocked
      const response = await request(app)
        .post('/auth/login')
        .expect(429);

      expect(response.body.error).toBe('Too many login attempts, please try again later');
    });
  });

  describe('General Rate Limiter', () => {
    beforeEach(() => {
      app = express();

      const generalLimiter = rateLimit({
        windowMs: 1000,
        max: 5,
        message: { error: 'Too many requests, please try again later' },
        standardHeaders: true,
        legacyHeaders: false,
      });

      app.use(generalLimiter);

      app.get('/', (req, res) => {
        res.json({ success: true });
      });
    });

    it('should apply general limits to all routes', async () => {
      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        await request(app).get('/').expect(200);
      }

      // 6th request should be blocked
      const response = await request(app)
        .get('/')
        .expect(429);

      expect(response.body.error).toBe('Too many requests, please try again later');
    });

    it('should track remaining requests in headers', async () => {
      const response1 = await request(app).get('/').expect(200);
      expect(parseInt(response1.headers['ratelimit-remaining'])).toBe(4);

      const response2 = await request(app).get('/').expect(200);
      expect(parseInt(response2.headers['ratelimit-remaining'])).toBe(3);
    });
  });

  describe('Rate Limit Configuration', () => {
    it('should respect custom window times', async () => {
      app = express();

      const shortWindowLimiter = rateLimit({
        windowMs: 500, // 500ms window
        max: 2,
        message: { error: 'Rate limited' },
      });

      app.use(shortWindowLimiter);
      app.get('/test', (req, res) => res.json({ ok: true }));

      // Exhaust limit
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(200);
      await request(app).get('/test').expect(429);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 600));

      // Should work again
      await request(app).get('/test').expect(200);
    });

    it('should return proper JSON error response', async () => {
      app = express();

      const limiter = rateLimit({
        windowMs: 1000,
        max: 1,
        message: {
          error: 'Rate limited',
          retryAfter: '1 second'
        },
      });

      app.use(limiter);
      app.get('/test', (req, res) => res.json({ ok: true }));

      // First request ok
      await request(app).get('/test').expect(200);

      // Second request limited
      const response = await request(app).get('/test').expect(429);

      expect(response.body.error).toBe('Rate limited');
      expect(response.body.retryAfter).toBe('1 second');
    });
  });
});
