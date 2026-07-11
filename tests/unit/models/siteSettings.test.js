/**
 * Unit Tests for SiteSettings Model
 */

const mongoose = require('mongoose');
const SiteSettings = require('../../../models/SiteSettings');
const Lecture = require('../../../models/Lecture');
const PageView = require('../../../models/PageView');
const Sheikh = require('../../../models/Sheikh');
const Counter = require('../../../models/Counter');
const testDb = require('../../helpers/testDb');

describe('SiteSettings Model', () => {
  beforeAll(async () => {
    await testDb.connect();
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  beforeEach(async () => {
    // Clean up before each test to ensure test isolation
    await SiteSettings.deleteMany({});
    await Lecture.deleteMany({});
    await PageView.deleteMany({});
    await Sheikh.deleteMany({});
    await Counter.deleteMany({});
  });

  afterEach(async () => {
    await SiteSettings.deleteMany({});
    await Lecture.deleteMany({});
    await PageView.deleteMany({});
    await Sheikh.deleteMany({});
    await Counter.deleteMany({});
  });

  describe('Schema Structure', () => {
    it('should create settings with default values', async () => {
      const settings = await SiteSettings.create({ key: 'global' });

      expect(settings.key).toBe('global');
      expect(settings.analytics.showPublicStats).toBe(false);
      expect(settings.analytics.minPlaysToDisplay).toBe(1000);
      expect(settings.analytics.minDownloadsToDisplay).toBe(500);
      expect(settings.analytics.minPageViewsToDisplay).toBe(5000);
    });

    it('should have correct homepage defaults', async () => {
      const settings = await SiteSettings.create({ key: 'global' });

      expect(settings.homepage.showSchedule).toBe(true);
      expect(settings.homepage.showSeriesTab).toBe(true);
      expect(settings.homepage.showStandaloneTab).toBe(true);
      expect(settings.homepage.showKhutbasTab).toBe(true);
    });

    it('should have correct seriesStats defaults', async () => {
      const settings = await SiteSettings.create({ key: 'global' });

      expect(settings.seriesStats.minPlaysToShow).toBe(100);
      expect(settings.seriesStats.showDuration).toBe(false);
    });

    it('should have correct cachedStats defaults', async () => {
      const settings = await SiteSettings.create({ key: 'global' });

      expect(settings.cachedStats.totalPlays).toBe(0);
      expect(settings.cachedStats.totalDownloads).toBe(0);
      expect(settings.cachedStats.totalPageViews).toBe(0);
      expect(settings.cachedStats.totalLectures).toBe(0);
    });

    it('should enforce unique key', async () => {
      await SiteSettings.create({ key: 'global' });

      await expect(SiteSettings.create({ key: 'global' })).rejects.toThrow();
    });
  });

  describe('Static Methods', () => {
    describe('getSettings', () => {
      it('should create settings if not exists', async () => {
        const settings = await SiteSettings.getSettings();

        expect(settings).not.toBeNull();
        expect(settings.key).toBe('global');
      });

      it('should return existing settings', async () => {
        await SiteSettings.create({
          key: 'global',
          analytics: {
            showPublicStats: true
          }
        });

        const settings = await SiteSettings.getSettings();
        expect(settings.analytics.showPublicStats).toBe(true);
      });

      it('should be atomic (no race conditions)', async () => {
        // Call getSettings multiple times concurrently
        const promises = [
          SiteSettings.getSettings(),
          SiteSettings.getSettings(),
          SiteSettings.getSettings()
        ];

        const results = await Promise.all(promises);

        // All should return the same settings
        expect(results[0]._id.toString()).toBe(results[1]._id.toString());
        expect(results[1]._id.toString()).toBe(results[2]._id.toString());
      });
    });

    describe('updateCachedStats', () => {
      it('should update cached stats from database', async () => {
        // Create a sheikh first
        const sheikh = await Sheikh.create({
          nameArabic: 'الشيخ محمد'
        });

        // Create published lectures with play counts - use insertMany to avoid middleware issues
        const lectures = await Lecture.insertMany([
          {
            titleArabic: 'محاضرة 1',
            sheikhId: sheikh._id,
            published: true,
            playCount: 100,
            downloadCount: 50
          },
          {
            titleArabic: 'محاضرة 2',
            sheikhId: sheikh._id,
            published: true,
            playCount: 200,
            downloadCount: 75
          }
        ]);

        // Verify lectures were created
        expect(lectures.length).toBe(2);

        // Create page views
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        await PageView.create({
          page: '/homepage',
          date: today,
          count: 1000
        });

        const stats = await SiteSettings.updateCachedStats();

        expect(stats.totalPlays).toBe(300);
        expect(stats.totalDownloads).toBe(125);
        expect(stats.totalPageViews).toBe(1000);
        expect(stats.totalLectures).toBe(2);
      });

      it('should handle empty database', async () => {
        const stats = await SiteSettings.updateCachedStats();

        expect(stats.totalPlays).toBe(0);
        expect(stats.totalDownloads).toBe(0);
        expect(stats.totalPageViews).toBe(0);
        expect(stats.totalLectures).toBe(0);
      });

      it('should only count published lectures', async () => {
        const sheikh = await Sheikh.create({
          nameArabic: 'الشيخ أحمد'
        });

        // Use insertMany to avoid middleware issues with Counter
        const lectures = await Lecture.insertMany([
          {
            titleArabic: 'محاضرة منشورة',
            sheikhId: sheikh._id,
            published: true,
            playCount: 100
          },
          {
            titleArabic: 'محاضرة غير منشورة',
            sheikhId: sheikh._id,
            published: false,
            playCount: 500
          }
        ]);

        // Verify lectures were created
        expect(lectures.length).toBe(2);

        const stats = await SiteSettings.updateCachedStats();

        expect(stats.totalPlays).toBe(100);
        expect(stats.totalLectures).toBe(1);
      });
    });
  });

  describe('Instance Methods', () => {
    describe('shouldShowPublicStats', () => {
      it('should return true if showPublicStats is manually enabled', async () => {
        const settings = await SiteSettings.create({
          key: 'global',
          analytics: {
            showPublicStats: true
          }
        });

        expect(settings.shouldShowPublicStats()).toBe(true);
      });

      it('should return false when thresholds not met', async () => {
        const settings = await SiteSettings.create({
          key: 'global',
          analytics: {
            showPublicStats: false,
            minPlaysToDisplay: 1000,
            minDownloadsToDisplay: 500,
            minPageViewsToDisplay: 5000
          },
          cachedStats: {
            totalPlays: 100,
            totalDownloads: 50,
            totalPageViews: 500
          }
        });

        expect(settings.shouldShowPublicStats()).toBe(false);
      });

      it('should return true when all thresholds are met', async () => {
        const settings = await SiteSettings.create({
          key: 'global',
          analytics: {
            showPublicStats: false,
            minPlaysToDisplay: 1000,
            minDownloadsToDisplay: 500,
            minPageViewsToDisplay: 5000
          },
          cachedStats: {
            totalPlays: 1500,
            totalDownloads: 600,
            totalPageViews: 6000
          }
        });

        expect(settings.shouldShowPublicStats()).toBe(true);
      });

      it('should return false if only some thresholds are met', async () => {
        const settings = await SiteSettings.create({
          key: 'global',
          analytics: {
            showPublicStats: false,
            minPlaysToDisplay: 1000,
            minDownloadsToDisplay: 500,
            minPageViewsToDisplay: 5000
          },
          cachedStats: {
            totalPlays: 1500, // Met
            totalDownloads: 100, // Not met
            totalPageViews: 6000 // Met
          }
        });

        expect(settings.shouldShowPublicStats()).toBe(false);
      });
    });
  });

  describe('Timestamps', () => {
    it('should automatically add createdAt and updatedAt', async () => {
      const settings = await SiteSettings.create({ key: 'global' });

      expect(settings.createdAt).toBeInstanceOf(Date);
      expect(settings.updatedAt).toBeInstanceOf(Date);
    });
  });
});
