#!/usr/bin/env node
/**
 * Audio Optimization Script (voice/speech content)
 *
 * Converts audio to a small, voice-optimized m4a using FFmpeg — but does it
 * SOURCE-AWARE so it never makes a file bigger and never wastes quality
 * re-encoding something that is already small.
 *
 * Why this rewrite:
 *   The previous version always re-encoded to a FIXED 48 kbps. Files that were
 *   already low-bitrate (e.g. ~16 kbps .ogg) got 2-3x BIGGER, cancelling out
 *   the savings on the large files (net ~4% reduction). Now each file is probed
 *   first and handled on its merits.
 *
 * Per-file decision:
 *   1. ffprobe the audio: codec, bitrate, channels, duration, has-video.
 *   2. If the audio is already at/under the "keep" threshold (default 40 kbps)
 *      AND the file has no video track  -> KEEP the original untouched
 *      (re-encoding lossy->lossy here would only add artefacts and/or bytes).
 *   3. Otherwise encode to the target (default 32 kbps mono). If the result is
 *      not actually smaller than the source, throw it away and KEEP the original.
 *   => The output is never larger than the input.
 *
 * Encoder: prefers HE-AAC (libfdk_aac, best at low bitrate); falls back to the
 * native `aac` (AAC-LC) encoder when libfdk isn't compiled in, so it runs on any
 * FFmpeg build. Pass --opus to use libopus instead (smallest, but check device
 * compatibility before serving .opus/.ogg to the site).
 *
 * Usage:
 *   node scripts/optimize-audio.js <input-dir> <output-dir> [options]
 *
 * Options:
 *   --bitrate <kbps>     Target bitrate for re-encoded files   (default 32)
 *   --keep-under <kbps>  Leave originals at/under this as-is    (default 40)
 *   --no-trim            Don't trim leading silence
 *   --normalize          EBU-R128 loudness normalize (consistent volume)
 *   --opus               Use libopus (.opus) instead of AAC (.m4a)
 *   --dry-run            Probe + report decisions, write nothing
 *
 * Examples:
 *   node scripts/optimize-audio.js /mnt/audio /mnt/audio-opt
 *   node scripts/optimize-audio.js "D:\sheikhhassan audio" "D:\sheikhhassan audio\out" --bitrate 24
 */

const { execSync, execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------- CLI ----------
const rawArgs = process.argv.slice(2);
function flag(name) { return rawArgs.includes(name); }
function opt(name, def) {
  const i = rawArgs.indexOf(name);
  return i !== -1 && rawArgs[i + 1] ? rawArgs[i + 1] : def;
}
const positional = rawArgs.filter((a, i) =>
  !a.startsWith('--') && !(i > 0 && rawArgs[i - 1].startsWith('--') &&
    ['--bitrate', '--keep-under'].includes(rawArgs[i - 1])));

const CONFIG = {
  targetBitrateK: parseInt(opt('--bitrate', '32'), 10),   // re-encode target
  keepUnderK: parseInt(opt('--keep-under', '40'), 10),    // keep originals <= this
  channels: 1,            // Mono — speech
  sampleRate: 22050,      // Ample for voice
  trim: !flag('--no-trim'),
  silenceThreshold: '-50dB',
  normalize: flag('--normalize'),
  useOpus: flag('--opus'),
  dryRun: flag('--dry-run'),
  inputFormats: ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.flac',
                 '.wma', '.mp4', '.m4v', '.mpeg', '.mpg', '.mkv', '.webm']
};

// ---------- helpers ----------
function checkBin(bin) {
  try { execSync(`${bin} -version`, { stdio: 'pipe' }); return true; }
  catch { return false; }
}

