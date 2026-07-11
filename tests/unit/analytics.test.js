/**
 * Unit Tests for analytics middleware
 * Tests page view tracking and analytics helpers
 */

// Mock the models
jest.mock('../../models', () => ({
  PageView: {
    recordView: jest.fn(),
    getSummary: jest.fn()
  },
  Lecture: {
    find: jest.fn(),
    aggregate: jest.fn()
  },
  SiteSettings: {
    getSettings: jest.fn()
  }
}));

const { PageView, Lecture, SiteSettings } = require('../../models');
const {
  trackPageView,
  getAnalyticsSummary,
  getTopLectures,
  getTopDownloads
} = require('../../middleware/analytics');

describe('Analytics Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('trackPageView()', () => {
    let mockReq;
    let mockRes;
    let next;

    beforeEach(() => {
      mockReq = {
        path: '/',
        method: 'GET',
        get: jest.fn().mockReturnValue('Mozilla/5.0')
      };
      mockRes = {};
      next = jest.fn();
    });

    it('should skip API routes', () => {
      mockReq.path = '/api/lectures';

      trackPageView(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
      expect(PageView.recordView).not.toHaveBeenCalled();
    });

    it('should skip admin routes', () => {
      mockReq.path = '/admin/dashboard';

      trackPageView(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
      expect(PageView.recordView).not.toHaveBeenCalled();
    });

    it('should skip auth routes', () => {
      mockReq.path = '/auth/google';

      trackPageView(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
      expect(PageView.recordView).not.toHaveBeenCalled();
    });

    it('should skip stream routes', () => {
      mockReq.path = '/stream/audio.mp3';

      trackPageView(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
      expect(PageView.recordView).not.toHaveBeenCalled();
    });

    it('should skip download routes', () => {
      mockReq.path = '/download/audio.mp3';

      trackPageView(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
      expect(PageView.recordView).not.toHaveBeenCalled();
    });

    it('should skip static files', () => {
      mockReq.path = '/css/styles.css';

      trackPageView(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
      expect(PageView.recordView).not.toHaveBeenCalled();
    });

    it('should skip non-GET requests', () => {
      mockReq.method = 'POST';

      trackPageView(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
      expect(PageView.recordView).not.toHaveBeenCalled();
    });

    it('should skip bot requests - Googlebot', () => {
      mockReq.get.mockReturnValue('Googlebot/2.1');

      trackPageView(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
      expect(PageView.recordView).not.toHaveBeenCalled();
    });

    it('should skip bot requests - Bingbot', () => {
      mockReq.get.mockReturnValue('Mozilla/5.0 (compatible; bingbot/2.0)');

      trackPageView(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
      expect(PageView.recordView).not.toHaveBeenCalled();
    });

    it('should skip bot requests - crawler', () => {
      mockReq.get.mockReturnValue('Mozilla/5.0 crawler');

      trackPageView(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
      expect(PageView.recordView).not.toHaveBeenCalled();
    });

    it('should skip bot requests - spider', () => {
      mockReq.get.mockReturnValue('Spider Bot 1.0');

      trackPageView(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
      expect(PageView.recordView).not.toHaveBeenCalled();
    });

    it('should track homepage view', (done) => {
      mockReq.path = '/';
      PageView.recordView.mockResolvedValue({});

      trackPageView(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();

      // Give setImmediate time to run
      setImmediate(() => {
        expect(PageView.recordView).toHaveBeenCalledWith('/', 'homepage', null);
        done();
      });
    });

    it('should track lecture page view', (done) => {
      mockReq.path = '/lectures/123';
      PageView.recordView.mockResolvedValue({});

      trackPageView(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();

      setImmediate(() => {
        expect(PageView.recordView).toHaveBeenCalledWith('/lectures/123', 'lecture', null);
        done();
      });
    });

    it('should track series page view', (done) => {
      mockReq.path = '/series/test-series';
      PageView.recordView.mockResolvedValue({});

      trackPageView(mockReq, mockRes, next);

      setImmediate(() => {
        expect(PageView.recordView).toHaveBeenCalledWith('/series/test-series', 'series', null);
        done();
      });
    });

    it('should track sheikh page view', (done) => {
      mockReq.path = '/sheikhs/sheikh-name';
      PageView.recordView.mockResolvedValue({});

      trackPageView(mockReq, mockRes, next);

      setImmediate(() => {
        expect(PageView.recordView).toHaveBeenCalledWith('/sheikhs/sheikh-name', 'sheikh', null);
        done();
      });
    });

    it('should track browse page view', (done) => {
      mockReq.path = '/browse';
      PageView.recordView.mockResolvedValue({});

      trackPageView(mockReq, mockRes, next);

      setImmediate(() => {
        expect(PageView.recordView).toHaveBeenCalledWith('/browse', 'browse', null);
        done();
      });
    });

    it('should track other pages as "other" type', (done) => {
      mockReq.path = '/about';
      PageView.recordView.mockResolvedValue({});

      trackPageView(mockReq, mockRes, next);

      setImmediate(() => {
        expect(PageView.recordView).toHaveBeenCalledWith('/about', 'other', null);
        done();
      });
    });

    it('should handle recordView errors gracefully', (done) => {
      mockReq.path = '/';
      PageView.recordView.mockRejectedValue(new Error('Database error'));

      trackPageView(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();

      setImmediate(() => {
        // Should not throw
        expect(console.error).toHaveBeenCalled();
        done();
      });
    });

    it('should handle missing User-Agent', (done) => {
      mockReq.get.mockReturnValue('');
      mockReq.path = '/';
      PageView.recordView.mockResolvedValue({});

      trackPageView(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();

      setImmediate(() => {
        expect(PageView.recordView).toHaveBeenCalled();
        done();
      });
    });
  });

  describe('getAnalyticsSummary()', () => {
    it('should return analytics summary', async () => {
      PageView.getSummary.mockResolvedValue({
        today: 100,
        thisWeek: 500,
        thisMonth: 2000
      });

      Lecture.aggregate.mockResolvedValue([{
        totalPlays: 5000,
        totalDownloads: 1000,
        count: 150
      }]);

      SiteSettings.getSettings.mockResolvedValue({
        analytics: {
          showPublicStats: true,
          minPlaysToDisplay: 10,
          minDownloadsToDisplay: 5,
          minPageViewsToDisplay: 100
        },
        shouldShowPublicStats: () => true
      });

      const result = await getAnalyticsSummary();

      expect(result).toEqual({
        pageViews: {
          today: 100,
          thisWeek: 500,
          thisMonth: 2000
        },
        lectures: {
          total: 150,
          totalPlays: 5000,
          totalDownloads: 1000
        },
        settings: {
          showPublicStats: true,
          thresholds: {
            plays: 10,
            downloads: 5,
            pageViews: 100
          }
        },
        shouldShowPublic: true
      });
    });

    it('should handle empty lecture stats', async () => {
      PageView.getSummary.mockResolvedValue({ today: 0 });
      Lecture.aggregate.mockResolvedValue([]);
      SiteSettings.getSettings.mockResolvedValue({
        analytics: {
          showPublicStats: false,
          minPlaysToDisplay: 0,
          minDownloadsToDisplay: 0,
          minPageViewsToDisplay: 0
        },
        shouldShowPublicStats: () => false
      });

      const result = await getAnalyticsSummary();

      expect(result.lectures).toEqual({
        total: 0,
        totalPlays: 0,
        totalDownloads: 0
      });
    });
  });

  describe('getTopLectures()', () => {
    it('should return top lectures by play count', async () => {
      const mockLectures = [
        { titleArabic: 'Lecture 1', playCount: 100, slug: 'lecture-1' },
        { titleArabic: 'Lecture 2', playCount: 80, slug: 'lecture-2' }
      ];

      Lecture.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockLectures)
      });

      const result = await getTopLectures(10);

      expect(result).toEqual(mockLectures);
      expect(Lecture.find).toHaveBeenCalledWith({ published: true });
    });

    it('should use default limit of 10', async () => {
      Lecture.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      });

      await getTopLectures();

      const limitCall = Lecture.find().limit;
      expect(limitCall).toHaveBeenCalledWith(10);
    });
  });

  describe('getTopDownloads()', () => {
    it('should return top lectures by download count', async () => {
      const mockLectures = [
        { titleArabic: 'Lecture 1', downloadCount: 50, slug: 'lecture-1' },
        { titleArabic: 'Lecture 2', downloadCount: 30, slug: 'lecture-2' }
      ];

      Lecture.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockLectures)
      });

      const result = await getTopDownloads(5);

      expect(result).toEqual(mockLectures);
    });

    it('should use default limit of 10', async () => {
      Lecture.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      });

      await getTopDownloads();

      const limitCall = Lecture.find().limit;
      expect(limitCall).toHaveBeenCalledWith(10);
    });
  });
});
