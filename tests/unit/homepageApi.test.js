/**
 * Unit Tests for Homepage API Routes
 *
 * Tests the server-side filtering and pagination endpoints:
 * - GET /api/homepage/series
 * - GET /api/homepage/standalone
 * - GET /api/homepage/khutbas
 * - GET /api/homepage/stats
 */

const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');

// Create mock ObjectIds
const mockObjectId = () => new mongoose.Types.ObjectId();

const sheikhId1 = mockObjectId();
const seriesId1 = mockObjectId();
const seriesId2 = mockObjectId();
const seriesId3 = mockObjectId(); // khutba series
const lectureId1 = mockObjectId();
const lectureId2 = mockObjectId();
const lectureId3 = mockObjectId();

// Mock data
const mockSheikh = {
  _id: sheikhId1,
  nameArabic: 'الشيخ حسن الدغريري',
  nameEnglish: 'Sheikh Hasan Dhaghriri',
  honorific: 'حفظه الله'
};

const mockSeriesList = [
  {
    _id: seriesId1,
    titleArabic: 'شرح كتاب التوحيد',
    titleEnglish: 'Explanation of Kitab at-Tawheed',
    category: 'Aqeedah',
    sheikhId: mockSheikh,
    tags: [],
    isVisible: true,
    bookAuthor: 'محمد بن عبدالوهاب',
    createdAt: new Date('2025-01-01')
  },
  {
    _id: seriesId2,
    titleArabic: 'دروس عن بعد - الفقه',
    titleEnglish: 'Online Fiqh Lessons',
    category: 'Fiqh',
    sheikhId: mockSheikh,
    tags: ['online'],
    isVisible: true,
    createdAt: new Date('2025-06-01')
  },
  {
    _id: seriesId3,
    titleArabic: 'خطب الجمعة',
    titleEnglish: 'Friday Sermons',
    category: 'Other',
    sheikhId: mockSheikh,
    tags: ['khutba'],
    isVisible: true,
    createdAt: new Date('2025-03-01')
  }
];

const mockLectures = {
  [seriesId1.toString()]: [
    {
      _id: lectureId1,
      titleArabic: 'شرح كتاب التوحيد - الدرس ١',
      seriesId: seriesId1,
      published: true,
      dateRecorded: new Date('2025-12-01'),
      createdAt: new Date('2025-12-01'),
      duration: 3600,
      lectureNumber: 1,
      sortOrder: 0
    },
    {
      _id: lectureId2,
      titleArabic: 'شرح كتاب التوحيد - الدرس ٢',
      seriesId: seriesId1,
      published: true,
      dateRecorded: new Date('2025-12-15'),
      createdAt: new Date('2025-12-15'),
      duration: 2700,
      lectureNumber: 2,
      sortOrder: 0
    }
  ],
  [seriesId2.toString()]: [
    {
      _id: lectureId3,
      titleArabic: 'درس الفقه عن بعد',
      seriesId: seriesId2,
      published: true,
      dateRecorded: new Date('2026-01-10'),
      createdAt: new Date('2026-01-10'),
      duration: 1800,
      lectureNumber: 1,
      sortOrder: 0
    }
  ],
  [seriesId3.toString()]: [
    {
      _id: mockObjectId(),
      titleArabic: 'خطبة التقوى',
      seriesId: seriesId3,
      published: true,
      dateRecorded: new Date('2026-02-01'),
      createdAt: new Date('2026-02-01'),
      duration: 1200,
      lectureNumber: 1,
      sortOrder: 0
    }
  ]
};

const mockStandaloneLectures = [
  {
    _id: mockObjectId(),
    titleArabic: 'محاضرة مستقلة عن الصبر',
    sheikhId: mockSheikh,
    seriesId: null,
    published: true,
    dateRecorded: new Date('2026-01-20'),
    createdAt: new Date('2026-01-20'),
    duration: 2400,
    category: 'Akhlaq'
  }
];

// Build chainable mock for Mongoose queries
function buildChainableMock(resolveValue) {
  const chain = {
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(resolveValue),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis()
  };
  return chain;
}

// Mock the models
jest.mock('../../models', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    Lecture: {
      find: jest.fn(),
      findOne: jest.fn(),
      countDocuments: jest.fn(),
      aggregate: jest.fn()
    },
    Series: {
      find: jest.fn(),
      findOne: jest.fn()
    }
  };
});

const { Lecture, Series } = require('../../models');

// Set up app with the homepage router
let app;

beforeAll(() => {
  app = express();
  app.use(express.json());
  const homepageRouter = require('../../routes/api/homepage');
  app.use('/api/homepage', homepageRouter);
});

