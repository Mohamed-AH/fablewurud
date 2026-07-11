/**
 * Extended Integration Tests for Admin Routes
 * Tests additional admin routes for better coverage
 */

jest.mock('music-metadata');
jest.mock('../../../utils/ociStorage', () => ({
  uploadToOCI: jest.fn().mockResolvedValue({
    url: 'https://oci.test/audio.mp3',
    size: 1000
  }),
  objectExists: jest.fn().mockResolvedValue(true),
  deleteFromOCI: jest.fn().mockResolvedValue({ success: true })
}));

const request = require('supertest');
const express = require('express');
const Sheikh = require('../../../models/Sheikh');
const Series = require('../../../models/Series');
const Lecture = require('../../../models/Lecture');
const Admin = require('../../../models/Admin');
const testDb = require('../../helpers/testDb');

let app;
let adminUser;
let editorUser;

function buildApp(authUser) {
  const a = express();
  a.use(express.json());
  a.use(express.urlencoded({ extended: true }));

  a.use((req, res, next) => {
    if (authUser) {
      req.isAuthenticated = () => true;
      req.user = authUser;
      req.logout = (cb) => cb(null);
    } else {
      req.isAuthenticated = () => false;
      req.logout = (cb) => cb(null);
    }
    next();
  });

  a.use((req, res, next) => {
    res.render = (view, data) => {
      res.json({ _view: view, ...data });
    };
    next();
  });

  const adminRoutes = require('../../../routes/admin/index');
  a.use('/admin', adminRoutes);

  return a;
}

