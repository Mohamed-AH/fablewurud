/**
 * Unit Tests for streamController
 * Tests audio streaming and download functionality
 */

const fs = require('fs');
const { EventEmitter } = require('events');

// Mock dependencies before requiring the module
jest.mock('../../models', () => ({
  Lecture: {
    findById: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 })
  }
}));

jest.mock('../../utils/fileManager', () => ({
  getFilePath: jest.fn(),
  fileExists: jest.fn()
}));

jest.mock('../../middleware/streamHandler', () => ({
  getMimeType: jest.fn(),
  handleRangeRequest: jest.fn()
}));

jest.mock('../../utils/ociStorage', () => ({
  getPublicUrl: jest.fn(),
  isConfigured: jest.fn(),
  createPreAuthenticatedRequest: jest.fn()
}));

jest.mock('../../utils/validators', () => ({
  isValidObjectId: jest.fn()
}));

jest.mock('../../utils/metrics', () => ({
  recordAudioPlay: jest.fn()
}));

jest.mock('../../utils/sentryMetrics', () => ({
  audioPlay: jest.fn(),
  audioDownload: jest.fn()
}));

const { Lecture } = require('../../models');
const { getFilePath, fileExists } = require('../../utils/fileManager');
const { getMimeType, handleRangeRequest } = require('../../middleware/streamHandler');
const { getPublicUrl, isConfigured, createPreAuthenticatedRequest } = require('../../utils/ociStorage');
const { isValidObjectId } = require('../../utils/validators');

const {
  streamAudio,
  downloadAudio,
  getStreamInfo
} = require('../../controllers/streamController');