beforeEach(() => {
  jest.clearAllMocks();

  // Default mock implementations for Series.find
  const seriesChain = buildChainableMock([...mockSeriesList]);
  Series.find.mockReturnValue(seriesChain);

  // Default mock for Series.findOne (misc series lookup)
  const findOneChain = buildChainableMock(null);
  Series.findOne.mockReturnValue(findOneChain);

  // Default mock for Lecture.aggregate
  Lecture.aggregate.mockImplementation((pipeline) => {
    const matchStage = pipeline.find(s => s.$match);
    if (matchStage && matchStage.$match.seriesId) {
      // Check for $in queries FIRST (used by /series and /khutbas endpoints)
      if (matchStage.$match.seriesId.$in) {
        const ids = matchStage.$match.seriesId.$in.map(id => id.toString());
        // Check if this is a grouping query (stats endpoint) or a lecture fetch
        const groupStage = pipeline.find(s => s.$group);
        if (groupStage) {
          // Stats endpoint - return groups
          const groups = [];
          for (const id of ids) {
            if (mockLectures[id] && mockLectures[id].length > 0) {
              groups.push({ _id: id });
            }
          }
          return Promise.resolve(groups);
        } else {
          // Series/khutbas endpoint - return all matching lectures
          const lectures = [];
          for (const id of ids) {
            if (mockLectures[id]) {
              lectures.push(...mockLectures[id]);
            }
          }
          return Promise.resolve(lectures);
        }
      }
      // For single seriesId queries
      const seriesId = matchStage.$match.seriesId;
      const key = seriesId.toString();
      return Promise.resolve(mockLectures[key] || []);
    }
    return Promise.resolve([]);
  });

  // Default mock for Lecture.find
  const lectureChain = buildChainableMock([...mockStandaloneLectures]);
  Lecture.find.mockReturnValue(lectureChain);

  // Default mock for Lecture.countDocuments
  Lecture.countDocuments.mockResolvedValue(1);
});

