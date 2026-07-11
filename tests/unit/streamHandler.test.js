/**
 * Unit Tests for streamHandler middleware
 * Tests HTTP Range requests and caching headers
 */

const fs = require('fs');
const { EventEmitter } = require('events');

const {
  handleRangeRequest,
  getMimeType,
  setCacheHeaders,
  preventCache
} = require('../../middleware/streamHandler');

describe('Stream Handler Middleware', () => {
  describe('getMimeType()', () => {
    it('should return correct MIME type for MP3', () => {
      expect(getMimeType('audio.mp3')).toBe('audio/mpeg');
      expect(getMimeType('file.MP3')).toBe('audio/mpeg');
    });

    it('should return correct MIME type for M4A', () => {
      expect(getMimeType('audio.m4a')).toBe('audio/mp4');
      expect(getMimeType('file.M4A')).toBe('audio/mp4');
    });

    it('should return correct MIME type for MP4', () => {
      expect(getMimeType('audio.mp4')).toBe('audio/mp4');
    });

    it('should return correct MIME type for WAV', () => {
      expect(getMimeType('audio.wav')).toBe('audio/wav');
    });

    it('should return correct MIME type for OGG', () => {
      expect(getMimeType('audio.ogg')).toBe('audio/ogg');
    });

    it('should return correct MIME type for WEBM', () => {
      expect(getMimeType('audio.webm')).toBe('audio/webm');
    });

    it('should return correct MIME type for AAC', () => {
      expect(getMimeType('audio.aac')).toBe('audio/aac');
    });

    it('should return correct MIME type for FLAC', () => {
      expect(getMimeType('audio.flac')).toBe('audio/flac');
    });

    it('should return default audio/mpeg for unknown extensions', () => {
      expect(getMimeType('audio.xyz')).toBe('audio/mpeg');
      expect(getMimeType('audio.unknown')).toBe('audio/mpeg');
    });

    it('should handle files with no extension', () => {
      expect(getMimeType('audiofile')).toBe('audio/mpeg');
    });

    it('should handle files with multiple dots', () => {
      expect(getMimeType('my.audio.file.mp3')).toBe('audio/mpeg');
      expect(getMimeType('file.test.ogg')).toBe('audio/ogg');
    });
  });

  describe('setCacheHeaders()', () => {
    it('should set cache headers for one year', () => {
      const req = {};
      const res = {
        set: jest.fn()
      };
      const next = jest.fn();

      setCacheHeaders(req, res, next);

      expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
        'Cache-Control': 'public, max-age=31536000, immutable'
      }));
      expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
        'Expires': expect.any(String)
      }));
      expect(next).toHaveBeenCalled();
    });
  });

  describe('preventCache()', () => {
    it('should set no-cache headers', () => {
      const req = {};
      const res = {
        set: jest.fn()
      };
      const next = jest.fn();

      preventCache(req, res, next);

      expect(res.set).toHaveBeenCalledWith({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Expires': '0',
        'Pragma': 'no-cache'
      });
      expect(next).toHaveBeenCalled();
    });
  });

  describe('handleRangeRequest()', () => {
    let mockReq;
    let mockRes;
    let mockStream;

    beforeEach(() => {
      mockStream = new EventEmitter();
      mockStream.pipe = jest.fn().mockReturnValue(mockStream);

      jest.spyOn(fs, 'createReadStream').mockReturnValue(mockStream);

      mockReq = {
        filePath: '/tmp/test.mp3',
        fileStat: { size: 1000000 },
        mimeType: 'audio/mpeg',
        headers: {}
      };

      mockRes = {
        writeHead: jest.fn(),
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
        json: jest.fn(),
        headersSent: false
      };
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return 500 if filePath not provided', () => {
      mockReq.filePath = null;

      handleRangeRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'File path or stats not provided'
      });
    });

    it('should return 500 if fileStat not provided', () => {
      mockReq.fileStat = null;

      handleRangeRequest(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'File path or stats not provided'
      });
    });

    it('should serve entire file when no Range header', () => {
      handleRangeRequest(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
        'Content-Length': 1000000,
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000'
      });
      expect(fs.createReadStream).toHaveBeenCalledWith('/tmp/test.mp3');
      expect(mockStream.pipe).toHaveBeenCalledWith(mockRes);
    });

    it('should serve partial content with Range header', () => {
      mockReq.headers.range = 'bytes=0-99999';

      handleRangeRequest(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(206, {
        'Content-Range': 'bytes 0-99999/1000000',
        'Accept-Ranges': 'bytes',
        'Content-Length': 100000,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=31536000'
      });
      expect(fs.createReadStream).toHaveBeenCalledWith('/tmp/test.mp3', {
        start: 0,
        end: 99999
      });
    });

    it('should handle open-ended Range header (bytes=500-)', () => {
      mockReq.headers.range = 'bytes=500000-';

      handleRangeRequest(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(206, expect.objectContaining({
        'Content-Range': 'bytes 500000-999999/1000000',
        'Content-Length': 500000
      }));
    });

    it('should return 416 for invalid range (start >= fileSize)', () => {
      mockReq.headers.range = 'bytes=2000000-2000100';

      handleRangeRequest(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(416, {
        'Content-Range': 'bytes */1000000'
      });
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should return 416 for invalid range (end >= fileSize)', () => {
      mockReq.headers.range = 'bytes=0-2000000';

      handleRangeRequest(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(416, {
        'Content-Range': 'bytes */1000000'
      });
    });

    it('should use default MIME type if not specified', () => {
      delete mockReq.mimeType;

      handleRangeRequest(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        'Content-Type': 'audio/mpeg'
      }));
    });

    it('should handle stream errors gracefully', () => {
      handleRangeRequest(mockReq, mockRes);

      // Simulate stream error
      mockStream.emit('error', new Error('Read error'));

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.end).toHaveBeenCalledWith('Stream error');
    });

    it('should not send error if headers already sent', () => {
      mockRes.headersSent = true;

      handleRangeRequest(mockReq, mockRes);

      // Simulate stream error after headers sent
      mockStream.emit('error', new Error('Read error'));

      // Should not call status/end again
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should handle range with partial content for range requests', () => {
      mockReq.headers.range = 'bytes=100-199';

      handleRangeRequest(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(206, expect.objectContaining({
        'Content-Range': 'bytes 100-199/1000000',
        'Content-Length': 100
      }));
    });
  });
});
