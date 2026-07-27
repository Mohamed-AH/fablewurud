#!/usr/bin/env node
/**
 * Upload PDF publications to Cloudflare R2 (Run on Local PC)
 *
 * Uploads PDF files from a local directory to the same R2 bucket used for audio.
 * Files are served inline-friendly (Content-Type: application/pdf) but also carry a
 * Content-Disposition so "download" links save with the original Arabic filename.
 *
 * Outputs a manifest (pdf-upload-manifest.json) mapping each filename → public URL
 * and byte size. Feed that manifest + the catalog CSV to scripts/import-publications.js
 * on the Cloud VM to create the Publication documents.
 *
 * Usage:
 *   node scripts/upload-pdfs-to-r2.js /path/to/pdfs [options]
 *
 * Options:
 *   --env FILE        Path to .env file (default: .env)
 *   --dry-run         Show what would be uploaded without uploading
 *   --skip-existing   Skip files already in R2
 *   --output FILE     Output manifest file (default: pdf-upload-manifest.json)
 *   --prefix STR      Key prefix inside the bucket (default: "pdf/")
 *   --limit N         Process only first N files
 *   --verbose         Show detailed progress
 *
 * Env required (in .env):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_EXISTING = args.includes('--skip-existing');
const VERBOSE = args.includes('--verbose');

function getArg(name, def) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
}

const OUTPUT_FILE = getArg('--output', 'pdf-upload-manifest.json');
let PREFIX = getArg('--prefix', 'pdf/');
if (PREFIX && !PREFIX.endsWith('/')) PREFIX += '/';
const LIMIT = args.indexOf('--limit') !== -1 ? parseInt(args[args.indexOf('--limit') + 1]) : null;

const pdfDir = args.find(a =>
  !a.startsWith('--') &&
  a !== envPath &&
  a !== OUTPUT_FILE &&
  a !== PREFIX &&
  args[args.indexOf(a) - 1] !== '--env' &&
  args[args.indexOf(a) - 1] !== '--output' &&
  args[args.indexOf(a) - 1] !== '--prefix' &&
  args[args.indexOf(a) - 1] !== '--limit'
);

const stats = { total: 0, uploaded: 0, skipped: 0, failed: 0, totalBytes: 0 };

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getContentDisposition(filename) {
  // inline lets "Open in new tab" render in the browser; download links still work
  const hasNonAscii = /[^\x00-\x7F]/.test(filename);
  if (hasNonAscii) {
    return `inline; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }
  return `inline; filename="${filename}"`;
}

// Walk a directory tree and collect every .pdf. Files may live in sub-folders
// (e.g. book_lib/, comments/, messages/, cv_ar/); R2 keys stay flat (basename)
// since all 116 basenames are unique. Duplicate basenames are reported and skipped.
function getPdfFiles(directory) {
  if (!fs.existsSync(directory)) throw new Error(`Directory not found: ${directory}`);
  const out = [];
  const seen = new Map();
  const dupes = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (path.extname(entry.name).toLowerCase() !== '.pdf') continue;
      if (seen.has(entry.name)) { dupes.push(`${p}  (already have ${seen.get(entry.name)})`); continue; }
      seen.set(entry.name, p);
      out.push({ name: entry.name, path: p, size: fs.statSync(p).size });
    }
  })(directory);
  if (dupes.length) {
    console.log(`\n⚠️  ${dupes.length} duplicate basename(s) skipped (flat keys require unique names):`);
    dupes.forEach(d => console.log(`     ${d}`));
    console.log('');
  }
  return out;
}

function initR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });
}

async function objectExists(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) return false;
    throw error;
  }
}

async function uploadFile(client, bucket, localPath, key) {
  const size = fs.statSync(localPath).size;
  const response = await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fs.createReadStream(localPath),
    ContentType: 'application/pdf',
    ContentDisposition: getContentDisposition(path.basename(key)),
    CacheControl: 'public, max-age=31536000'
  }));
  return { etag: response.ETag, size };
}

function getPublicUrl(base, key) {
  // Encode each path segment but keep the "/" separators
  const encoded = key.split('/').map(encodeURIComponent).join('/');
  return `${base.replace(/\/$/, '')}/${encoded}`;
}

async function main() {
  console.log('\n📚 Upload PDF publications to R2 (Local PC)');
  console.log('='.repeat(55));
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '⚡ LIVE'}`);

  if (!pdfDir) {
    console.log('\nUsage: node scripts/upload-pdfs-to-r2.js <pdf-directory> [options]');
    console.log('  --dry-run --skip-existing --prefix pdf/ --output pdf-upload-manifest.json');
    process.exit(1);
  }

  const directory = path.resolve(pdfDir);
  console.log(`📁 PDF directory: ${directory}`);
  console.log(`🔑 Key prefix:   ${PREFIX}`);
  console.log(`📄 Output:       ${OUTPUT_FILE}\n`);

  let files;
  try {
    files = getPdfFiles(directory);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log('⚠️  No PDF files found');
    process.exit(0);
  }
  if (LIMIT && LIMIT < files.length) files = files.slice(0, LIMIT);

  stats.total = files.length;
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  console.log(`📊 Found ${files.length} PDFs (${formatBytes(totalSize)} total)\n`);

  let client, bucket, publicBase;
  bucket = process.env.R2_BUCKET_NAME || 'wurud-audio';
  publicBase = process.env.R2_PUBLIC_URL || (DRY_RUN ? 'https://example.r2.dev' : null);

  if (!DRY_RUN) {
    if (!publicBase) {
      console.error('❌ R2_PUBLIC_URL is required');
      process.exit(1);
    }
    try {
      client = initR2Client();
    } catch (error) {
      console.error(`❌ ${error.message}`);
      process.exit(1);
    }
    console.log(`☁️  Bucket: ${bucket}`);
    console.log(`🌐 Public: ${publicBase}\n`);
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'live',
    kind: 'pdf',
    source: directory,
    storageConfig: { provider: 'r2', bucket, publicUrl: publicBase, prefix: PREFIX },
    files: []
  };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const key = PREFIX + file.name;
    const url = getPublicUrl(publicBase, key);
    const progress = `[${i + 1}/${files.length}]`;

    if (DRY_RUN) {
      console.log(`${progress} 🔍 Would upload: ${file.name} (${formatBytes(file.size)})`);
      manifest.files.push({ filename: file.name, key, size: file.size, url, status: 'dry-run' });
      stats.uploaded++;
      continue;
    }

    if (SKIP_EXISTING) {
      try {
        if (await objectExists(client, bucket, key)) {
          if (VERBOSE) console.log(`${progress} ⏭️  Skipped (exists): ${file.name}`);
          manifest.files.push({ filename: file.name, key, size: file.size, url, status: 'skipped-exists' });
          stats.skipped++;
          continue;
        }
      } catch (_) { /* ignore check errors, try upload */ }
    }

    try {
      if (VERBOSE) console.log(`${progress} ⬆️  Uploading: ${file.name} (${formatBytes(file.size)})`);
      else process.stdout.write(`\r${progress} Uploading: ${file.name.substring(0, 40)}...`);

      const result = await uploadFile(client, bucket, file.path, key);
      manifest.files.push({
        filename: file.name, key, size: result.size, url,
        etag: result.etag, status: 'uploaded', uploadedAt: new Date().toISOString()
      });
      stats.uploaded++;
      stats.totalBytes += result.size;
    } catch (error) {
      console.log(`\n${progress} ❌ Failed: ${file.name} - ${error.message}`);
      manifest.files.push({ filename: file.name, key, size: file.size, status: 'failed', error: error.message });
      stats.failed++;
    }
  }

  if (!VERBOSE && !DRY_RUN) console.log('\n');

  manifest.summary = { ...stats };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));

  console.log('\n' + '='.repeat(55));
  console.log('📊 SUMMARY');
  console.log('='.repeat(55));
  console.log(`  Total:    ${stats.total}`);
  console.log(`  Uploaded: ${stats.uploaded}`);
  console.log(`  Skipped:  ${stats.skipped}`);
  console.log(`  Failed:   ${stats.failed}`);
  if (!DRY_RUN) console.log(`  Bytes:    ${formatBytes(stats.totalBytes)}`);
  console.log('='.repeat(55));
  console.log(`\n📄 Manifest saved: ${OUTPUT_FILE}`);
  console.log('\n📋 NEXT: transfer the manifest to the Cloud VM, then run:');
  console.log('   node scripts/import-publications.js --catalog pdf_catalog.csv --manifest pdf-upload-manifest.json');

  if (stats.failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