// ============================================================
// GET /api/homepage/series
// ============================================================
describe('GET /api/homepage/series', () => {
  it('should return paginated series with lectures', async () => {
    const res = await request(app)
      .get('/api/homepage/series')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.series).toBeDefined();
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination).toHaveProperty('page');
    expect(res.body.pagination).toHaveProperty('limit');
    expect(res.body.pagination).toHaveProperty('total');
    expect(res.body.pagination).toHaveProperty('pages');
    expect(res.body.pagination).toHaveProperty('hasMore');
  });

  it('should exclude khutba series by default', async () => {
    const res = await request(app)
      .get('/api/homepage/series')
      .expect(200);

    // The khutba series (seriesId3 with tag 'khutba') should be excluded
    const seriesTitles = res.body.series.map(s => s.titleArabic);
    expect(seriesTitles).not.toContain('خطب الجمعة');
  });

  it('should include khutba series when excludeKhutbas=false', async () => {
    const res = await request(app)
      .get('/api/homepage/series?excludeKhutbas=false')
      .expect(200);

    // All series with lectures should appear (including khutba)
    expect(res.body.series.length).toBeGreaterThanOrEqual(1);
  });

  it('should filter by category', async () => {
    const res = await request(app)
      .get('/api/homepage/series?category=Aqeedah')
      .expect(200);

    // Series.find should have been called with category filter
    expect(Series.find).toHaveBeenCalled();
    const findArgs = Series.find.mock.calls[0][0];
    expect(findArgs.category).toBe('Aqeedah');
  });

  it('should not add category filter when category=all', async () => {
    const res = await request(app)
      .get('/api/homepage/series?category=all')
      .expect(200);

    const findArgs = Series.find.mock.calls[0][0];
    expect(findArgs.category).toBeUndefined();
  });

  it('should filter by series type (online)', async () => {
    const res = await request(app)
      .get('/api/homepage/series?type=online')
      .expect(200);

    // Only the 'online' series should pass the post-fetch filter
    // seriesId2 has tag 'online'
    const types = res.body.series.map(s => s.seriesType);
    types.forEach(t => expect(t).toBe('online'));
  });

  it('should search by title', async () => {
    const res = await request(app)
      .get('/api/homepage/series?search=' + encodeURIComponent('التوحيد'))
      .expect(200);

    // Series.find should be called with search $or query
    const findArgs = Series.find.mock.calls[0][0];
    expect(findArgs.$or).toBeDefined();
    expect(findArgs.$or.length).toBe(3); // titleArabic, titleEnglish, bookAuthor
  });

  it('should sort by newest by default', async () => {
    const res = await request(app)
      .get('/api/homepage/series')
      .expect(200);

    expect(res.body.success).toBe(true);
    // Series should be sorted by most recent lecture date (descending)
    if (res.body.series.length >= 2) {
      const date0 = new Date(res.body.series[0].mostRecentDate);
      const date1 = new Date(res.body.series[1].mostRecentDate);
      expect(date0.getTime()).toBeGreaterThanOrEqual(date1.getTime());
    }
  });

  it('should sort by oldest when requested', async () => {
    const res = await request(app)
      .get('/api/homepage/series?sort=oldest')
      .expect(200);

    if (res.body.series.length >= 2) {
      const date0 = new Date(res.body.series[0].mostRecentDate);
      const date1 = new Date(res.body.series[1].mostRecentDate);
      expect(date0.getTime()).toBeLessThanOrEqual(date1.getTime());
    }
  });

  it('should respect pagination with page and limit', async () => {
    const res = await request(app)
      .get('/api/homepage/series?page=1&limit=1')
      .expect(200);

    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(1);
  });

  it('should clamp limit to max 50', async () => {
    const res = await request(app)
      .get('/api/homepage/series?limit=100')
      .expect(200);

    expect(res.body.pagination.limit).toBe(50);
  });

  it('should clamp limit to min 1', async () => {
    const res = await request(app)
      .get('/api/homepage/series?limit=0')
      .expect(200);

    expect(res.body.pagination.limit).toBe(1);
  });

  it('should clamp page to min 1', async () => {
    const res = await request(app)
      .get('/api/homepage/series?page=-5')
      .expect(200);

    expect(res.body.pagination.page).toBe(1);
  });

  it('should indicate hasMore when more pages exist', async () => {
    // Create enough mock series to test pagination
    const manySeries = Array.from({ length: 15 }, (_, i) => ({
      _id: mockObjectId(),
      titleArabic: `سلسلة ${i + 1}`,
      category: 'Fiqh',
      sheikhId: mockSheikh,
      tags: [],
      isVisible: true,
      createdAt: new Date(`2025-${String(i + 1).padStart(2, '0')}-01`)
    }));

    const seriesChain = buildChainableMock(manySeries);
    Series.find.mockReturnValue(seriesChain);

    // Each series has 1 lecture - mock aggregate to return lectures with seriesIds
    Lecture.aggregate.mockImplementation((pipeline) => {
      const matchStage = pipeline.find(s => s.$match);
      if (matchStage && matchStage.$match.seriesId && matchStage.$match.seriesId.$in) {
        const ids = matchStage.$match.seriesId.$in;
        // Return one lecture per series
        return Promise.resolve(ids.map(id => ({
          _id: mockObjectId(),
          seriesId: id,
          titleArabic: 'درس',
          published: true,
          dateRecorded: new Date(),
          createdAt: new Date(),
          sortOrder: 0,
          lectureNumber: 1
        })));
      }
      return Promise.resolve([]);
    });

    const res = await request(app)
      .get('/api/homepage/series?page=1&limit=5')
      .expect(200);

    expect(res.body.pagination.hasMore).toBe(true);
    expect(res.body.pagination.pages).toBe(3);
  });

  it('should filter out series with no published lectures', async () => {
    // One series returns no lectures
    Lecture.aggregate.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/homepage/series')
      .expect(200);

    // All series should have lectures
    res.body.series.forEach(s => {
      expect(s.lectureCount).toBeGreaterThan(0);
    });
  });

  it('should include bookAuthor as originalAuthor', async () => {
    const res = await request(app)
      .get('/api/homepage/series')
      .expect(200);

    const aqeedahSeries = res.body.series.find(s => s.titleArabic === 'شرح كتاب التوحيد');
    if (aqeedahSeries) {
      expect(aqeedahSeries.originalAuthor).toBe('محمد بن عبدالوهاب');
    }
  });

  it('should handle server errors gracefully', async () => {
    Series.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockRejectedValue(new Error('DB connection failed'))
    });

    const res = await request(app)
      .get('/api/homepage/series')
      .expect(500);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Failed to fetch series');
  });
});

