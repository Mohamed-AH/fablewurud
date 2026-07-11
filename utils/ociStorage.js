/**
 * OCI Object Storage Utility Functions
 *
 * Handles upload, download, delete, and URL generation for audio files
 * stored in Oracle Cloud Infrastructure Object Storage.
 */

const fs = require('fs');
const path = require('path');
const oci = require('../config/oci');

/**
 * Upload a file to OCI Object Storage
 *
 * @param {string} filePath - Local path to the file
 * @param {string} objectName - Name to use in OCI (e.g., 'lecture-001.mp3')
 * @param {object} options - Additional options
 * @returns {Promise<object>} Upload result with URL
 */
async function uploadToOCI(filePath, objectName, options = {}) {
  const client = oci.client;
  if (!client) {
    throw new Error('OCI client not initialized');
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  if (!namespace) {
    throw new Error('OCI_NAMESPACE not configured');
  }

  // Verify file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  const fileStream = fs.createReadStream(filePath);

  // Determine content type
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac'
  };
  const contentType = options.contentType || contentTypes[ext] || 'audio/mp4';

  // Base64 encode the original filename for metadata (HTTP headers require ASCII)
  const originalNameBase64 = Buffer.from(path.basename(filePath)).toString('base64');

  // Generate content-disposition for direct downloads via PAR
  // This enables "Save As" dialog when accessing via presigned URL
  // Use RFC 5987 encoding for non-ASCII characters (e.g., Arabic filenames)
  const filename = path.basename(objectName);
  const hasNonAscii = /[^\x00-\x7F]/.test(filename);
  const contentDisposition = hasNonAscii
    ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    : `attachment; filename="${filename}"`;

  // Don't pre-encode objectName - OCI SDK handles encoding internally
  const putObjectRequest = {
    namespaceName: namespace,
    bucketName: bucketName,
    objectName: objectName,  // Raw name - SDK will encode
    putObjectBody: fileStream,
    contentLength: stats.size,
    contentType: contentType,
    contentDisposition: contentDisposition,  // Enable direct PAR downloads
    opcMeta: {
      'uploaded-at': new Date().toISOString(),
      'original-name-b64': originalNameBase64
    }
  };

  // Add cache control for better performance
  if (options.cacheControl !== false) {
    putObjectRequest.cacheControl = 'public, max-age=31536000'; // 1 year
  }

  try {
    const response = await client.putObject(putObjectRequest);

    return {
      success: true,
      objectName: objectName,  // Return raw name
      etag: response.eTag,
      size: stats.size,
      contentType: contentType,
      url: getPublicUrl(objectName)  // getPublicUrl will encode
    };
  } catch (error) {
    console.error('Upload error:', error);
    throw new Error(`Failed to upload ${objectName}: ${error.message}`);
  }
}

/**
 * Delete an object from OCI Object Storage
 *
 * @param {string} objectName - Name of the object to delete
 * @returns {Promise<object>} Deletion result
 */
