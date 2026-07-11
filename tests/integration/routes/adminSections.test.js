/**
 * Integration Tests for Admin Section and Configuration Routes
 * Tests section management, analytics settings, and homepage config
 */

jest.mock('music-metadata');

const request = require('supertest');
const express = require('express');
const Sheikh = require('../../../models/Sheikh');
const Series = require('../../../models/Series');
const Section = require('../../../models/Section');
const SiteSettings = require('../../../models/SiteSettings');
const Admin = require('../../../models/Admin');
const testDb = require('../../helpers/testDb');

let app;
let adminUser;

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

describe('Admin Section and Configuration Routes', () => {
  beforeAll(async () => {
    await testDb.connect();
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  beforeEach(async () => {
    await Sheikh.deleteMany({});
    await Series.deleteMany({});
    await Section.deleteMany({});
    await Admin.deleteMany({});
    await SiteSettings.deleteMany({});

    adminUser = await Admin.create({
      email: 'admin@test.com',
      displayName: 'Test Admin',
      username: 'admin',
      role: 'admin',
      isActive: true
    });

    app = buildApp(adminUser);
  });

  describe('Analytics Settings Routes', () => {
    it('POST /admin/analytics/settings should update settings', async () => {
      const response = await request(app)
        .post('/admin/analytics/settings')
        .send({
          showPublicStats: 'on',
          minPlaysToDisplay: '2000',
          minDownloadsToDisplay: '1000',
          minPageViewsToDisplay: '10000'
        })
        .expect(302);

      expect(response.headers.location).toContain('success=settings_updated');

      const settings = await SiteSettings.getSettings();
      expect(settings.analytics.showPublicStats).toBe(true);
      expect(settings.analytics.minPlaysToDisplay).toBe(2000);
    });

    it('POST /admin/analytics/settings should handle invalid numbers', async () => {
      const response = await request(app)
        .post('/admin/analytics/settings')
        .send({
          minPlaysToDisplay: 'invalid',
          minDownloadsToDisplay: '',
          minPageViewsToDisplay: 'abc'
        })
        .expect(302);

      expect(response.headers.location).toContain('success=settings_updated');

      const settings = await SiteSettings.getSettings();
      // Should default to 1000/500/5000 when invalid
      expect(settings.analytics.minPlaysToDisplay).toBe(1000);
      expect(settings.analytics.minDownloadsToDisplay).toBe(500);
      expect(settings.analytics.minPageViewsToDisplay).toBe(5000);
    });

    it('POST /admin/analytics/refresh-stats should refresh stats', async () => {
      const response = await request(app)
        .post('/admin/analytics/refresh-stats')
        .expect(302);

      expect(response.headers.location).toContain('success=stats_refreshed');
    });
  });

  describe('Section Management Routes', () => {
    it('GET /admin/sections should list all sections', async () => {
      const section = await Section.create({
        title: { ar: 'قسم ١', en: 'Section 1' },
        displayOrder: 0
      });

      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      await Series.create({
        titleArabic: 'سلسلة',
        sheikhId: sheikh._id,
        sectionId: section._id
      });

      const response = await request(app)
        .get('/admin/sections')
        .expect(200);

      expect(response.body._view).toBe('admin/sections');
      expect(response.body.sections).toHaveLength(1);
      expect(response.body.sections[0].seriesCount).toBe(1);
    });

    it('GET /admin/sections should count unassigned series', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
      await Series.create({
        titleArabic: 'سلسلة بدون قسم',
        sheikhId: sheikh._id,
        sectionId: null
      });

      const response = await request(app)
        .get('/admin/sections')
        .expect(200);

      expect(response.body.unassignedCount).toBe(1);
    });

    it('GET /admin/sections/new should render form', async () => {
      const response = await request(app)
        .get('/admin/sections/new')
        .expect(200);

      expect(response.body._view).toBe('admin/section-form');
      expect(response.body.isEdit).toBe(false);
    });

    it('POST /admin/sections/new should create section', async () => {
      const response = await request(app)
        .post('/admin/sections/new')
        .send({
          titleAr: 'قسم جديد',
          titleEn: 'New Section',
          descriptionAr: 'وصف',
          descriptionEn: 'Description',
          icon: '📖',
          maxVisible: '10',
          collapsedByDefault: 'on'
        })
        .expect(302);

      expect(response.headers.location).toContain('success=section_created');

      const section = await Section.findOne({ 'title.ar': 'قسم جديد' });
      expect(section).not.toBeNull();
      expect(section.icon).toBe('📖');
      expect(section.maxVisible).toBe(10);
      expect(section.collapsedByDefault).toBe(true);
    });

    it('GET /admin/sections/:id/edit should render edit form', async () => {
      const section = await Section.create({
        title: { ar: 'قسم', en: 'Section' },
        displayOrder: 0
      });

      const response = await request(app)
        .get(`/admin/sections/${section._id}/edit`)
        .expect(200);

      expect(response.body._view).toBe('admin/section-form');
      expect(response.body.isEdit).toBe(true);
      expect(response.body.section.title.ar).toBe('قسم');
    });

    it('GET /admin/sections/:id/edit should redirect for non-existent section', async () => {
      const response = await request(app)
        .get('/admin/sections/507f1f77bcf86cd799439011/edit')
        .expect(302);

      expect(response.headers.location).toContain('error=not_found');
    });

    it('POST /admin/sections/:id should update section', async () => {
      const section = await Section.create({
        title: { ar: 'قبل', en: 'Before' },
        displayOrder: 0
      });

      const response = await request(app)
        .post(`/admin/sections/${section._id}`)
        .send({
          titleAr: 'بعد',
          titleEn: 'After',
          icon: '🎓',
          maxVisible: '8',
          isVisible: 'on'
        })
        .expect(302);

      expect(response.headers.location).toContain('success=section_updated');

      const updated = await Section.findById(section._id);
      expect(updated.title.ar).toBe('بعد');
      expect(updated.icon).toBe('🎓');
      expect(updated.isVisible).toBe(true);
    });

    it('POST /admin/sections/:id should redirect for non-existent section', async () => {
      const response = await request(app)
        .post('/admin/sections/507f1f77bcf86cd799439011')
        .send({ titleAr: 'test' })
        .expect(302);

      expect(response.headers.location).toContain('error=not_found');
    });

    it('POST /admin/sections/:id/delete should delete section', async () => {
      const section = await Section.create({
        title: { ar: 'للحذف', en: 'To Delete' },
        displayOrder: 0,
        isDefault: false
      });

      const response = await request(app)
        .post(`/admin/sections/${section._id}/delete`)
        .expect(302);

      expect(response.headers.location).toContain('success=section_deleted');
      expect(await Section.findById(section._id)).toBeNull();
    });

    it('POST /admin/sections/:id/delete should unassign series', async () => {
      const section = await Section.create({
        title: { ar: 'قسم', en: 'Section' },
        displayOrder: 0,
        isDefault: false
      });

      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ' });
      const series = await Series.create({
        titleArabic: 'سلسلة',
        sheikhId: sheikh._id,
        sectionId: section._id,
        sectionOrder: 5
      });

      await request(app)
        .post(`/admin/sections/${section._id}/delete`)
        .expect(302);

      const updated = await Series.findById(series._id);
      expect(updated.sectionId).toBeNull();
      expect(updated.sectionOrder).toBe(0);
    });

    it('POST /admin/sections/:id/delete should prevent deleting default sections', async () => {
      const section = await Section.create({
        title: { ar: 'افتراضي', en: 'Default' },
        displayOrder: 0,
        isDefault: true
      });

      const response = await request(app)
        .post(`/admin/sections/${section._id}/delete`)
        .expect(302);

      expect(response.headers.location).toContain('error=cannot_delete_default');
      expect(await Section.findById(section._id)).not.toBeNull();
    });

    it('POST /admin/sections/reorder should reorder sections', async () => {
      const section1 = await Section.create({ title: { ar: '١', en: '1' }, displayOrder: 0 });
      const section2 = await Section.create({ title: { ar: '٢', en: '2' }, displayOrder: 1 });

      const response = await request(app)
        .post('/admin/sections/reorder')
        .send({
          order: [
            { id: section2._id.toString(), order: 0 },
            { id: section1._id.toString(), order: 1 }
          ]
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('POST /admin/sections/reorder should reject invalid data', async () => {
      const response = await request(app)
        .post('/admin/sections/reorder')
        .send({ order: 'not-an-array' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Section Series Management', () => {
    let section;
    let sheikh;

    beforeEach(async () => {
      section = await Section.create({
        title: { ar: 'قسم', en: 'Section' },
        displayOrder: 0
      });
      sheikh = await Sheikh.create({ nameArabic: 'الشيخ أحمد' });
    });

    it('GET /admin/sections/:id/series should list series in section', async () => {
      await Series.create({
        titleArabic: 'سلسلة في قسم',
        sheikhId: sheikh._id,
        sectionId: section._id
      });

      await Series.create({
        titleArabic: 'سلسلة بدون قسم',
        sheikhId: sheikh._id,
        sectionId: null
      });

      const response = await request(app)
        .get(`/admin/sections/${section._id}/series`)
        .expect(200);

      expect(response.body._view).toBe('admin/section-series');
      expect(response.body.seriesInSection).toHaveLength(1);
      expect(response.body.unassignedSeries).toHaveLength(1);
    });

    it('GET /admin/sections/:id/series should redirect for non-existent section', async () => {
      const response = await request(app)
        .get('/admin/sections/507f1f77bcf86cd799439011/series')
        .expect(302);

      expect(response.headers.location).toContain('error=not_found');
    });

    it('POST /admin/sections/:id/series/add should add series to section', async () => {
      const series = await Series.create({
        titleArabic: 'سلسلة',
        sheikhId: sheikh._id,
        sectionId: null
      });

      const response = await request(app)
        .post(`/admin/sections/${section._id}/series/add`)
        .send({ seriesId: series._id.toString() })
        .expect(302);

      expect(response.headers.location).toContain('success=series_added');

      const updated = await Series.findById(series._id);
      expect(updated.sectionId.toString()).toBe(section._id.toString());
    });

    it('POST /admin/sections/:id/series/add should handle non-existent series', async () => {
      const response = await request(app)
        .post(`/admin/sections/${section._id}/series/add`)
        .send({ seriesId: '507f1f77bcf86cd799439011' })
        .expect(302);

      expect(response.headers.location).toContain('error=series_not_found');
    });

    it('POST /admin/sections/:id/series/:seriesId/remove should remove series', async () => {
      const series = await Series.create({
        titleArabic: 'سلسلة',
        sheikhId: sheikh._id,
        sectionId: section._id,
        sectionOrder: 5
      });

      const response = await request(app)
        .post(`/admin/sections/${section._id}/series/${series._id}/remove`)
        .expect(302);

      expect(response.headers.location).toContain('success=series_removed');

      const updated = await Series.findById(series._id);
      expect(updated.sectionId).toBeNull();
      expect(updated.sectionOrder).toBe(0);
    });

    it('POST /admin/sections/:id/series/reorder should reorder series', async () => {
      const series1 = await Series.create({
        titleArabic: 'سلسلة ١',
        sheikhId: sheikh._id,
        sectionId: section._id,
        sectionOrder: 0
      });
      const series2 = await Series.create({
        titleArabic: 'سلسلة ٢',
        sheikhId: sheikh._id,
        sectionId: section._id,
        sectionOrder: 1
      });

      const response = await request(app)
        .post(`/admin/sections/${section._id}/series/reorder`)
        .send({
          order: [
            { id: series2._id.toString(), order: 0 },
            { id: series1._id.toString(), order: 1 }
          ]
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      const updated1 = await Series.findById(series1._id);
      const updated2 = await Series.findById(series2._id);
      expect(updated1.sectionOrder).toBe(1);
      expect(updated2.sectionOrder).toBe(0);
    });

    it('POST /admin/sections/:id/series/reorder should reject invalid data', async () => {
      const response = await request(app)
        .post(`/admin/sections/${section._id}/series/reorder`)
        .send({ order: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Series Section Assignment', () => {
    it('POST /admin/series/:id/assign-section should assign to section', async () => {
      const section = await Section.create({
        title: { ar: 'قسم', en: 'Section' },
        displayOrder: 0
      });
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ' });
      const series = await Series.create({
        titleArabic: 'سلسلة',
        sheikhId: sheikh._id,
        sectionId: null
      });

      const response = await request(app)
        .post(`/admin/series/${series._id}/assign-section`)
        .send({ sectionId: section._id.toString() })
        .expect(302);

      expect(response.headers.location).toContain('success=section_assigned');

      const updated = await Series.findById(series._id);
      expect(updated.sectionId.toString()).toBe(section._id.toString());
    });

    it('POST /admin/series/:id/assign-section should unassign when empty', async () => {
      const section = await Section.create({
        title: { ar: 'قسم', en: 'Section' },
        displayOrder: 0
      });
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ' });
      const series = await Series.create({
        titleArabic: 'سلسلة',
        sheikhId: sheikh._id,
        sectionId: section._id
      });

      const response = await request(app)
        .post(`/admin/series/${series._id}/assign-section`)
        .send({ sectionId: '' })
        .expect(302);

      expect(response.headers.location).toContain('success=section_assigned');

      const updated = await Series.findById(series._id);
      expect(updated.sectionId).toBeNull();
    });

    it('POST /admin/series/:id/assign-section should handle non-existent series', async () => {
      const response = await request(app)
        .post('/admin/series/507f1f77bcf86cd799439011/assign-section')
        .send({ sectionId: '507f1f77bcf86cd799439011' })
        .expect(302);

      expect(response.headers.location).toContain('error=series_not_found');
    });

    it('POST /admin/series/:id/assign-section should handle non-existent section', async () => {
      const sheikh = await Sheikh.create({ nameArabic: 'الشيخ' });
      const series = await Series.create({
        titleArabic: 'سلسلة',
        sheikhId: sheikh._id
      });

      const response = await request(app)
        .post(`/admin/series/${series._id}/assign-section`)
        .send({ sectionId: '507f1f77bcf86cd799439011' })
        .expect(302);

      expect(response.headers.location).toContain('error=section_not_found');
    });
  });

  describe('Homepage Configuration Routes', () => {
    it('GET /admin/homepage-config should render config page', async () => {
      const response = await request(app)
        .get('/admin/homepage-config')
        .expect(200);

      expect(response.body._view).toBe('admin/homepage-config');
    });

    it('POST /admin/homepage-config should update settings', async () => {
      const response = await request(app)
        .post('/admin/homepage-config')
        .send({
          showSchedule: 'on',
          showSeriesTab: 'on',
          showStandaloneTab: 'on',
          showKhutbasTab: 'on'
        })
        .expect(302);

      expect(response.headers.location).toContain('success=settings_updated');

      const settings = await SiteSettings.getSettings();
      expect(settings.homepage.showSchedule).toBe(true);
      expect(settings.homepage.showSeriesTab).toBe(true);
    });

    it('POST /admin/homepage-config should handle unchecked options', async () => {
      // First enable all
      await SiteSettings.findOneAndUpdate({}, {
        homepage: {
          showSchedule: true,
          showSeriesTab: true,
          showStandaloneTab: true,
          showKhutbasTab: true
        }
      }, { upsert: true });

      // Then disable by not sending them
      const response = await request(app)
        .post('/admin/homepage-config')
        .send({})
        .expect(302);

      expect(response.headers.location).toContain('success=settings_updated');

      const settings = await SiteSettings.getSettings();
      expect(settings.homepage.showSchedule).toBe(false);
      expect(settings.homepage.showSeriesTab).toBe(false);
    });
  });
});