/** Choose the best available AAC encoder (HE-AAC preferred), or Opus if asked. */
function pickEncoder() {
  let encoders = '';
  try { encoders = execSync('ffmpeg -hide_banner -encoders', { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); }
  catch { encoders = ''; }
  if (CONFIG.useOpus && /\blibopus\b/.test(encoders)) {
    return { name: 'libopus', he: false, ext: 'opus', label: 'libopus (Opus)' };
  }
  if (/\blibfdk_aac\b/.test(encoders)) {
    return { name: 'libfdk_aac', he: true, ext: 'm4a', label: 'libfdk_aac (HE-AAC)' };
  }
  return { name: 'aac', he: false, ext: 'm4a', label: 'aac (native AAC-LC)' };
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
/** Signed percent change, new vs old (negative = smaller = good). */
function pct(oldSize, newSize) {
  const d = ((newSize / oldSize) - 1) * 100;
  return (d <= 0 ? '' : '+') + d.toFixed(1) + '%';
}

/** Probe a file: returns { audioBitrateK, hasVideo, codec, durationSec } or null. */
function probe(file) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-show_format', '-show_streams', '-of', 'json', file
    ], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const data = JSON.parse(out);
    const streams = data.streams || [];
    const audio = streams.find(s => s.codec_type === 'audio');
    const hasVideo = streams.some(s => s.codec_type === 'video' &&
      // ignore cover-art "video" streams (mjpeg/png attached pics)
      !(s.disposition && s.disposition.attached_pic));
    const durationSec = parseFloat((data.format && data.format.duration) || (audio && audio.duration) || 0);

    let bitrate = audio && /^\d+$/.test(String(audio.bit_rate)) ? parseInt(audio.bit_rate, 10) : null;
    if (!bitrate && !hasVideo && data.format && /^\d+$/.test(String(data.format.bit_rate))) {
      bitrate = parseInt(data.format.bit_rate, 10); // audio-only container overall ≈ audio
    }
    if (!bitrate && !hasVideo && durationSec > 0) {
      bitrate = Math.round((fs.statSync(file).size * 8) / durationSec); // derive
    }
    return {
      audioBitrateK: bitrate ? Math.round(bitrate / 1000) : null,
      hasVideo, codec: audio ? audio.codec_name : 'none', durationSec
    };
  } catch {
    return null;
  }
}

function encode(inputPath, outputPath, enc) {
  return new Promise((resolve, reject) => {
    const args = ['-hide_banner', '-loglevel', 'error', '-i', inputPath, '-vn', '-map_metadata', '-1'];

    const filters = [];
    if (CONFIG.trim) {
      filters.push(`silenceremove=start_periods=1:start_duration=0:start_threshold=${CONFIG.silenceThreshold}`);
    }
    if (CONFIG.normalize) filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
    if (filters.length) args.push('-af', filters.join(','));

    args.push('-c:a', enc.name, '-ac', String(CONFIG.channels), '-ar', String(CONFIG.sampleRate));
    if (enc.name === 'libfdk_aac' && enc.he) args.push('-profile:a', 'aac_he');
    if (enc.name === 'libopus') args.push('-vbr', 'on', '-application', 'voip');
    args.push('-b:a', `${CONFIG.targetBitrateK}k`);
    if (enc.ext === 'm4a') args.push('-movflags', '+faststart');
    args.push('-y', outputPath);

    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    ff.stderr.on('data', d => { stderr += d.toString(); });
    ff.on('close', code => code === 0 ? resolve() : reject(new Error(stderr.trim().split('\n').pop() || `exit ${code}`)));
    ff.on('error', err => reject(err));
  });
}