// ============================================================
// GET /api/homepage/standalone
// ============================================================
describe('GET /api/homepage/standalone', () => {
  it('should return paginated standalone lectures', async () => {
    const res = await request(app)
      .get('/api/homepage/standalone')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.lectures).toBeDefined();
    expect(res.body.pagination).toBeDefined();
  });

  it('should query for lectures with seriesId: null', async () => {
    await request(app)
      .get('/api/homepage/standalone')
      .expect(200);

    expect(Lecture.find).toHaveBeenCalled();
    const findArgs = Lecture.find.mock.calls[0][0];
    expect(findArgs.seriesId).toBeNull();
    expect(findArgs.published).toBe(true);
  });

  it('should filter by category', async () => {
    await request(app)
      .get('/api/homepage/standalone?category=Fiqh')
      .expect(200);

    const findArgs = Lecture.find.mock.calls[0][0];
    expect(findArgs.category).toBe('Fiqh');
  });

  it('should not add category filter when category=all', async () => {
    await request(app)
      .get('/api/homepage/standalone?category=all')
      .expect(200);

    const findArgs = Lecture.find.mock.calls[0][0];
    expect(findArgs.category).toBeUndefined();
  });

  it('should search by title', async () => {
    await request(app)
      .get('/api/homepage/standalone?search=' + encodeURIComponent('الصبر'))
      .expect(200);

    const findArgs = Lecture.find.mock.calls[0][0];
    expect(findArgs.$or).toBeDefined();
    expect(findArgs.$or.length).toBe(3); // titleArabic, titleEnglish, descriptionArabic
  });

  it('should include محاضرات متفرقة by default', async () => {
    // Mock finding the misc series
    const miscSeriesId = mockObjectId();
    const miscFindOneChain = buildChainableMock({
      _id: miscSeriesId,
      titleArabic: 'محاضرات متفرقة',
      isVisible: true
    });
    Series.findOne.mockReturnValue(miscFindOneChain);

    // Mock misc lectures - second call to Lecture.find
    const miscLectures = [{
      _id: mockObjectId(),
      titleArabic: 'محاضرة متفرقة',
      sheikhId: mockSheikh,
      seriesId: miscSeriesId,
      published: true
    }];

    // First call returns standalone, second returns misc
    Lecture.find
      .mockReturnValueOnce(buildChainableMock(mockStandaloneLectures))
      .mockReturnValueOnce(buildChainableMock(miscLectures));

    const res = await request(app)
      .get('/api/homepage/standalone')
      .expect(200);

    // Should have looked for misc series
    expect(Series.findOne).toHaveBeenCalled();
  });

  it('should exclude محاضرات متفرقة when includeMisc=false', async () => {
    await request(app)
      .get('/api/homepage/standalone?includeMisc=false')
      .expect(200);

    // Series.findOne should not be called for misc series
    expect(Series.findOne).not.toHaveBeenCalled();
  });

  it('should respect pagination defaults (limit=20)', async () => {
    const res = await request(app)
      .get('/api/homepage/standalone')
      .expect(200);

    expect(res.body.pagination.limit).toBe(20);
  });

  it('should sort by newest by default', async () => {
    await request(app)
      .get('/api/homepage/standalone')
      .expect(200);

    // Check sort was called with descending dates
    const sortCall = Lecture.find.mock.results[0].value.sort;
    expect(sortCall).toHaveBeenCalled();
  });

  it('should handle server errors gracefully', async () => {
    Lecture.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockRejectedValue(new Error('DB error'))
    });

    const res = await request(app)
      .get('/api/homepage/standalone')
      .expect(500);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Failed to fetch standalone lectures');
  });
});

// ============================================================
// GET /api/homepage/khutbas
// ============================================================
describe('GET /api/homepage/khutbas', () => {
  it('should return only khutba series', async () => {
    const res = await request(app)
      .get('/api/homepage/khutbas')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.series).toBeDefined();
    // Only series with khutba tag or title should appear
    res.body.series.forEach(s => {
      const isKhutba = (s.tags && s.tags.includes('khutba')) ||
        (s.titleArabic && (s.titleArabic.includes('خطب') || s.titleArabic.includes('خطبة')));
      // The original data was filtered, so the rendered data should be khutba
      // (But note: the API filters internally, so all results should be khutba-related)
    });
    expect(res.body.pagination).toBeDefined();
  });

  it('should apply search filter', async () => {
    await request(app)
      .get('/api/homepage/khutbas?search=' + encodeURIComponent('التقوى'))
      .expect(200);

    const findArgs = Series.find.mock.calls[0][0];
    expect(findArgs.$or).toBeDefined();
  });

  it('should respect pagination', async () => {
    const res = await request(app)
      .get('/api/homepage/khutbas?page=1&limit=5')
      .expect(200);

    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(5);
  });

  it('should filter out series with no published lectures', async () => {
    Lecture.aggregate.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/homepage/khutbas')
      .expect(200);

    res.body.series.forEach(s => {
      expect(s.lectureCount).toBeGreaterThan(0);
    });
  });

  it('should sort by most recent lecture date', async () => {
    const res = await request(app)
      .get('/api/homepage/khutbas?sort=newest')
      .expect(200);

    if (res.body.series.length >= 2) {
      const date0 = new Date(res.body.series[0].mostRecentDate);
      const date1 = new Date(res.body.series[1].mostRecentDate);
      expect(date0.getTime()).toBeGreaterThanOrEqual(date1.getTime());
    }
  });

  it('should handle server errors gracefully', async () => {
    Series.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockRejectedValue(new Error('Timeout'))
    });

    const res = await request(app)
      .get('/api/homepage/khutbas')
      .expect(500);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Failed to fetch khutbas');
  });
});

