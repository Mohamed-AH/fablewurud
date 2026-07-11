/**
 * Unit Tests for audioMetadata utility
 * Tests audio file metadata extraction and validation
 */

const path = require('path');
const fs = require('fs');

// Mock music-metadata before requiring the module
jest.mock('music-metadata', () => ({
  parseFile: jest.fn()
}));

const { parseFile } = require('music-metadata');
const {
  extractAudioMetadata,
  formatDuration,
  isValidAudioFile,
  getQuickFileInfo
} = require('../../utils/audioMetadata');

describe('Audio Metadata Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('formatDuration()', () => {
    it('should format seconds to MM:SS for short durations', () => {
      expect(formatDuration(0)).toBe('00:00');
      expect(formatDuration(30)).toBe('0:30');
      expect(formatDuration(60)).toBe('1:00');
      expect(formatDuration(90)).toBe('1:30');
      expect(formatDuration(125)).toBe('2:05');
      expect(formatDuration(599)).toBe('9:59');
    });

    it('should format seconds to HH:MM:SS for long durations', () => {
      expect(formatDuration(3600)).toBe('1:00:00');
      expect(formatDuration(3661)).toBe('1:01:01');
      expect(formatDuration(7200)).toBe('2:00:00');
      expect(formatDuration(7325)).toBe('2:02:05');
    });

    it('should handle invalid input', () => {
      expect(formatDuration(null)).toBe('00:00');
      expect(formatDuration(undefined)).toBe('00:00');
      expect(formatDuration(-1)).toBe('00:00');
      expect(formatDuration(-100)).toBe('00:00');
    });

    it('should handle fractional seconds', () => {
      expect(formatDuration(90.5)).toBe('1:30');
      expect(formatDuration(90.9)).toBe('1:30');
    });
  });

  describe('extractAudioMetadata()', () => {
    const mockFilePath = '/tmp/test-audio.mp3';

    beforeEach(() => {
      // Mock fs.existsSync
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      // Mock fs.statSync
      jest.spyOn(fs, 'statSync').mockReturnValue({
        size: 5242880 // 5MB
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should extract metadata from valid audio file', async () => {
      parseFile.mockResolvedValue({
        format: {
          duration: 180,
          bitrate: 128000,
          sampleRate: 44100,
          numberOfChannels: 2,
          codec: 'MPEG 1 Layer 3',
          container: 'MPEG'
        },
        common: {
          title: 'Test Title',
          artist: 'Test Artist',
          album: 'Test Album',
          year: 2024
        }
      });

      const result = await extractAudioMetadata(mockFilePath);

      expect(result).toEqual({
        duration: 180,
        fileSize: 5242880,
        bitrate: 128,
        sampleRate: 44100,
        channels: 2,
        codec: 'MPEG 1 Layer 3',
        container: 'MPEG',
        durationFormatted: '3:00',
        fileSizeMB: '5.00',
        title: 'Test Title',
        artist: 'Test Artist',
        album: 'Test Album',
        year: 2024
      });
    });

    it('should handle missing optional metadata', async () => {
      parseFile.mockResolvedValue({
        format: {
          duration: 60
        },
        common: {}
      });

      const result = await extractAudioMetadata(mockFilePath);

      expect(result.duration).toBe(60);
      expect(result.bitrate).toBeNull();
      expect(result.sampleRate).toBeNull();
      expect(result.channels).toBeNull();
      expect(result.codec).toBeNull();
      expect(result.title).toBeNull();
      expect(result.artist).toBeNull();
    });

    it('should throw error if file does not exist', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      await expect(extractAudioMetadata(mockFilePath)).rejects.toThrow(
        'Failed to extract audio metadata: File not found'
      );
    });

    it('should throw error if parsing fails', async () => {
      parseFile.mockRejectedValue(new Error('Invalid audio format'));

      await expect(extractAudioMetadata(mockFilePath)).rejects.toThrow(
        'Failed to extract audio metadata: Invalid audio format'
      );
    });

    it('should round duration to nearest second', async () => {
      parseFile.mockResolvedValue({
        format: { duration: 123.7 },
        common: {}
      });

      const result = await extractAudioMetadata(mockFilePath);
      expect(result.duration).toBe(124);
    });

    it('should convert bitrate from bps to kbps', async () => {
      parseFile.mockResolvedValue({
        format: { duration: 60, bitrate: 320000 },
        common: {}
      });

      const result = await extractAudioMetadata(mockFilePath);
      expect(result.bitrate).toBe(320);
    });
  });

  describe('isValidAudioFile()', () => {
    const mockFilePath = '/tmp/test-audio.mp3';

    it('should return true for valid MP3 file', async () => {
      parseFile.mockResolvedValue({
        format: {
          duration: 120,
          container: 'MPEG'
        }
      });

      const result = await isValidAudioFile(mockFilePath);
      expect(result).toBe(true);
    });

    it('should return true for valid MP4/M4A file', async () => {
      parseFile.mockResolvedValue({
        format: {
          duration: 120,
          container: 'MP4'
        }
      });

      const result = await isValidAudioFile(mockFilePath);
      expect(result).toBe(true);
    });

    it('should return true for valid WAV file', async () => {
      parseFile.mockResolvedValue({
        format: {
          duration: 120,
          container: 'WAV'
        }
      });

      const result = await isValidAudioFile(mockFilePath);
      expect(result).toBe(true);
    });

    it('should return true for valid OGG file', async () => {
      parseFile.mockResolvedValue({
        format: {
          duration: 120,
          container: 'OGG'
        }
      });

      const result = await isValidAudioFile(mockFilePath);
      expect(result).toBe(true);
    });

    it('should return true for AAC codec', async () => {
      parseFile.mockResolvedValue({
        format: {
          duration: 120,
          codec: 'AAC'
        }
      });

      const result = await isValidAudioFile(mockFilePath);
      expect(result).toBe(true);
    });

    it('should return true for MP3 codec', async () => {
      parseFile.mockResolvedValue({
        format: {
          duration: 120,
          codec: 'mp3'
        }
      });

      const result = await isValidAudioFile(mockFilePath);
      expect(result).toBe(true);
    });

    it('should return true for Opus codec', async () => {
      parseFile.mockResolvedValue({
        format: {
          duration: 120,
          codec: 'opus'
        }
      });

      const result = await isValidAudioFile(mockFilePath);
      expect(result).toBe(true);
    });

    it('should return true for Vorbis codec', async () => {
      parseFile.mockResolvedValue({
        format: {
          duration: 120,
          codec: 'vorbis'
        }
      });

      const result = await isValidAudioFile(mockFilePath);
      expect(result).toBe(true);
    });

    it('should return false for file with no duration', async () => {
      parseFile.mockResolvedValue({
        format: {
          duration: 0,
          container: 'MPEG'
        }
      });

      const result = await isValidAudioFile(mockFilePath);
      expect(result).toBe(false);
    });

    it('should return false for file with negative duration', async () => {
      parseFile.mockResolvedValue({
        format: {
          duration: -1,
          container: 'MPEG'
        }
      });

      const result = await isValidAudioFile(mockFilePath);
      expect(result).toBe(false);
    });

    it('should return false for unknown container/codec', async () => {
      parseFile.mockResolvedValue({
        format: {
          duration: 120,
          container: 'UNKNOWN',
          codec: 'unknown'
        }
      });

      const result = await isValidAudioFile(mockFilePath);
      expect(result).toBe(false);
    });

    it('should return false if parsing throws error', async () => {
      parseFile.mockRejectedValue(new Error('Parse error'));

      const result = await isValidAudioFile(mockFilePath);
      expect(result).toBe(false);
    });
  });

  describe('getQuickFileInfo()', () => {
    const mockFilePath = '/tmp/test-file.mp3';
    const mockBirthtime = new Date('2024-01-01');
    const mockMtime = new Date('2024-06-01');

    beforeEach(() => {
      jest.spyOn(fs, 'statSync').mockReturnValue({
        size: 10485760, // 10MB
        birthtime: mockBirthtime,
        mtime: mockMtime
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return file info for existing file', () => {
      const result = getQuickFileInfo(mockFilePath);

      expect(result).toEqual({
        exists: true,
        size: 10485760,
        sizeMB: '10.00',
        extension: '.mp3',
        filename: 'test-file.mp3',
        created: mockBirthtime,
        modified: mockMtime
      });
    });

    it('should return correct extension for different file types', () => {
      expect(getQuickFileInfo('/path/to/file.m4a').extension).toBe('.m4a');
      expect(getQuickFileInfo('/path/to/file.wav').extension).toBe('.wav');
      expect(getQuickFileInfo('/path/to/file.OGG').extension).toBe('.ogg');
    });

    it('should return exists: false if file does not exist', () => {
      jest.spyOn(fs, 'statSync').mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = getQuickFileInfo(mockFilePath);

      expect(result).toEqual({
        exists: false,
        error: 'ENOENT: no such file or directory'
      });
    });

    it('should handle permission errors', () => {
      jest.spyOn(fs, 'statSync').mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const result = getQuickFileInfo(mockFilePath);

      expect(result).toEqual({
        exists: false,
        error: 'EACCES: permission denied'
      });
    });

    it('should calculate file size in MB correctly', () => {
      // 1.5 MB
      jest.spyOn(fs, 'statSync').mockReturnValue({
        size: 1572864,
        birthtime: mockBirthtime,
        mtime: mockMtime
      });

      const result = getQuickFileInfo(mockFilePath);
      expect(result.sizeMB).toBe('1.50');
    });
  });
});
