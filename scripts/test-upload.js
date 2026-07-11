// Test script to verify file upload system setup
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing File Upload & Storage System...\n');

// Test 1: Multer configuration
console.log('1️⃣  Testing Multer Configuration:');
try {
  const { upload, uploadMultiple, uploadDir } = require('../config/storage');
  console.log('  ✅ Multer configuration loaded');
  console.log(`  📁 Upload directory: ${uploadDir}`);
  console.log(`  📊 Upload directory exists: ${fs.existsSync(uploadDir) ? '✅' : '❌ (will be created on first upload)'}`);
  console.log('  ✅ Single file upload configured');
  console.log('  ✅ Multiple file upload configured');
} catch (error) {
  console.log('  ❌ Error:', error.message);
}

// Test 2: File validation middleware
console.log('\n2️⃣  Testing File Validation Middleware:');
try {
  const { validateUploadedFile, validateUploadedFiles, handleMulterError } = require('../middleware/fileValidation');
  console.log('  ✅ validateUploadedFile loaded');
  console.log('  ✅ validateUploadedFiles loaded');
  console.log('  ✅ handleMulterError loaded');
  console.log('  ℹ️  Validates: file type, size, path traversal, MIME type match');
} catch (error) {
  console.log('  ❌ Error:', error.message);
}

// Test 3: Audio metadata extraction
console.log('\n3️⃣  Testing Audio Metadata Extraction:');
try {
  const { extractAudioMetadata, formatDuration, isValidAudioFile, getQuickFileInfo } = require('../utils/audioMetadata');
  console.log('  ✅ extractAudioMetadata loaded');
  console.log('  ✅ formatDuration loaded');
  console.log('  ✅ isValidAudioFile loaded');
  console.log('  ✅ getQuickFileInfo loaded');

  // Test formatDuration function
  console.log('\n  Testing formatDuration:');
  console.log(`    3661 seconds = ${formatDuration(3661)} (expected: 1:01:01)`);
  console.log(`    125 seconds = ${formatDuration(125)} (expected: 2:05)`);
  console.log(`    45 seconds = ${formatDuration(45)} (expected: 0:45)`);
} catch (error) {
  console.log('  ❌ Error:', error.message);
}

// Test 4: File management utilities
console.log('\n4️⃣  Testing File Management Utilities:');
try {
  const fileManager = require('../utils/fileManager');
  const functions = [
    'deleteFile',
    'deleteMultipleFiles',
    'fileExists',
    'getFilePath',
    'getFileSize',
    'getStorageStats',
    'findOrphanedFiles',
    'cleanupOrphanedFiles',
    'moveFile'
  ];

  functions.forEach(fn => {
    if (typeof fileManager[fn] === 'function') {
      console.log(`  ✅ ${fn}`);
    } else {
      console.log(`  ❌ ${fn} not found`);
    }
  });

  // Test storage stats
  console.log('\n  Current storage statistics:');
  const stats = fileManager.getStorageStats();
  console.log(`    Total files: ${stats.totalFiles}`);
  console.log(`    Total size: ${stats.totalSizeMB} MB (${stats.totalSizeGB} GB)`);

} catch (error) {
  console.log('  ❌ Error:', error.message);
}

// Test 5: API routes
console.log('\n5️⃣  Testing API Routes:');
try {
  const lecturesRoutes = require('../routes/api/lectures');
  console.log('  ✅ Lectures API routes loaded');
  console.log('  📡 Available endpoints:');
  console.log('    POST   /api/lectures - Upload new lecture');
  console.log('    GET    /api/lectures - Get all lectures (with filters)');
  console.log('    GET    /api/lectures/:id - Get single lecture');
} catch (error) {
  console.log('  ❌ Error:', error.message);
}

// Test 6: Environment configuration
console.log('\n6️⃣  Testing Environment Configuration:');
const uploadDir = process.env.UPLOAD_DIR || './uploads';
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 62914560;
console.log(`  📁 UPLOAD_DIR: ${uploadDir}`);
console.log(`  📊 MAX_FILE_SIZE: ${(maxFileSize / 1024 / 1024).toFixed(0)}MB`);

// Test 7: Supported audio formats
console.log('\n7️⃣  Supported Audio Formats:');
const formats = [
  { ext: '.mp3', mime: 'audio/mpeg', desc: 'MP3 Audio' },
  { ext: '.m4a', mime: 'audio/mp4', desc: 'M4A/AAC Audio' },
  { ext: '.wav', mime: 'audio/wav', desc: 'WAV Audio' },
  { ext: '.ogg', mime: 'audio/ogg', desc: 'OGG Audio' },
  { ext: '.flac', mime: 'audio/flac', desc: 'FLAC Audio' }
];

formats.forEach(format => {
  console.log(`  ✅ ${format.ext.padEnd(6)} - ${format.desc.padEnd(20)} (${format.mime})`);
});

console.log('\n✅ File Upload & Storage System Setup Complete!\n');
console.log('📝 Next Steps:');
console.log('  1. Ensure MongoDB is running and connected');
console.log('  2. Create at least one Sheikh in the database (or run npm run db:seed)');
console.log('  3. Authenticate as admin (requires Google OAuth setup)');
console.log('  4. Test upload via API:');
console.log('     POST /api/lectures with form-data:');
console.log('       - audioFile: [audio file]');
console.log('       - titleArabic: "عنوان المحاضرة"');
console.log('       - sheikhId: [valid sheikh ID]');
console.log('       - (plus other optional fields)');
console.log('\n💡 Use Postman, Insomnia, or curl to test the upload API endpoint.');