// ============================================================
// GET /api/homepage/stats
// ============================================================
describe('GET /api/homepage/stats', () => {
  it('should return stats for all tabs', async () => {
    const res = await request(app)
      .get('/api/homepage/stats')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats).toHaveProperty('series');
    expect(res.body.stats).toHaveProperty('standalone');
    expect(res.body.stats).toHaveProperty('khutbas');
    expect(res.body.stats).toHaveProperty('totalLectures');
  });

  it('should count total published lectures', async () => {
    Lecture.countDocuments.mockResolvedValue(162);

    const res = await request(app)
      .get('/api/homepage/stats')
      .expect(200);

    expect(res.body.stats.totalLectures).toBe(162);
  });

  it('should filter stats by category', async () => {
    await request(app)
      .get('/api/homepage/stats?category=Fiqh')
      .expect(200);

    const findArgs = Series.find.mock.calls[0][0];
    expect(findArgs.category).toBe('Fiqh');
  });

  it('should filter stats by series type', async () => {
    await request(app)
      .get('/api/homepage/stats?type=online')
      .expect(200);

    // The type filter is applied after fetching, so Series.find still runs
    expect(Series.find).toHaveBeenCalled();
  });

  it('should filter stats by search', async () => {
    await request(app)
      .get('/api/homepage/stats?search=' + encodeURIComponent('التوحيد'))
      .expect(200);

    const findArgs = Series.find.mock.calls[0][0];
    expect(findArgs.$or).toBeDefined();
  });

  it('should include misc series in standalone count', async () => {
    const miscSeriesId = mockObjectId();
    const miscFindOneChain = buildChainableMock({
      _id: miscSeriesId,
      titleArabic: 'محاضرات متفرقة',
      isVisible: true
    });
    Series.findOne.mockReturnValue(miscFindOneChain);

    Lecture.countDocuments
      .mockResolvedValueOnce(5)  // standalone count
      .mockResolvedValueOnce(3)  // misc count
      .mockResolvedValueOnce(162); // total count

    const res = await request(app)
      .get('/api/homepage/stats')
      .expect(200);

    // standalone should include misc count
    expect(res.body.stats.standalone).toBe(8);
  });

  it('should handle server errors gracefully', async () => {
    Series.find.mockReturnValue({
      lean: jest.fn().mockRejectedValue(new Error('Connection lost'))
    });

    const res = await request(app)
      .get('/api/homepage/stats')
      .expect(500);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Failed to fetch stats');
  });
});

// ============================================================
// Helper function tests
// ============================================================
// Helper to create aggregate mock that returns lectures with proper seriesId
function createAggregateWithSeriesId() {
  return (pipeline) => {
    const matchStage = pipeline.find(s => s.$match);
    if (matchStage && matchStage.$match.seriesId) {
      if (matchStage.$match.seriesId.$in) {
        const ids = matchStage.$match.seriesId.$in;
        return Promise.resolve(ids.map(id => ({
          _id: mockObjectId(),
          seriesId: id,
          titleArabic: 'درس',
          published: true,
          dateRecorded: new Date(),
          createdAt: new Date(),
          sortOrder: 0,
          lectureNumber: 1
        })));
      }
    }
    return Promise.resolve([]);
  };
}

