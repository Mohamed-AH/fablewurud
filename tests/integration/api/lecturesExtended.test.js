/**
 * Extended Integration Tests for Lecture API Endpoints
 * Tests for POST, PUT, DELETE operations and additional endpoints
 */

// Mock music-metadata before any imports
jest.mock('music-metadata');

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const path = require('path');
const Lecture = require('../../../models/Lecture');
const Sheikh = require('../../../models/Sheikh');
const Series = require('../../../models/Series');
const testDb = require('../../helpers/testDb');

// Mock middleware
jest.mock('../../../middleware/auth', () => ({
  isAdminAPI: (req, res, next) => next()
}));

jest.mock('../../../middleware/fileValidation', () => ({
  validateUploadedFile: (req, res, next) => next(),
  handleMulterError: (err, req, res, next) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  }
}));

// Module-level variable to control file injection in tests
let mockFile = null;

jest.mock('../../../config/storage', () => ({
  upload: {
    single: jest.fn(() => (req, res, next) => {
      req.file = mockFile;
      next();
    })
  }
}));

jest.mock('../../../utils/audioMetadata', () => ({
  extractAudioMetadata: jest.fn().mockResolvedValue({
    duration: 3600,
    durationFormatted: '1:00:00',
    fileSize: 50000000,
    fileSizeMB: '47.68',
    bitrate: 128,
    container: 'mp3'
  }),
  isValidAudioFile: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../../utils/fileManager', () => ({
  deleteFile: jest.fn(),
  getFilePath: jest.fn(),
  fileExists: jest.fn()
}));

let app;

