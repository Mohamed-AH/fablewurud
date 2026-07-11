/**
 * Integration Tests for Admin Routes
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
let editorUser;

/**
 * Helper: build an Express app with fake auth and a JSON render stub
 * so we don't need the full EJS template infrastructure.
 */
function buildApp(authUser) {
  const a = express();
  a.use(express.json());
  a.use(express.urlencoded({ extended: true }));

  // Stub passport methods
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

  // Stub res.render to return JSON instead of rendering templates
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

describe('Admin Routes Integration Tests', () => {
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

  describe('GET /admin/login', () => {
    it('should render login page for unauthenticated users', async () => {
      const unauthApp = buildApp(null);

      const response = await request(unauthApp)
        .get('/admin/login')
        .expect(200);

      expect(response.body._view).toBe('admin/login');
      expect(response.body.title).toBe('Admin Login');
      expect(response.body.errorMessage).toBe('');
    });

    it('should redirect authenticated users to dashboard', async () => {
      const response = await request(app)
        .get('/admin/login')
        .expect(302);

      expect(response.headers.location).toBe('/admin/dashboard');
    });

    it('should show unauthorized error message', async () => {
      const unauthApp = buildApp(null);

      const response = await request(unauthApp)
        .get('/admin/login?error=unauthorized')
        .expect(200);

      expect(response.body.errorMessage).toContain('not authorized');
    });

    it('should show inactive error message', async () => {
      const unauthApp = buildApp(null);

      const response = await request(unauthApp)
        .get('/admin/login?error=inactive')
        .expect(200);

      expect(response.body.errorMessage).toContain('deactivated');
    });
  });

  describe('GET /admin/dashboard', () => {
    it('should redirect unauthenticated users', async () => {
      const unauthApp = buildApp(null);

      const response = await request(unauthApp)
        .get('/admin/dashboard')
        .expect(302);

      expect(response.headers.location).toBe('/admin/login');
    });

    it('should render dashboard with stats', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const series = await Series.create({
        titleArabic: 'سلسلة',
        sheikhId: sheikh._id
      });
      await Lecture.create({
        titleArabic: 'محاضرة',
        sheikhId: sheikh._id,
        seriesId: series._id,
        published: true,
        playCount: 10,
        downloadCount: 5
      });

      const response = await request(app)
        .get('/admin/dashboard')
        .expect(200);

      expect(response.body._view).toBe('admin/dashboard');
      expect(response.body.stats.totalLectures).toBe(1);
      expect(response.body.stats.publishedLectures).toBe(1);
      expect(response.body.stats.totalSheikhs).toBe(1);
      expect(response.body.stats.totalSeries).toBe(1);
      expect(response.body.stats.totalPlays).toBe(10);
      expect(response.body.stats.totalDownloads).toBe(5);
      expect(response.body.recentLectures).toHaveLength(1);
    });
  });

  describe('GET /admin/upload', () => {
    it('should render upload page', async () => {
      const response = await request(app)
        .get('/admin/upload')
        .expect(200);

      expect(response.body._view).toBe('admin/upload');
      expect(response.body.title).toBe('Upload Lecture');
    });
  });

  describe('GET /admin/bulk-upload', () => {
    it('should render bulk upload page', async () => {
      const response = await request(app)
        .get('/admin/bulk-upload')
        .expect(200);

      expect(response.body._view).toBe('admin/bulk-upload');
    });
  });

  describe('GET /admin/manage', () => {
    it('should render manage page with lectures and series', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      await Series.create({ titleArabic: 'سلسلة', sheikhId: sheikh._id });
      await Lecture.create({
        titleArabic: 'محاضرة',
        sheikhId: sheikh._id,
        published: true
      });

      const response = await request(app)
        .get('/admin/manage')
        .expect(200);

      expect(response.body._view).toBe('admin/manage');
      expect(response.body.lectures).toHaveLength(1);
      expect(response.body.series).toHaveLength(1);
    });
  });

  describe('GET /admin/lectures/unpublished', () => {
    it('should list only unpublished lectures', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      await Lecture.create([
        { titleArabic: 'منشورة', sheikhId: sheikh._id, published: true },
        { titleArabic: 'غير منشورة', sheikhId: sheikh._id, published: false }
      ]);

      const response = await request(app)
        .get('/admin/lectures/unpublished')
        .expect(200);

      expect(response.body._view).toBe('admin/unpublished-lectures');
      expect(response.body.lectures).toHaveLength(1);
      expect(response.body.lectures[0].titleArabic).toBe('غير منشورة');
    });
  });

  describe('GET /admin/lectures/no-audio', () => {
    it('should list lectures without audio', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      await Lecture.create([
        { titleArabic: 'بدون صوت', sheikhId: sheikh._id, audioFileName: null },
        { titleArabic: 'بدون صوت ٢', sheikhId: sheikh._id, audioFileName: '' },
        { titleArabic: 'مع صوت', sheikhId: sheikh._id, audioFileName: 'file.mp3' }
      ]);

      const response = await request(app)
        .get('/admin/lectures/no-audio')
        .expect(200);

      expect(response.body._view).toBe('admin/no-audio-lectures');
      expect(response.body.lectures).toHaveLength(2);
    });
  });

  describe('POST /admin/lectures/:id/toggle-published', () => {
    it('should toggle published status', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const lecture = await Lecture.create({
        titleArabic: 'محاضرة',
        sheikhId: sheikh._id,
        published: false
      });

      const response = await request(app)
        .post(`/admin/lectures/${lecture._id}/toggle-published`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.published).toBe(true);

      // Toggle again
      const response2 = await request(app)
        .post(`/admin/lectures/${lecture._id}/toggle-published`)
        .expect(200);

      expect(response2.body.published).toBe(false);
    });

    it('should return 404 for non-existent lecture', async () => {
      const response = await request(app)
        .post('/admin/lectures/507f1f77bcf86cd799439011/toggle-published')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Series Edit Routes', () => {
    it('GET /admin/series/:id/edit should render edit form', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const series = await Series.create({
        titleArabic: 'سلسلة',
        sheikhId: sheikh._id,
        category: 'Fiqh'
      });

      const response = await request(app)
        .get(`/admin/series/${series._id}/edit`)
        .expect(200);

      expect(response.body._view).toBe('admin/edit-series');
      expect(response.body.series.titleArabic).toBe('سلسلة');
      expect(response.body.sheikhs).toHaveLength(1);
    });

    it('GET /admin/series/:id/edit should return 404 for missing series', async () => {
      await request(app)
        .get('/admin/series/507f1f77bcf86cd799439011/edit')
        .expect(404);
    });

    it('POST /admin/series/:id/edit should update and redirect', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const series = await Series.create({
        titleArabic: 'قبل',
        sheikhId: sheikh._id
      });

      const response = await request(app)
        .post(`/admin/series/${series._id}/edit`)
        .send({
          titleArabic: 'بعد',
          category: 'Hadith',
          tags: 'khutba'
        })
        .expect(302);

      expect(response.headers.location).toContain('/admin/series/');
      expect(response.headers.location).toContain('success=updated');

      const updated = await Series.findById(series._id);
      expect(updated.titleArabic).toBe('بعد');
      expect(updated.tags).toEqual(['khutba']);
    });

    it('POST /admin/series/:id/edit should handle array tags', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const series = await Series.create({
        titleArabic: 'سلسلة',
        sheikhId: sheikh._id
      });

      await request(app)
        .post(`/admin/series/${series._id}/edit`)
        .send({
          titleArabic: 'سلسلة',
          tags: ['tag1', 'tag2']
        })
        .expect(302);

      const updated = await Series.findById(series._id);
      expect(updated.tags).toEqual(['tag1', 'tag2']);
    });
  });

  describe('Lecture Edit Routes', () => {
    it('GET /admin/lectures/:id/edit should render edit form', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const lecture = await Lecture.create({
        titleArabic: 'محاضرة',
        sheikhId: sheikh._id
      });

      const response = await request(app)
        .get(`/admin/lectures/${lecture._id}/edit`)
        .expect(200);

      expect(response.body._view).toBe('admin/edit-lecture');
      expect(response.body.lecture.titleArabic).toBe('محاضرة');
    });

    it('GET /admin/lectures/:id/edit should return 404 for missing lecture', async () => {
      await request(app)
        .get('/admin/lectures/507f1f77bcf86cd799439011/edit')
        .expect(404);
    });

    it('POST /admin/lectures/:id/edit should update and redirect', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      const lecture = await Lecture.create({
        titleArabic: 'قبل',
        sheikhId: sheikh._id,
        published: false
      });

      const response = await request(app)
        .post(`/admin/lectures/${lecture._id}/edit`)
        .send({
          titleArabic: 'بعد',
          lectureNumber: '5',
          published: 'true',
          category: 'Tafsir',
          tags: 'important'
        })
        .expect(302);

      expect(response.headers.location).toContain('/admin/manage');

      const updated = await Lecture.findById(lecture._id);
      expect(updated.titleArabic).toBe('بعد');
      expect(updated.lectureNumber).toBe(5);
      expect(updated.published).toBe(true);
      expect(updated.tags).toEqual(['important']);
    });
  });

  describe('Sheikh Routes', () => {
    it('GET /admin/sheikhs should list sheikhs with lecture counts', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      await Lecture.create({
        titleArabic: 'محاضرة',
        sheikhId: sheikh._id,
        published: true
      });

      const response = await request(app)
        .get('/admin/sheikhs')
        .expect(200);

      expect(response.body._view).toBe('admin/sheikhs');
      expect(response.body.sheikhs).toHaveLength(1);
      expect(response.body.sheikhs[0].actualLectureCount).toBe(1);
    });

    it('GET /admin/sheikhs/new should render form', async () => {
      const response = await request(app)
        .get('/admin/sheikhs/new')
        .expect(200);

      expect(response.body._view).toBe('admin/sheikh-form');
      expect(response.body.isEdit).toBe(false);
    });

    it('POST /admin/sheikhs should create sheikh', async () => {
      const response = await request(app)
        .post('/admin/sheikhs')
        .send({
          nameArabic: 'الشيخ الجديد',
          nameEnglish: 'New Sheikh',
          honorific: 'رحمه الله'
        })
        .expect(302);

      expect(response.headers.location).toContain('/admin/sheikhs');

      const sheikh = await Sheikh.findOne({ nameArabic: 'الشيخ الجديد' });
      expect(sheikh).not.toBeNull();
      expect(sheikh.honorific).toBe('رحمه الله');
    });

    it('POST /admin/sheikhs should default honorific', async () => {
      await request(app)
        .post('/admin/sheikhs')
        .send({ nameArabic: 'الشيخ' })
        .expect(302);

      const sheikh = await Sheikh.findOne({ nameArabic: 'الشيخ' });
      expect(sheikh.honorific).toBe('حفظه الله');
    });

    it('GET /admin/sheikhs/:id/edit should render edit form', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });

      const response = await request(app)
        .get(`/admin/sheikhs/${sheikh._id}/edit`)
        .expect(200);

      expect(response.body._view).toBe('admin/sheikh-form');
      expect(response.body.isEdit).toBe(true);
      expect(response.body.sheikh.nameArabic).toBe('الشيخ أحمد');
    });

    it('POST /admin/sheikhs/:id/edit should update sheikh', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'قبل' });

      await request(app)
        .post(`/admin/sheikhs/${sheikh._id}/edit`)
        .send({ nameArabic: 'بعد', nameEnglish: 'After' })
        .expect(302);

      const updated = await Sheikh.findById(sheikh._id);
      expect(updated.nameArabic).toBe('بعد');
    });

    it('POST /admin/sheikhs/:id/delete should delete sheikh without content', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'للحذف' });

      const response = await request(app)
        .post(`/admin/sheikhs/${sheikh._id}/delete`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(await Sheikh.findById(sheikh._id)).toBeNull();
    });

    it('POST /admin/sheikhs/:id/delete should prevent deleting sheikh with lectures', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ' });
      await Lecture.create({ titleArabic: 'محاضرة', sheikhId: sheikh._id });

      const response = await request(app)
        .post(`/admin/sheikhs/${sheikh._id}/delete`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Cannot delete');
    });

    it('POST /admin/sheikhs/:id/delete should prevent deleting sheikh with series', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ' });
      await Series.create({ titleArabic: 'سلسلة', sheikhId: sheikh._id });

      const response = await request(app)
        .post(`/admin/sheikhs/${sheikh._id}/delete`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('User Management Routes (Super Admin)', () => {
    it('GET /admin/users should list all users', async () => {
      const response = await request(app)
        .get('/admin/users')
        .expect(200);

      expect(response.body._view).toBe('admin/users');
      expect(response.body.users.length).toBeGreaterThanOrEqual(2);
    });

    it('GET /admin/users should deny non-admin users', async () => {
      const editorApp = buildApp(editorUser);

      const response = await request(editorApp)
        .get('/admin/users')
        .expect(403);

      expect(response.text).toContain('super admins');
    });

    it('POST /admin/users/add should create new user', async () => {
      const response = await request(app)
        .post('/admin/users/add')
        .send({
          email: 'new@test.com',
          displayName: 'New User',
          role: 'editor'
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      const user = await Admin.findOne({ email: 'new@test.com' });
      expect(user.role).toBe('editor');
      expect(user.username).toBe('new');
    });

    it('POST /admin/users/add should require email and displayName', async () => {
      const response = await request(app)
        .post('/admin/users/add')
        .send({ role: 'editor' })
        .expect(400);

      expect(response.body.message).toContain('required');
    });

    it('POST /admin/users/add should reject invalid role', async () => {
      const response = await request(app)
        .post('/admin/users/add')
        .send({
          email: 'x@test.com',
          displayName: 'X',
          role: 'superuser'
        })
        .expect(400);

      expect(response.body.message).toContain('Invalid role');
    });

    it('POST /admin/users/add should reject duplicate email', async () => {
      const response = await request(app)
        .post('/admin/users/add')
        .send({
          email: 'admin@test.com',
          displayName: 'Dup',
          role: 'editor'
        })
        .expect(400);

      expect(response.body.message).toContain('already exists');
    });

    it('POST /admin/users/:id/role should update role', async () => {
      const response = await request(app)
        .post(`/admin/users/${editorUser._id}/role`)
        .send({ role: 'admin' })
        .expect(200);

      expect(response.body.success).toBe(true);

      const updated = await Admin.findById(editorUser._id);
      expect(updated.role).toBe('admin');
    });

    it('POST /admin/users/:id/role should prevent changing own role', async () => {
      const response = await request(app)
        .post(`/admin/users/${adminUser._id}/role`)
        .send({ role: 'editor' })
        .expect(400);

      expect(response.body.message).toContain('own role');
    });

    it('POST /admin/users/:id/role should reject invalid role', async () => {
      const response = await request(app)
        .post(`/admin/users/${editorUser._id}/role`)
        .send({ role: 'invalid' })
        .expect(400);

      expect(response.body.message).toContain('Invalid role');
    });

    it('POST /admin/users/:id/toggle-active should toggle status', async () => {
      const response = await request(app)
        .post(`/admin/users/${editorUser._id}/toggle-active`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.isActive).toBe(false);
    });

    it('POST /admin/users/:id/toggle-active should prevent self-deactivation', async () => {
      const response = await request(app)
        .post(`/admin/users/${adminUser._id}/toggle-active`)
        .expect(400);

      expect(response.body.message).toContain('own account');
    });

    it('POST /admin/users/:id/toggle-active should return 404 for missing user', async () => {
      const response = await request(app)
        .post('/admin/users/507f1f77bcf86cd799439011/toggle-active')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });
});