async function deleteFromOCI(objectName) {
  const client = oci.client;
  if (!client) {
    throw new Error('OCI client not initialized');
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  // Don't pre-encode - SDK handles encoding
  const deleteObjectRequest = {
    namespaceName: namespace,
    bucketName: bucketName,
    objectName: objectName
  };

  try {
    await client.deleteObject(deleteObjectRequest);
    return { success: true, objectName: objectName };
  } catch (error) {
    if (error.statusCode === 404) {
      return { success: true, objectName: objectName, note: 'Object did not exist' };
    }
    throw new Error(`Failed to delete ${objectName}: ${error.message}`);
  }
}

/**
 * Check if an object exists in OCI Object Storage
 *
 * @param {string} objectName - Name of the object
 * @returns {Promise<boolean>} True if exists
 */
async function objectExists(objectName) {
  const client = oci.client;
  if (!client) {
    return false;
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  // Don't pre-encode - SDK handles encoding
  try {
    await client.headObject({
      namespaceName: namespace,
      bucketName: bucketName,
      objectName: objectName
    });
    return true;
  } catch (error) {
    if (error.statusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * List objects in the bucket
 *
 * @param {string} prefix - Optional prefix filter
 * @param {number} limit - Maximum number of objects to return
 * @returns {Promise<Array>} List of objects
 */
async function listObjects(prefix = '', limit = 1000) {
  const client = oci.client;
  if (!client) {
    throw new Error('OCI client not initialized');
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  const listObjectsRequest = {
    namespaceName: namespace,
    bucketName: bucketName,
    prefix: prefix,
    limit: limit
  };

  try {
    const response = await client.listObjects(listObjectsRequest);
    // Filter out any objects with null/undefined names
    return response.listObjects.objects
      .filter(obj => obj && obj.name)
      .map(obj => ({
        name: obj.name,
        size: obj.size,
        etag: obj.etag,
        timeCreated: obj.timeCreated,
        url: getPublicUrl(obj.name)
      }));
  } catch (error) {
    throw new Error(`Failed to list objects: ${error.message}`);
  }
}

/**
 * Get the public URL for an object
 *
 * @param {string} objectName - Name of the object (can be pre-encoded or plain)
 * @returns {string} Public URL
 */
function getPublicUrl(objectName) {
  const region = oci.getRegion();
  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  if (!namespace) {
    console.warn('OCI_NAMESPACE not set, returning placeholder URL');
    return `/stream/${objectName}`;
  }

  // Check if objectName is already URL-encoded (contains %XX patterns)
  const isEncoded = /%[0-9A-Fa-f]{2}/.test(objectName);
  const encodedName = isEncoded ? objectName : encodeURIComponent(objectName);

  // OCI Object Storage public URL format
  return `https://objectstorage.${region}.oraclecloud.com/n/${namespace}/b/${bucketName}/o/${encodedName}`;
}

/**
 * Get object metadata
 *
 * @param {string} objectName - Name of the object
 * @returns {Promise<object>} Object metadata
 */
async function getObjectMetadata(objectName) {
  const client = oci.client;
  if (!client) {
    throw new Error('OCI client not initialized');
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  // Don't pre-encode - SDK handles encoding
  try {
    const response = await client.headObject({
      namespaceName: namespace,
      bucketName: bucketName,
      objectName: objectName
    });

    return {
      name: objectName,
      size: response.contentLength,
      contentType: response.contentType,
      etag: response.eTag,
      lastModified: response.lastModified,
      url: getPublicUrl(objectName)
    };
  } catch (error) {
    if (error.statusCode === 404) {
      return null;
    }
    throw new Error(`Failed to get metadata for ${objectName}: ${error.message}`);
  }
}

/**
 * Generate a Pre-Authenticated Request (PAR) for temporary access
 * Useful for private buckets
 *
 * @param {string} objectName - Name of the object
 * @param {number} expiryHours - Hours until expiry (default 24)
 * @returns {Promise<string>} PAR URL
 */
async function createPreAuthenticatedRequest(objectName, expiryHours = 24) {
  const client = oci.client;
  if (!client) {
    throw new Error('OCI client not initialized');
  }

  const namespace = oci.getNamespace();
  const bucketName = oci.getBucketName();

  // Don't pre-encode - SDK handles encoding
  const expiryTime = new Date();
  expiryTime.setHours(expiryTime.getHours() + expiryHours);

  const createPreauthenticatedRequestDetails = {
    name: `par-${Date.now()}`,  // Simplified name to avoid encoding issues
    objectName: objectName,  // Raw name - SDK will encode
    accessType: 'ObjectRead',
    timeExpires: expiryTime
  };

  try {
    const response = await client.createPreauthenticatedRequest({
      namespaceName: namespace,
      bucketName: bucketName,
      createPreauthenticatedRequestDetails: createPreauthenticatedRequestDetails
    });

    const region = oci.getRegion();
    return `https://objectstorage.${region}.oraclecloud.com${response.preauthenticatedRequest.accessUri}`;
  } catch (error) {
    throw new Error(`Failed to create PAR for ${objectName}: ${error.message}`);
  }
}

module.exports = {
  uploadToOCI,
  deleteFromOCI,
  objectExists,
  listObjects,
  getPublicUrl,
  getObjectMetadata,
  createPreAuthenticatedRequest,
  isConfigured: oci.isConfigured
};
