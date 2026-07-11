/**
 * Jest mock for music-metadata ESM module
 * This mock is necessary because music-metadata uses ESM imports
 * which aren't compatible with Jest's default CommonJS handling
 */

module.exports = {
  parseFile: jest.fn().mockResolvedValue({
    format: {
      duration: 3600,
      bitrate: 128000,
      sampleRate: 44100,
      numberOfChannels: 2,
      codec: 'mp3'
    },
    common: {
      title: 'Test Audio',
      artist: 'Test Artist',
      album: 'Test Album'
    }
  }),
  parseBuffer: jest.fn().mockResolvedValue({
    format: {
      duration: 3600,
      bitrate: 128000
    },
    common: {}
  }),
  parseStream: jest.fn().mockResolvedValue({
    format: {
      duration: 3600
    },
    common: {}
  })
};
