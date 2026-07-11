/**
 * Integration Tests for Admin Articles Routes
 *
 * Tests the complete articles admin panel functionality:
 * - List view with pagination, search, filters, sorting
 * - Create new articles
 * - Edit existing articles
 * - Delete articles (single and bulk)
 * - Toggle published status
 * - Bulk operations (publish, unpublish, delete)
 */

jest.mock('music-metadata');

const request = require('supertest');
const express = require('express');
const Article = require('../../../models/Article');
const Admin = require('../../../models/Admin');
const testDb = require('../../helpers/testDb');

// Check if MongoDB is available before running tests
const mongoAvailable = testDb.isAvailable();

let app;
let adminUser;

/**
 * Helper: build an Express app with fake auth and a JSON render stub
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

/**
 * Helper: create test articles
 */
async function createTestArticles(count = 5) {
  const articles = [];
  for (let i = 1; i <= count; i++) {
    articles.push({
      title: `مقال رقم ${i}`,
      summary: `ملخص المقال ${i}`,
      content: `محتوى المقال ${i} الكامل`,
      type: i % 2 === 0 ? 'TelegramArticle' : 'Asdaa',
      publishedAt: new Date(2024, 0, i),
      isPublished: i % 3 !== 0
    });
  }
  return Article.create(articles);
}

// Conditionally run tests based on MongoDB availability
const describeIfMongo = mongoAvailable ? describe : describe.skip;

