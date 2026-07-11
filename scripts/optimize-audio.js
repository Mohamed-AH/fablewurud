#!/usr/bin/env node
/**
 * Audio Optimization Script
 *
 * Converts audio files to voice-optimized HE-AAC format using FFmpeg.
 * Achieves significant file size reduction while maintaining speech clarity.
 *
 * Features:
 *   - HE-AAC encoding (libfdk_aac) for excellent quality at low bitrates
 *   - Trims silence from beginning of audio files
 *   - Faststart for optimized web streaming
 *
 * Usage:
 *   node scripts/optimize-audio.js <input-dir> <output-dir>
 *
 * Requirements:
 *   - FFmpeg installed with libfdk_aac support
 *
 * Output Format:
 *   - M4A (HE-AAC), 48kbps, Mono, 22050 Hz (optimal for voice content)
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  // Audio settings optimized for voice/speech (HE-AAC)
  codec: 'libfdk_aac',
  profile: 'aac_he',   // HE-AAC for excellent quality at low bitrates
  bitrate: '48k',      // 48kbps - excellent for speech
  channels: 1,         // Mono
  sampleRate: 22050,   // Good for voice
  format: 'm4a',
  faststart: true,     // Move moov atom to start for web streaming

  // Trim silence from beginning
  trimStartSilence: true,
  silenceThreshold: '-50dB',  // Audio below this is considered silence

  // Supported input formats
  inputFormats: ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac', '.wma']
};

/**
 * Check if FFmpeg is installed
 */
function checkFFmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file size in human-readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Convert a single audio file
 */
function convertFile(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-vn',                          // No video
    ];

    // Add silence trimming filter for beginning of audio
    if (CONFIG.trimStartSilence) {
      args.push('-af', `silenceremove=start_periods=1:start_duration=0:start_threshold=${CONFIG.silenceThreshold}`);
    }

    args.push(
      '-c:a', CONFIG.codec,
      '-profile:a', CONFIG.profile,   // HE-AAC profile
      '-ac', CONFIG.channels.toString(),
      '-ar', CONFIG.sampleRate.toString(),
      '-b:a', CONFIG.bitrate,
    );

    // Add faststart for web streaming
    if (CONFIG.faststart) {
      args.push('-movflags', '+faststart');
    }

    args.push('-y', outputPath);      // Overwrite output

    const ffmpeg = spawn('ffmpeg', args, { stdio: 'pipe' });

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Process all audio files in a directory
 */
async function processDirectory(inputDir, outputDir) {
  // Validate input directory
  if (!fs.existsSync(inputDir)) {
    console.error(`❌ Input directory not found: ${inputDir}`);
    process.exit(1);
  }

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`📁 Created output directory: ${outputDir}`);
  }

  // Find all audio files
  const files = fs.readdirSync(inputDir).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return CONFIG.inputFormats.includes(ext);
  });

  if (files.length === 0) {
    console.log('⚠️ No audio files found in input directory');
    process.exit(0);
  }

  console.log(`\n🎵 Found ${files.length} audio files to process\n`);
  console.log('Configuration:');
  console.log(`  Codec: ${CONFIG.codec} (${CONFIG.profile})`);
  console.log(`  Bitrate: ${CONFIG.bitrate}`);
  console.log(`  Channels: ${CONFIG.channels} (Mono)`);
  console.log(`  Sample Rate: ${CONFIG.sampleRate} Hz`);
  console.log(`  Format: ${CONFIG.format}`);
  console.log(`  Faststart: ${CONFIG.faststart ? 'Yes (optimized for web)' : 'No'}`);
  console.log(`  Trim start silence: ${CONFIG.trimStartSilence ? `Yes (threshold: ${CONFIG.silenceThreshold})` : 'No'}`);
  console.log('');

  let totalOriginalSize = 0;
  let totalNewSize = 0;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const inputPath = path.join(inputDir, file);
    const outputName = path.basename(file, path.extname(file)) + '.' + CONFIG.format;
    const outputPath = path.join(outputDir, outputName);

    const originalSize = fs.statSync(inputPath).size;
    totalOriginalSize += originalSize;

    process.stdout.write(`[${i + 1}/${files.length}] Processing: ${file}... `);

    try {
      await convertFile(inputPath, outputPath);

      const newSize = fs.statSync(outputPath).size;
      totalNewSize += newSize;

      const reduction = ((1 - newSize / originalSize) * 100).toFixed(1);

      console.log(`✅ ${formatBytes(originalSize)} → ${formatBytes(newSize)} (-${reduction}%)`);
      successCount++;
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
      failCount++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Files processed: ${successCount}/${files.length}`);
  console.log(`  Failed: ${failCount}`);
  console.log(`  Original total: ${formatBytes(totalOriginalSize)}`);
  console.log(`  Optimized total: ${formatBytes(totalNewSize)}`);
  console.log(`  Total reduction: ${((1 - totalNewSize / totalOriginalSize) * 100).toFixed(1)}%`);
  console.log(`  Space saved: ${formatBytes(totalOriginalSize - totalNewSize)}`);
  console.log('='.repeat(60));

  if (successCount > 0) {
    console.log(`\n✅ Optimized files saved to: ${outputDir}`);
    console.log('\nNext step: Upload to OCI Object Storage');
    console.log('  node scripts/upload-to-oci.js ' + outputDir);
  }
}

// Main
async function main() {
  console.log('🎧 Audio Optimization Tool for Voice Content');
  console.log('============================================\n');

  // Check FFmpeg
  if (!checkFFmpeg()) {
    console.error('❌ FFmpeg is not installed or not in PATH');
    console.error('\nPlease install FFmpeg:');
    console.error('  Windows: choco install ffmpeg');
    console.error('  macOS: brew install ffmpeg');
    console.error('  Ubuntu: sudo apt install ffmpeg');
    process.exit(1);
  }
  console.log('✅ FFmpeg found\n');

  // Get directories from command line
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: node scripts/optimize-audio.js <input-dir> <output-dir>');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/optimize-audio.js /mnt/audio /mnt/audio-optimized');
    console.log('');
    console.log('This will convert all audio files to voice-optimized HE-AAC:');
    console.log('  - 48kbps HE-AAC (excellent for speech)');
    console.log('  - Mono audio');
    console.log('  - 22050 Hz sample rate');
    console.log('  - Faststart enabled for web streaming');
    console.log('  - Trims silence from beginning of audio');
    console.log('  - Output format: .m4a');
    process.exit(1);
  }

  const inputDir = path.resolve(args[0]);
  const outputDir = path.resolve(args[1]);

  await processDirectory(inputDir, outputDir);
}

main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