describe('Lecture API Extended Tests', () => {
  beforeAll(async () => {
    await testDb.connect();

    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    const apiRoutes = require('../../../routes/api/lectures');
    app.use('/api/lectures', apiRoutes);

    app.use((err, req, res, next) => {
      res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error'
      });
    });
  });

  afterAll(async () => {
    await testDb.disconnect();
  });

  beforeEach(async () => {
    await Lecture.deleteMany({});
    await Sheikh.deleteMany({});
    await Series.deleteMany({});
    jest.clearAllMocks();
  });

  describe('PUT /api/lectures/:id', () => {
    it('should update lecture successfully', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد'
      });

      const lecture = await Lecture.create({
        titleArabic: 'المحاضرة الأصلية',
        sheikhId: sheikh._id,
        published: false
      });

      const response = await request(app)
        .put(`/api/lectures/${lecture._id}`)
        .send({
          titleArabic: 'المحاضرة المعدلة',
          titleEnglish: 'Updated Lecture',
          published: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.lecture.titleArabic).toBe('المحاضرة المعدلة');
      expect(response.body.lecture.titleEnglish).toBe('Updated Lecture');
      expect(response.body.lecture.published).toBe(true);
    });

    it('should return 404 for non-existent lecture', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .put(`/api/lectures/${fakeId}`)
        .send({
          titleArabic: 'محاضرة جديدة'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Lecture not found');
    });

    it('should update featured status', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ أحمد'
      });

      const lecture = await Lecture.create({
        titleArabic: 'محاضرة',
        sheikhId: sheikh._id,
        featured: false
      });

      const response = await request(app)
        .put(`/api/lectures/${lecture._id}`)
        .send({
          featured: true
        })
        .expect(200);

      expect(response.body.lecture.featured).toBe(true);
    });

    it('should update description fields', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ علي'
      });

      const lecture = await Lecture.create({
        titleArabic: 'محاضرة',
        sheikhId: sheikh._id
      });

      const response = await request(app)
        .put(`/api/lectures/${lecture._id}`)
        .send({
          descriptionArabic: 'وصف عربي',
          descriptionEnglish: 'English description'
        })
        .expect(200);

      expect(response.body.lecture.descriptionArabic).toBe('وصف عربي');
      expect(response.body.lecture.descriptionEnglish).toBe('English description');
    });
  });

  describe('DELETE /api/lectures/:id', () => {
    it('should delete lecture successfully', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمد',
        lectureCount: 1
      });

      const lecture = await Lecture.create({
        titleArabic: 'محاضرة للحذف',
        sheikhId: sheikh._id,
        audioFileName: 'test.mp3'
      });

      const response = await request(app)
        .delete(`/api/lectures/${lecture._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Lecture deleted successfully');

      // Verify lecture was deleted
      const deletedLecture = await Lecture.findById(lecture._id);
      expect(deletedLecture).toBeNull();
    });

    it('should decrement sheikh lecture count', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ أحمد',
        lectureCount: 5
      });

      const lecture = await Lecture.create({
        titleArabic: 'محاضرة',
        sheikhId: sheikh._id
      });

      await request(app)
        .delete(`/api/lectures/${lecture._id}`)
        .expect(200);

      const updatedSheikh = await Sheikh.findById(sheikh._id);
      expect(updatedSheikh.lectureCount).toBe(4);
    });

    it('should decrement series lecture count if lecture is in series', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ علي'
      });

      const series = await Series.create({
        titleArabic: 'سلسلة',
        sheikhId: sheikh._id,
        lectureCount: 3
      });

      const lecture = await Lecture.create({
        titleArabic: 'محاضرة في سلسلة',
        sheikhId: sheikh._id,
        seriesId: series._id
      });

      await request(app)
        .delete(`/api/lectures/${lecture._id}`)
        .expect(200);

      const updatedSeries = await Series.findById(series._id);
      expect(updatedSeries.lectureCount).toBe(2);
    });

    it('should return 404 for non-existent lecture', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .delete(`/api/lectures/${fakeId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Lecture not found');
    });
  });

  describe('POST /api/lectures/:id/verify-duration', () => {
    it('should verify and update duration if different', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ فهد'
      });

      const lecture = await Lecture.create({
        titleArabic: 'محاضرة',
        sheikhId: sheikh._id,
        duration: 1000,
        durationVerified: false
      });

      const response = await request(app)
        .post(`/api/lectures/${lecture._id}/verify-duration`)
        .send({ duration: 1500 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.updated).toBe(true);
      expect(response.body.oldDuration).toBe(1000);
      expect(response.body.newDuration).toBe(1500);

      const updatedLecture = await Lecture.findById(lecture._id);
      expect(updatedLecture.duration).toBe(1500);
      expect(updatedLecture.durationVerified).toBe(true);
    });

    it('should verify duration without update if within tolerance', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ خالد'
      });

      const lecture = await Lecture.create({
        titleArabic: 'محاضرة',
        sheikhId: sheikh._id,
        duration: 1000,
        durationVerified: false
      });

      const response = await request(app)
        .post(`/api/lectures/${lecture._id}/verify-duration`)
        .send({ duration: 1001 }) // Within 2 second tolerance
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.verified).toBe(true);
      expect(response.body.updated).toBeUndefined();
    });

    it('should skip if already verified', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ سعد'
      });

      const lecture = await Lecture.create({
        titleArabic: 'محاضرة',
        sheikhId: sheikh._id,
        duration: 1000,
        durationVerified: true
      });

      const response = await request(app)
        .post(`/api/lectures/${lecture._id}/verify-duration`)
        .send({ duration: 2000 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.skipped).toBe(true);
    });

    it('should reject duration exceeding maximum', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ ناصر'
      });

      const lecture = await Lecture.create({
        titleArabic: 'محاضرة',
        sheikhId: sheikh._id
      });

      const response = await request(app)
        .post(`/api/lectures/${lecture._id}/verify-duration`)
        .send({ duration: 50000 }) // More than 12 hours
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent lecture', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .post(`/api/lectures/${fakeId}/verify-duration`)
        .send({ duration: 1000 })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Lecture not found');
    });
  });

  describe('POST /api/lectures/:id/play', () => {
    it('should increment play count', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ عمر'
      });

      const lecture = await Lecture.create({
        titleArabic: 'محاضرة',
        sheikhId: sheikh._id,
        playCount: 10
      });

      const response = await request(app)
        .post(`/api/lectures/${lecture._id}/play`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.playCount).toBe(11);

      const updatedLecture = await Lecture.findById(lecture._id);
      expect(updatedLecture.playCount).toBe(11);
    });

    it('should start from 0 play count', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ ياسر'
      });

      const lecture = await Lecture.create({
        titleArabic: 'محاضرة جديدة',
        sheikhId: sheikh._id
      });

      const response = await request(app)
        .post(`/api/lectures/${lecture._id}/play`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.playCount).toBe(1);
    });

    it('should return 404 for non-existent lecture', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .post(`/api/lectures/${fakeId}/play`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Lecture not found');
    });
  });

  describe('GET /api/lectures with filters', () => {
    it('should filter by published status', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ إبراهيم'
      });

      await Lecture.create({
        titleArabic: 'محاضرة منشورة',
        sheikhId: sheikh._id,
        published: true
      });

      await Lecture.create({
        titleArabic: 'محاضرة غير منشورة',
        sheikhId: sheikh._id,
        published: false
      });

      const response = await request(app)
        .get('/api/lectures?published=true')
        .expect(200);

      expect(response.body.lectures).toHaveLength(1);
      expect(response.body.lectures[0].titleArabic).toBe('محاضرة منشورة');
    });

    it('should filter by featured status', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ حسن'
      });

      await Lecture.create({
        titleArabic: 'محاضرة مميزة',
        sheikhId: sheikh._id,
        featured: true
      });

      await Lecture.create({
        titleArabic: 'محاضرة عادية',
        sheikhId: sheikh._id,
        featured: false
      });

      const response = await request(app)
        .get('/api/lectures?featured=true')
        .expect(200);

      expect(response.body.lectures).toHaveLength(1);
      expect(response.body.lectures[0].titleArabic).toBe('محاضرة مميزة');
    });

    it('should filter by series ID', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ محمود'
      });

      const series = await Series.create({
        titleArabic: 'سلسلة العقيدة',
        sheikhId: sheikh._id
      });

      await Lecture.create({
        titleArabic: 'محاضرة في السلسلة',
        sheikhId: sheikh._id,
        seriesId: series._id
      });

      await Lecture.create({
        titleArabic: 'محاضرة منفردة',
        sheikhId: sheikh._id
      });

      const response = await request(app)
        .get(`/api/lectures?seriesId=${series._id}`)
        .expect(200);

      expect(response.body.lectures).toHaveLength(1);
      expect(response.body.lectures[0].titleArabic).toBe('محاضرة في السلسلة');
    });

    it('should handle pagination correctly', async () => {
      const sheikh = await Sheikh.create({
        nameArabic: 'الشيخ طارق'
      });

      // Create 15 lectures
      for (let i = 0; i < 15; i++) {
        await Lecture.create({
          titleArabic: `محاضرة ${i + 1}`,
          sheikhId: sheikh._id
        });
      }

      const response = await request(app)
        .get('/api/lectures?page=2&limit=5')
        .expect(200);

      expect(response.body.lectures).toHaveLength(5);
      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.limit).toBe(5);
      expect(response.body.pagination.total).toBe(15);
      expect(response.body.pagination.pages).toBe(3);
    });

    it('should reject limit over 100 with validation error', async () => {
      const response = await request(app)
        .get('/api/lectures?limit=500')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });

    it('should reject invalid sheikhId with validation error', async () => {
      const response = await request(app)
        .get('/api/lectures?sheikhId=invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed');
    });
  });

  describe('POST /api/lectures (upload)', () => {
    let sheikh;
    let series;
    const { isValidAudioFile } = require('../../../utils/audioMetadata');

    beforeEach(async () => {
      sheikh = await Sheikh.create({
        nameArabic: 'الشيخ للتحميل',
        lectureCount: 0
      });

      series = await Series.create({
        titleArabic: 'سلسلة تجريبية',
        sheikhId: sheikh._id,
        lectureCount: 0
      });

      // Set default mock file for upload tests
      mockFile = {
        filename: 'test-audio.mp3',
        path: '/tmp/test-audio.mp3',
        size: 50000000
      };
    });

    afterEach(() => {
      mockFile = null;
    });

    it('should upload lecture with all required fields', async () => {
      const response = await request(app)
        .post('/api/lectures')
        .send({
          titleArabic: 'محاضرة جديدة',
          titleEnglish: 'New Lecture',
          sheikhId: sheikh._id.toString(),
          published: 'true',
          featured: 'false'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.lecture.titleArabic).toBe('محاضرة جديدة');
      expect(response.body.audioMetadata).toBeDefined();
    });

    it('should reject upload without Arabic title', async () => {
      const response = await request(app)
        .post('/api/lectures')
        .send({
          sheikhId: sheikh._id.toString()
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Arabic title is required');
    });

    it('should reject upload without sheikh', async () => {
      const response = await request(app)
        .post('/api/lectures')
        .send({
          titleArabic: 'محاضرة'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Sheikh is required');
    });

    it('should reject upload with invalid sheikh ID', async () => {
      const fakeSheikhId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .post('/api/lectures')
        .send({
          titleArabic: 'محاضرة',
          sheikhId: fakeSheikhId.toString()
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Sheikh not found');
    });

    it('should reject upload with invalid series ID', async () => {
      const fakeSeriesId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .post('/api/lectures')
        .send({
          titleArabic: 'محاضرة',
          sheikhId: sheikh._id.toString(),
          seriesId: fakeSeriesId.toString()
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Series not found');
    });

    it('should reject invalid audio file', async () => {
      isValidAudioFile.mockResolvedValueOnce(false);

      const response = await request(app)
        .post('/api/lectures')
        .send({
          titleArabic: 'محاضرة',
          sheikhId: sheikh._id.toString()
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid audio file');
    });

    it('should increment sheikh lecture count after upload', async () => {
      await request(app)
        .post('/api/lectures')
        .send({
          titleArabic: 'محاضرة جديدة',
          sheikhId: sheikh._id.toString()
        })
        .expect(201);

      const updatedSheikh = await Sheikh.findById(sheikh._id);
      expect(updatedSheikh.lectureCount).toBe(1);
    });

    it('should increment series lecture count when series is provided', async () => {
      await request(app)
        .post('/api/lectures')
        .send({
          titleArabic: 'محاضرة في سلسلة',
          sheikhId: sheikh._id.toString(),
          seriesId: series._id.toString(),
          lectureNumber: 1
        })
        .expect(201);

      const updatedSeries = await Series.findById(series._id);
      expect(updatedSeries.lectureCount).toBe(1);
    });

    it('should auto-convert Gregorian date to Hijri', async () => {
      const response = await request(app)
        .post('/api/lectures')
        .send({
          titleArabic: 'محاضرة مؤرخة',
          sheikhId: sheikh._id.toString(),
          dateRecorded: '2024-01-15'
        })
        .expect(201);

      expect(response.body.lecture.dateRecordedHijri).toBeDefined();
    });

    it('should use provided Hijri date instead of auto-converting', async () => {
      const response = await request(app)
        .post('/api/lectures')
        .send({
          titleArabic: 'محاضرة بتاريخ هجري',
          sheikhId: sheikh._id.toString(),
          dateRecorded: '2024-01-15',
          dateRecordedHijri: '1445/07/15'
        })
        .expect(201);

      expect(response.body.lecture.dateRecordedHijri).toBe('1445/07/15');
    });
  });

  describe('POST /api/lectures/bulk-upload-audio', () => {
    let sheikh;
    let lecture;
    const fileManager = require('../../../utils/fileManager');

    beforeEach(async () => {
      sheikh = await Sheikh.create({
        nameArabic: 'الشيخ للتحميل الجماعي'
      });

      lecture = await Lecture.create({
        titleArabic: 'محاضرة بدون صوت',
        sheikhId: sheikh._id
      });

      // Set default mock file
      mockFile = {
        filename: 'bulk-audio.mp3',
        path: '/tmp/bulk-audio.mp3',
        size: 25000000
      };
    });

    afterEach(() => {
      mockFile = null;
    });

    it('should reject without lecture ID', async () => {
      const response = await request(app)
        .post('/api/lectures/bulk-upload-audio')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Lecture ID is required');
    });

    it('should reject without audio file', async () => {
      mockFile = null; // No file

      const response = await request(app)
        .post('/api/lectures/bulk-upload-audio')
        .send({
          lectureId: lecture._id.toString()
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Audio file is required');
    });

    it('should return 404 for non-existent lecture', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .post('/api/lectures/bulk-upload-audio')
        .send({
          lectureId: fakeId.toString()
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Lecture not found');
    });

    it('should upload audio to existing lecture successfully', async () => {
      const response = await request(app)
        .post('/api/lectures/bulk-upload-audio')
        .send({
          lectureId: lecture._id.toString()
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Audio file uploaded successfully');

      const updatedLecture = await Lecture.findById(lecture._id);
      expect(updatedLecture.audioFileName).toBe('bulk-audio.mp3');
    });

    it('should delete old audio file when replacing', async () => {
      // Set up lecture with existing audio
      lecture.audioFileName = 'old-audio.mp3';
      await lecture.save();

      mockFile = {
        filename: 'new-audio.mp3',
        path: '/tmp/new-audio.mp3',
        size: 30000000
      };

      await request(app)
        .post('/api/lectures/bulk-upload-audio')
        .send({
          lectureId: lecture._id.toString()
        })
        .expect(200);

      // fileManager.deleteFile should have been called with old filename
      expect(fileManager.deleteFile).toHaveBeenCalled();
    });
  });
});