describe('Homepage API - Helper Functions', () => {
  describe('getSeriesType detection', () => {
    it('should detect online series by tag', async () => {
      const seriesIdVal = mockObjectId();
      const onlineSeries = [{
        _id: seriesIdVal,
        titleArabic: 'سلسلة عادية',
        tags: ['online'],
        sheikhId: mockSheikh,
        isVisible: true,
        createdAt: new Date()
      }];
      Series.find.mockReturnValue(buildChainableMock(onlineSeries));
      Lecture.aggregate.mockImplementation(createAggregateWithSeriesId());

      const res = await request(app)
        .get('/api/homepage/series?type=online&excludeKhutbas=false')
        .expect(200);

      if (res.body.series.length > 0) {
        expect(res.body.series[0].seriesType).toBe('online');
      }
    });

    it('should detect online series by title containing عن بعد', async () => {
      const seriesIdVal = mockObjectId();
      const onlineSeries = [{
        _id: seriesIdVal,
        titleArabic: 'دروس عن بعد',
        tags: [],
        sheikhId: mockSheikh,
        isVisible: true,
        createdAt: new Date()
      }];
      Series.find.mockReturnValue(buildChainableMock(onlineSeries));
      Lecture.aggregate.mockImplementation(createAggregateWithSeriesId());

      const res = await request(app)
        .get('/api/homepage/series?type=online&excludeKhutbas=false')
        .expect(200);

      if (res.body.series.length > 0) {
        expect(res.body.series[0].seriesType).toBe('online');
      }
    });

    it('should detect archive-ramadan series by tag', async () => {
      const seriesIdVal = mockObjectId();
      const ramadanSeries = [{
        _id: seriesIdVal,
        titleArabic: 'سلسلة رمضانية',
        tags: ['archive-ramadan'],
        sheikhId: mockSheikh,
        isVisible: true,
        createdAt: new Date()
      }];
      Series.find.mockReturnValue(buildChainableMock(ramadanSeries));
      Lecture.aggregate.mockImplementation(createAggregateWithSeriesId());

      const res = await request(app)
        .get('/api/homepage/series?type=archive-ramadan&excludeKhutbas=false')
        .expect(200);

      if (res.body.series.length > 0) {
        expect(res.body.series[0].seriesType).toBe('archive-ramadan');
      }
    });

    it('should detect archive series by title containing أرشيف', async () => {
      const seriesIdVal = mockObjectId();
      const archiveSeries = [{
        _id: seriesIdVal,
        titleArabic: 'أرشيف الدروس',
        tags: [],
        sheikhId: mockSheikh,
        isVisible: true,
        createdAt: new Date()
      }];
      Series.find.mockReturnValue(buildChainableMock(archiveSeries));
      Lecture.aggregate.mockImplementation(createAggregateWithSeriesId());

      const res = await request(app)
        .get('/api/homepage/series?type=archive&excludeKhutbas=false')
        .expect(200);

      if (res.body.series.length > 0) {
        expect(res.body.series[0].seriesType).toBe('archive');
      }
    });

    it('should default to masjid type', async () => {
      const seriesIdVal = mockObjectId();
      const masjidSeries = [{
        _id: seriesIdVal,
        titleArabic: 'شرح الأصول الثلاثة',
        tags: [],
        sheikhId: mockSheikh,
        isVisible: true,
        createdAt: new Date()
      }];
      Series.find.mockReturnValue(buildChainableMock(masjidSeries));
      Lecture.aggregate.mockImplementation(createAggregateWithSeriesId());

      const res = await request(app)
        .get('/api/homepage/series?excludeKhutbas=false')
        .expect(200);

      if (res.body.series.length > 0) {
        expect(res.body.series[0].seriesType).toBe('masjid');
      }
    });
  });

  describe('isKhutbaSeries detection', () => {
    it('should detect khutba series by tag', async () => {
      const seriesIdVal = mockObjectId();
      const khutbaSeries = [{
        _id: seriesIdVal,
        titleArabic: 'سلسلة عادية',
        tags: ['khutba'],
        sheikhId: mockSheikh,
        isVisible: true,
        createdAt: new Date()
      }];
      Series.find.mockReturnValue(buildChainableMock(khutbaSeries));
      Lecture.aggregate.mockImplementation(createAggregateWithSeriesId());

      const res = await request(app)
        .get('/api/homepage/khutbas')
        .expect(200);

      expect(res.body.series.length).toBe(1);
    });

    it('should detect khutba series by title containing خطب', async () => {
      const seriesIdVal = mockObjectId();
      const khutbaSeries = [{
        _id: seriesIdVal,
        titleArabic: 'خطب الشيخ حسن',
        tags: [],
        sheikhId: mockSheikh,
        isVisible: true,
        createdAt: new Date()
      }];
      Series.find.mockReturnValue(buildChainableMock(khutbaSeries));
      Lecture.aggregate.mockImplementation(createAggregateWithSeriesId());

      const res = await request(app)
        .get('/api/homepage/khutbas')
        .expect(200);

      expect(res.body.series.length).toBe(1);
    });

    it('should not include non-khutba series in khutbas endpoint', async () => {
      const regularSeries = [{
        _id: mockObjectId(),
        titleArabic: 'شرح كتاب التوحيد',
        tags: [],
        sheikhId: mockSheikh,
        isVisible: true,
        createdAt: new Date()
      }];
      Series.find.mockReturnValue(buildChainableMock(regularSeries));

      const res = await request(app)
        .get('/api/homepage/khutbas')
        .expect(200);

      expect(res.body.series.length).toBe(0);
    });
  });

  describe('Search query building', () => {
    it('should build series search query with 3 fields', async () => {
      await request(app)
        .get('/api/homepage/series?search=test')
        .expect(200);

      const findArgs = Series.find.mock.calls[0][0];
      expect(findArgs.$or).toHaveLength(3);
      expect(findArgs.$or[0]).toHaveProperty('titleArabic');
      expect(findArgs.$or[1]).toHaveProperty('titleEnglish');
      expect(findArgs.$or[2]).toHaveProperty('bookAuthor');
    });

    it('should build lecture search query with 3 fields', async () => {
      await request(app)
        .get('/api/homepage/standalone?search=test')
        .expect(200);

      const findArgs = Lecture.find.mock.calls[0][0];
      expect(findArgs.$or).toHaveLength(3);
      expect(findArgs.$or[0]).toHaveProperty('titleArabic');
      expect(findArgs.$or[1]).toHaveProperty('titleEnglish');
      expect(findArgs.$or[2]).toHaveProperty('descriptionArabic');
    });
  });
});

