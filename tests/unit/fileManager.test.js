/**
 * Unit Tests for fileManager utility
 * Tests file operations: delete, move, storage stats
 */

const path = require('path');
const fs = require('fs');

// Store original path.resolve
const originalPathResolve = path.resolve.bind(path);

// Mock the storage config
jest.mock('../../config/storage', () => ({
  uploadDir: '/tmp/test-uploads'
}));

const {
  deleteFile,
  deleteMultipleFiles,
  fileExists,
  getFilePath,
  getFileSize,
  getStorageStats,
  findOrphanedFiles,
  cleanupOrphanedFiles,
  moveFile
} = require('../../utils/fileManager');

describe('File Manager Utility', () => {
  const uploadDir = '/tmp/test-uploads';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Restore original path.resolve
    path.resolve = originalPathResolve;
  });

  // Helper to mock path.resolve for security check to pass
  const mockPathResolveForSuccess = () => {
    path.resolve = (p) => {
      // Normalize the path and ensure consistent forward slashes
      const normalized = p.replace(/\\/g, '/');
      // Return the same format for both paths so startsWith check works
      return normalized;
    };
  };

  // Helper to mock path.resolve for path traversal test
  const mockPathResolveForTraversal = () => {
    path.resolve = (p) => {
      if (p.includes('..')) {
        return '/etc/passwd';
      }
      return '/tmp/test-uploads';
    };
  };

  describe('deleteFile()', () => {
    it('should delete existing file successfully', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
      mockPathResolveForSuccess();

      const result = deleteFile('test-audio.mp3');

      expect(result).toBe(true);
    });

    it('should return false if no filename provided', () => {
      expect(deleteFile(null)).toBe(false);
      expect(deleteFile(undefined)).toBe(false);
      expect(deleteFile('')).toBe(false);
    });

    it('should return false if file does not exist', () => {
      mockPathResolveForSuccess();
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = deleteFile('nonexistent.mp3');

      expect(result).toBe(false);
    });

    it('should prevent path traversal attacks', () => {
      mockPathResolveForTraversal();

      const result = deleteFile('../../../etc/passwd');

      expect(result).toBe(false);
    });

    it('should return false if unlink throws error', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });
      mockPathResolveForSuccess();

      const result = deleteFile('test.mp3');

      expect(result).toBe(false);
    });
  });

  describe('deleteMultipleFiles()', () => {
    it('should delete multiple files successfully', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
      mockPathResolveForSuccess();

      const result = deleteMultipleFiles(['file1.mp3', 'file2.mp3', 'file3.mp3']);

      expect(result).toEqual({
        successCount: 3,
        failCount: 0,
        errors: []
      });
    });

    it('should track failed deletions', () => {
      mockPathResolveForSuccess();
      // First and third files exist, second doesn't
      jest.spyOn(fs, 'existsSync')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const result = deleteMultipleFiles(['file1.mp3', 'file2.mp3', 'file3.mp3']);

      expect(result.successCount).toBe(2);
      expect(result.failCount).toBe(1);
      expect(result.errors).toContain('file2.mp3');
    });

    it('should return empty results for empty array', () => {
      const result = deleteMultipleFiles([]);

      expect(result).toEqual({
        successCount: 0,
        failCount: 0,
        errors: []
      });
    });

    it('should return empty results for non-array input', () => {
      expect(deleteMultipleFiles(null)).toEqual({
        successCount: 0,
        failCount: 0,
        errors: []
      });
      expect(deleteMultipleFiles('file.mp3')).toEqual({
        successCount: 0,
        failCount: 0,
        errors: []
      });
    });
  });

  describe('fileExists()', () => {
    it('should return true if file exists', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);

      expect(fileExists('test.mp3')).toBe(true);
    });

    it('should return false if file does not exist', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(fileExists('nonexistent.mp3')).toBe(false);
    });

    it('should return false for empty filename', () => {
      expect(fileExists(null)).toBe(false);
      expect(fileExists(undefined)).toBe(false);
      expect(fileExists('')).toBe(false);
    });

    it('should return false if check throws error', () => {
      jest.spyOn(fs, 'existsSync').mockImplementation(() => {
        throw new Error('Error');
      });

      expect(fileExists('test.mp3')).toBe(false);
    });
  });

  describe('getFilePath()', () => {
    it('should return full path for filename', () => {
      const result = getFilePath('test.mp3');
      expect(result).toBe(path.join(uploadDir, 'test.mp3'));
    });

    it('should return null for empty filename', () => {
      expect(getFilePath(null)).toBeNull();
      expect(getFilePath(undefined)).toBeNull();
      expect(getFilePath('')).toBeNull();
    });
  });

  describe('getFileSize()', () => {
    it('should return file size in bytes', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 5242880 });

      const result = getFileSize('test.mp3');
      expect(result).toBe(5242880);
    });

    it('should return null if file does not exist', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(getFileSize('nonexistent.mp3')).toBeNull();
    });

    it('should return null for empty filename', () => {
      expect(getFileSize(null)).toBeNull();
      expect(getFileSize(undefined)).toBeNull();
      expect(getFileSize('')).toBeNull();
    });

    it('should return null if stat throws error', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockImplementation(() => {
        throw new Error('Error');
      });

      expect(getFileSize('test.mp3')).toBeNull();
    });
  });

  describe('getStorageStats()', () => {
    it('should calculate total storage used', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['file1.mp3', 'file2.mp3']);
      jest.spyOn(fs, 'statSync')
        .mockReturnValueOnce({ isFile: () => true, size: 5242880 }) // 5MB
        .mockReturnValueOnce({ isFile: () => true, size: 10485760 }); // 10MB

      const result = getStorageStats();

      expect(result.totalFiles).toBe(2);
      expect(result.totalSize).toBe(15728640);
      expect(result.totalSizeMB).toBe('15.00');
      expect(result.totalSizeGB).toBe('0.01');
    });

    it('should return zeros if upload directory does not exist', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = getStorageStats();

      expect(result).toEqual({
        totalFiles: 0,
        totalSize: 0,
        totalSizeMB: 0,
        totalSizeGB: 0
      });
    });

    it('should skip directories in count', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['file1.mp3', 'subdir', 'file2.mp3']);
      jest.spyOn(fs, 'statSync')
        .mockReturnValueOnce({ isFile: () => true, size: 5242880 })
        .mockReturnValueOnce({ isFile: () => false, size: 0 }) // directory
        .mockReturnValueOnce({ isFile: () => true, size: 5242880 });

      const result = getStorageStats();

      expect(result.totalSize).toBe(10485760);
    });

    it('should handle errors reading individual files', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['file1.mp3', 'broken.mp3']);
      jest.spyOn(fs, 'statSync')
        .mockReturnValueOnce({ isFile: () => true, size: 5242880 })
        .mockImplementationOnce(() => { throw new Error('Permission denied'); });

      const result = getStorageStats();

      expect(result.totalSize).toBe(5242880);
    });

    it('should return error info if readdirSync throws', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockImplementation(() => {
        throw new Error('Cannot read directory');
      });

      const result = getStorageStats();

      expect(result.totalFiles).toBe(0);
      expect(result.error).toBe('Cannot read directory');
    });
  });

  describe('findOrphanedFiles()', () => {
    const mockLectureModel = {
      find: jest.fn()
    };

    it('should find files not in database', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['file1.mp3', 'file2.mp3', 'orphan.mp3']);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true });
      mockLectureModel.find.mockReturnValue({
        lean: () => Promise.resolve([
          { audioFileName: 'file1.mp3' },
          { audioFileName: 'file2.mp3' }
        ])
      });

      const result = await findOrphanedFiles(mockLectureModel);

      expect(result).toEqual(['orphan.mp3']);
    });

    it('should return empty array if no orphaned files', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['file1.mp3']);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true });
      mockLectureModel.find.mockReturnValue({
        lean: () => Promise.resolve([{ audioFileName: 'file1.mp3' }])
      });

      const result = await findOrphanedFiles(mockLectureModel);

      expect(result).toEqual([]);
    });

    it('should return empty array if upload directory does not exist', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = await findOrphanedFiles(mockLectureModel);

      expect(result).toEqual([]);
    });

    it('should return empty array on database error', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['file1.mp3']);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true });
      mockLectureModel.find.mockReturnValue({
        lean: () => Promise.reject(new Error('DB error'))
      });

      const result = await findOrphanedFiles(mockLectureModel);

      expect(result).toEqual([]);
    });
  });

  describe('cleanupOrphanedFiles()', () => {
    const mockLectureModel = {
      find: jest.fn()
    };

    it('should delete orphaned files', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['file1.mp3', 'orphan.mp3']);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true });
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
      mockPathResolveForSuccess();
      mockLectureModel.find.mockReturnValue({
        lean: () => Promise.resolve([{ audioFileName: 'file1.mp3' }])
      });

      const result = await cleanupOrphanedFiles(mockLectureModel);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(1);
    });

    it('should report no orphaned files found', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['file1.mp3']);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true });
      mockLectureModel.find.mockReturnValue({
        lean: () => Promise.resolve([{ audioFileName: 'file1.mp3' }])
      });

      const result = await cleanupOrphanedFiles(mockLectureModel);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
      expect(result.message).toBe('No orphaned files found');
    });

    it('should handle errors gracefully', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue(['orphan.mp3']);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true });
      mockLectureModel.find.mockReturnValue({
        lean: () => Promise.reject(new Error('Database error'))
      });

      const result = await cleanupOrphanedFiles(mockLectureModel);

      // Since findOrphanedFiles catches errors and returns [], cleanup will succeed with 0 deleted
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
    });
  });

  describe('moveFile()', () => {
    it('should move file successfully', () => {
      jest.spyOn(fs, 'existsSync')
        .mockReturnValueOnce(true)  // source exists
        .mockReturnValueOnce(false); // destination doesn't exist
      jest.spyOn(fs, 'renameSync').mockImplementation(() => {});
      mockPathResolveForSuccess();

      const result = moveFile('old.mp3', 'new.mp3');

      expect(result).toBe(true);
      expect(fs.renameSync).toHaveBeenCalled();
    });

    it('should return false if source file does not exist', () => {
      mockPathResolveForSuccess();
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = moveFile('nonexistent.mp3', 'new.mp3');

      expect(result).toBe(false);
    });

    it('should return false if destination already exists', () => {
      mockPathResolveForSuccess();
      jest.spyOn(fs, 'existsSync').mockReturnValue(true); // both exist

      const result = moveFile('old.mp3', 'existing.mp3');

      expect(result).toBe(false);
    });

    it('should prevent path traversal for source', () => {
      mockPathResolveForTraversal();

      const result = moveFile('../../../etc/passwd', 'new.mp3');

      expect(result).toBe(false);
    });

    it('should prevent path traversal for destination', () => {
      mockPathResolveForTraversal();

      const result = moveFile('old.mp3', '../../../etc/passwd');

      expect(result).toBe(false);
    });

    it('should return false if rename throws error', () => {
      jest.spyOn(fs, 'existsSync')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      jest.spyOn(fs, 'renameSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });
      mockPathResolveForSuccess();

      const result = moveFile('old.mp3', 'new.mp3');

      expect(result).toBe(false);
    });
  });
});