describeIfMongo('Admin Articles Routes Integration Tests', () => {
  beforeAll(async () => {
    await testDb.connect();
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  beforeEach(async () => {
    await Article.deleteMany({});
    await Admin.deleteMany({});

    adminUser = await Admin.create({
      email: 'admin@test.com',
      displayName: 'Test Admin',
      username: 'admin',
      role: 'admin',
      isActive: true
    });

    app = buildApp(adminUser);
  });

  // Log skip reason if MongoDB is not available
  if (!mongoAvailable) {
    console.warn('Skipping Admin Articles tests: MongoDB is not available');
  }

  // ========================================
  // LIST VIEW TESTS
  // ========================================
  describe('GET /admin/articles', () => {
    it('should redirect unauthenticated users to login', async () => {
      const unauthApp = buildApp(null);

      const response = await request(unauthApp)
        .get('/admin/articles')
        .expect(302);

      expect(response.headers.location).toBe('/admin/login');
    });

    it('should render articles list with stats', async () => {
      await createTestArticles(5);

      const response = await request(app)
        .get('/admin/articles')
        .expect(200);

      expect(response.body._view).toBe('admin/articles-list');
      expect(response.body.articles).toHaveLength(5);
      expect(response.body.stats.total).toBe(5);
      expect(response.body.stats.published).toBeGreaterThan(0);
      expect(response.body.stats.draft).toBeGreaterThan(0);
    });

    it('should show empty state when no articles exist', async () => {
      const response = await request(app)
        .get('/admin/articles')
        .expect(200);

      expect(response.body.articles).toHaveLength(0);
      expect(response.body.stats.total).toBe(0);
    });

    it('should paginate results', async () => {
      // Create 25 articles (more than page limit of 20)
      await createTestArticles(25);

      const page1 = await request(app)
        .get('/admin/articles?page=1')
        .expect(200);

      expect(page1.body.articles).toHaveLength(20);
      expect(page1.body.pagination.totalPages).toBe(2);
      expect(page1.body.pagination.hasNext).toBe(true);
      expect(page1.body.pagination.hasPrev).toBe(false);

      const page2 = await request(app)
        .get('/admin/articles?page=2')
        .expect(200);

      expect(page2.body.articles).toHaveLength(5);
      expect(page2.body.pagination.hasNext).toBe(false);
      expect(page2.body.pagination.hasPrev).toBe(true);
    });

    it('should search by title', async () => {
      await Article.create([
        { title: 'أحكام الصلاة', content: 'محتوى', type: 'Asdaa', publishedAt: new Date() },
        { title: 'أحكام الزكاة', content: 'محتوى', type: 'Asdaa', publishedAt: new Date() },
        { title: 'فقه الصيام', content: 'محتوى', type: 'Asdaa', publishedAt: new Date() }
      ]);

      const response = await request(app)
        .get(`/admin/articles?search=${encodeURIComponent('أحكام')}`)
        .expect(200);

      expect(response.body.articles).toHaveLength(2);
    });

    it('should search by summary', async () => {
      await Article.create([
        { title: 'مقال ١', summary: 'ملخص عن الصلاة', content: 'محتوى', type: 'Asdaa', publishedAt: new Date() },
        { title: 'مقال ٢', summary: 'ملخص عن الزكاة', content: 'محتوى', type: 'Asdaa', publishedAt: new Date() },
        { title: 'مقال ٣', summary: 'نص آخر', content: 'محتوى', type: 'Asdaa', publishedAt: new Date() }
      ]);

      const response = await request(app)
        .get(`/admin/articles?search=${encodeURIComponent('ملخص')}`)
        .expect(200);

      expect(response.body.articles).toHaveLength(2);
    });

    it('should filter by type (Asdaa)', async () => {
      await Article.create([
        { title: 'أصداء ١', content: 'محتوى', type: 'Asdaa', publishedAt: new Date() },
        { title: 'تليجرام ١', content: 'محتوى', type: 'TelegramArticle', publishedAt: new Date() },
        { title: 'أصداء ٢', content: 'محتوى', type: 'Asdaa', publishedAt: new Date() }
      ]);

      const response = await request(app)
        .get('/admin/articles?type=Asdaa')
        .expect(200);

      expect(response.body.articles).toHaveLength(2);
      expect(response.body.articles.every(a => a.type === 'Asdaa')).toBe(true);
    });

    it('should filter by type (TelegramArticle)', async () => {
      await Article.create([
        { title: 'أصداء ١', content: 'محتوى', type: 'Asdaa', publishedAt: new Date() },
        { title: 'تليجرام ١', content: 'محتوى', type: 'TelegramArticle', publishedAt: new Date() },
        { title: 'تليجرام ٢', content: 'محتوى', type: 'TelegramArticle', publishedAt: new Date() }
      ]);

      const response = await request(app)
        .get('/admin/articles?type=TelegramArticle')
        .expect(200);

      expect(response.body.articles).toHaveLength(2);
      expect(response.body.articles.every(a => a.type === 'TelegramArticle')).toBe(true);
    });

    it('should filter by published status', async () => {
      await Article.create([
        { title: 'منشور', content: 'محتوى', type: 'Asdaa', publishedAt: new Date(), isPublished: true },
        { title: 'مسودة', content: 'محتوى', type: 'Asdaa', publishedAt: new Date(), isPublished: false },
        { title: 'منشور ٢', content: 'محتوى', type: 'Asdaa', publishedAt: new Date(), isPublished: true }
      ]);

      const publishedResponse = await request(app)
        .get('/admin/articles?status=published')
        .expect(200);

      expect(publishedResponse.body.articles).toHaveLength(2);
      expect(publishedResponse.body.articles.every(a => a.isPublished)).toBe(true);

      const draftResponse = await request(app)
        .get('/admin/articles?status=draft')
        .expect(200);

      expect(draftResponse.body.articles).toHaveLength(1);
      expect(draftResponse.body.articles.every(a => !a.isPublished)).toBe(true);
    });

    it('should sort by newest first (default)', async () => {
      await Article.create([
        { title: 'قديم', content: 'محتوى', type: 'Asdaa', publishedAt: new Date(2024, 0, 1) },
        { title: 'جديد', content: 'محتوى', type: 'Asdaa', publishedAt: new Date(2024, 5, 1) },
        { title: 'وسط', content: 'محتوى', type: 'Asdaa', publishedAt: new Date(2024, 2, 1) }
      ]);

      const response = await request(app)
        .get('/admin/articles')
        .expect(200);

      expect(response.body.articles[0].title).toBe('جديد');
      expect(response.body.articles[2].title).toBe('قديم');
    });

    it('should sort by oldest first', async () => {
      await Article.create([
        { title: 'قديم', content: 'محتوى', type: 'Asdaa', publishedAt: new Date(2024, 0, 1) },
        { title: 'جديد', content: 'محتوى', type: 'Asdaa', publishedAt: new Date(2024, 5, 1) }
      ]);

      const response = await request(app)
        .get('/admin/articles?sort=oldest')
        .expect(200);

      expect(response.body.articles[0].title).toBe('قديم');
    });

    it('should sort by title', async () => {
      await Article.create([
        { title: 'ب - مقال', content: 'محتوى', type: 'Asdaa', publishedAt: new Date() },
        { title: 'أ - مقال', content: 'محتوى', type: 'Asdaa', publishedAt: new Date() },
        { title: 'ج - مقال', content: 'محتوى', type: 'Asdaa', publishedAt: new Date() }
      ]);

      const response = await request(app)
        .get('/admin/articles?sort=title')
        .expect(200);

      expect(response.body.articles[0].title).toBe('أ - مقال');
    });

    it('should combine search and filter', async () => {
      await Article.create([
        { title: 'فقه الصلاة', content: 'محتوى', type: 'Asdaa', publishedAt: new Date(), isPublished: true },
        { title: 'فقه الزكاة', content: 'محتوى', type: 'TelegramArticle', publishedAt: new Date(), isPublished: true },
        { title: 'فقه الصيام', content: 'محتوى', type: 'Asdaa', publishedAt: new Date(), isPublished: false }
      ]);

      const response = await request(app)
        .get(`/admin/articles?search=${encodeURIComponent('فقه')}&type=Asdaa&status=published`)
        .expect(200);

      expect(response.body.articles).toHaveLength(1);
      expect(response.body.articles[0].title).toBe('فقه الصلاة');
    });
  });

  // ========================================
  // CREATE ARTICLE TESTS
  // ========================================
  describe('GET /admin/articles/new', () => {
    it('should render create form', async () => {
      const response = await request(app)
        .get('/admin/articles/new')
        .expect(200);

      expect(response.body._view).toBe('admin/article-form');
      expect(response.body.isEdit).toBe(false);
      expect(response.body.article).toBeNull();
    });
  });

  describe('POST /admin/articles/new', () => {
    it('should create new article and redirect', async () => {
      const response = await request(app)
        .post('/admin/articles/new')
        .send({
          title: 'مقال جديد',
          summary: 'ملخص المقال',
          content: 'محتوى المقال الكامل',
          type: 'Asdaa',
          publishedAt: '2024-06-15',
          sourceUrl: 'https://example.com/article',
          isPublished: 'on'
        })
        .expect(302);

      expect(response.headers.location).toContain('/admin/articles');
      expect(response.headers.location).toContain('success=article_created');

      const article = await Article.findOne({ title: 'مقال جديد' });
      expect(article).not.toBeNull();
      expect(article.summary).toBe('ملخص المقال');
      expect(article.content).toBe('محتوى المقال الكامل');
      expect(article.type).toBe('Asdaa');
      expect(article.isPublished).toBe(true);
      expect(article.sourceUrl).toBe('https://example.com/article');
    });

    it('should create article with default values', async () => {
      await request(app)
        .post('/admin/articles/new')
        .send({
          title: 'مقال بسيط',
          content: 'محتوى'
        })
        .expect(302);

      const article = await Article.findOne({ title: 'مقال بسيط' });
      expect(article.type).toBe('Asdaa');
      expect(article.isPublished).toBe(false);
      expect(article.summary).toBe('');
    });

    it('should auto-generate slug', async () => {
      await request(app)
        .post('/admin/articles/new')
        .send({
          title: 'مقال للاختبار',
          content: 'محتوى'
        })
        .expect(302);

      const article = await Article.findOne({ title: 'مقال للاختبار' });
      expect(article.slug).toBeTruthy();
      expect(article.shortId).toBeTruthy();
    });

    it('should create TelegramArticle type', async () => {
      await request(app)
        .post('/admin/articles/new')
        .send({
          title: 'مقال تليجرام',
          content: 'محتوى',
          type: 'TelegramArticle'
        })
        .expect(302);

      const article = await Article.findOne({ title: 'مقال تليجرام' });
      expect(article.type).toBe('TelegramArticle');
    });
  });

  // ========================================
  // EDIT ARTICLE TESTS
  // ========================================
  describe('GET /admin/articles/:id/edit', () => {
    it('should render edit form with article data', async () => {
      const article = await Article.create({
        title: 'مقال للتعديل',
        summary: 'ملخص',
        content: 'محتوى',
        type: 'Asdaa',
        publishedAt: new Date()
      });

      const response = await request(app)
        .get(`/admin/articles/${article._id}/edit`)
        .expect(200);

      expect(response.body._view).toBe('admin/article-form');
      expect(response.body.isEdit).toBe(true);
      expect(response.body.article.title).toBe('مقال للتعديل');
      expect(response.body.article.summary).toBe('ملخص');
    });

    it('should redirect with error for non-existent article', async () => {
      const response = await request(app)
        .get('/admin/articles/507f1f77bcf86cd799439011/edit')
        .expect(302);

      expect(response.headers.location).toContain('error=not_found');
    });
  });

  describe('POST /admin/articles/:id/edit', () => {
    it('should update article and redirect', async () => {
      const article = await Article.create({
        title: 'قبل التعديل',
        content: 'محتوى قديم',
        type: 'Asdaa',
        publishedAt: new Date(),
        isPublished: false
      });

      const response = await request(app)
        .post(`/admin/articles/${article._id}/edit`)
        .send({
          title: 'بعد التعديل',
          summary: 'ملخص جديد',
          content: 'محتوى جديد',
          type: 'TelegramArticle',
          isPublished: 'on'
        })
        .expect(302);

      expect(response.headers.location).toContain('success=article_updated');

      const updated = await Article.findById(article._id);
      expect(updated.title).toBe('بعد التعديل');
      expect(updated.summary).toBe('ملخص جديد');
      expect(updated.content).toBe('محتوى جديد');
      expect(updated.type).toBe('TelegramArticle');
      expect(updated.isPublished).toBe(true);
    });

    it('should allow updating slug', async () => {
      const article = await Article.create({
        title: 'مقال',
        content: 'محتوى',
        type: 'Asdaa',
        publishedAt: new Date(),
        slug: 'original-slug'
      });

      await request(app)
        .post(`/admin/articles/${article._id}/edit`)
        .send({
          title: 'مقال',
          content: 'محتوى',
          slug: 'new-slug'
        })
        .expect(302);

      const updated = await Article.findById(article._id);
      expect(updated.slug).toBe('new-slug');
    });

    it('should redirect with error for non-existent article', async () => {
      const response = await request(app)
        .post('/admin/articles/507f1f77bcf86cd799439011/edit')
        .send({ title: 'test', content: 'test' })
        .expect(302);

      expect(response.headers.location).toContain('error=not_found');
    });
  });

  // ========================================
  // DELETE ARTICLE TESTS
  // ========================================
  describe('POST /admin/articles/:id/delete', () => {
    it('should delete article (JSON response)', async () => {
      const article = await Article.create({
        title: 'للحذف',
        content: 'محتوى',
        type: 'Asdaa',
        publishedAt: new Date()
      });

      const response = await request(app)
        .post(`/admin/articles/${article._id}/delete`)
        .set('Accept', 'application/json')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(await Article.findById(article._id)).toBeNull();
    });

    it('should delete article (redirect response)', async () => {
      const article = await Article.create({
        title: 'للحذف',
        content: 'محتوى',
        type: 'Asdaa',
        publishedAt: new Date()
      });

      const response = await request(app)
        .post(`/admin/articles/${article._id}/delete`)
        .expect(302);

      expect(response.headers.location).toContain('success=article_deleted');
      expect(await Article.findById(article._id)).toBeNull();
    });

    it('should return 404 for non-existent article', async () => {
      const response = await request(app)
        .post('/admin/articles/507f1f77bcf86cd799439011/delete')
        .set('Accept', 'application/json')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ========================================
  // TOGGLE PUBLISHED TESTS
  // ========================================
  describe('POST /admin/articles/:id/toggle-published', () => {
    it('should toggle published status from false to true', async () => {
      const article = await Article.create({
        title: 'مقال',
        content: 'محتوى',
        type: 'Asdaa',
        publishedAt: new Date(),
        isPublished: false
      });

      const response = await request(app)
        .post(`/admin/articles/${article._id}/toggle-published`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.isPublished).toBe(true);

      const updated = await Article.findById(article._id);
      expect(updated.isPublished).toBe(true);
    });

    it('should toggle published status from true to false', async () => {
      const article = await Article.create({
        title: 'مقال',
        content: 'محتوى',
        type: 'Asdaa',
        publishedAt: new Date(),
        isPublished: true
      });

      const response = await request(app)
        .post(`/admin/articles/${article._id}/toggle-published`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.isPublished).toBe(false);
    });

    it('should return 404 for non-existent article', async () => {
      const response = await request(app)
        .post('/admin/articles/507f1f77bcf86cd799439011/toggle-published')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ========================================
  // BULK OPERATIONS TESTS
  // ========================================
  describe('POST /admin/articles/bulk', () => {
    it('should bulk delete articles', async () => {
      const articles = await Article.create([
        { title: 'للحذف ١', content: 'محتوى', type: 'Asdaa', publishedAt: new Date() },
        { title: 'للحذف ٢', content: 'محتوى', type: 'Asdaa', publishedAt: new Date() },
        { title: 'للإبقاء', content: 'محتوى', type: 'Asdaa', publishedAt: new Date() }
      ]);

      const response = await request(app)
        .post('/admin/articles/bulk')
        .send({
          action: 'delete',
          articleIds: [articles[0]._id.toString(), articles[1]._id.toString()]
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.affected).toBe(2);

      expect(await Article.countDocuments()).toBe(1);
      expect(await Article.findById(articles[2]._id)).not.toBeNull();
    });

    it('should bulk publish articles', async () => {
      const articles = await Article.create([
        { title: 'مقال ١', content: 'محتوى', type: 'Asdaa', publishedAt: new Date(), isPublished: false },
        { title: 'مقال ٢', content: 'محتوى', type: 'Asdaa', publishedAt: new Date(), isPublished: false },
        { title: 'مقال ٣', content: 'محتوى', type: 'Asdaa', publishedAt: new Date(), isPublished: false }
      ]);

      const response = await request(app)
        .post('/admin/articles/bulk')
        .send({
          action: 'publish',
          articleIds: [articles[0]._id.toString(), articles[1]._id.toString()]
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      const updated = await Article.find({}).lean();
      expect(updated.filter(a => a.isPublished)).toHaveLength(2);
    });

    it('should bulk unpublish articles', async () => {
      const articles = await Article.create([
        { title: 'مقال ١', content: 'محتوى', type: 'Asdaa', publishedAt: new Date(), isPublished: true },
        { title: 'مقال ٢', content: 'محتوى', type: 'Asdaa', publishedAt: new Date(), isPublished: true },
        { title: 'مقال ٣', content: 'محتوى', type: 'Asdaa', publishedAt: new Date(), isPublished: true }
      ]);

      const response = await request(app)
        .post('/admin/articles/bulk')
        .send({
          action: 'unpublish',
          articleIds: [articles[0]._id.toString(), articles[1]._id.toString()]
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      const updated = await Article.find({}).lean();
      const unpublished = updated.filter(a => !a.isPublished);
      expect(unpublished).toHaveLength(2);
    });

    it('should return error for empty selection', async () => {
      const response = await request(app)
        .post('/admin/articles/bulk')
        .send({
          action: 'delete',
          articleIds: []
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('No articles selected');
    });

    it('should return error for missing articleIds', async () => {
      const response = await request(app)
        .post('/admin/articles/bulk')
        .send({ action: 'delete' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return error for invalid action', async () => {
      const article = await Article.create({
        title: 'مقال',
        content: 'محتوى',
        type: 'Asdaa',
        publishedAt: new Date()
      });

      const response = await request(app)
        .post('/admin/articles/bulk')
        .send({
          action: 'invalid_action',
          articleIds: [article._id.toString()]
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid action');
    });
  });

  // ========================================
  // DASHBOARD INTEGRATION TESTS
  // ========================================
  describe('Dashboard Article Stats', () => {
    it('should include totalArticles in dashboard stats', async () => {
      await createTestArticles(10);

      const response = await request(app)
        .get('/admin/dashboard')
        .expect(200);

      expect(response.body.stats.totalArticles).toBe(10);
    });
  });

  // ========================================
  // AUTHENTICATION TESTS
  // ========================================
  describe('Authentication', () => {
    it('should require authentication for all article routes', async () => {
      const unauthApp = buildApp(null);
      const article = await Article.create({
        title: 'مقال',
        content: 'محتوى',
        type: 'Asdaa',
        publishedAt: new Date()
      });

      // Test all routes require auth
      const routes = [
        ['get', '/admin/articles'],
        ['get', '/admin/articles/new'],
        ['post', '/admin/articles/new'],
        ['get', `/admin/articles/${article._id}/edit`],
        ['post', `/admin/articles/${article._id}/edit`],
        ['post', `/admin/articles/${article._id}/delete`],
        ['post', `/admin/articles/${article._id}/toggle-published`],
        ['post', '/admin/articles/bulk']
      ];

      for (const [method, path] of routes) {
        const response = await request(unauthApp)[method](path).expect(302);
        expect(response.headers.location).toBe('/admin/login');
      }
    });
  });
});
