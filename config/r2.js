const { S3Client } = require('@aws-sdk/client-s3');

let s3Client = null;

function initializeClient() {
  if (s3Client) return s3Client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  try {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
    console.log('R2 client initialized');
    return s3Client;
  } catch (error) {
    console.error('Failed to initialize R2 client:', error.message);
    return null;
  }
}

function getBucketName() {
  return process.env.R2_BUCKET_NAME || 'wurud-audio';
}

function getPublicUrl() {
  return process.env.R2_PUBLIC_URL || '';
}

function isConfigured() {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
}

module.exports = {
  initializeClient,
  getBucketName,
  getPublicUrl,
  isConfigured,
  get client() {
    return initializeClient();
  }
};
