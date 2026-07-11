const fs = require('fs');
const path = require('path');
const { uploadDir } = require('../config/storage');

/**
 * Delete a file from storage
 * @param {string} filename - Filename to delete (not full path)
 * @returns {boolean} - True if deleted successfully
 */
const deleteFile = (filename) => {
  try {
    if (!filename) {
      console.error('No filename provided for deletion');
      return false;
    }

    const filePath = path.join(uploadDir, filename);

    // Security check: ensure file is within upload directory
    const resolvedPath = path.resolve(filePath);
    const resolvedUploadDir = path.resolve(uploadDir);

    if (!resolvedPath.startsWith(resolvedUploadDir)) {
      console.error('Security: Attempted to delete file outside upload directory');
      return false;
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found for deletion: ${filename}`);
      return false;
    }

    // Delete the file
    fs.unlinkSync(filePath);
    console.log(`✅ Deleted file: ${filename}`);
    return true;

  } catch (error) {
    console.error(`Error deleting file ${filename}:`, error);
    return false;
  }
};

/**
 * Delete multiple files
 * @param {string[]} filenames - Array of filenames to delete
 * @returns {object} - Result with success count and errors
 */
const deleteMultipleFiles = (filenames) => {
  const results = {
    successCount: 0,
    failCount: 0,
    errors: []
  };

  if (!Array.isArray(filenames) || filenames.length === 0) {
    return results;
  }

  filenames.forEach(filename => {
    const success = deleteFile(filename);
    if (success) {
      results.successCount++;
    } else {
      results.failCount++;
      results.errors.push(filename);
    }
  });

  return results;
};

/**
 * Check if file exists in storage
 * @param {string} filename - Filename to check
 * @returns {boolean} - True if file exists
 */
const fileExists = (filename) => {
  try {
    if (!filename) return false;

    const filePath = path.join(uploadDir, filename);
    return fs.existsSync(filePath);
  } catch (error) {
    console.error(`Error checking file existence:`, error);
    return false;
  }
};

/**
 * Get full file path
 * @param {string} filename - Filename
 * @returns {string} - Full path to file
 */
const getFilePath = (filename) => {
  if (!filename) return null;
  return path.join(uploadDir, filename);
};

/**
 * Get file size in bytes
 * @param {string} filename - Filename
 * @returns {number|null} - File size in bytes or null if error
 */
const getFileSize = (filename) => {
  try {
    if (!filename) return null;

    const filePath = path.join(uploadDir, filename);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (error) {
    console.error(`Error getting file size:`, error);
    return null;
  }
};

/**
 * Calculate total storage used
 * @returns {object} - Storage statistics
 */
const getStorageStats = () => {
  try {
    if (!fs.existsSync(uploadDir)) {
      return {
        totalFiles: 0,
        totalSize: 0,
        totalSizeMB: 0,
        totalSizeGB: 0
      };
    }

    const files = fs.readdirSync(uploadDir);
    let totalSize = 0;

    files.forEach(file => {
      const filePath = path.join(uploadDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          totalSize += stats.size;
        }
      } catch (err) {
        console.error(`Error reading file ${file}:`, err);
      }
    });

    return {
      totalFiles: files.length,
      totalSize: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      totalSizeGB: (totalSize / (1024 * 1024 * 1024)).toFixed(2)
    };

  } catch (error) {
    console.error('Error calculating storage stats:', error);
    return {
      totalFiles: 0,
      totalSize: 0,
      totalSizeMB: 0,
      totalSizeGB: 0,
      error: error.message
    };
  }
};

/**
 * Find orphaned files (files not referenced in database)
 * @param {object} Lecture - Lecture model
 * @returns {Promise<string[]>} - Array of orphaned filenames
 */
const findOrphanedFiles = async (Lecture) => {
  try {
    if (!fs.existsSync(uploadDir)) {
      return [];
    }

    // Get all files in upload directory
    const filesOnDisk = fs.readdirSync(uploadDir)
      .filter(file => {
        const filePath = path.join(uploadDir, file);
        return fs.statSync(filePath).isFile();
      });

    // Get all filenames from database
    const lectures = await Lecture.find({}, 'audioFileName').lean();
    const filesInDB = lectures.map(l => l.audioFileName);

    // Find files not in database
    const orphanedFiles = filesOnDisk.filter(file => !filesInDB.includes(file));

    return orphanedFiles;

  } catch (error) {
    console.error('Error finding orphaned files:', error);
    return [];
  }
};

/**
 * Clean up orphaned files
 * @param {object} Lecture - Lecture model
 * @returns {Promise<object>} - Cleanup results
 */
const cleanupOrphanedFiles = async (Lecture) => {
  try {
    const orphanedFiles = await findOrphanedFiles(Lecture);

    if (orphanedFiles.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        message: 'No orphaned files found'
      };
    }

    const results = deleteMultipleFiles(orphanedFiles);

    return {
      success: true,
      deletedCount: results.successCount,
      failedCount: results.failCount,
      errors: results.errors,
      message: `Deleted ${results.successCount} orphaned files`
    };

  } catch (error) {
    console.error('Error cleaning up orphaned files:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Move file to new location (useful for reorganization)
 * @param {string} filename - Current filename
 * @param {string} newFilename - New filename
 * @returns {boolean} - True if moved successfully
 */
const moveFile = (filename, newFilename) => {
  try {
    const oldPath = path.join(uploadDir, filename);
    const newPath = path.join(uploadDir, newFilename);

    // Security checks
    const resolvedOldPath = path.resolve(oldPath);
    const resolvedNewPath = path.resolve(newPath);
    const resolvedUploadDir = path.resolve(uploadDir);

    if (!resolvedOldPath.startsWith(resolvedUploadDir) || !resolvedNewPath.startsWith(resolvedUploadDir)) {
      console.error('Security: Attempted to move file outside upload directory');
      return false;
    }

    if (!fs.existsSync(oldPath)) {
      console.error(`Source file not found: ${filename}`);
      return false;
    }

    if (fs.existsSync(newPath)) {
      console.error(`Destination file already exists: ${newFilename}`);
      return false;
    }

    fs.renameSync(oldPath, newPath);
    console.log(`✅ Moved file: ${filename} -> ${newFilename}`);
    return true;

  } catch (error) {
    console.error(`Error moving file:`, error);
    return false;
  }
};

module.exports = {
  deleteFile,
  deleteMultipleFiles,
  fileExists,
  getFilePath,
  getFileSize,
  getStorageStats,
  findOrphanedFiles,
  cleanupOrphanedFiles,
  moveFile
};
