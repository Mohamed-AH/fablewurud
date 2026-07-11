/**
 * Integration Tests for Sheikhs API Endpoints
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

describe('Sheikhs API Integration Tests', () => {
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

    const sheikhsRoutes = require('../../../routes/api/sheikhs');
    app.use('/api/sheikhs', sheikhsRoutes);
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

  describe('GET /api/sheikhs', () => {
    it('should return empty array when no sheikhs exist', async () => {
      const response = await request(app)
        .get('/api/sheikhs')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sheikhs).toEqual([]);
    });

    it('should return all sheikhs', async () => {
      await Sheikh.create([
        { nameArabic: 'الشيخ أحمد', nameEnglish: 'Sheikh Ahmed' },
        { nameArabic: 'الشيخ محمد', nameEnglish: 'Sheikh Mohammad' }
      ]);

      const response = await request(app)
        .get('/api/sheikhs')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sheikhs).toHaveLength(2);
    });

    it('should return sheikhs sorted by Arabic name', async () => {
      await Sheikh.create([
        { nameArabic: 'محمد', nameEnglish: 'Mohammad' },
        { nameArabic: 'أحمد', nameEnglish: 'Ahmed' }
      ]);

      const response = await request(app)
        .get('/api/sheikhs')
        .expect(200);

      // Arabic sorting: أحمد comes before محمد
      expect(response.body.sheikhs[0].nameArabic).toBe('أحمد');
      expect(response.body.sheikhs[1].nameArabic).toBe('محمد');
    });
  });

  describe('POST /api/sheikhs', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/sheikhs')
        .send({ nameArabic: 'الشيخ أحمد' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should create a new sheikh with admin auth', async () => {
      const response = await request(app)
        .post('/api/sheikhs')
        .set('x-test-auth', 'admin')
        .send({
          nameArabic: 'الشيخ أحمد',
          nameEnglish: 'Sheikh Ahmed',
          honorific: 'حفظه الله',
          bioArabic: 'عالم من العلماء',
          bioEnglish: 'A scholar'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.sheikh.nameArabic).toBe('الشيخ أحمد');
      expect(response.body.sheikh.nameEnglish).toBe('Sheikh Ahmed');
      expect(response.body.sheikh.honorific).toBe('حفظه الله');
    });

    it('should require Arabic name', async () => {
      const response = await request(app)
        .post('/api/sheikhs')
        .set('x-test-auth', 'admin')
        .send({ nameEnglish: 'Sheikh Ahmed' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Arabic name is required');
    });

    it('should use default honorific if not provided', async () => {
      const response = await request(app)
        .post('/api/sheikhs')
        .set('x-test-auth', 'admin')
        .send({ nameArabic: 'الشيخ أحمد' })
        .expect(201);

      expect(response.body.sheikh.honorific).toBe('حفظه الله');
    });

    it('should handle empty optional fields', async () => {
      const response = await request(app)
        .post('/api/sheikhs')
        .set('x-test-auth', 'admin')
        .send({ nameArabic: 'الشيخ أحمد' })
        .expect(201);

      expect(response.body.sheikh.nameEnglish).toBe('');
      expect(response.body.sheikh.bioArabic).toBe('');
      expect(response.body.sheikh.bioEnglish).toBe('');
    });
  });

  describe('PUT /api/sheikhs/:id', () => {
    let testSheikh;

    beforeEach(async () => {
      testSheikh = await Sheikh.create({
        nameArabic: 'الشيخ أحمد',
        nameEnglish: 'Sheikh Ahmed',
        honorific: 'حفظه الله'
      });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put(`/api/sheikhs/${testSheikh._id}`)
        .send({ nameArabic: 'الشيخ محمد' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should update sheikh with admin auth', async () => {
      const response = await request(app)
        .put(`/api/sheikhs/${testSheikh._id}`)
        .set('x-test-auth', 'admin')
        .send({
          nameArabic: 'الشيخ محمد',
          nameEnglish: 'Sheikh Mohammad',
          honorific: 'رحمه الله'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sheikh.nameArabic).toBe('الشيخ محمد');
      expect(response.body.sheikh.honorific).toBe('رحمه الله');
    });

    it('should return 400 for invalid ObjectId format', async () => {
      const response = await request(app)
        .put('/api/sheikhs/invalid-id')
        .set('x-test-auth', 'admin')
        .send({ nameArabic: 'الشيخ محمد' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid sheikh ID format');
    });

    it('should return 404 for non-existent sheikh', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .put(`/api/sheikhs/${fakeId}`)
        .set('x-test-auth', 'admin')
        .send({ nameArabic: 'الشيخ محمد' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Sheikh not found');
    });
  });

  describe('DELETE /api/sheikhs/:id', () => {
    let testSheikh;

    beforeEach(async () => {
      testSheikh = await Sheikh.create({
        nameArabic: 'الشيخ أحمد',
        nameEnglish: 'Sheikh Ahmed'
      });
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .delete(`/api/sheikhs/${testSheikh._id}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should delete sheikh with admin auth', async () => {
      const response = await request(app)
        .delete(`/api/sheikhs/${testSheikh._id}`)
        .set('x-test-auth', 'admin')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Sheikh deleted successfully');

      // Verify deletion
      const deletedSheikh = await Sheikh.findById(testSheikh._id);
      expect(deletedSheikh).toBeNull();
    });

    it('should return 400 for invalid ObjectId format', async () => {
      const response = await request(app)
        .delete('/api/sheikhs/invalid-id')
        .set('x-test-auth', 'admin')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid sheikh ID format');
    });

    it('should return 404 for non-existent sheikh', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .delete(`/api/sheikhs/${fakeId}`)
        .set('x-test-auth', 'admin')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Sheikh not found');
    });

    it('should prevent deletion of sheikh with lectures', async () => {
      // Create a lecture associated with the sheikh
      await Lecture.create({
        titleArabic: 'محاضرة',
        sheikhId: testSheikh._id,
        audioFileName: 'test.mp3',
        audioFileUrl: 'https://example.com/test.mp3',
        duration: 3600,
        fileSize: 50000000
      });

      const response = await request(app)
        .delete(`/api/sheikhs/${testSheikh._id}`)
        .set('x-test-auth', 'admin')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Cannot delete sheikh with');
      expect(response.body.message).toContain('lectures');

      // Verify sheikh still exists
      const sheikh = await Sheikh.findById(testSheikh._id);
      expect(sheikh).not.toBeNull();
    });

    it('should prevent deletion of sheikh with multiple lectures', async () => {
      // Create multiple lectures
      await Lecture.create([
        {
          titleArabic: 'محاضرة ١',
          sheikhId: testSheikh._id,
          audioFileName: 'test1.mp3',
          audioFileUrl: 'https://example.com/test1.mp3',
          duration: 3600,
          fileSize: 50000000
        },
        {
          titleArabic: 'محاضرة ٢',
          sheikhId: testSheikh._id,
          audioFileName: 'test2.mp3',
          audioFileUrl: 'https://example.com/test2.mp3',
          duration: 3600,
          fileSize: 50000000
        }
      ]);

      const response = await request(app)
        .delete(`/api/sheikhs/${testSheikh._id}`)
        .set('x-test-auth', 'admin')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('2 lectures');
    });
  });
});