describe('Admin Routes Extended Tests', () => {
  beforeAll(async () => {
    await testDb.connect();
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

    editorUser = await Admin.create({
      email: 'editor@test.com',
      displayName: 'Test Editor',
      username: 'editor',
      role: 'editor',
      isActive: true
    });

    app = buildApp(adminUser);
  });

  describe('GET /admin/duration-status', () => {
    it('should render duration status page with stats', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      await Lecture.create([
        { titleArabic: 'with audio verified', sheikhId: sheikh._id, audioFileName: 'a.mp3', durationVerified: true },
        { titleArabic: 'with audio pending', sheikhId: sheikh._id, audioFileName: 'b.mp3', durationVerified: false },
        { titleArabic: 'no audio', sheikhId: sheikh._id, audioFileName: null }
      ]);

      const response = await request(app)
        .get('/admin/duration-status')
        .expect(200);

      expect(response.body._view).toBe('admin/duration-status');
      expect(response.body.stats.total).toBe(3);
      expect(response.body.stats.withAudio).toBe(2);
      expect(response.body.stats.verified).toBe(1);
      expect(response.body.stats.pending).toBe(1);
    });
  });

  describe('GET /admin/lectures', () => {
    it('should list lectures with search', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      await Lecture.create([
        { titleArabic: 'درس التوحيد', sheikhId: sheikh._id },
        { titleArabic: 'درس الفقه', sheikhId: sheikh._id }
      ]);

      const response = await request(app)
        .get('/admin/lectures?search=' + encodeURIComponent('التوحيد'))
        .expect(200);

      expect(response.body._view).toBe('admin/lectures-list');
      expect(response.body.lectures).toHaveLength(1);
      expect(response.body.lectures[0].titleArabic).toContain('التوحيد');
    });

    it('should filter lectures by series', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const series1 = await Series.create({ titleArabic: 'سلسلة ١', sheikhId: sheikh._id });
      const series2 = await Series.create({ titleArabic: 'سلسلة ٢', sheikhId: sheikh._id });

      await Lecture.create([
        { titleArabic: 'درس ١', sheikhId: sheikh._id, seriesId: series1._id },
        { titleArabic: 'درس ٢', sheikhId: sheikh._id, seriesId: series2._id }
      ]);

      const response = await request(app)
        .get(`/admin/lectures?seriesId=${series1._id}`)
        .expect(200);

      expect(response.body.lectures).toHaveLength(1);
      expect(response.body.lectures[0].titleArabic).toBe('درس ١');
    });
  });

  describe('POST /admin/lectures/:id/delete', () => {
    it('should delete lecture via JSON', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const lecture = await Lecture.create({
        titleArabic: 'للحذف',
        sheikhId: sheikh._id
      });

      const response = await request(app)
        .post(`/admin/lectures/${lecture._id}/delete`)
        .set('Accept', 'application/json')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(await Lecture.findById(lecture._id)).toBeNull();
    });

    it('should return 404 for non-existent lecture', async () => {
      const response = await request(app)
        .post('/admin/lectures/507f1f77bcf86cd799439011/delete')
        .set('Accept', 'application/json')
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should decrement series and sheikh lecture counts', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد', lectureCount: 1 });
      const series = await Series.create({ titleArabic: 'سلسلة', sheikhId: sheikh._id, lectureCount: 1 });
      const lecture = await Lecture.create({
        titleArabic: 'للحذف',
        sheikhId: sheikh._id,
        seriesId: series._id
      });

      await request(app)
        .post(`/admin/lectures/${lecture._id}/delete`)
        .set('Accept', 'application/json')
        .expect(200);

      const updatedSeries = await Series.findById(series._id);
      const updatedSheikh = await Sheikh.findById(sheikh._id);
      expect(updatedSeries.lectureCount).toBe(0);
      expect(updatedSheikh.lectureCount).toBe(0);
    });
  });

  describe('POST /admin/series/:id/reorder-lectures', () => {
    it('should reorder lectures in a series', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const series = await Series.create({ titleArabic: 'سلسلة', sheikhId: sheikh._id });
      const lecture1 = await Lecture.create({ titleArabic: 'درس ١', sheikhId: sheikh._id, seriesId: series._id, sortOrder: 0 });
      const lecture2 = await Lecture.create({ titleArabic: 'درس ٢', sheikhId: sheikh._id, seriesId: series._id, sortOrder: 1 });

      const response = await request(app)
        .post(`/admin/series/${series._id}/reorder-lectures`)
        .send({ lectureIds: [lecture2._id.toString(), lecture1._id.toString()] })
        .expect(200);

      expect(response.body.success).toBe(true);

      const updated1 = await Lecture.findById(lecture1._id);
      const updated2 = await Lecture.findById(lecture2._id);
      expect(updated1.sortOrder).toBe(1);
      expect(updated2.sortOrder).toBe(0);
    });

    it('should return 400 for invalid data', async () => {
      const response = await request(app)
        .post('/admin/series/507f1f77bcf86cd799439011/reorder-lectures')
        .send({ lectureIds: 'not-an-array' })
        .expect(400);

      expect(response.body.error).toContain('Invalid');
    });
  });

  describe('GET /admin/series/:id/quick-add-lecture', () => {
    it('should render quick add form', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const series = await Series.create({ titleArabic: 'سلسلة', sheikhId: sheikh._id });

      const response = await request(app)
        .get(`/admin/series/${series._id}/quick-add-lecture`)
        .expect(200);

      expect(response.body._view).toBe('admin/quick-add-lecture');
      expect(response.body.nextLectureNumber).toBe(1);
    });

    it('should return 404 for non-existent series', async () => {
      await request(app)
        .get('/admin/series/507f1f77bcf86cd799439011/quick-add-lecture')
        .expect(404);
    });

    it('should calculate next lecture number correctly', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const series = await Series.create({ titleArabic: 'سلسلة', sheikhId: sheikh._id });
      await Lecture.create({ titleArabic: 'درس ١', sheikhId: sheikh._id, seriesId: series._id, lectureNumber: 5 });

      const response = await request(app)
        .get(`/admin/series/${series._id}/quick-add-lecture`)
        .expect(200);

      expect(response.body.nextLectureNumber).toBe(6);
    });
  });

  describe('POST /admin/series/:id/quick-add-lecture', () => {
    it('should create lecture with minimal data', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const series = await Series.create({ titleArabic: 'سلسلة التوحيد', sheikhId: sheikh._id });

      const response = await request(app)
        .post(`/admin/series/${series._id}/quick-add-lecture`)
        .send({
          lectureNumber: '3',
          dateRecorded: '2024-01-15',
          sortOrder: 2
        })
        .expect(302);

      expect(response.headers.location).toContain('success=lecture_added');

      const lecture = await Lecture.findOne({ seriesId: series._id });
      expect(lecture.titleArabic).toContain('سلسلة التوحيد');
      expect(lecture.titleArabic).toContain('الدرس 3');
      expect(lecture.lectureNumber).toBe(3);
    });

    it('should return 404 for non-existent series', async () => {
      await request(app)
        .post('/admin/series/507f1f77bcf86cd799439011/quick-add-lecture')
        .send({ lectureNumber: '1' })
        .expect(404);
    });
  });

  describe('POST /admin/lectures/:id/remove-from-series', () => {
    it('should remove lecture from series', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const series = await Series.create({ titleArabic: 'سلسلة', sheikhId: sheikh._id, lectureCount: 1 });
      const lecture = await Lecture.create({ titleArabic: 'درس', sheikhId: sheikh._id, seriesId: series._id });

      const response = await request(app)
        .post(`/admin/lectures/${lecture._id}/remove-from-series`)
        .expect(200);

      expect(response.body.success).toBe(true);

      const updated = await Lecture.findById(lecture._id);
      expect(updated.seriesId).toBeNull();

      const updatedSeries = await Series.findById(series._id);
      expect(updatedSeries.lectureCount).toBe(0);
    });

    it('should return 404 for non-existent lecture', async () => {
      const response = await request(app)
        .post('/admin/lectures/507f1f77bcf86cd799439011/remove-from-series')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /admin/api/unassociated-lectures', () => {
    it('should return lectures without series', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const series = await Series.create({ titleArabic: 'سلسلة', sheikhId: sheikh._id });

      await Lecture.create([
        { titleArabic: 'مع سلسلة', sheikhId: sheikh._id, seriesId: series._id },
        { titleArabic: 'بدون سلسلة', sheikhId: sheikh._id, seriesId: null }
      ]);

      const response = await request(app)
        .get('/admin/api/unassociated-lectures')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);
      expect(response.body.lectures[0].titleArabic).toBe('بدون سلسلة');
    });
  });

  describe('POST /admin/api/series/create', () => {
    it('should create series via API', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });

      const response = await request(app)
        .post('/admin/api/series/create')
        .send({
          titleArabic: 'سلسلة جديدة',
          titleEnglish: 'New Series',
          sheikhId: sheikh._id.toString(),
          category: 'Fiqh'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.series.titleArabic).toBe('سلسلة جديدة');
    });

    it('should require titleArabic and sheikhId', async () => {
      const response = await request(app)
        .post('/admin/api/series/create')
        .send({ titleEnglish: 'No Arabic Title' })
        .expect(400);

      expect(response.body.error).toContain('required');
    });

    it('should return 404 for non-existent sheikh', async () => {
      const response = await request(app)
        .post('/admin/api/series/create')
        .send({
          titleArabic: 'سلسلة',
          sheikhId: '507f1f77bcf86cd799439011'
        })
        .expect(404);

      expect(response.body.error).toContain('Sheikh not found');
    });
  });

  describe('GET /admin/api/sheikhs', () => {
    it('should return all sheikhs', async () => {
      await Sheikh.create([
        { nameArabic: 'الشيخ أحمد' },
        { nameArabic: 'الشيخ محمد' }
      ]);

      const response = await request(app)
        .get('/admin/api/sheikhs')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sheikhs).toHaveLength(2);
    });
  });

  describe('POST /admin/lectures/:id/assign-to-series', () => {
    it('should assign lecture to series', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const series = await Series.create({ titleArabic: 'سلسلة', sheikhId: sheikh._id, category: 'Fiqh' });
      const lecture = await Lecture.create({ titleArabic: 'درس', sheikhId: sheikh._id, seriesId: null });

      const response = await request(app)
        .post(`/admin/lectures/${lecture._id}/assign-to-series`)
        .send({ seriesId: series._id.toString(), lectureNumber: 5 })
        .expect(200);

      expect(response.body.success).toBe(true);

      const updated = await Lecture.findById(lecture._id);
      expect(updated.seriesId.toString()).toBe(series._id.toString());
      expect(updated.lectureNumber).toBe(5);
      expect(updated.category).toBe('Fiqh');
    });

    it('should require seriesId', async () => {
      const response = await request(app)
        .post('/admin/lectures/507f1f77bcf86cd799439011/assign-to-series')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('required');
    });
  });

  describe('GET /admin/series/new', () => {
    it('should render new series form', async () => {
      await Sheikh.create({ nameArabic: 'الشيخ أحمد' });

      const response = await request(app)
        .get('/admin/series/new')
        .expect(200);

      expect(response.body._view).toBe('admin/series-form');
      expect(response.body.isEdit).toBe(false);
      expect(response.body.sheikhs).toHaveLength(1);
    });
  });

  describe('POST /admin/series/new', () => {
    it('should create new series', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });

      const response = await request(app)
        .post('/admin/series/new')
        .send({
          titleArabic: 'سلسلة جديدة',
          sheikhId: sheikh._id.toString(),
          category: 'Tafsir',
          isVisible: 'true'
        })
        .expect(302);

      const series = await Series.findOne({ titleArabic: 'سلسلة جديدة' });
      expect(series).not.toBeNull();
      expect(series.category).toBe('Tafsir');
    });
  });
});
