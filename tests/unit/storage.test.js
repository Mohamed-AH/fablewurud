/**
 * Unit Tests for Storage Configuration
 */

const fs = require('fs');
const path = require('path');

// Store original env
const originalEnv = process.env;

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn()
}));

// Mock multer
jest.mock('multer', () => {
  const multerInstance = {
    single: jest.fn().mockReturnValue('singleMiddleware'),
    array: jest.fn().mockReturnValue('arrayMiddleware')
  };
  const multer = jest.fn(() => multerInstance);
  multer.diskStorage = jest.fn((config) => ({
    destination: config.destination,
    filename: config.filename
  }));
  return multer;
});

describe('Storage Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterAll(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('Upload Directory', () => {
    it('should use default upload directory when UPLOAD_DIR not set', () => {
      delete process.env.UPLOAD_DIR;
      fs.existsSync.mockReturnValue(true);

      const storage = require('../../config/storage');
      expect(storage.uploadDir).toBe('./uploads');
    });

    it('should use UPLOAD_DIR from environment', () => {
      process.env.UPLOAD_DIR = '/custom/uploads';
      fs.existsSync.mockReturnValue(true);

      jest.resetModules();
      const storage = require('../../config/storage');
      expect(storage.uploadDir).toBe('/custom/uploads');
    });

    it('should create upload directory if it does not exist', () => {
      delete process.env.UPLOAD_DIR;

      // Get fresh fs mock after module reset and set return value
      const freshFs = require('fs');
      freshFs.existsSync.mockReturnValue(false);

      require('../../config/storage');

      expect(freshFs.mkdirSync).toHaveBeenCalledWith('./uploads', { recursive: true });
    });

    it('should not create directory if it exists', () => {
      delete process.env.UPLOAD_DIR;
      fs.existsSync.mockReturnValue(true);

      jest.resetModules();
      require('../../config/storage');

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('Multer Configuration', () => {
    it('should export upload middleware', () => {
      fs.existsSync.mockReturnValue(true);
      jest.resetModules();
      const storage = require('../../config/storage');

      expect(storage.upload).toBeDefined();
    });

    it('should export uploadMultiple middleware', () => {
      fs.existsSync.mockReturnValue(true);
      jest.resetModules();
      const storage = require('../../config/storage');

      expect(storage.uploadMultiple).toBeDefined();
    });
  });

  describe('Storage Filename Generation', () => {
    it('should generate unique filename with timestamp', () => {
      fs.existsSync.mockReturnValue(true);

      require('../../config/storage');
      const multer = require('multer');

      // Get the storage config that was passed to diskStorage
      const storageConfig = multer.diskStorage.mock.calls[0][0];

      const mockFile = {
        originalname: 'test-file.mp3'
      };

      const callback = jest.fn();
      storageConfig.filename({}, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(
        null,
        expect.stringMatching(/^test-file-\d+-\d+\.mp3$/)
      );
    });

    it('should sanitize special characters from filename', () => {
      fs.existsSync.mockReturnValue(true);

      require('../../config/storage');
      const multer = require('multer');
      const storageConfig = multer.diskStorage.mock.calls[0][0];

      const mockFile = {
        originalname: 'test@file#123!.mp3'
      };

      const callback = jest.fn();
      storageConfig.filename({}, mockFile, callback);

      const generatedFilename = callback.mock.calls[0][1];
      expect(generatedFilename).not.toContain('@');
      expect(generatedFilename).not.toContain('#');
      expect(generatedFilename).not.toContain('!');
    });

    it('should preserve Arabic characters in filename', () => {
      fs.existsSync.mockReturnValue(true);

      require('../../config/storage');
      const multer = require('multer');
      const storageConfig = multer.diskStorage.mock.calls[0][0];

      const mockFile = {
        originalname: 'محاضرة.mp3'
      };

      const callback = jest.fn();
      storageConfig.filename({}, mockFile, callback);

      const generatedFilename = callback.mock.calls[0][1];
      expect(generatedFilename).toContain('محاضرة');
    });

    it('should truncate long filenames', () => {
      fs.existsSync.mockReturnValue(true);

      require('../../config/storage');
      const multer = require('multer');
      const storageConfig = multer.diskStorage.mock.calls[0][0];

      const longName = 'a'.repeat(100);
      const mockFile = {
        originalname: `${longName}.mp3`
      };

      const callback = jest.fn();
      storageConfig.filename({}, mockFile, callback);

      const generatedFilename = callback.mock.calls[0][1];
      const baseName = generatedFilename.split('-')[0];
      expect(baseName.length).toBeLessThanOrEqual(50);
    });

    it('should set correct destination', () => {
      delete process.env.UPLOAD_DIR;
      fs.existsSync.mockReturnValue(true);

      require('../../config/storage');
      const multer = require('multer');
      const storageConfig = multer.diskStorage.mock.calls[0][0];

      const callback = jest.fn();
      storageConfig.destination({}, {}, callback);

      expect(callback).toHaveBeenCalledWith(null, './uploads');
    });
  });

  describe('File Filter', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
      jest.resetModules();
    });

    const getFileFilter = () => {
      const multer = require('multer');
      // The file filter is passed in the multer config
      const multerConfig = multer.mock.calls[0][0];
      return multerConfig.fileFilter;
    };

    it('should accept MP3 files', () => {
      require('../../config/storage');
      const fileFilter = getFileFilter();

      const mockFile = {
        mimetype: 'audio/mpeg',
        originalname: 'test.mp3'
      };

      const callback = jest.fn();
      fileFilter({}, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should accept M4A files', () => {
      require('../../config/storage');
      const fileFilter = getFileFilter();

      const mockFile = {
        mimetype: 'audio/mp4',
        originalname: 'test.m4a'
      };

      const callback = jest.fn();
      fileFilter({}, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should accept WAV files', () => {
      require('../../config/storage');
      const fileFilter = getFileFilter();

      const mockFile = {
        mimetype: 'audio/wav',
        originalname: 'test.wav'
      };

      const callback = jest.fn();
      fileFilter({}, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should accept OGG files', () => {
      require('../../config/storage');
      const fileFilter = getFileFilter();

      const mockFile = {
        mimetype: 'audio/ogg',
        originalname: 'test.ogg'
      };

      const callback = jest.fn();
      fileFilter({}, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should accept WEBM audio files', () => {
      require('../../config/storage');
      const fileFilter = getFileFilter();

      const mockFile = {
        mimetype: 'audio/webm',
        originalname: 'test.webm'
      };

      const callback = jest.fn();
      fileFilter({}, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should accept AAC files', () => {
      require('../../config/storage');
      const fileFilter = getFileFilter();

      const mockFile = {
        mimetype: 'audio/aac',
        originalname: 'test.aac'
      };

      const callback = jest.fn();
      fileFilter({}, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should accept FLAC files', () => {
      require('../../config/storage');
      const fileFilter = getFileFilter();

      const mockFile = {
        mimetype: 'audio/flac',
        originalname: 'test.flac'
      };

      const callback = jest.fn();
      fileFilter({}, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should reject non-audio files', () => {
      require('../../config/storage');
      const fileFilter = getFileFilter();

      const mockFile = {
        mimetype: 'image/jpeg',
        originalname: 'test.jpg'
      };

      const callback = jest.fn();
      fileFilter({}, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
    });

    it('should reject files with wrong extension', () => {
      require('../../config/storage');
      const fileFilter = getFileFilter();

      const mockFile = {
        mimetype: 'audio/mpeg',
        originalname: 'test.txt'
      };

      const callback = jest.fn();
      fileFilter({}, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
    });

    it('should reject PDF files', () => {
      require('../../config/storage');
      const fileFilter = getFileFilter();

      const mockFile = {
        mimetype: 'application/pdf',
        originalname: 'test.pdf'
      };

      const callback = jest.fn();
      fileFilter({}, mockFile, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
    });
  });

  describe('File Size Limits', () => {
    it('should use default file size limit of 60MB', () => {
      delete process.env.MAX_FILE_SIZE;
      fs.existsSync.mockReturnValue(true);
      jest.resetModules();

      require('../../config/storage');
      const multer = require('multer');

      const multerConfig = multer.mock.calls[0][0];
      expect(multerConfig.limits.fileSize).toBe(62914560);
    });

    it('should use MAX_FILE_SIZE from environment', () => {
      process.env.MAX_FILE_SIZE = '104857600'; // 100MB
      fs.existsSync.mockReturnValue(true);
      jest.resetModules();

      require('../../config/storage');
      const multer = require('multer');

      const multerConfig = multer.mock.calls[0][0];
      expect(multerConfig.limits.fileSize).toBe(104857600);
    });

    it('should limit single upload to 1 file', () => {
      fs.existsSync.mockReturnValue(true);
      jest.resetModules();

      require('../../config/storage');
      const multer = require('multer');

      const multerConfig = multer.mock.calls[0][0];
      expect(multerConfig.limits.files).toBe(1);
    });

    it('should limit multiple upload to 10 files', () => {
      fs.existsSync.mockReturnValue(true);
      jest.resetModules();

      require('../../config/storage');
      const multer = require('multer');

      // The second call to multer() is for uploadMultiple
      const multerConfigMultiple = multer.mock.calls[1][0];
      expect(multerConfigMultiple.limits.files).toBe(10);
    });
  });
});
