/**
 * Unit Tests for auth middleware
 * Tests authentication and authorization middleware functions
 */

// Mock the Admin model before requiring the middleware
jest.mock('../../models', () => ({
  Admin: {
    findById: jest.fn()
  }
}));

const { Admin } = require('../../models');
const {
  isAuthenticated,
  isAdmin,
  isAuthenticatedAPI,
  isAdminAPI,
  isEditor,
  isSuperAdmin
} = require('../../middleware/auth');

// Mongoose queries are chainable (findById().select().lean()).
// These helpers return objects that mimic that chain and are also thenable.
function mockQuery(value) {
  const q = {};
  q.select = jest.fn().mockReturnValue(q);
  q.lean = jest.fn().mockResolvedValue(value);
  q.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
  return q;
}

function mockQueryReject(error) {
  const q = {};
  q.select = jest.fn().mockReturnValue(q);
  q.lean = jest.fn().mockRejectedValue(error);
  q.then = (resolve, reject) => Promise.reject(error).then(resolve, reject);
  return q;
}

describe('Auth Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    mockReq = {
      isAuthenticated: jest.fn(() => false),
      user: { _id: '507f1f77bcf86cd799439011' },
      logout: jest.fn((cb) => cb())
    };

    mockRes = {
      redirect: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn()
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isAuthenticated()', () => {
    it('should call next() if user is authenticated', () => {
      mockReq.isAuthenticated.mockReturnValue(true);

      isAuthenticated(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.redirect).not.toHaveBeenCalled();
    });

    it('should redirect to login if user is not authenticated', () => {
      mockReq.isAuthenticated.mockReturnValue(false);

      isAuthenticated(mockReq, mockRes, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith('/admin/login');
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('isAuthenticatedAPI()', () => {
    it('should call next() if user is authenticated', () => {
      mockReq.isAuthenticated.mockReturnValue(true);

      isAuthenticatedAPI(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should return 401 JSON if user is not authenticated', () => {
      mockReq.isAuthenticated.mockReturnValue(false);

      isAuthenticatedAPI(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('isAdmin()', () => {
    it('should redirect to login if user is not authenticated', async () => {
      mockReq.isAuthenticated.mockReturnValue(false);

      await isAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith('/admin/login');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next() for active admin', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery({
        _id: '507f1f77bcf86cd799439011',
        isActive: true,
        role: 'admin'
      }));

      await isAdmin(mockReq, mockRes, mockNext);

      expect(Admin.findById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() for active editor', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery({
        _id: '507f1f77bcf86cd799439011',
        isActive: true,
        role: 'editor'
      }));

      await isAdmin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should redirect articleEditor to /article-editor', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery({
        _id: '507f1f77bcf86cd799439011',
        isActive: true,
        role: 'articleEditor'
      }));

      await isAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith('/article-editor');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should logout and redirect if admin not found', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery(null));

      await isAdmin(mockReq, mockRes, mockNext);

      expect(mockReq.logout).toHaveBeenCalled();
      expect(mockRes.redirect).toHaveBeenCalledWith('/admin/login?error=inactive');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should logout and redirect if admin is inactive', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery({
        _id: '507f1f77bcf86cd799439011',
        isActive: false
      }));

      await isAdmin(mockReq, mockRes, mockNext);

      expect(mockReq.logout).toHaveBeenCalled();
      expect(mockRes.redirect).toHaveBeenCalledWith('/admin/login?error=inactive');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle logout errors gracefully', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery({ isActive: false }));
      mockReq.logout = jest.fn((cb) => cb(new Error('Logout error')));

      await isAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith('/admin/login?error=inactive');
    });

    it('should return 500 on database error', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQueryReject(new Error('Database error')));

      await isAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('Authentication error');
    });
  });

  describe('isAdminAPI()', () => {
    it('should return 401 if not authenticated', async () => {
      mockReq.isAuthenticated.mockReturnValue(false);

      await isAdminAPI(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication required'
      });
    });

    it('should call next() for active admin', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery({
        _id: '507f1f77bcf86cd799439011',
        isActive: true,
        role: 'admin'
      }));

      await isAdminAPI(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 if admin not found', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery(null));

      await isAdminAPI(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'User is not an active admin'
      });
    });

    it('should return 403 if admin is inactive', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery({ isActive: false }));

      await isAdminAPI(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'User is not an active admin'
      });
    });

    it('should return 500 on database error', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQueryReject(new Error('Database error')));

      await isAdminAPI(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Authentication error'
      });
    });
  });

  describe('isEditor()', () => {
    it('should redirect to login if not authenticated', async () => {
      mockReq.isAuthenticated.mockReturnValue(false);

      await isEditor(mockReq, mockRes, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith('/admin/login');
    });

    it('should call next() for active admin', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery({
        isActive: true,
        role: 'admin'
      }));

      await isEditor(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() for active editor', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery({
        isActive: true,
        role: 'editor'
      }));

      await isEditor(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should logout and redirect if admin not found', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery(null));

      await isEditor(mockReq, mockRes, mockNext);

      expect(mockReq.logout).toHaveBeenCalled();
      expect(mockRes.redirect).toHaveBeenCalledWith('/admin/login?error=inactive');
    });

    it('should logout and redirect if admin is inactive', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery({ isActive: false }));

      await isEditor(mockReq, mockRes, mockNext);

      expect(mockReq.logout).toHaveBeenCalled();
      expect(mockRes.redirect).toHaveBeenCalledWith('/admin/login?error=inactive');
    });

    it('should return 403 for non-editor/non-admin roles', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery({
        isActive: true,
        role: 'viewer'
      }));

      await isEditor(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.send).toHaveBeenCalledWith('Insufficient permissions');
    });

    it('should handle logout errors gracefully', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery({ isActive: false }));
      mockReq.logout = jest.fn((cb) => cb(new Error('Logout error')));

      await isEditor(mockReq, mockRes, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith('/admin/login?error=inactive');
    });

    it('should return 500 on database error', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQueryReject(new Error('Database error')));

      await isEditor(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('Authentication error');
    });
  });

  describe('isSuperAdmin()', () => {
    it('should redirect to login if not authenticated', async () => {
      mockReq.isAuthenticated.mockReturnValue(false);

      await isSuperAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith('/admin/login');
    });

    it('should call next() for active super admin', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery({
        isActive: true,
        role: 'admin'
      }));

      await isSuperAdmin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 for admin not found', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery(null));

      await isSuperAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.send).toHaveBeenCalledWith('Only super admins can access this page');
    });

    it('should return 403 for inactive admin', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery({
        isActive: false,
        role: 'admin'
      }));

      await isSuperAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.send).toHaveBeenCalledWith('Only super admins can access this page');
    });

    it('should return 403 for non-admin role', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQuery({
        isActive: true,
        role: 'editor'
      }));

      await isSuperAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.send).toHaveBeenCalledWith('Only super admins can access this page');
    });

    it('should return 500 on database error', async () => {
      mockReq.isAuthenticated.mockReturnValue(true);
      Admin.findById.mockReturnValue(mockQueryReject(new Error('Database error')));

      await isSuperAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('Authentication error');
    });
  });
});
