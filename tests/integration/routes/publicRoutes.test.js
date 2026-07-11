/**
 * Integration Tests for Public Routes (routes/index.js)
 *
 * Tests the route handlers by stubbing res.render to return JSON,
 * avoiding the need for EJS template infrastructure.
 */

jest.mock('music-metadata');

const request = require('supertest');
const express = require('express');
const Sheikh = require('../../../models/Sheikh');
const Series = require('../../../models/Series');
const Lecture = require('../../../models/Lecture');
const testDb = require('../../helpers/testDb');

let app;

describe('Public Routes Integration Tests', () => {
  beforeAll(async () => {
    await testDb.connect();

    app = express();
    app.use(express.json());

    // Stub res.render to return JSON
    app.use((req, res, next) => {
      res.render = (view, data) => {
        res.json({ _view: view, ...data });
      };
      next();
    });

    const publicRoutes = require('../../../routes/index');
    const homepageApi = require('../../../routes/api/homepage');
    app.use('/', publicRoutes);
    app.use('/api/homepage', homepageApi);
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  beforeEach(async () => {
    await Sheikh.deleteMany({});
    await Series.deleteMany({});
    await Lecture.deleteMany({});
  });

  describe('GET / (Homepage)', () => {
    it('should render homepage with empty data', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body._view).toBe('public/index');
      expect(response.body.title).toBe('البحث في التفريغ الصوتي');
      expect(response.body.seriesList).toEqual([]);
      expect(response.body.standaloneLectures).toEqual([]);
      expect(response.body.khutbaSeries).toEqual([]);
    });

    it('should return series with published lectures via API', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ أحمد',
        honorific: 'حفظه الله'
      });
      const series = await Series.create({
        titleArabic: 'شرح التوحيد',
        sheikhId: sheikh._id,
        category: 'Aqeedah'
      });
      await Lecture.create({
        titleArabic: 'الدرس الأول',
        sheikhId: sheikh._id,
        seriesId: series._id,
        published: true,
        lectureNumber: 1
      });

      // Homepage now lazy-loads series via API
      const homepageResponse = await request(app)
        .get('/')
        .expect(200);

      expect(homepageResponse.body.seriesList).toHaveLength(0); // Empty - loaded via API
      expect(homepageResponse.body.lazyLoadSeries).toBe(true);

      // Test API endpoint
      const apiResponse = await request(app)
        .get('/api/homepage/series')
        .expect(200);

      expect(apiResponse.body.series).toHaveLength(1);
      expect(apiResponse.body.series[0].titleArabic).toBe('شرح التوحيد');
    });

    it('should filter out series with no published lectures', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ' });
      const series = await Series.create({
        titleArabic: 'سلسلة فارغة',
        sheikhId: sheikh._id
      });
      // No lectures created for this series

      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body.seriesList).toHaveLength(0);
    });

    it('should identify khutba series by tag via API', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ' });
      const series = await Series.create({
        titleArabic: 'مجموعة',
        sheikhId: sheikh._id,
        tags: ['khutba']
      });
      await Lecture.create({
        titleArabic: 'خطبة',
        sheikhId: sheikh._id,
        seriesId: series._id,
        published: true
      });

      // Homepage returns empty khutbaSeries (loaded via API)
      const homepageResponse = await request(app)
        .get('/')
        .expect(200);

      expect(homepageResponse.body.khutbaSeries).toHaveLength(0);

      // Test API endpoint
      const apiResponse = await request(app)
        .get('/api/homepage/khutbas')
        .expect(200);

      expect(apiResponse.body.series).toHaveLength(1);
    });

    it('should identify khutba series by title via API', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ' });
      const series = await Series.create({
        titleArabic: 'خطب الجمعة',
        sheikhId: sheikh._id
      });
      await Lecture.create({
        titleArabic: 'خطبة',
        sheikhId: sheikh._id,
        seriesId: series._id,
        published: true
      });

      // Homepage returns empty khutbaSeries (loaded via API)
      const homepageResponse = await request(app)
        .get('/')
        .expect(200);

      expect(homepageResponse.body.khutbaSeries).toHaveLength(0);

      // Test API endpoint
      const apiResponse = await request(app)
        .get('/api/homepage/khutbas')
        .expect(200);

      expect(apiResponse.body.series).toHaveLength(1);
    });

    it('should return standalone lectures via API', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ',
        honorific: 'حفظه الله'
      });
      await Lecture.create({
        titleArabic: 'محاضرة مستقلة',
        sheikhId: sheikh._id,
        seriesId: null,
        published: true
      });

      // Homepage returns empty standaloneLectures (loaded via API)
      const homepageResponse = await request(app)
        .get('/')
        .expect(200);

      expect(homepageResponse.body.standaloneLectures).toHaveLength(0);

      // Test API endpoint
      const apiResponse = await request(app)
        .get('/api/homepage/standalone')
        .expect(200);

      expect(apiResponse.body.lectures).toHaveLength(1);
      expect(apiResponse.body.lectures[0].titleArabic).toBe('محاضرة مستقلة');
    });
  });

  describe('GET /browse', () => {
    it('should render browse page with published lectures', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ' });
      await Lecture.create([
        { titleArabic: 'منشورة', sheikhId: sheikh._id, published: true },
        { titleArabic: 'غير منشورة', sheikhId: sheikh._id, published: false }
      ]);

      const response = await request(app)
        .get('/browse')
        .expect(200);

      expect(response.body._view).toBe('public/browse');
      expect(response.body.title).toBe('جميع المحاضرات');
      expect(response.body.lectures).toHaveLength(1);
      expect(response.body.lectures[0].titleArabic).toBe('منشورة');
    });

    it('should filter by category', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ' });
      await Lecture.create([
        { titleArabic: 'عقيدة', sheikhId: sheikh._id, published: true, category: 'Aqeedah' },
        { titleArabic: 'فقه', sheikhId: sheikh._id, published: true, category: 'Fiqh' }
      ]);

      const response = await request(app)
        .get('/browse?category=Aqeedah')
        .expect(200);

      expect(response.body.lectures).toHaveLength(1);
      expect(response.body.lectures[0].titleArabic).toBe('عقيدة');
    });
  });

  describe('GET /lectures/:id', () => {
    it('should render lecture detail page', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ أحمد',
        bioArabic: 'نبذة'
      });
      const lecture = await Lecture.create({
        titleArabic: 'محاضرة التفصيل',
        sheikhId: sheikh._id,
        published: true,
        category: 'Aqeedah'
      });

      const response = await request(app)
        .get(`/lectures/${lecture._id}`)
        .redirects(1)
        .expect(200);

      expect(response.body._view).toBe('public/lecture');
      expect(response.body.title).toBe('محاضرة التفصيل');
      expect(response.body.lecture.titleArabic).toBe('محاضرة التفصيل');
    });

    it('should return 404 for unpublished lecture', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ' });
      const lecture = await Lecture.create({
        titleArabic: 'غير منشورة',
        sheikhId: sheikh._id,
        published: false
      });

      await request(app)
        .get(`/lectures/${lecture._id}`)
        .expect(404);
    });

    it('should return 404 for non-existent lecture', async () => {
      await request(app)
        .get('/lectures/507f1f77bcf86cd799439011')
        .expect(404);
    });

    it('should include related lectures', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ' });
      const series = await Series.create({
        titleArabic: 'سلسلة',
        sheikhId: sheikh._id
      });
      const lecture = await Lecture.create({
        titleArabic: 'الأولى',
        sheikhId: sheikh._id,
        seriesId: series._id,
        published: true
      });
      await Lecture.create({
        titleArabic: 'الثانية',
        sheikhId: sheikh._id,
        seriesId: series._id,
        published: true
      });

      const response = await request(app)
        .get(`/lectures/${lecture._id}`)
        .redirects(1)
        .expect(200);

      expect(response.body.relatedLectures).toHaveLength(1);
    });
  });

  describe('GET /sheikhs', () => {
    it('should list all sheikhs', async () => {
      await Sheikh.create([
        { nameArabic: 'الشيخ أحمد' },
        { nameArabic: 'الشيخ محمد' }
      ]);

      const response = await request(app)
        .get('/sheikhs')
        .expect(200);

      expect(response.body._view).toBe('public/sheikhs');
      expect(response.body.sheikhs).toHaveLength(2);
    });
  });

  describe('GET /sheikhs/:id', () => {
    it('should render sheikh profile with stats', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ أحمد',
        bioArabic: 'نبذة'
      });
      await Lecture.create({
        titleArabic: 'محاضرة',
        sheikhId: sheikh._id,
        published: true,
        playCount: 50,
        duration: 3600
      });

      const response = await request(app)
        .get(`/sheikhs/${sheikh._id}`)
        .redirects(1)
        .expect(200);

      expect(response.body._view).toBe('public/sheikh');
      expect(response.body.sheikh.nameArabic).toBe('الشيخ أحمد');
      expect(response.body.stats.totalLectures).toBe(1);
      expect(response.body.stats.totalPlays).toBe(50);
      expect(response.body.stats.totalDuration).toBe(3600);
    });

    it('should return 404 for non-existent sheikh', async () => {
      await request(app)
        .get('/sheikhs/507f1f77bcf86cd799439011')
        .expect(404);
    });
  });

  describe('GET /series', () => {
    it('should list all series', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ' });
      await Series.create([
        { titleArabic: 'سلسلة ١', sheikhId: sheikh._id },
        { titleArabic: 'سلسلة ٢', sheikhId: sheikh._id }
      ]);

      const response = await request(app)
        .get('/series')
        .expect(200);

      expect(response.body._view).toBe('public/series');
      expect(response.body.series).toHaveLength(2);
    });
  });

  describe('GET /series/:id', () => {
    it('should render series detail with lectures and stats', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const series = await Series.create({
        titleArabic: 'شرح التوحيد',
        sheikhId: sheikh._id
      });
      await Lecture.create({
        titleArabic: 'الدرس ١',
        sheikhId: sheikh._id,
        seriesId: series._id,
        published: true,
        lectureNumber: 1,
        playCount: 10,
        duration: 1800
      });

      const response = await request(app)
        .get(`/series/${series._id}`)
        .redirects(1)
        .expect(200);

      expect(response.body._view).toBe('public/series-detail');
      expect(response.body.series.titleArabic).toBe('شرح التوحيد');
      expect(response.body.lectures).toHaveLength(1);
      expect(response.body.stats.totalLectures).toBe(1);
      expect(response.body.stats.totalPlays).toBe(10);
      expect(response.body.stats.totalDuration).toBe(1800);
    });

    it('should return 404 for non-existent series', async () => {
      await request(app)
        .get('/series/507f1f77bcf86cd799439011')
        .expect(404);
    });
  });

  describe('GET /sitemap.xml', () => {
    it('should return valid XML sitemap', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ' });
      const series = await Series.create({
        titleArabic: 'سلسلة',
        sheikhId: sheikh._id
      });
      await Lecture.create({
        titleArabic: 'محاضرة',
        sheikhId: sheikh._id,
        published: true
      });

      const response = await request(app)
        .get('/sitemap.xml')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/xml');
      expect(response.text).toContain('<?xml version="1.0"');
      expect(response.text).toContain('<urlset');
      expect(response.text).toContain('rasmihassan.com');
      expect(response.text).toContain('/lectures/');
      expect(response.text).toContain('/series/');
      expect(response.text).toContain('/sheikhs/');
    });
  });

  describe('GET /robots.txt', () => {
    it('should return robots.txt', async () => {
      const response = await request(app)
        .get('/robots.txt')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('User-agent: *');
      expect(response.text).toContain('Allow: /');
      expect(response.text).toContain('Disallow: /admin/');
      expect(response.text).toContain('Sitemap:');
    });
  });
});
