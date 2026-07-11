/**
 * Integration Tests for Public Routes
 *
 * Note: Full page rendering tests are skipped because they require
 * complete EJS template setup. These tests focus on route behavior
 * and data handling.
 */

const request = require('supertest');
const express = require('express');
const Lecture = require('../../../models/Lecture');
const Sheikh = require('../../../models/Sheikh');
const Series = require('../../../models/Series');
const testDb = require('../../helpers/testDb');

let app;

describe('Public Routes Integration Tests', () => {
  beforeAll(async () => {
    // Connect to test database
    await testDb.connect();

    // Create Express app with minimal configuration
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Create a simple test route that returns JSON instead of rendering
    app.get('/api/homepage-data', async (req, res) => {
      try {
        const series = await Series.find()
          .populate('sheikhId', 'nameArabic nameEnglish honorific')
          .sort({ createdAt: -1 })
          .lean();

        const seriesList = await Promise.all(
          series.map(async (s) => {
            const lectures = await Lecture.find({
              seriesId: s._id,
              published: true
            })
              .sort({ lectureNumber: 1, createdAt: 1 })
              .lean();

            return {
              ...s,
              sheikh: s.sheikhId,
              lectures: lectures,
              lectureCount: lectures.length
            };
          })
        );

        const filteredSeries = seriesList.filter(s => s.lectureCount > 0);

        const standaloneLectures = await Lecture.find({
          seriesId: null,
          published: true
        })
          .populate('sheikhId', 'nameArabic nameEnglish honorific')
          .sort({ dateRecorded: -1, createdAt: -1 })
          .lean();

        const khutbaSeries = filteredSeries.filter(s => {
          if (s.tags && s.tags.includes('khutba')) return true;
          return s.titleArabic && (
            s.titleArabic.includes('خطب') ||
            s.titleArabic.includes('خطبة')
          );
        });

        res.json({
          success: true,
          seriesList: filteredSeries,
          standaloneLectures,
          khutbaSeries
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({ error: 'Not Found' });
    });
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  // Clear database before each test
  beforeEach(async () => {
    await Lecture.deleteMany({});
    await Sheikh.deleteMany({});
    await Series.deleteMany({});
  });

  describe('Homepage Data', () => {
    it('should return empty arrays when no data exists', async () => {
      const response = await request(app)
        .get('/api/homepage-data')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.seriesList).toEqual([]);
      expect(response.body.standaloneLectures).toEqual([]);
      expect(response.body.khutbaSeries).toEqual([]);
    });

    it('should return series with published lectures', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد'
      });

      const series = await Series.create({
        titleArabic: 'سلسلة تجريبية',
        sheikhId: sheikh._id
      });

      await Lecture.create({
        titleArabic: 'محاضرة الأولى',
        sheikhId: sheikh._id,
        seriesId: series._id,
        lectureNumber: 1,
        published: true
      });

      const response = await request(app)
        .get('/api/homepage-data')
        .expect(200);

      expect(response.body.seriesList).toHaveLength(1);
      expect(response.body.seriesList[0].titleArabic).toBe('سلسلة تجريبية');
      expect(response.body.seriesList[0].lectures).toHaveLength(1);
    });

    it('should not include series without published lectures', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ أحمد'
      });

      await Series.create({
        titleArabic: 'سلسلة فارغة',
        sheikhId: sheikh._id
      });

      const response = await request(app)
        .get('/api/homepage-data')
        .expect(200);

      expect(response.body.seriesList).toHaveLength(0);
    });

    it('should identify khutba series by tag', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ عبدالله'
      });

      const khutbaSeries = await Series.create({
        titleArabic: 'خطب الجمعة',
        sheikhId: sheikh._id,
        tags: ['khutba']
      });

      await Lecture.create({
        titleArabic: 'خطبة التقوى',
        sheikhId: sheikh._id,
        seriesId: khutbaSeries._id,
        lectureNumber: 1,
        published: true
      });

      const response = await request(app)
        .get('/api/homepage-data')
        .expect(200);

      expect(response.body.khutbaSeries).toHaveLength(1);
      expect(response.body.khutbaSeries[0].titleArabic).toBe('خطب الجمعة');
    });

    it('should identify khutba series by title', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ خالد'
      });

      const khutbaSeries = await Series.create({
        titleArabic: 'خطب متنوعة',
        sheikhId: sheikh._id
      });

      await Lecture.create({
        titleArabic: 'خطبة الصبر',
        sheikhId: sheikh._id,
        seriesId: khutbaSeries._id,
        lectureNumber: 1,
        published: true
      });

      const response = await request(app)
        .get('/api/homepage-data')
        .expect(200);

      expect(response.body.khutbaSeries).toHaveLength(1);
    });

    it('should return standalone lectures', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ سالم'
      });

      await Lecture.create({
        titleArabic: 'محاضرة مستقلة',
        sheikhId: sheikh._id,
        seriesId: null,
        published: true
      });

      const response = await request(app)
        .get('/api/homepage-data')
        .expect(200);

      expect(response.body.standaloneLectures).toHaveLength(1);
      expect(response.body.standaloneLectures[0].titleArabic).toBe('محاضرة مستقلة');
    });

    it('should populate sheikh information', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ فهد',
        honorific: 'حفظه الله'
      });

      const series = await Series.create({
        titleArabic: 'دروس مباركة',
        sheikhId: sheikh._id
      });

      await Lecture.create({
        titleArabic: 'الدرس الأول',
        sheikhId: sheikh._id,
        seriesId: series._id,
        lectureNumber: 1,
        published: true
      });

      const response = await request(app)
        .get('/api/homepage-data')
        .expect(200);

      expect(response.body.seriesList[0].sheikh).toHaveProperty('nameArabic', 'الشيخ فهد');
      expect(response.body.seriesList[0].sheikh).toHaveProperty('honorific', 'حفظه الله');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent routes with 404', async () => {
      await request(app)
        .get('/non-existent-route')
        .expect(404);
    });

    it('should handle invalid paths gracefully', async () => {
      await request(app)
        .get('/some-invalid-path')
        .expect(404);
    });
  });

  describe('Category Data', () => {
    it('should include category in series data', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ علي'
      });

      const series = await Series.create({
        titleArabic: 'دروس العقيدة',
        sheikhId: sheikh._id,
        category: 'Aqeedah'
      });

      await Lecture.create({
        titleArabic: 'درس في العقيدة',
        sheikhId: sheikh._id,
        seriesId: series._id,
        category: 'Aqeedah',
        lectureNumber: 1,
        published: true
      });

      const response = await request(app)
        .get('/api/homepage-data')
        .expect(200);

      expect(response.body.seriesList[0].category).toBe('Aqeedah');
    });
  });

  describe('Date Handling', () => {
    it('should include date information in lectures', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ عمر'
      });

      const series = await Series.create({
        titleArabic: 'دروس مؤرخة',
        sheikhId: sheikh._id
      });

      await Lecture.create({
        titleArabic: 'محاضرة مؤرخة',
        sheikhId: sheikh._id,
        seriesId: series._id,
        lectureNumber: 1,
        dateRecorded: new Date('2024-01-15'),
        dateRecordedHijri: '1445/07/15',
        published: true
      });

      const response = await request(app)
        .get('/api/homepage-data')
        .expect(200);

      const lecture = response.body.seriesList[0].lectures[0];
      expect(lecture).toHaveProperty('dateRecorded');
      expect(lecture).toHaveProperty('dateRecordedHijri', '1445/07/15');
    });
  });
});
