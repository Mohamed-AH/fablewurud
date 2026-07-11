/**
 * Integration Tests for Lecture API Endpoints
 */

// Mock music-metadata before any imports
jest.mock('music-metadata');

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const Lecture = require('../../../models/Lecture');
const Sheikh = require('../../../models/Sheikh');
const Series = require('../../../models/Series');
const testDb = require('../../helpers/testDb');

let app;

describe('Lecture API Integration Tests', () => {
  beforeAll(async () => {
    // Connect to test database
    await testDb.connect();

    // Create Express app with minimal configuration
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Mount API routes
    const apiRoutes = require('../../../routes/api/lectures');
    app.use('/api/lectures', apiRoutes);

    // Error handler
    app.use((err, req, res, next) => {
      res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error'
      });
    });
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  // Clear database before each test to ensure isolation
  beforeEach(async () => {
    await Lecture.deleteMany({});
    await Sheikh.deleteMany({});
    await Series.deleteMany({});
  });

  describe('GET /api/lectures', () => {
    it('should return empty array when no lectures exist', async () => {
      const response = await request(app)
        .get('/api/lectures')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.lectures).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should return all lectures with pagination', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد'
      });

      await Lecture.create({
        titleArabic: 'المحاضرة الأولى',
        sheikhId: sheikh._id,
        published: true
      });

      await Lecture.create({
        titleArabic: 'المحاضرة الثانية',
        sheikhId: sheikh._id,
        published: true
      });

      const response = await request(app)
        .get('/api/lectures')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.lectures).toHaveLength(2);
      expect(response.body.lectures[0]).toHaveProperty('titleArabic');
      expect(response.body.lectures[0]).toHaveProperty('sheikhId');
      expect(response.body.pagination.total).toBe(2);
    });

    it('should populate sheikh information', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد',
        bioArabic: 'عالم جليل'
      });

      await Lecture.create({
        titleArabic: 'محاضرة تجريبية',
        sheikhId: sheikh._id,
        published: true
      });

      const response = await request(app)
        .get('/api/lectures')
        .expect(200);

      expect(response.body.lectures[0].sheikhId).toHaveProperty('nameArabic', 'الشيخ محمد');
    });

    it('should filter by category if provided', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ أحمد'
      });

      await Lecture.create({
        titleArabic: 'محاضرة عقيدة',
        sheikhId: sheikh._id,
        category: 'Aqeedah',
        published: true
      });

      await Lecture.create({
        titleArabic: 'محاضرة فقه',
        sheikhId: sheikh._id,
        category: 'Fiqh',
        published: true
      });

      const response = await request(app)
        .get('/api/lectures?category=Aqeedah')
        .expect(200);

      expect(response.body.lectures).toHaveLength(1);
      expect(response.body.lectures[0].titleArabic).toBe('محاضرة عقيدة');
    });

    it('should filter by sheikh if provided', async () => {
      const sheikh1 = await Sheikh.create({ nameArabic: 'الشيخ الأول' });
      const sheikh2 = await Sheikh.create({ nameArabic: 'الشيخ الثاني' });

      await Lecture.create({
        titleArabic: 'محاضرة من الشيخ الأول',
        sheikhId: sheikh1._id,
        published: true
      });

      await Lecture.create({
        titleArabic: 'محاضرة من الشيخ الثاني',
        sheikhId: sheikh2._id,
        published: true
      });

      const response = await request(app)
        .get(`/api/lectures?sheikhId=${sheikh1._id}`)
        .expect(200);

      expect(response.body.lectures).toHaveLength(1);
      expect(response.body.lectures[0].titleArabic).toBe('محاضرة من الشيخ الأول');
    });
  });

  describe('GET /api/lectures/:id', () => {
    it('should return a specific lecture by ID', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ خالد'
      });

      const lecture = await Lecture.create({
        titleArabic: 'محاضرة محددة',
        sheikhId: sheikh._id,
        descriptionArabic: 'وصف المحاضرة',
        published: true
      });

      const response = await request(app)
        .get(`/api/lectures/${lecture._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.lecture).toHaveProperty('titleArabic', 'محاضرة محددة');
      expect(response.body.lecture).toHaveProperty('descriptionArabic', 'وصف المحاضرة');
    });

    it('should return 404 for non-existent lecture', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .get(`/api/lectures/${fakeId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Lecture not found');
    });

    it('should return 500 for invalid lecture ID format', async () => {
      // Silence expected CastError logged by the error handler
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const response = await request(app)
        .get('/api/lectures/invalid-id')
        .expect(500);

      expect(response.body.success).toBe(false);
      spy.mockRestore();
    });
  });

  describe('Series Integration', () => {
    it('should include series information if lecture is part of series', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ عمر'
      });

      const series = await Series.create({
        titleArabic: 'سلسلة تجريبية',
        descriptionArabic: 'وصف السلسلة',
        sheikhId: sheikh._id
      });

      await Lecture.create({
        titleArabic: 'محاضرة في السلسلة',
        sheikhId: sheikh._id,
        seriesId: series._id,
        lectureNumber: 1,
        published: true
      });

      const response = await request(app)
        .get('/api/lectures')
        .expect(200);

      expect(response.body.lectures[0]).toHaveProperty('seriesId');
      expect(response.body.lectures[0]).toHaveProperty('lectureNumber', 1);
    });
  });

  describe('Date Handling', () => {
    it('should return lectures with dateRecorded', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ فهد'
      });

      const testDate = new Date('2024-01-15');

      await Lecture.create({
        titleArabic: 'محاضرة مؤرخة',
        sheikhId: sheikh._id,
        dateRecorded: testDate,
        published: true
      });

      const response = await request(app)
        .get('/api/lectures')
        .expect(200);

      expect(response.body.lectures[0]).toHaveProperty('dateRecorded');
      expect(new Date(response.body.lectures[0].dateRecorded)).toEqual(testDate);
    });

    it('should handle Hijri dates', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ علي'
      });

      await Lecture.create({
        titleArabic: 'محاضرة بتاريخ هجري',
        sheikhId: sheikh._id,
        dateRecordedHijri: '1445/07/15',
        published: true
      });

      const response = await request(app)
        .get('/api/lectures')
        .expect(200);

      expect(response.body.lectures[0]).toHaveProperty('dateRecordedHijri', '1445/07/15');
    });
  });
});