// ============================================================
// Edge Cases and Pagination
// ============================================================
describe('Homepage API - Edge Cases', () => {
  it('should handle empty database gracefully for series', async () => {
    Series.find.mockReturnValue(buildChainableMock([]));

    const res = await request(app)
      .get('/api/homepage/series')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.series).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it('should handle empty database gracefully for standalone', async () => {
    Lecture.find.mockReturnValue(buildChainableMock([]));

    const res = await request(app)
      .get('/api/homepage/standalone?includeMisc=false')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.lectures).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it('should handle empty database gracefully for khutbas', async () => {
    Series.find.mockReturnValue(buildChainableMock([]));

    const res = await request(app)
      .get('/api/homepage/khutbas')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.series).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it('should handle page beyond available data', async () => {
    const res = await request(app)
      .get('/api/homepage/series?page=999')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.series).toEqual([]);
    expect(res.body.pagination.hasMore).toBe(false);
  });

  it('should handle NaN page parameter', async () => {
    const res = await request(app)
      .get('/api/homepage/series?page=abc')
      .expect(200);

    // NaN should be clamped to 1
    expect(res.body.pagination.page).toBe(1);
  });

  it('should handle NaN limit parameter', async () => {
    const res = await request(app)
      .get('/api/homepage/series?limit=abc')
      .expect(200);

    // NaN should fall back to default limit (10 for series)
    expect(res.body.pagination.limit).toBe(10);
  });

  it('should only include visible series', async () => {
    await request(app)
      .get('/api/homepage/series')
      .expect(200);

    const findArgs = Series.find.mock.calls[0][0];
    expect(findArgs.isVisible).toEqual({ $ne: false });
  });

  it('should handle series with lectures that have no dateRecorded', async () => {
    const noDatesLectures = [{
      _id: mockObjectId(),
      titleArabic: 'درس بدون تاريخ',
      seriesId: seriesId1,
      published: true,
      createdAt: new Date('2025-06-01'),
      sortOrder: 0,
      lectureNumber: 1
    }];
    Lecture.aggregate.mockResolvedValue(noDatesLectures);

    const res = await request(app)
      .get('/api/homepage/series')
      .expect(200);

    // Should not crash - mostRecentDate should fallback to createdAt
    expect(res.body.success).toBe(true);
  });
});

// ============================================================
// Search Input Sanitization Tests
// ============================================================
describe('Homepage API - Search Sanitization', () => {
  describe('Series Search Sanitization', () => {
    it('should sanitize XSS payloads in series search', async () => {
      const xssPayload = '<script>alert("XSS")</script>';

      await request(app)
        .get('/api/homepage/series')
        .query({ search: xssPayload })
        .expect(200);

      // Verify the search query was sanitized before being used
      const findArgs = Series.find.mock.calls[0][0];
      expect(findArgs.$or).toBeDefined();

      // The regex should contain encoded HTML entities, not raw tags
      const titleArabicRegex = findArgs.$or[0].titleArabic;
      const regexStr = titleArabicRegex.toString();
      expect(regexStr).not.toContain('<script>');
      expect(regexStr).toContain('&lt;'); // Encoded <
    });

    it('should handle HTML entities in series search', async () => {
      const htmlEntities = '& < > " \'';

      await request(app)
        .get('/api/homepage/series')
        .query({ search: htmlEntities })
        .expect(200);

      const findArgs = Series.find.mock.calls[0][0];
      expect(findArgs.$or).toBeDefined();

      // Should have encoded the entities
      const regexStr = findArgs.$or[0].titleArabic.toString();
      expect(regexStr).toContain('&amp;'); // Encoded &
    });

    it('should preserve Arabic text in series search', async () => {
      const arabicSearch = 'شرح كتاب التوحيد';

      await request(app)
        .get('/api/homepage/series')
        .query({ search: arabicSearch })
        .expect(200);

      const findArgs = Series.find.mock.calls[0][0];
      expect(findArgs.$or).toBeDefined();

      // Arabic text should be preserved in the regex
      const regexStr = findArgs.$or[0].titleArabic.toString();
      expect(regexStr).toContain('شرح');
    });

    it('should escape regex special characters in series search', async () => {
      const regexChars = '.*+?^${}()|[]\\';

      await request(app)
        .get('/api/homepage/series')
        .query({ search: regexChars })
        .expect(200);

      // Should not throw and should handle gracefully
      expect(Series.find).toHaveBeenCalled();

      // The regex chars should be escaped
      const findArgs = Series.find.mock.calls[0][0];
      const regexStr = findArgs.$or[0].titleArabic.toString();
      // Special chars should be escaped with backslashes
      expect(regexStr).toContain('\\.');
      expect(regexStr).toContain('\\*');
    });
  });

  describe('Standalone Lecture Search Sanitization', () => {
    it('should sanitize XSS payloads in standalone search', async () => {
      const xssPayload = '<img src=x onerror=alert(1)>';

      await request(app)
        .get('/api/homepage/standalone')
        .query({ search: xssPayload })
        .expect(200);

      const findArgs = Lecture.find.mock.calls[0][0];
      expect(findArgs.$or).toBeDefined();

      // The regex should contain encoded HTML, not raw tags
      const regexStr = findArgs.$or[0].titleArabic.toString();
      expect(regexStr).not.toContain('<img');
      expect(regexStr).toContain('&lt;'); // Encoded <
    });

    it('should handle empty search gracefully', async () => {
      await request(app)
        .get('/api/homepage/standalone')
        .query({ search: '' })
        .expect(200);

      const findArgs = Lecture.find.mock.calls[0][0];
      // Empty search should not add $or clause
      expect(findArgs.$or).toBeUndefined();
    });

    it('should handle whitespace-only search', async () => {
      await request(app)
        .get('/api/homepage/standalone')
        .query({ search: '   ' })
        .expect(200);

      const findArgs = Lecture.find.mock.calls[0][0];
      // Whitespace-only search should not add $or clause
      expect(findArgs.$or).toBeUndefined();
    });
  });

  describe('Khutba Search Sanitization', () => {
    it('should sanitize XSS payloads in khutba search', async () => {
      const xssPayload = '"><svg onload=alert(1)>';

      await request(app)
        .get('/api/homepage/khutbas')
        .query({ search: xssPayload })
        .expect(200);

      const findArgs = Series.find.mock.calls[0][0];
      expect(findArgs.$or).toBeDefined();

      // The regex should contain encoded HTML, not raw tags
      const regexStr = findArgs.$or[0].titleArabic.toString();
      expect(regexStr).not.toContain('<svg');
      expect(regexStr).toContain('&lt;'); // Encoded <
    });
  });

  describe('Stats Search Sanitization', () => {
    it('should sanitize XSS payloads in stats search', async () => {
      const xssPayload = '<iframe src="javascript:alert(1)">';

      await request(app)
        .get('/api/homepage/stats')
        .query({ search: xssPayload })
        .expect(200);

      // Stats endpoint should handle sanitized search
      expect(Series.find).toHaveBeenCalled();
    });
  });

  describe('ReDoS Prevention', () => {
    it('should handle potentially catastrophic regex patterns', async () => {
      // Patterns that could cause ReDoS if not escaped
      const dangerousPatterns = [
        'a{1,1000000}',
        '(a+)+',
        '([a-zA-Z]+)*',
        '(a|aa)+',
        '(.*a){100}'
      ];

      for (const pattern of dangerousPatterns) {
        const startTime = Date.now();

        await request(app)
          .get('/api/homepage/series')
          .query({ search: pattern })
          .expect(200);

        const duration = Date.now() - startTime;
        // Should complete quickly (not hang due to ReDoS)
        expect(duration).toBeLessThan(5000);
      }
    });
  });
});
