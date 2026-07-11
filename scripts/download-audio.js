#!/usr/bin/env node
/**
 * Download Audio Files by Short IDs
 *
 * Downloads audio files from OCI Object Storage for lectures
 * specified by Short IDs in a CSV file.
 *
 * Usage:
 *   node download_audio.js input.csv [--output-dir ./downloads] [--column shortId]
 *
 * CSV format:
 *   shortId
 *   1
 *   2
 *   3
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const csv = require('csv-parser');
const connectDB = require('../config/database');
const { Lecture } = require('../models');

const args = process.argv.slice(2);

function parseArgs() {
  const options = {
    csvFile: null,
    outputDir: './downloads',
    column: 'shortId',
    delay: 500
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output-dir' || args[i] === '-o') {
      options.outputDir = args[++i];
    } else if (args[i] === '--column' || args[i] === '-c') {
      options.column = args[++i];
    } else if (args[i] === '--delay' || args[i] === '-d') {
      options.delay = parseInt(args[++i], 10);
    } else if (!args[i].startsWith('-')) {
      options.csvFile = args[i];
    }
  }

  return options;
}

function readShortIds(csvPath, column) {
  return new Promise((resolve, reject) => {
    const shortIds = [];

    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        // Try specified column, then common variations
        const id = row[column] || row['short_id'] || row['shortId'] || row['id'] || Object.values(row)[0];
        if (id) {
          const parsed = parseInt(id.toString().trim(), 10);
          if (!isNaN(parsed)) {
            shortIds.push(parsed);
          }
        }
      })
      .on('end', () => resolve(shortIds))
      .on('error', reject);
  });
}

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(outputPath);

    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Follow redirect
        downloadFile(response.headers.location, outputPath)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        fs.unlinkSync(outputPath);
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(true);
      });
    }).on('error', (err) => {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      reject(err);
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const options = parseArgs();

  if (!options.csvFile) {
    console.log('Usage: node download_audio.js <csv_file> [options]');
    console.log('\nOptions:');
    console.log('  --output-dir, -o  Output directory (default: ./downloads)');
    console.log('  --column, -c      CSV column name for Short IDs (default: shortId)');
    console.log('  --delay, -d       Delay between downloads in ms (default: 500)');
    process.exit(1);
  }

  if (!fs.existsSync(options.csvFile)) {
    console.error(`Error: CSV file not found: ${options.csvFile}`);
    process.exit(1);
  }

  // Create output directory
  if (!fs.existsSync(options.outputDir)) {
    fs.mkdirSync(options.outputDir, { recursive: true });
  }

  console.log(`Reading Short IDs from ${options.csvFile}...`);
  const shortIds = await readShortIds(options.csvFile, options.column);

  if (shortIds.length === 0) {
    console.error('No Short IDs found in CSV file.');
    process.exit(1);
  }

  console.log(`Found ${shortIds.length} Short IDs`);

  // Connect to database
  console.log('Connecting to database...');
  await connectDB();

  // Fetch lectures from database
  console.log('Fetching lecture data from database...');
  const lectures = await Lecture.find({
    shortId: { $in: shortIds }
  }).select('shortId audioFileName audioUrl titleArabic');

  console.log(`Found ${lectures.length} lectures in database`);

  if (lectures.length === 0) {
    console.error('No lectures found for provided Short IDs');
    process.exit(1);
  }

  // Create lookup map
  const lectureMap = new Map();
  lectures.forEach(l => lectureMap.set(l.shortId, l));

  const results = { success: [], failed: [], notFound: [], noAudio: [] };
  const total = shortIds.length;

  console.log(`\nDownloading to: ${options.outputDir}`);
  console.log('-'.repeat(60));

  for (let i = 0; i < shortIds.length; i++) {
    const shortId = shortIds[i];
    const lecture = lectureMap.get(shortId);

    process.stdout.write(`[${i + 1}/${total}] Short ID ${shortId}... `);

    if (!lecture) {
      console.log('NOT FOUND in database');
      results.notFound.push(shortId);
      continue;
    }

    if (!lecture.audioUrl) {
      console.log('NO AUDIO URL');
      results.noAudio.push(shortId);
      continue;
    }

    // Determine filename
    const ext = path.extname(lecture.audioFileName || '.m4a') || '.m4a';
    const filename = `${shortId}${ext}`;
    const outputPath = path.join(options.outputDir, filename);

    // Skip if already exists
    if (fs.existsSync(outputPath)) {
      console.log('SKIPPED (exists)');
      results.success.push(shortId);
      continue;
    }

    try {
      await downloadFile(lecture.audioUrl, outputPath);
      const stats = fs.statSync(outputPath);
      console.log(`OK (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
      results.success.push(shortId);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      results.failed.push({ shortId, error: err.message });
    }

    // Rate limiting
    if (i < shortIds.length - 1 && options.delay > 0) {
      await sleep(options.delay);
    }
  }

  console.log('-'.repeat(60));
  console.log('\nSummary:');
  console.log(`  Success:    ${results.success.length}`);
  console.log(`  Failed:     ${results.failed.length}`);
  console.log(`  Not found:  ${results.notFound.length}`);
  console.log(`  No audio:   ${results.noAudio.length}`);

  if (results.failed.length > 0) {
    console.log('\nFailed downloads:');
    results.failed.forEach(f => console.log(`  - ${f.shortId}: ${f.error}`));
  }

  if (results.notFound.length > 0) {
    console.log('\nNot found in database:');
    results.notFound.forEach(id => console.log(`  - ${id}`));
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
