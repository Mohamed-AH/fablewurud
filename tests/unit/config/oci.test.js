/**
 * Unit Tests for OCI Configuration
 * Tests OCI Object Storage client initialization and helper functions
 */

describe('OCI Configuration', () => {
  const originalEnv = process.env;
  let mockCommon;
  let mockOs;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };

    // Mock oci-common
    mockCommon = {
      SimpleAuthenticationDetailsProvider: jest.fn(),
      ConfigFileAuthenticationDetailsProvider: jest.fn(),
      Region: {
        fromRegionId: jest.fn().mockReturnValue('mock-region')
      }
    };

    // Mock oci-objectstorage
    mockOs = {
      ObjectStorageClient: jest.fn().mockImplementation(() => ({
        getNamespace: jest.fn()
      }))
    };

    jest.mock('oci-common', () => mockCommon);
    jest.mock('oci-objectstorage', () => mockOs);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('getNamespace()', () => {
    it('should return OCI_NAMESPACE from environment', () => {
      process.env.OCI_NAMESPACE = 'test-namespace';
      const oci = require('../../../config/oci');

      expect(oci.getNamespace()).toBe('test-namespace');
    });

    it('should return undefined when OCI_NAMESPACE is not set', () => {
      delete process.env.OCI_NAMESPACE;
      const oci = require('../../../config/oci');

      expect(oci.getNamespace()).toBeUndefined();
    });
  });

  describe('getBucketName()', () => {
    it('should return OCI_BUCKET from environment', () => {
      process.env.OCI_BUCKET = 'custom-bucket';
      const oci = require('../../../config/oci');

      expect(oci.getBucketName()).toBe('custom-bucket');
    });

    it('should return default bucket name when OCI_BUCKET is not set', () => {
      delete process.env.OCI_BUCKET;
      const oci = require('../../../config/oci');

      expect(oci.getBucketName()).toBe('wurud-audio');
    });
  });

  describe('getRegion()', () => {
    it('should return OCI_REGION from environment', () => {
      process.env.OCI_REGION = 'eu-frankfurt-1';
      const oci = require('../../../config/oci');

      expect(oci.getRegion()).toBe('eu-frankfurt-1');
    });

    it('should return default region when OCI_REGION is not set', () => {
      delete process.env.OCI_REGION;
      const oci = require('../../../config/oci');

      expect(oci.getRegion()).toBe('us-ashburn-1');
    });
  });

  describe('isConfigured()', () => {
    it('should return true when namespace and private key are configured', () => {
      process.env.OCI_NAMESPACE = 'test-namespace';
      process.env.OCI_PRIVATE_KEY = 'test-key';
      const oci = require('../../../config/oci');

      expect(oci.isConfigured()).toBe(true);
    });

    it('should return true when namespace and config file are configured', () => {
      process.env.OCI_NAMESPACE = 'test-namespace';
      process.env.OCI_CONFIG_FILE = '/path/to/config';
      delete process.env.OCI_PRIVATE_KEY;
      const oci = require('../../../config/oci');

      expect(oci.isConfigured()).toBe(true);
    });

    it('should return false when namespace is missing', () => {
      delete process.env.OCI_NAMESPACE;
      process.env.OCI_PRIVATE_KEY = 'test-key';
      const oci = require('../../../config/oci');

      expect(oci.isConfigured()).toBe(false);
    });

    it('should return false when both private key and config file are missing', () => {
      process.env.OCI_NAMESPACE = 'test-namespace';
      delete process.env.OCI_PRIVATE_KEY;
      delete process.env.OCI_CONFIG_FILE;
      const oci = require('../../../config/oci');

      expect(oci.isConfigured()).toBe(false);
    });
  });

  describe('initializeClient()', () => {
    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should return null when no credentials are configured', () => {
      delete process.env.OCI_PRIVATE_KEY;
      delete process.env.OCI_TENANCY;
      delete process.env.OCI_CONFIG_FILE;
      const oci = require('../../../config/oci');

      const client = oci.initializeClient();

      expect(client).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('OCI credentials not configured')
      );
    });

    it('should use environment variable authentication when OCI_PRIVATE_KEY is set', () => {
      process.env.OCI_PRIVATE_KEY = 'test-key\\nwith-newlines';
      process.env.OCI_TENANCY = 'test-tenancy';
      process.env.OCI_USER = 'test-user';
      process.env.OCI_FINGERPRINT = 'test-fingerprint';
      process.env.OCI_REGION = 'us-ashburn-1';

      const oci = require('../../../config/oci');
      oci.initializeClient();

      expect(mockCommon.SimpleAuthenticationDetailsProvider).toHaveBeenCalledWith(
        'test-tenancy',
        'test-user',
        'test-fingerprint',
        'test-key\nwith-newlines', // Newlines should be converted
        null,
        'mock-region'
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Using OCI environment variable authentication')
      );
    });

    it('should use config file authentication when OCI_CONFIG_FILE is set', () => {
      delete process.env.OCI_PRIVATE_KEY;
      delete process.env.OCI_TENANCY;
      process.env.OCI_CONFIG_FILE = '/path/to/config';
      process.env.OCI_PROFILE = 'CUSTOM';

      const oci = require('../../../config/oci');
      oci.initializeClient();

      expect(mockCommon.ConfigFileAuthenticationDetailsProvider).toHaveBeenCalledWith(
        '/path/to/config',
        'CUSTOM'
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Using OCI config file authentication')
      );
    });

    it('should use DEFAULT profile when OCI_PROFILE is not set', () => {
      delete process.env.OCI_PRIVATE_KEY;
      delete process.env.OCI_TENANCY;
      process.env.OCI_CONFIG_FILE = '/path/to/config';
      delete process.env.OCI_PROFILE;

      const oci = require('../../../config/oci');
      oci.initializeClient();

      expect(mockCommon.ConfigFileAuthenticationDetailsProvider).toHaveBeenCalledWith(
        '/path/to/config',
        'DEFAULT'
      );
    });

    it('should return cached client on subsequent calls', () => {
      process.env.OCI_PRIVATE_KEY = 'test-key';
      process.env.OCI_TENANCY = 'test-tenancy';
      process.env.OCI_USER = 'test-user';
      process.env.OCI_FINGERPRINT = 'test-fingerprint';

      const oci = require('../../../config/oci');
      const client1 = oci.initializeClient();
      const client2 = oci.initializeClient();

      expect(client1).toBe(client2);
      expect(mockOs.ObjectStorageClient).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors gracefully', () => {
      process.env.OCI_PRIVATE_KEY = 'test-key';
      process.env.OCI_TENANCY = 'test-tenancy';

      mockCommon.SimpleAuthenticationDetailsProvider.mockImplementation(() => {
        throw new Error('Authentication failed');
      });

      const oci = require('../../../config/oci');
      const client = oci.initializeClient();

      expect(client).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize OCI client'),
        'Authentication failed'
      );
    });
  });

  describe('client getter', () => {
    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
      jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('should call initializeClient when accessing client property', () => {
      process.env.OCI_PRIVATE_KEY = 'test-key';
      process.env.OCI_TENANCY = 'test-tenancy';
      process.env.OCI_USER = 'test-user';
      process.env.OCI_FINGERPRINT = 'test-fingerprint';

      const oci = require('../../../config/oci');
      const client = oci.client;

      expect(client).toBeDefined();
      expect(mockOs.ObjectStorageClient).toHaveBeenCalled();
    });

    it('should return null when not configured', () => {
      delete process.env.OCI_PRIVATE_KEY;
      delete process.env.OCI_CONFIG_FILE;

      const oci = require('../../../config/oci');
      const client = oci.client;

      expect(client).toBeNull();
    });
  });
});
