const fs = require('fs');
const path = require('path');
const { PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const r2 = require('../config/r2');

async function uploadToR2(filePath, objectName, options = {}) {
  const client = r2.client;
  if (!client) throw new Error('R2 client not initialized');

  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const stats = fs.statSync(filePath);
  const fileStream = fs.createReadStream(filePath);

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

  const filename = path.basename(objectName);
  const hasNonAscii = /[^\x00-\x7F]/.test(filename);
  const contentDisposition = hasNonAscii
    ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    : `attachment; filename="${filename}"`;

  const params = {
    Bucket: r2.getBucketName(),
    Key: objectName,
    Body: fileStream,
    ContentType: contentType,
    ContentDisposition: contentDisposition,
    CacheControl: options.cacheControl !== false ? 'public, max-age=31536000' : undefined,
    Metadata: { 'uploaded-at': new Date().toISOString() }
  };

  try {
    const response = await client.send(new PutObjectCommand(params));
    return {
      success: true,
      objectName,
      etag: response.ETag,
      size: stats.size,
      contentType,
      url: getR2PublicUrl(objectName)
    };
  } catch (error) {
    throw new Error(`Failed to upload ${objectName}: ${error.message}`);
  }
}

async function deleteFromR2(objectName) {
  const client = r2.client;
  if (!client) throw new Error('R2 client not initialized');

  try {
    await client.send(new DeleteObjectCommand({
      Bucket: r2.getBucketName(),
      Key: objectName
    }));
    return { success: true, objectName };
  } catch (error) {
    throw new Error(`Failed to delete ${objectName}: ${error.message}`);
  }
}

async function objectExistsR2(objectName) {
  const client = r2.client;
  if (!client) return false;

  try {
    await client.send(new HeadObjectCommand({
      Bucket: r2.getBucketName(),
      Key: objectName
    }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

function getR2PublicUrl(objectName) {
  const publicUrl = r2.getPublicUrl();
  if (!publicUrl) return `/stream/${objectName}`;

  const isEncoded = /%[0-9A-Fa-f]{2}/.test(objectName);
  const encodedName = isEncoded ? objectName : encodeURIComponent(objectName);
  return `${publicUrl}/${encodedName}`;
}

function isR2Url(url) {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl || !url) return false;
  return url.startsWith(publicUrl);
}

async function getR2ObjectMetadata(objectName) {
  const client = r2.client;
  if (!client) throw new Error('R2 client not initialized');

  try {
    const response = await client.send(new HeadObjectCommand({
      Bucket: r2.getBucketName(),
      Key: objectName
    }));
    return {
      name: objectName,
      size: response.ContentLength,
      contentType: response.ContentType,
      etag: response.ETag,
      lastModified: response.LastModified,
      url: getR2PublicUrl(objectName)
    };
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw new Error(`Failed to get metadata for ${objectName}: ${error.message}`);
  }
}

async function createR2PresignedUrl(objectName, expirySeconds = 3600) {
  const client = r2.client;
  if (!client) throw new Error('R2 client not initialized');

  const command = new GetObjectCommand({
    Bucket: r2.getBucketName(),
    Key: objectName
  });

  return getSignedUrl(client, command, { expiresIn: expirySeconds });
}

module.exports = {
  uploadToR2,
  deleteFromR2,
  objectExistsR2,
  getR2PublicUrl,
  isR2Url,
  getR2ObjectMetadata,
  createR2PresignedUrl,
  isConfigured: r2.isConfigured
};
