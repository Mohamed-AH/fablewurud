/**
 * Unit Tests for OCI Object Storage utility
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Mock the OCI config module before requiring ociStorage
jest.mock('../../config/oci', () => ({
  client: null,
  getNamespace: jest.fn(() => null),
  getBucketName: jest.fn(() => 'wurud-audio'),
  getRegion: jest.fn(() => 'us-ashburn-1'),
  isConfigured: jest.fn(() => false)
}));

const oci = require('../../config/oci');
const {
  uploadToOCI,
  deleteFromOCI,
  objectExists,
  listObjects,
  getPublicUrl,
  getObjectMetadata,
  createPreAuthenticatedRequest,
  isConfigured
} = require('../../utils/ociStorage');

describe('OCI Storage Utility', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getPublicUrl()', () => {
    it('should return placeholder URL when namespace is not set', () => {
      oci.getNamespace.mockReturnValue(null);

      const url = getPublicUrl('test-file.mp3');
      expect(url).toBe('/stream/test-file.mp3');
    });

    it('should return full OCI URL when namespace is set', () => {
      oci.getNamespace.mockReturnValue('test-namespace');
      oci.getBucketName.mockReturnValue('test-bucket');
      oci.getRegion.mockReturnValue('us-ashburn-1');

      const url = getPublicUrl('test-file.mp3');
      expect(url).toBe(
        'https://objectstorage.us-ashburn-1.oraclecloud.com/n/test-namespace/b/test-bucket/o/test-file.mp3'
      );
    });

    it('should URL-encode the object name', () => {
      oci.getNamespace.mockReturnValue('ns');
      oci.getBucketName.mockReturnValue('bucket');
      oci.getRegion.mockReturnValue('us-ashburn-1');

      const url = getPublicUrl('folder/file name.mp3');
      expect(url).toContain('folder%2Ffile%20name.mp3');
    });
  });

  describe('isConfigured', () => {
    it('should delegate to oci.isConfigured', () => {
      oci.isConfigured.mockReturnValue(false);
      expect(isConfigured()).toBe(false);

      oci.isConfigured.mockReturnValue(true);
      expect(isConfigured()).toBe(true);
    });
  });

  describe('uploadToOCI()', () => {
    it('should throw if OCI client is not initialized', async () => {
      await expect(uploadToOCI('/tmp/test.mp3', 'test.mp3'))
        .rejects.toThrow('OCI client not initialized');
    });

    it('should throw if namespace is not configured', async () => {
      const mockClient = { putObject: jest.fn() };
      Object.defineProperty(oci, 'client', { value: mockClient, writable: true });
      oci.getNamespace.mockReturnValue(null);

      await expect(uploadToOCI('/tmp/test.mp3', 'test.mp3'))
        .rejects.toThrow('OCI_NAMESPACE not configured');

      Object.defineProperty(oci, 'client', { value: null, writable: true });
    });

    it('should throw if file does not exist', async () => {
      const mockClient = { putObject: jest.fn() };
      Object.defineProperty(oci, 'client', { value: mockClient, writable: true });
      oci.getNamespace.mockReturnValue('ns');

      await expect(uploadToOCI('/nonexistent/file.mp3', 'test.mp3'))
        .rejects.toThrow('File not found');

      Object.defineProperty(oci, 'client', { value: null, writable: true });
    });

    it('should upload file successfully', async () => {
      const tmpFile = path.join(os.tmpdir(), `oci-test-upload-${Date.now()}.mp3`);
      fs.writeFileSync(tmpFile, 'fake audio data');

      const mockClient = {
        putObject: jest.fn().mockResolvedValue({ eTag: 'abc123' })
      };
      Object.defineProperty(oci, 'client', { value: mockClient, writable: true });
      oci.getNamespace.mockReturnValue('ns');
      oci.getBucketName.mockReturnValue('bucket');

      const result = await uploadToOCI(tmpFile, 'test.mp3');

      expect(result.success).toBe(true);
      expect(result.objectName).toBe('test.mp3');
      expect(result.etag).toBe('abc123');
      expect(result.contentType).toBe('audio/mpeg');
      expect(mockClient.putObject).toHaveBeenCalledTimes(1);

      const putArg = mockClient.putObject.mock.calls[0][0];
      expect(putArg.namespaceName).toBe('ns');
      expect(putArg.bucketName).toBe('bucket');
      expect(putArg.objectName).toBe('test.mp3');
      expect(putArg.contentType).toBe('audio/mpeg');
      expect(putArg.cacheControl).toBe('public, max-age=31536000');

      // Note: temp file left for OS cleanup to avoid race with lazy ReadStream open
      Object.defineProperty(oci, 'client', { value: null, writable: true });
    });

    it('should detect content type from extension', async () => {
      const tmpFile = path.join(os.tmpdir(), `oci-test-m4a-${Date.now()}.m4a`);
      fs.writeFileSync(tmpFile, 'fake audio');

      const mockClient = {
        putObject: jest.fn().mockResolvedValue({ eTag: 'x' })
      };
      Object.defineProperty(oci, 'client', { value: mockClient, writable: true });
      oci.getNamespace.mockReturnValue('ns');
      oci.getBucketName.mockReturnValue('bucket');

      const result = await uploadToOCI(tmpFile, 'test.m4a');
      expect(result.contentType).toBe('audio/mp4');

      // Note: temp file left for OS cleanup to avoid race with lazy ReadStream open
      Object.defineProperty(oci, 'client', { value: null, writable: true });
    });

    it('should wrap client errors', async () => {
      const tmpFile = path.join(os.tmpdir(), `oci-test-err-${Date.now()}.mp3`);
      fs.writeFileSync(tmpFile, 'data');

      const mockClient = {
        putObject: jest.fn().mockRejectedValue(new Error('network down'))
      };
      Object.defineProperty(oci, 'client', { value: mockClient, writable: true });
      oci.getNamespace.mockReturnValue('ns');
      oci.getBucketName.mockReturnValue('bucket');

      await expect(uploadToOCI(tmpFile, 'test.mp3'))
        .rejects.toThrow('Failed to upload test.mp3: network down');

      // Note: temp file left for OS cleanup to avoid race with lazy ReadStream open
      Object.defineProperty(oci, 'client', { value: null, writable: true });
    });
  });

  describe('deleteFromOCI()', () => {
    it('should throw if OCI client is not initialized', async () => {
      await expect(deleteFromOCI('test.mp3'))
        .rejects.toThrow('OCI client not initialized');
    });

    it('should delete object successfully', async () => {
      const mockClient = { deleteObject: jest.fn().mockResolvedValue({}) };
      Object.defineProperty(oci, 'client', { value: mockClient, writable: true });
      oci.getNamespace.mockReturnValue('ns');
      oci.getBucketName.mockReturnValue('bucket');

      const result = await deleteFromOCI('test.mp3');
      expect(result.success).toBe(true);
      expect(result.objectName).toBe('test.mp3');

      Object.defineProperty(oci, 'client', { value: null, writable: true });
    });

    it('should succeed if object does not exist (404)', async () => {
      const err = new Error('Not found');
      err.statusCode = 404;
      const mockClient = { deleteObject: jest.fn().mockRejectedValue(err) };
      Object.defineProperty(oci, 'client', { value: mockClient, writable: true });
      oci.getNamespace.mockReturnValue('ns');
      oci.getBucketName.mockReturnValue('bucket');

      const result = await deleteFromOCI('missing.mp3');
      expect(result.success).toBe(true);
      expect(result.note).toBe('Object did not exist');

      Object.defineProperty(oci, 'client', { value: null, writable: true });
    });

    it('should throw on non-404 errors', async () => {
      const err = new Error('server error');
      err.statusCode = 500;
      const mockClient = { deleteObject: jest.fn().mockRejectedValue(err) };
      Object.defineProperty(oci, 'client', { value: mockClient, writable: true });
      oci.getNamespace.mockReturnValue('ns');
      oci.getBucketName.mockReturnValue('bucket');

      await expect(deleteFromOCI('test.mp3'))
        .rejects.toThrow('Failed to delete test.mp3');

      Object.defineProperty(oci, 'client', { value: null, writable: true });
    });
  });

  describe('objectExists()', () => {
    it('should return false if client is not initialized', async () => {
      expect(await objectExists('test.mp3')).toBe(false);
    });

    it('should return true if object exists', async () => {
      const mockClient = { headObject: jest.fn().mockResolvedValue({}) };
      Object.defineProperty(oci, 'client', { value: mockClient, writable: true });
      oci.getNamespace.mockReturnValue('ns');
      oci.getBucketName.mockReturnValue('bucket');

      expect(await objectExists('test.mp3')).toBe(true);

      Object.defineProperty(oci, 'client', { value: null, writable: true });
    });

    it('should return false for 404 errors', async () => {
      const err = new Error('not found');
      err.statusCode = 404;
      const mockClient = { headObject: jest.fn().mockRejectedValue(err) };
      Object.defineProperty(oci, 'client', { value: mockClient, writable: true });
      oci.getNamespace.mockReturnValue('ns');
      oci.getBucketName.mockReturnValue('bucket');

      expect(await objectExists('missing.mp3')).toBe(false);

      Object.defineProperty(oci, 'client', { value: null, writable: true });
    });

    it('should throw on non-404 errors', async () => {
      const err = new Error('auth error');
      err.statusCode = 401;
      const mockClient = { headObject: jest.fn().mockRejectedValue(err) };
      Object.defineProperty(oci, 'client', { value: mockClient, writable: true });
      oci.getNamespace.mockReturnValue('ns');
      oci.getBucketName.mockReturnValue('bucket');

      await expect(objectExists('test.mp3')).rejects.toThrow('auth error');

      Object.defineProperty(oci, 'client', { value: null, writable: true });
    });
  });

  describe('listObjects()', () => {
    it('should throw if client is not initialized', async () => {
      await expect(listObjects()).rejects.toThrow('OCI client not initialized');
    });

    it('should list objects successfully', async () => {
      const mockClient = {
        listObjects: jest.fn().mockResolvedValue({
          listObjects: {
            objects: [
              { name: 'file1.mp3', size: 1000, etag: 'a', timeCreated: '2024-01-01' },
              { name: 'file2.mp3', size: 2000, etag: 'b', timeCreated: '2024-01-02' }
            ]
          }
        })
      };
      Object.defineProperty(oci, 'client', { value: mockClient, writable: true });
      oci.getNamespace.mockReturnValue('ns');
      oci.getBucketName.mockReturnValue('bucket');

      const result = await listObjects('prefix/', 10);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('file1.mp3');
      expect(result[0]).toHaveProperty('url');

      Object.defineProperty(oci, 'client', { value: null, writable: true });
    });

    it('should filter out objects with null names', async () => {
      const mockClient = {
        listObjects: jest.fn().mockResolvedValue({
          listObjects: {
            objects: [
              { name: 'file1.mp3', size: 1000 },
              { name: null, size: 0 },
              { name: undefined }
            ]
          }
        })
      };
      Object.defineProperty(oci, 'client', { value: mockClient, writable: true });
      oci.getNamespace.mockReturnValue('ns');
      oci.getBucketName.mockReturnValue('bucket');

      const result = await listObjects();
      expect(result).toHaveLength(1);

      Object.defineProperty(oci, 'client', { value: null, writable: true });
    });
  });

  describe('getObjectMetadata()', () => {
    it('should throw if client is not initialized', async () => {
      await expect(getObjectMetadata('test.mp3'))
        .rejects.toThrow('OCI client not initialized');
    });

    it('should return metadata for existing object', async () => {
      const mockClient = {
        headObject: jest.fn().mockResolvedValue({
          contentLength: 5000,
          contentType: 'audio/mpeg',
          eTag: 'etag123',
          lastModified: '2024-01-01'
        })
      };
      Object.defineProperty(oci, 'client', { value: mockClient, writable: true });
      oci.getNamespace.mockReturnValue('ns');
      oci.getBucketName.mockReturnValue('bucket');

      const result = await getObjectMetadata('test.mp3');
      expect(result.name).toBe('test.mp3');
      expect(result.size).toBe(5000);
      expect(result.contentType).toBe('audio/mpeg');
      expect(result).toHaveProperty('url');

      Object.defineProperty(oci, 'client', { value: null, writable: true });
    });

    it('should return null for 404', async () => {
      const err = new Error('not found');
      err.statusCode = 404;
      const mockClient = { headObject: jest.fn().mockRejectedValue(err) };
      Object.defineProperty(oci, 'client', { value: mockClient, writable: true });
      oci.getNamespace.mockReturnValue('ns');
      oci.getBucketName.mockReturnValue('bucket');

      const result = await getObjectMetadata('missing.mp3');
      expect(result).toBeNull();

      Object.defineProperty(oci, 'client', { value: null, writable: true });
    });
  });

  describe('createPreAuthenticatedRequest()', () => {
    it('should throw if client is not initialized', async () => {
      await expect(createPreAuthenticatedRequest('test.mp3'))
        .rejects.toThrow('OCI client not initialized');
    });

    it('should create PAR successfully', async () => {
      const mockClient = {
        createPreauthenticatedRequest: jest.fn().mockResolvedValue({
          preauthenticatedRequest: {
            accessUri: '/p/abc123/n/ns/b/bucket/o/test.mp3'
          }
        })
      };
      Object.defineProperty(oci, 'client', { value: mockClient, writable: true });
      oci.getNamespace.mockReturnValue('ns');
      oci.getBucketName.mockReturnValue('bucket');
      oci.getRegion.mockReturnValue('us-ashburn-1');

      const result = await createPreAuthenticatedRequest('test.mp3', 48);
      expect(result).toContain('https://objectstorage.us-ashburn-1.oraclecloud.com');
      expect(result).toContain('/p/abc123');

      Object.defineProperty(oci, 'client', { value: null, writable: true });
    });
  });
});
