/**
 * Integration Tests for Series API Endpoints
 */

jest.mock('music-metadata');

const request = require('supertest');
const express = require('express');
const Sheikh = require('../../../models/Sheikh');
const Series = require('../../../models/Series');
const Lecture = require('../../../models/Lecture');
const Admin = require('../../../models/Admin');
const testDb = require('../../helpers/testDb');

let app;
let adminUser;

describe('Series API Integration Tests', () => {
  beforeAll(async () => {
    await testDb.connect();

    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Simulate authenticated admin for protected routes
    app.use((req, res, next) => {
      if (req.headers['x-test-auth'] === 'admin') {
        req.isAuthenticated = () => true;
        req.user = adminUser;
      } else {
        req.isAuthenticated = () => false;
      }
      next();
    });

    const seriesRoutes = require('../../../routes/api/series');
    app.use('/api/series', seriesRoutes);
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  beforeEach(async () => {
    await Sheikh.deleteMany({});
    await Series.deleteMany({});
    await Lecture.deleteMany({});
    await Admin.deleteMany({});

    adminUser = await Admin.create({
      email: 'admin@test.com',
      displayName: 'Test Admin',
      username: 'admin',
      role: 'admin',
      isActive: true
    });
  });

  describe('GET /api/series', () => {
    it('should return empty array when no series exist', async () => {
      const response = await request(app)
        .get('/api/series')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.series).toEqual([]);
    });

    it('should return all series', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ أحمد',
        nameEnglish: 'Sheikh Ahmed'
      });

      await Series.create([
        { titleArabic: 'سلسلة الأولى', sheikhId: sheikh._id, category: 'Aqeedah' },
        { titleArabic: 'سلسلة الثانية', sheikhId: sheikh._id, category: 'Fiqh' }
      ]);

      const response = await request(app)
        .get('/api/series')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.series).toHaveLength(2);
    });

    it('should filter by sheikhId', async () => {
      const sheikh1 = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const sheikh2 = await Sheikh.create({ nameArabic: 'الشيخ محمد' });

      await Series.create([
        { titleArabic: 'سلسلة ١', sheikhId: sheikh1._id },
        { titleArabic: 'سلسلة ٢', sheikhId: sheikh2._id }
      ]);

      const response = await request(app)
        .get(`/api/series?sheikhId=${sheikh1._id}`)
        .expect(200);

      expect(response.body.series).toHaveLength(1);
      expect(response.body.series[0].titleArabic).toBe('سلسلة ١');
    });

    it('should populate sheikh information', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ أحمد',
        nameEnglish: 'Sheikh Ahmed'
      });

      await Series.create({ titleArabic: 'سلسلة', sheikhId: sheikh._id });

      const response = await request(app)
        .get('/api/series')
        .expect(200);

      expect(response.body.series[0].sheikhId.nameArabic).toBe('الشيخ أحمد');
      expect(response.body.series[0].sheikhId.nameEnglish).toBe('Sheikh Ahmed');
    });
  });

  describe('GET /api/series/export', () => {
    it('should return CSV with BOM and proper headers', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ أحمد',
        nameEnglish: 'Sheikh Ahmed'
      });

      await Series.create({
        titleArabic: 'شرح كتاب التوحيد',
        titleEnglish: 'Tawheed Explanation',
        sheikhId: sheikh._id,
        category: 'Aqeedah'
      });

      const response = await request(app)
        .get('/api/series/export')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('series-export');
      // BOM + CSV header row
      expect(response.text).toContain('ID,Title (Arabic)');
      expect(response.text).toContain('شرح كتاب التوحيد');
      expect(response.text).toContain('Sheikh Ahmed');
    });

    it('should export empty CSV when no series exist', async () => {
      const response = await request(app)
        .get('/api/series/export')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      // Should have header row but no data rows
      expect(response.text).toContain('ID,Title (Arabic)');
    });
  });

  describe('POST /api/series', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/series')
        .send({ titleArabic: 'test' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should require Arabic title', async () => {
      const response = await request(app)
        .post('/api/series')
        .set('x-test-auth', 'admin')
        .send({ sheikhId: adminUser._id.toString() })
        .expect(400);

      expect(response.body.message).toContain('Arabic title is required');
    });

    it('should require sheikhId', async () => {
      const response = await request(app)
        .post('/api/series')
        .set('x-test-auth', 'admin')
        .send({ titleArabic: 'سلسلة جديدة' })
        .expect(400);

      expect(response.body.message).toContain('Sheikh is required');
    });

    it('should create series successfully', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });

      const response = await request(app)
        .post('/api/series')
        .set('x-test-auth', 'admin')
        .send({
          titleArabic: 'سلسلة جديدة',
          titleEnglish: 'New Series',
          sheikhId: sheikh._id.toString(),
          category: 'Fiqh'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.series.titleArabic).toBe('سلسلة جديدة');
      expect(response.body.series.category).toBe('Fiqh');

      const saved = await Series.findById(response.body.series._id);
      expect(saved).not.toBeNull();
    });

    it('should default category to Other', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });

      const response = await request(app)
        .post('/api/series')
        .set('x-test-auth', 'admin')
        .send({
          titleArabic: 'سلسلة',
          sheikhId: sheikh._id.toString()
        })
        .expect(201);

      expect(response.body.series.category).toBe('Other');
    });
  });

  describe('PUT /api/series/:id', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .put('/api/series/507f1f77bcf86cd799439011')
        .send({ titleArabic: 'updated' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should update series successfully', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const series = await Series.create({
        titleArabic: 'قبل التعديل',
        sheikhId: sheikh._id
      });

      const response = await request(app)
        .put(`/api/series/${series._id}`)
        .set('x-test-auth', 'admin')
        .send({
          titleArabic: 'بعد التعديل',
          category: 'Hadith'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.series.titleArabic).toBe('بعد التعديل');
      expect(response.body.series.category).toBe('Hadith');
    });

    it('should return 404 for non-existent series', async () => {
      const response = await request(app)
        .put('/api/series/507f1f77bcf86cd799439011')
        .set('x-test-auth', 'admin')
        .send({ titleArabic: 'test' })
        .expect(404);

      expect(response.body.message).toContain('not found');
    });
  });

  describe('DELETE /api/series/:id', () => {
    it('should require authentication', async () => {
      await request(app)
        .delete('/api/series/507f1f77bcf86cd799439011')
        .expect(401);
    });

    it('should delete series with no lectures', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const series = await Series.create({
        titleArabic: 'للحذف',
        sheikhId: sheikh._id
      });

      const response = await request(app)
        .delete(`/api/series/${series._id}`)
        .set('x-test-auth', 'admin')
        .expect(200);

      expect(response.body.success).toBe(true);

      const deleted = await Series.findById(series._id);
      expect(deleted).toBeNull();
    });

    it('should prevent deleting series with lectures', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const series = await Series.create({
        titleArabic: 'سلسلة',
        sheikhId: sheikh._id
      });

      await Lecture.create({
        titleArabic: 'محاضرة',
        seriesId: series._id,
        sheikhId: sheikh._id,
        published: true
      });

      const response = await request(app)
        .delete(`/api/series/${series._id}`)
        .set('x-test-auth', 'admin')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Cannot delete series');
    });

    it('should return 404 for non-existent series', async () => {
      const response = await request(app)
        .delete('/api/series/507f1f77bcf86cd799439011')
        .set('x-test-auth', 'admin')
        .expect(404);

      expect(response.body.message).toContain('not found');
    });
  });
});
