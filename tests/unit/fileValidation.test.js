/**
 * Unit Tests for fileValidation middleware
 * Tests file upload validation and error handling
 */

const fs = require('fs');
const multer = require('multer');

const {
  validateUploadedFile,
  validateUploadedFiles,
  handleMulterError
} = require('../../middleware/fileValidation');

describe('File Validation Middleware', () => {
  let mockReq;
  let mockRes;
  let next;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validateUploadedFile()', () => {
    it('should return 400 if no file uploaded', () => {
      mockReq.file = null;

      validateUploadedFile(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'No file uploaded'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 500 if file does not exist on disk', () => {
      mockReq.file = {
        path: '/tmp/nonexistent.mp3',
        originalname: 'audio.mp3',
        mimetype: 'audio/mpeg'
      };
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      validateUploadedFile(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'File upload failed - file not found on server'
      });
    });

    it('should return 400 if file is too large', () => {
      mockReq.file = {
        path: '/tmp/large.mp3',
        originalname: 'audio.mp3',
        mimetype: 'audio/mpeg'
      };
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 100000000 }); // 100MB
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      validateUploadedFile(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'File too large. Maximum size is 60MB'
      });
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should return 400 if file is too small', () => {
      mockReq.file = {
        path: '/tmp/small.mp3',
        originalname: 'audio.mp3',
        mimetype: 'audio/mpeg'
      };
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 500 }); // 500 bytes
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      validateUploadedFile(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'File too small. Invalid audio file.'
      });
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should return 400 if extension does not match MIME type', () => {
      mockReq.file = {
        path: '/tmp/fake.mp3',
        originalname: 'audio.wav', // .wav extension
        mimetype: 'audio/mpeg' // but MP3 MIME type
      };
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 5000000 });
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      validateUploadedFile(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'File extension does not match MIME type. Possible security risk.'
      });
    });

    it('should return 400 for path traversal in filename', () => {
      mockReq.file = {
        path: '/tmp/test.mp3',
        originalname: '../../../etc/passwd.mp3', // Valid extension to pass MIME check
        mimetype: 'audio/mpeg'
      };
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 5000000 });
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      validateUploadedFile(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid filename detected'
      });
    });

    it('should call next() for valid MP3 file', () => {
      mockReq.file = {
        path: '/tmp/valid.mp3',
        originalname: 'audio.mp3',
        mimetype: 'audio/mpeg'
      };
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 5000000 });

      validateUploadedFile(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should call next() for valid M4A file', () => {
      mockReq.file = {
        path: '/tmp/valid.m4a',
        originalname: 'audio.m4a',
        mimetype: 'audio/mp4'
      };
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 5000000 });

      validateUploadedFile(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
    });

    it('should call next() for valid WAV file', () => {
      mockReq.file = {
        path: '/tmp/valid.wav',
        originalname: 'audio.wav',
        mimetype: 'audio/wav'
      };
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 5000000 });

      validateUploadedFile(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
    });

    it('should accept audio/mp3 MIME type', () => {
      mockReq.file = {
        path: '/tmp/valid.mp3',
        originalname: 'audio.mp3',
        mimetype: 'audio/mp3'
      };
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 5000000 });

      validateUploadedFile(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
    });

    it('should accept audio/x-m4a MIME type', () => {
      mockReq.file = {
        path: '/tmp/valid.m4a',
        originalname: 'audio.m4a',
        mimetype: 'audio/x-m4a'
      };
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 5000000 });

      validateUploadedFile(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
    });

    it('should accept audio/wave MIME type', () => {
      mockReq.file = {
        path: '/tmp/valid.wav',
        originalname: 'audio.wav',
        mimetype: 'audio/wave'
      };
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 5000000 });

      validateUploadedFile(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('validateUploadedFiles()', () => {
    it('should return 400 if no files uploaded', () => {
      mockReq.files = null;

      validateUploadedFiles(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'No files uploaded'
      });
    });

    it('should return 400 if files array is empty', () => {
      mockReq.files = [];

      validateUploadedFiles(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'No files uploaded'
      });
    });

    it('should validate all files and call next() if all valid', () => {
      mockReq.files = [
        { path: '/tmp/file1.mp3', originalname: 'file1.mp3' },
        { path: '/tmp/file2.mp3', originalname: 'file2.mp3' }
      ];
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 5000000 });

      validateUploadedFiles(mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return 400 if any file does not exist', () => {
      mockReq.files = [
        { path: '/tmp/file1.mp3', originalname: 'file1.mp3' },
        { path: '/tmp/file2.mp3', originalname: 'file2.mp3' }
      ];
      jest.spyOn(fs, 'existsSync')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 5000000 });
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      validateUploadedFiles(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'File validation failed',
        errors: expect.arrayContaining(['File 2: Upload failed'])
      });
    });

    it('should return 400 if any file is too large', () => {
      mockReq.files = [
        { path: '/tmp/file1.mp3', originalname: 'file1.mp3' },
        { path: '/tmp/file2.mp3', originalname: 'file2.mp3' }
      ];
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync')
        .mockReturnValueOnce({ size: 5000000 })
        .mockReturnValueOnce({ size: 100000000 }); // 100MB
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      validateUploadedFiles(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'File validation failed',
        errors: expect.arrayContaining([expect.stringContaining('Too large')])
      });
    });

    it('should return 400 if any file is too small', () => {
      mockReq.files = [
        { path: '/tmp/file1.mp3', originalname: 'file1.mp3' },
        { path: '/tmp/file2.mp3', originalname: 'file2.mp3' }
      ];
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync')
        .mockReturnValueOnce({ size: 5000000 })
        .mockReturnValueOnce({ size: 500 }); // Too small
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      validateUploadedFiles(mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'File validation failed',
        errors: expect.arrayContaining([expect.stringContaining('Too small')])
      });
    });

    it('should clean up all files on any validation error', () => {
      mockReq.files = [
        { path: '/tmp/file1.mp3', originalname: 'file1.mp3' },
        { path: '/tmp/file2.mp3', originalname: 'file2.mp3' }
      ];
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync')
        .mockReturnValueOnce({ size: 5000000 })
        .mockReturnValueOnce({ size: 500 });
      const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      validateUploadedFiles(mockReq, mockRes, next);

      // Should clean up both files
      expect(unlinkSpy).toHaveBeenCalledTimes(3); // 1 for too small + 2 for cleanup
    });
  });

  describe('handleMulterError()', () => {
    it('should handle LIMIT_FILE_SIZE error', () => {
      const err = new multer.MulterError('LIMIT_FILE_SIZE');

      handleMulterError(err, mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('File too large')
      });
    });

    it('should handle LIMIT_FILE_COUNT error', () => {
      const err = new multer.MulterError('LIMIT_FILE_COUNT');

      handleMulterError(err, mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Too many files. Maximum 10 files at once.'
      });
    });

    it('should handle LIMIT_UNEXPECTED_FILE error', () => {
      const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE');

      handleMulterError(err, mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Unexpected field name in upload'
      });
    });

    it('should handle other MulterError codes', () => {
      const err = new multer.MulterError('UNKNOWN_ERROR');
      err.message = 'Unknown error occurred';

      handleMulterError(err, mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Upload error: Unknown error occurred'
      });
    });

    it('should handle non-Multer errors', () => {
      const err = new Error('Custom error');

      handleMulterError(err, mockReq, mockRes, next);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Custom error'
      });
    });

    it('should call next() if no error', () => {
      handleMulterError(null, mockReq, mockRes, next);

      expect(next).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });
});
