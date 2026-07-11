/**
 * Integration Tests for Security Middleware
 * Tests authentication, authorization, and file validation middleware
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { Admin } = require('../../../models');
const testDb = require('../../helpers/testDb');
const {
  isAuthenticated,
  isAdmin,
  isAuthenticatedAPI,
  isAdminAPI,
  isEditor,
  isSuperAdmin
} = require('../../../middleware/auth');

let app;

describe('Security Middleware Integration Tests', () => {
  beforeAll(async () => {
    await testDb.connect();
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  beforeEach(async () => {
    await Admin.deleteMany({});

    // Create test app for each test
    app = express();
    app.use(express.json());
  });

  describe('isAuthenticated Middleware', () => {
    beforeEach(() => {
      app.get('/protected', (req, res, next) => {
        // Mock isAuthenticated
        req.isAuthenticated = () => false;
        next();
      }, isAuthenticated, (req, res) => {
        res.json({ success: true, message: 'Authenticated' });
      });

      app.get('/authenticated', (req, res, next) => {
        req.isAuthenticated = () => true;
        next();
      }, isAuthenticated, (req, res) => {
        res.json({ success: true, message: 'Authenticated' });
      });
    });

    it('should redirect to login when not authenticated', async () => {
      const response = await request(app)
        .get('/protected')
        .expect(302);

      expect(response.headers.location).toBe('/admin/login');
    });

    it('should allow access when authenticated', async () => {
      const response = await request(app)
        .get('/authenticated')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('isAuthenticatedAPI Middleware', () => {
    beforeEach(() => {
      app.get('/api/protected', (req, res, next) => {
        req.isAuthenticated = () => false;
        next();
      }, isAuthenticatedAPI, (req, res) => {
        res.json({ success: true });
      });

      app.get('/api/authenticated', (req, res, next) => {
        req.isAuthenticated = () => true;
        next();
      }, isAuthenticatedAPI, (req, res) => {
        res.json({ success: true });
      });
    });

    it('should return 401 JSON when not authenticated', async () => {
      const response = await request(app)
        .get('/api/protected')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Authentication required');
    });

    it('should allow API access when authenticated', async () => {
      const response = await request(app)
        .get('/api/authenticated')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('isAdmin Middleware', () => {
    it('should redirect to login when not authenticated', async () => {
      app.get('/admin/dashboard', (req, res, next) => {
        req.isAuthenticated = () => false;
        next();
      }, isAdmin, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/admin/dashboard')
        .expect(302);

      expect(response.headers.location).toBe('/admin/login');
    });

    it('should allow access for active admin', async () => {
      // Create active admin
      const admin = await Admin.create({
        email: 'admin@test.com',
        googleId: 'google123',
        displayName: 'Test Admin',
        role: 'admin',
        isActive: true
      });

      app.get('/admin/dashboard', (req, res, next) => {
        req.isAuthenticated = () => true;
        req.user = { _id: admin._id };
        next();
      }, isAdmin, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/admin/dashboard')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should logout inactive admin', async () => {
      const admin = await Admin.create({
        email: 'inactive@test.com',
        googleId: 'google456',
        displayName: 'Inactive Admin',
        role: 'admin',
        isActive: false
      });

      app.get('/admin/dashboard', (req, res, next) => {
        req.isAuthenticated = () => true;
        req.user = { _id: admin._id };
        req.logout = (cb) => cb();
        next();
      }, isAdmin, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/admin/dashboard')
        .expect(302);

      expect(response.headers.location).toBe('/admin/login?error=inactive');
    });
  });

  describe('isAdminAPI Middleware', () => {
    it('should return 401 when not authenticated', async () => {
      app.get('/api/admin/data', (req, res, next) => {
        req.isAuthenticated = () => false;
        next();
      }, isAdminAPI, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/api/admin/data')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Authentication required');
    });

    it('should return 403 for inactive admin', async () => {
      const admin = await Admin.create({
        email: 'inactive@test.com',
        googleId: 'google789',
        displayName: 'Inactive Admin',
        role: 'admin',
        isActive: false
      });

      app.get('/api/admin/data', (req, res, next) => {
        req.isAuthenticated = () => true;
        req.user = { _id: admin._id };
        next();
      }, isAdminAPI, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/api/admin/data')
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User is not an active admin');
    });

    it('should allow access for active admin', async () => {
      const admin = await Admin.create({
        email: 'active@test.com',
        googleId: 'google101',
        displayName: 'Active Admin',
        role: 'admin',
        isActive: true
      });

      app.get('/api/admin/data', (req, res, next) => {
        req.isAuthenticated = () => true;
        req.user = { _id: admin._id };
        next();
      }, isAdminAPI, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/api/admin/data')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 403 for non-existent admin', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      app.get('/api/admin/data', (req, res, next) => {
        req.isAuthenticated = () => true;
        req.user = { _id: fakeId };
        next();
      }, isAdminAPI, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/api/admin/data')
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('isEditor Middleware', () => {
    it('should allow access for admin role', async () => {
      const admin = await Admin.create({
        email: 'admin@test.com',
        googleId: 'google201',
        displayName: 'Admin User',
        role: 'admin',
        isActive: true
      });

      app.get('/admin/edit', (req, res, next) => {
        req.isAuthenticated = () => true;
        req.user = { _id: admin._id };
        next();
      }, isEditor, (req, res) => {
        res.json({ success: true, role: 'admin' });
      });

      const response = await request(app)
        .get('/admin/edit')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should allow access for editor role', async () => {
      const editor = await Admin.create({
        email: 'editor@test.com',
        googleId: 'google202',
        displayName: 'Editor User',
        role: 'editor',
        isActive: true
      });

      app.get('/admin/edit', (req, res, next) => {
        req.isAuthenticated = () => true;
        req.user = { _id: editor._id };
        next();
      }, isEditor, (req, res) => {
        res.json({ success: true, role: 'editor' });
      });

      const response = await request(app)
        .get('/admin/edit')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should deny access for non-existent user', async () => {
      // Test with a non-existent user ID (simulates invalid/deleted user)
      const fakeId = new mongoose.Types.ObjectId();

      app.get('/admin/edit', (req, res, next) => {
        req.isAuthenticated = () => true;
        req.user = { _id: fakeId };
        req.logout = (cb) => cb();
        next();
      }, isEditor, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/admin/edit')
        .expect(302);

      // Should redirect to login with error
      expect(response.headers.location).toBe('/admin/login?error=inactive');
    });
  });

  describe('isSuperAdmin Middleware', () => {
    it('should allow access for admin role only', async () => {
      const admin = await Admin.create({
        email: 'superadmin@test.com',
        googleId: 'google301',
        displayName: 'Super Admin',
        role: 'admin',
        isActive: true
      });

      app.get('/admin/users', (req, res, next) => {
        req.isAuthenticated = () => true;
        req.user = { _id: admin._id };
        next();
      }, isSuperAdmin, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/admin/users')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should deny access for editor role', async () => {
      const editor = await Admin.create({
        email: 'editor@test.com',
        googleId: 'google302',
        displayName: 'Editor User',
        role: 'editor',
        isActive: true
      });

      app.get('/admin/users', (req, res, next) => {
        req.isAuthenticated = () => true;
        req.user = { _id: editor._id };
        next();
      }, isSuperAdmin, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/admin/users')
        .expect(403);

      expect(response.text).toContain('Only super admins');
    });

    it('should deny access for inactive admin', async () => {
      const inactiveAdmin = await Admin.create({
        email: 'inactive.admin@test.com',
        googleId: 'google303',
        displayName: 'Inactive Super Admin',
        role: 'admin',
        isActive: false
      });

      app.get('/admin/users', (req, res, next) => {
        req.isAuthenticated = () => true;
        req.user = { _id: inactiveAdmin._id };
        next();
      }, isSuperAdmin, (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app)
        .get('/admin/users')
        .expect(403);
    });
  });
});
