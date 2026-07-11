/**
 * Unit Tests for Database Configuration
 * Tests MongoDB connection and event handling
 */

// Create mock functions that persist across module resets
const mockConnect = jest.fn();
const mockOn = jest.fn();
const mockClose = jest.fn();
const mockPlugin = jest.fn();

jest.mock('mongoose', () => ({
  connect: mockConnect,
  plugin: mockPlugin,
  connection: {
    host: 'localhost',
    name: 'test-db',
    on: mockOn,
    close: mockClose
  }
}));

describe('Database Configuration', () => {
  const originalEnv = process.env;
  const originalExit = process.exit;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test';

    process.exit = jest.fn();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Reset mocks
    mockConnect.mockReset();
    mockOn.mockReset();
    mockClose.mockReset();
    mockPlugin.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    process.exit = originalExit;
    jest.restoreAllMocks();
  });

  describe('connectDB()', () => {
    it('should connect to MongoDB successfully', async () => {
      const mockConnection = {
        connection: {
          host: 'localhost',
          name: 'test-db'
        }
      };
      mockConnect.mockResolvedValue(mockConnection);

      const connectDB = require('../../../config/database');
      const result = await connectDB();

      expect(mockConnect).toHaveBeenCalledWith(
        'mongodb://localhost:27017/test',
        expect.any(Object)
      );
      expect(result).toBe(mockConnection);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('MongoDB Connected')
      );
    });

    it('should log database name on successful connection', async () => {
      const mockConnection = {
        connection: {
          host: 'cluster.mongodb.net',
          name: 'wurud-production'
        }
      };
      mockConnect.mockResolvedValue(mockConnection);

      const connectDB = require('../../../config/database');
      await connectDB();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('cluster.mongodb.net')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('wurud-production')
      );
    });

    it('should return null and log warning on connection failure (maintenance mode)', async () => {
      const connectionError = new Error('Connection refused');
      mockConnect.mockRejectedValue(connectionError);

      const connectDB = require('../../../config/database');
      const result = await connectDB();

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('MongoDB connection failed'),
        'Connection refused'
      );
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('maintenance mode')
      );
      // Should NOT exit - server runs in maintenance mode
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('should handle SIGINT for graceful shutdown', async () => {
      const mockConnection = {
        connection: { host: 'localhost', name: 'test' }
      };
      mockConnect.mockResolvedValue(mockConnection);
      mockClose.mockResolvedValue();

      // Capture SIGINT handler
      let sigintHandler;
      const originalOn = process.on;
      process.on = jest.fn((event, handler) => {
        if (event === 'SIGINT') {
          sigintHandler = handler;
        }
        return process;
      });

      const connectDB = require('../../../config/database');
      await connectDB();

      // Verify SIGINT handler was registered
      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));

      // Simulate SIGINT
      if (sigintHandler) {
        await sigintHandler();
      }

      expect(mockClose).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);

      // Restore
      process.on = originalOn;
    });
  });
});
