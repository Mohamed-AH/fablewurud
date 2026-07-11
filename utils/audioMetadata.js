const { parseFile } = require('music-metadata');
const fs = require('fs');

/**
 * Extract metadata from audio file
 * @param {string} filePath - Path to audio file
 * @returns {Promise<object>} - Metadata object with duration, bitrate, format, etc.
 */
const extractAudioMetadata = async (filePath) => {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    // Parse audio file
    const metadata = await parseFile(filePath);

    // Get file stats for size
    const stats = fs.statSync(filePath);

    // Extract relevant information
    const audioInfo = {
      // Duration in seconds
      duration: Math.round(metadata.format.duration || 0),

      // File size in bytes
      fileSize: stats.size,

      // Bitrate in kbps
      bitrate: metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : null,

      // Sample rate in Hz
      sampleRate: metadata.format.sampleRate || null,

      // Number of channels (1 = mono, 2 = stereo)
      channels: metadata.format.numberOfChannels || null,

      // Audio codec/format
      codec: metadata.format.codec || null,

      // Container format (MP3, M4A, etc.)
      container: metadata.format.container || null,

      // Formatted duration (HH:MM:SS or MM:SS)
      durationFormatted: formatDuration(metadata.format.duration || 0),

      // File size in MB
      fileSizeMB: (stats.size / (1024 * 1024)).toFixed(2),

      // Additional metadata (if available)
      title: metadata.common.title || null,
      artist: metadata.common.artist || null,
      album: metadata.common.album || null,
      year: metadata.common.year || null
    };

    return audioInfo;

  } catch (error) {
    console.error('Error extracting audio metadata:', error);
    throw new Error(`Failed to extract audio metadata: ${error.message}`);
  }
};

/**
 * Format duration in seconds to HH:MM:SS or MM:SS
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration
 */
const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '00:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Validate audio file format
 * @param {string} filePath - Path to audio file
 * @returns {Promise<boolean>} - True if valid audio file
 */
const isValidAudioFile = async (filePath) => {
  try {
    const metadata = await parseFile(filePath);

    // Check if file has duration (basic audio validation)
    if (!metadata.format.duration || metadata.format.duration <= 0) {
      return false;
    }

    // Check if it's an audio file
    const audioContainers = ['MPEG', 'MP4', 'WAV', 'OGG', 'FLAC', 'AAC', 'WEBM'];
    const container = metadata.format.container?.toUpperCase();

    if (container && audioContainers.includes(container)) {
      return true;
    }

    // Additional check: if codec is audio-related
    const codec = metadata.format.codec?.toLowerCase() || '';
    if (codec.includes('mp3') || codec.includes('aac') || codec.includes('opus') || codec.includes('vorbis')) {
      return true;
    }

    return false;

  } catch (error) {
    console.error('Audio validation error:', error);
    return false;
  }
};

/**
 * Get quick file info without full metadata parsing
 * @param {string} filePath - Path to file
 * @returns {object} - Basic file info
 */
const getQuickFileInfo = (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    const path = require('path');

    return {
      exists: true,
      size: stats.size,
      sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
      extension: path.extname(filePath).toLowerCase(),
      filename: path.basename(filePath),
      created: stats.birthtime,
      modified: stats.mtime
    };
  } catch (error) {
    return {
      exists: false,
      error: error.message
    };
  }
};

module.exports = {
  extractAudioMetadata,
  formatDuration,
  isValidAudioFile,
  getQuickFileInfo
};
