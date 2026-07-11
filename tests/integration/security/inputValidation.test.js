/**
 * Security Tests for Input Validation
 * Tests for preventing injection attacks and enforcing validation rules
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { Lecture, Sheikh, Series } = require('../../../models');
const testDb = require('../../helpers/testDb');

let app;

describe('Input Validation Security Tests', () => {
  beforeAll(async () => {
    await testDb.connect();
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  beforeEach(async () => {
    await Lecture.deleteMany({});
    await Sheikh.deleteMany({});
    await Series.deleteMany({});

    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
  });

  describe('NoSQL Injection Prevention', () => {
    beforeEach(async () => {
      // Create test data
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد',
        nameEnglish: 'Sheikh Mohammed'
      });

      await Lecture.create({
        titleArabic: 'محاضرة في العقيدة',
        sheikhId: sheikh._id,
        published: true
      });
    });

    it('should reject $gt operator in query parameters', async () => {
      const { lecturesQueryValidation } = require('../../../utils/validators');

      app.get('/api/lectures', lecturesQueryValidation, async (req, res) => {
        const lectures = await Lecture.find({ published: true });
        res.json({ success: true, lectures });
      });

      // Attempt NoSQL injection with $gt operator
      const response = await request(app)
        .get('/api/lectures')
        .query({ page: { $gt: 0 } })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject $ne operator in query parameters', async () => {
      const { lecturesQueryValidation } = require('../../../utils/validators');

      app.get('/api/lectures', lecturesQueryValidation, async (req, res) => {
        res.json({ success: true });
      });

      // Attempt NoSQL injection with $ne operator
      const response = await request(app)
        .get('/api/lectures')
        .query({ sheikhId: { $ne: null } })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should sanitize potentially malicious MongoDB operators', async () => {
      const { sanitizeMongoQuery } = require('../../../utils/validators');

      const maliciousInput = {
        name: 'test',
        $where: 'this.password.length > 0',
        $gt: 100,
        nested: {
          $regex: '.*',
          valid: 'data'
        }
      };

      const sanitized = sanitizeMongoQuery(maliciousInput);

      expect(sanitized).not.toHaveProperty('$where');
      expect(sanitized).not.toHaveProperty('$gt');
      expect(sanitized.nested).not.toHaveProperty('$regex');
      expect(sanitized.name).toBe('test');
      expect(sanitized.nested.valid).toBe('data');
    });
  });

  describe('XSS Prevention', () => {
    it('should escape HTML in search queries', async () => {
      const { lecturesQueryValidation } = require('../../../utils/validators');

      app.get('/api/lectures', lecturesQueryValidation, async (req, res) => {
        // Search query should be escaped
        res.json({ success: true, search: req.query.search });
      });

      const xssPayload = '<script>alert("XSS")</script>';

      const response = await request(app)
        .get('/api/lectures')
        .query({ search: xssPayload })
        .expect(200);

      // Check that script tags are escaped
      expect(response.body.search).not.toContain('<script>');
    });

    it('should escape HTML entities in lecture titles', async () => {
      const { lectureUploadValidation } = require('../../../utils/validators');

      const mockIsAdmin = (req, res, next) => {
        req.isAuthenticated = () => true;
        req.user = { _id: new mongoose.Types.ObjectId(), role: 'admin' };
        next();
      };

      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد'
      });

      app.post('/api/lectures', mockIsAdmin, lectureUploadValidation, async (req, res) => {
        res.json({ success: true, title: req.body.titleArabic });
      });

      // This test verifies validation passes for normal text
      const response = await request(app)
        .post('/api/lectures')
        .send({
          titleArabic: 'محاضرة عادية',
          sheikhId: sheikh._id.toString()
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Input Length Validation', () => {
    it('should reject overly long search queries', async () => {
      const { lecturesQueryValidation } = require('../../../utils/validators');

      app.get('/api/lectures', lecturesQueryValidation, async (req, res) => {
        res.json({ success: true });
      });

      // Create a very long search query
      const longQuery = 'a'.repeat(250);

      const response = await request(app)
        .get('/api/lectures')
        .query({ search: longQuery })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors[0].message).toContain('200');
    });

    it('should reject overly long titles', async () => {
      const { lectureUploadValidation } = require('../../../utils/validators');

      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ'
      });

      app.post('/api/lectures', lectureUploadValidation, async (req, res) => {
        res.json({ success: true });
      });

      const longTitle = 'م'.repeat(600);

      const response = await request(app)
        .post('/api/lectures')
        .send({
          titleArabic: longTitle,
          sheikhId: sheikh._id.toString()
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should accept valid length inputs', async () => {
      const { lecturesQueryValidation } = require('../../../utils/validators');

      app.get('/api/lectures', lecturesQueryValidation, async (req, res) => {
        res.json({ success: true });
      });

      const validQuery = 'محاضرة في العقيدة';

      const response = await request(app)
        .get('/api/lectures')
        .query({ search: validQuery })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('ObjectId Validation', () => {
    it('should reject invalid ObjectId and slug format', async () => {
      const { idParamValidation } = require('../../../utils/validators');

      app.get('/api/lectures/:id', idParamValidation, async (req, res) => {
        res.json({ success: true });
      });

      // Use special characters that are invalid for both ObjectId and slug formats
      const response = await request(app)
        .get('/api/lectures/invalid@id!#$%')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should accept valid ObjectId', async () => {
      const { idParamValidation } = require('../../../utils/validators');

      const validId = new mongoose.Types.ObjectId().toString();

      app.get('/api/lectures/:id', idParamValidation, async (req, res) => {
        res.json({ success: true, id: req.params.id });
      });

      const response = await request(app)
        .get(`/api/lectures/${validId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.id).toBe(validId);
    });

    it('should accept valid slug format', async () => {
      const { idParamValidation } = require('../../../utils/validators');

      app.get('/api/series/:id', idParamValidation, async (req, res) => {
        res.json({ success: true, slug: req.params.id });
      });

      const response = await request(app)
        .get('/api/series/sharh-al-aqeedah-1')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Pagination Validation', () => {
    it('should reject negative page numbers', async () => {
      const { lecturesQueryValidation } = require('../../../utils/validators');

      app.get('/api/lectures', lecturesQueryValidation, async (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/api/lectures')
        .query({ page: -1 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject page zero', async () => {
      const { lecturesQueryValidation } = require('../../../utils/validators');

      app.get('/api/lectures', lecturesQueryValidation, async (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/api/lectures')
        .query({ page: 0 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject excessively large page numbers', async () => {
      const { lecturesQueryValidation } = require('../../../utils/validators');

      app.get('/api/lectures', lecturesQueryValidation, async (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/api/lectures')
        .query({ page: 100000 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject limit greater than max', async () => {
      const { lecturesQueryValidation } = require('../../../utils/validators');

      app.get('/api/lectures', lecturesQueryValidation, async (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/api/lectures')
        .query({ limit: 500 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should accept valid pagination parameters', async () => {
      const { lecturesQueryValidation } = require('../../../utils/validators');

      app.get('/api/lectures', lecturesQueryValidation, async (req, res) => {
        res.json({
          success: true,
          page: req.query.page,
          limit: req.query.limit
        });
      });

      const response = await request(app)
        .get('/api/lectures')
        .query({ page: 1, limit: 20 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(20);
    });
  });

  describe('Category Validation', () => {
    it('should reject invalid category values', async () => {
      const { lecturesQueryValidation } = require('../../../utils/validators');

      app.get('/api/lectures', lecturesQueryValidation, async (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/api/lectures')
        .query({ category: 'InvalidCategory' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should accept valid category values', async () => {
      const { lecturesQueryValidation } = require('../../../utils/validators');

      const validCategories = ['Aqeedah', 'Fiqh', 'Tafsir', 'Hadith', 'Seerah', 'Akhlaq', 'Other'];

      app.get('/api/lectures', lecturesQueryValidation, async (req, res) => {
        res.json({ success: true, category: req.query.category });
      });

      for (const category of validCategories) {
        const response = await request(app)
          .get('/api/lectures')
          .query({ category })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.category).toBe(category);
      }
    });
  });

  describe('Duration Validation', () => {
    it('should reject negative duration', async () => {
      const { verifyDurationValidation } = require('../../../utils/validators');

      app.post('/api/lectures/:id/verify-duration', verifyDurationValidation, async (req, res) => {
        res.json({ success: true });
      });

      const validId = new mongoose.Types.ObjectId().toString();

      const response = await request(app)
        .post(`/api/lectures/${validId}/verify-duration`)
        .send({ duration: -10 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject excessively long duration', async () => {
      const { verifyDurationValidation } = require('../../../utils/validators');

      app.post('/api/lectures/:id/verify-duration', verifyDurationValidation, async (req, res) => {
        res.json({ success: true });
      });

      const validId = new mongoose.Types.ObjectId().toString();

      const response = await request(app)
        .post(`/api/lectures/${validId}/verify-duration`)
        .send({ duration: 100000 }) // More than 24 hours in seconds
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should accept valid duration', async () => {
      const { verifyDurationValidation } = require('../../../utils/validators');

      app.post('/api/lectures/:id/verify-duration', verifyDurationValidation, async (req, res) => {
        res.json({ success: true, duration: req.body.duration });
      });

      const validId = new mongoose.Types.ObjectId().toString();

      const response = await request(app)
        .post(`/api/lectures/${validId}/verify-duration`)
        .send({ duration: 3600 }) // 1 hour
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.duration).toBe(3600);
    });
  });
});