describe('Stream Controller', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});

    mockReq = {
      params: { id: '507f1f77bcf86cd799439011' }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      redirect: jest.fn(),
      set: jest.fn()
    };

    isValidObjectId.mockReturnValue(true);
    isConfigured.mockReturnValue(false);
    Lecture.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('streamAudio()', () => {
    it('should return 400 for invalid lecture ID', async () => {
      isValidObjectId.mockReturnValue(false);

      await streamAudio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid lecture ID format'
      });
    });

    it('should return 404 if lecture not found', async () => {
      Lecture.findById.mockResolvedValue(null);

      await streamAudio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Lecture not found'
      });
    });

    it('should redirect to OCI URL if audioUrl contains objectstorage', async () => {
      const mockLecture = {
        _id: '507f1f77bcf86cd799439011',
        audioUrl: 'https://objectstorage.example.com/audio.m4a'
      };
      Lecture.findById.mockResolvedValue(mockLecture);

      await streamAudio(mockReq, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith(mockLecture.audioUrl);
      expect(Lecture.updateOne).toHaveBeenCalledWith(
        { _id: mockLecture._id },
        { $inc: { playCount: 1 } }
      );
    });

    it('should redirect to OCI if configured and audioFileName exists', async () => {
      const mockLecture = {
        _id: '507f1f77bcf86cd799439011',
        audioFileName: 'test.m4a'
      };
      Lecture.findById.mockResolvedValue(mockLecture);
      isConfigured.mockReturnValue(true);
      getPublicUrl.mockReturnValue('https://oci.example.com/test.m4a');

      await streamAudio(mockReq, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith('https://oci.example.com/test.m4a');
    });

    it('should return 404 if local file not found', async () => {
      const mockLecture = {
        _id: '507f1f77bcf86cd799439011',
        audioFileName: 'test.mp3'
      };
      Lecture.findById.mockResolvedValue(mockLecture);
      fileExists.mockReturnValue(false);

      await streamAudio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Audio file not found on server'
      });
    });

    it('should stream local file with range request support', async () => {
      const mockLecture = {
        _id: '507f1f77bcf86cd799439011',
        audioFileName: 'test.mp3',
        titleEnglish: 'Test Lecture',
        titleArabic: 'محاضرة تجريبية'
      };
      Lecture.findById.mockResolvedValue(mockLecture);
      fileExists.mockReturnValue(true);
      getFilePath.mockReturnValue('/path/to/test.mp3');
      getMimeType.mockReturnValue('audio/mpeg');
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 1000000 });

      await streamAudio(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalled();
      expect(handleRangeRequest).toHaveBeenCalled();
      expect(mockReq.filePath).toBe('/path/to/test.mp3');
      expect(mockReq.mimeType).toBe('audio/mpeg');
    });

    it('should handle errors gracefully', async () => {
      Lecture.findById.mockRejectedValue(new Error('Database error'));

      await streamAudio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to stream audio'
      }));
    });

    it('should handle play count increment errors silently', async () => {
      const mockLecture = {
        _id: '507f1f77bcf86cd799439011',
        audioUrl: 'https://objectstorage.example.com/audio.m4a'
      };
      Lecture.findById.mockResolvedValue(mockLecture);
      Lecture.updateOne.mockRejectedValueOnce(new Error('Count error'));

      await streamAudio(mockReq, mockRes);

      // Should still redirect despite count error
      expect(mockRes.redirect).toHaveBeenCalled();
    });
  });

  describe('downloadAudio()', () => {
    it('should return 400 for invalid lecture ID', async () => {
      isValidObjectId.mockReturnValue(false);

      await downloadAudio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid lecture ID format'
      });
    });

    it('should return 404 if lecture not found', async () => {
      Lecture.findById.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        then: (cb) => cb(null)
      });
      // Alternative mock approach
      Lecture.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(null)
        })
      });

      await downloadAudio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('should return 404 if local file not found', async () => {
      const mockLecture = {
        _id: '507f1f77bcf86cd799439011',
        audioFileName: 'test.mp3',
        titleArabic: 'محاضرة'
      };
      Lecture.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockLecture)
        })
      });
      fileExists.mockReturnValue(false);

      await downloadAudio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Audio file not found on server'
      });
    });

    it('should stream local file for download', async () => {
      const mockStream = new EventEmitter();
      mockStream.pipe = jest.fn().mockReturnValue(mockStream);

      const mockLecture = {
        _id: '507f1f77bcf86cd799439011',
        audioFileName: 'test.mp3',
        titleArabic: 'محاضرة',
        fileSize: 1000000
      };
      Lecture.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockLecture)
        })
      });
      fileExists.mockReturnValue(true);
      getFilePath.mockReturnValue('/path/to/test.mp3');
      getMimeType.mockReturnValue('audio/mpeg');
      jest.spyOn(fs, 'createReadStream').mockReturnValue(mockStream);

      await downloadAudio(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalledWith(expect.objectContaining({
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000'
      }));
      expect(fs.createReadStream).toHaveBeenCalled();
      expect(mockStream.pipe).toHaveBeenCalledWith(mockRes);
    });

    it('should handle download errors gracefully', async () => {
      Lecture.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockRejectedValue(new Error('DB error'))
        })
      });

      await downloadAudio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to download audio'
      }));
    });

    it('should generate PAR URL when OCI is configured', async () => {
      const mockLecture = {
        _id: '507f1f77bcf86cd799439011',
        audioFileName: 'test.m4a',
        titleArabic: 'محاضرة',
        fileSize: 1000000
      };
      Lecture.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockLecture)
        })
      });
      isConfigured.mockReturnValue(true);
      createPreAuthenticatedRequest.mockResolvedValue('https://objectstorage.me-jeddah-1.oraclecloud.com/p/secret-token/test.m4a');
      getMimeType.mockReturnValue('audio/mp4');

      // proxyOciDownload will fail since https is not mocked, but PAR should be generated
      await downloadAudio(mockReq, mockRes);

      expect(createPreAuthenticatedRequest).toHaveBeenCalledWith('test.m4a', 1);
    });

    it('should handle PAR generation error gracefully', async () => {
      const mockLecture = {
        _id: '507f1f77bcf86cd799439011',
        audioFileName: 'test.m4a',
        titleArabic: 'محاضرة'
      };
      Lecture.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockLecture)
        })
      });
      isConfigured.mockReturnValue(true);
      createPreAuthenticatedRequest.mockRejectedValue(new Error('OCI API error'));

      await downloadAudio(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Download failed from cloud storage'
      });
    });

    it('should extract object name from audioUrl for PAR when no audioFileName', async () => {
      const mockLecture = {
        _id: '507f1f77bcf86cd799439011',
        audioUrl: 'https://objectstorage.me-jeddah-1.oraclecloud.com/n/ns/b/bucket/o/audio-file.m4a',
        titleArabic: 'محاضرة',
        fileSize: 1000000
      };
      Lecture.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockLecture)
        })
      });
      isConfigured.mockReturnValue(true);
      createPreAuthenticatedRequest.mockResolvedValue('https://objectstorage.me-jeddah-1.oraclecloud.com/p/token/audio-file.m4a');
      getMimeType.mockReturnValue('audio/mp4');

      // proxyOciDownload will fail since https is not mocked, but PAR should be generated
      await downloadAudio(mockReq, mockRes);

      expect(createPreAuthenticatedRequest).toHaveBeenCalledWith('audio-file.m4a', 1);
    });
  });

  describe('getStreamInfo()', () => {
    it('should return 400 for invalid lecture ID', async () => {
      isValidObjectId.mockReturnValue(false);

      await getStreamInfo(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid lecture ID format'
      });
    });

    it('should return 404 if lecture not found', async () => {
      Lecture.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(null)
          })
        })
      });

      await getStreamInfo(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Lecture not found'
      });
    });

    it('should return stream info for existing lecture', async () => {
      const mockLecture = {
        _id: '507f1f77bcf86cd799439011',
        titleArabic: 'محاضرة',
        titleEnglish: 'Lecture',
        audioFileName: 'test.mp3',
        durationFormatted: '30:00',
        fileSizeMB: '10.5',
        playCount: 100,
        downloadCount: 50,
        sheikhId: { nameArabic: 'الشيخ' },
        seriesId: { titleArabic: 'سلسلة' }
      };
      Lecture.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockLecture)
          })
        })
      });
      fileExists.mockReturnValue(true);
      getFilePath.mockReturnValue('/path/to/test.mp3');
      getMimeType.mockReturnValue('audio/mpeg');
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 11010048 });

      await getStreamInfo(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        lecture: expect.objectContaining({
          id: mockLecture._id,
          titleArabic: mockLecture.titleArabic,
          playCount: 100,
          downloadCount: 50
        }),
        file: expect.objectContaining({
          fileName: 'test.mp3',
          exists: true,
          mimeType: 'audio/mpeg'
        }),
        urls: expect.objectContaining({
          stream: expect.stringContaining('/stream/'),
          download: expect.stringContaining('/download/')
        })
      });
    });

    it('should handle non-existent file gracefully', async () => {
      const mockLecture = {
        _id: '507f1f77bcf86cd799439011',
        titleArabic: 'محاضرة',
        audioFileName: 'missing.mp3',
        durationFormatted: '30:00',
        fileSizeMB: '10.5',
        playCount: 0,
        downloadCount: 0
      };
      Lecture.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockLecture)
          })
        })
      });
      fileExists.mockReturnValue(false);
      getFilePath.mockReturnValue('/path/to/missing.mp3');
      getMimeType.mockReturnValue('audio/mpeg');

      await getStreamInfo(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        file: expect.objectContaining({
          exists: false,
          size: null
        })
      }));
    });

    it('should handle errors gracefully', async () => {
      Lecture.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockRejectedValue(new Error('DB error'))
          })
        })
      });

      await getStreamInfo(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Failed to get stream info'
      }));
    });
  });
});