async function processDirectory(inputDir, outputDir, enc) {
  if (!fs.existsSync(inputDir)) { console.error(`Error: input dir not found: ${inputDir}`); process.exit(1); }
  if (!CONFIG.dryRun && !fs.existsSync(outputDir)) { fs.mkdirSync(outputDir, { recursive: true }); console.log(`Created output dir: ${outputDir}`); }

  const outResolved = path.resolve(outputDir);
  const files = fs.readdirSync(inputDir).filter(f => {
    const full = path.join(inputDir, f);
    try { if (fs.statSync(full).isDirectory()) return false; } catch { return false; }
    return CONFIG.inputFormats.includes(path.extname(f).toLowerCase());
  });
  if (!files.length) { console.log('No supported audio/video files found.'); process.exit(0); }

  console.log(`\nFound ${files.length} files\n`);
  console.log('Configuration:');
  console.log(`  Encoder:        ${enc.label}`);
  console.log(`  Target bitrate: ${CONFIG.targetBitrateK}k, mono, ${CONFIG.sampleRate} Hz`);
  console.log(`  Keep original if already <= ${CONFIG.keepUnderK}k (and no video)`);
  console.log(`  Trim silence:   ${CONFIG.trim ? 'yes' : 'no'}   Normalize: ${CONFIG.normalize ? 'yes' : 'no'}   Dry-run: ${CONFIG.dryRun ? 'yes' : 'no'}`);
  console.log('');

  let origTotal = 0, newTotal = 0, encoded = 0, kept = 0, failed = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const inputPath = path.join(inputDir, file);
    const originalSize = fs.statSync(inputPath).size;
    origTotal += originalSize;

    process.stdout.write(`[${i + 1}/${files.length}] ${file} ... `);
    const info = probe(inputPath);
    const br = info && info.audioBitrateK ? `${info.audioBitrateK}k` : '?';

    // Decision 1: already small enough -> keep original as-is
    const alreadySmall = info && info.audioBitrateK != null &&
      info.audioBitrateK <= CONFIG.keepUnderK && !info.hasVideo;

    if (alreadySmall) {
      const dest = path.join(outputDir, file); // keep original name + extension
      if (!CONFIG.dryRun && path.resolve(dest) !== path.resolve(inputPath)) fs.copyFileSync(inputPath, dest);
      newTotal += originalSize; kept++;
      console.log(`KEPT (already ${br}) ${formatBytes(originalSize)}`);
      continue;
    }

    // Decision 2: re-encode, then keep whichever is smaller
    const outName = path.basename(file, path.extname(file)) + '.' + enc.ext;
    const outputPath = path.join(outResolved, outName);
    if (CONFIG.dryRun) {
      newTotal += originalSize; // unknown; count as-is for the estimate
      console.log(`would encode (src ${br}) -> ${enc.ext} @ ${CONFIG.targetBitrateK}k`);
      continue;
    }
    try {
      await encode(inputPath, outputPath, enc);
      const encSize = fs.statSync(outputPath).size;
      if (encSize >= originalSize) {
        fs.rmSync(outputPath, { force: true });
        const dest = path.join(outResolved, file);
        if (path.resolve(dest) !== path.resolve(inputPath)) fs.copyFileSync(inputPath, dest);
        newTotal += originalSize; kept++;
        console.log(`KEPT (encode was larger) ${formatBytes(originalSize)}`);
      } else {
        newTotal += encSize; encoded++;
        console.log(`OK (src ${br}) ${formatBytes(originalSize)} -> ${formatBytes(encSize)} (${pct(originalSize, encSize)})`);
      }
    } catch (err) {
      failed++;
      console.log(`FAILED: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Re-encoded:      ${encoded}`);
  console.log(`  Kept original:   ${kept}`);
  console.log(`  Failed:          ${failed}`);
  console.log(`  Original total:  ${formatBytes(origTotal)}`);
  console.log(`  New total:       ${formatBytes(newTotal)}`);
  console.log(`  Total reduction: ${origTotal ? (((1 - newTotal / origTotal) * 100).toFixed(1)) : '0.0'}%`);
  console.log(`  Space saved:     ${formatBytes(origTotal - newTotal)}`);
  console.log('='.repeat(60));
  if (!CONFIG.dryRun && (encoded + kept) > 0) {
    console.log(`\nOutput: ${outResolved}`);
  }
}

async function main() {
  console.log('Audio Optimization Tool for Voice Content');
  console.log('============================================\n');
  if (!checkBin('ffmpeg') || !checkBin('ffprobe')) {
    console.error('Error: FFmpeg/ffprobe not found in PATH.');
    console.error('  Windows: choco install ffmpeg   macOS: brew install ffmpeg   Ubuntu: sudo apt install ffmpeg');
    process.exit(1);
  }
  const enc = pickEncoder();
  if (enc.name === 'aac') {
    console.log('Note: libfdk_aac (HE-AAC) not available — using native AAC-LC. For best low-bitrate quality install an FFmpeg built with libfdk_aac.\n');
  }
  if (positional.length < 2) {
    console.log('Usage: node scripts/optimize-audio.js <input-dir> <output-dir> [--bitrate 32] [--keep-under 40] [--normalize] [--opus] [--no-trim] [--dry-run]');
    process.exit(1);
  }
  await processDirectory(path.resolve(positional[0]), path.resolve(positional[1]), enc);
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
