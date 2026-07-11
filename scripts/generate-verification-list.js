#!/usr/bin/env node
/**
 * Generate Verification List for Manual Review
 * Creates a readable list of files with titles for content verification
 *
 * Usage: node scripts/generate-verification-list.js --input ready-to-restore.json
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const inputIndex = args.indexOf('--input');
const INPUT_FILE = inputIndex !== -1 ? args[inputIndex + 1] : 'ready-to-restore.json';

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`\n❌ File not found: ${INPUT_FILE}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
const files = Array.isArray(data) ? data : data.files || [];

console.log(`\n📋 Generating verification list from ${INPUT_FILE}`);
console.log(`   Found ${files.length} records\n`);

// Generate verification list
let output = 'RESTORATION VERIFICATION LIST\n';
output += '='.repeat(80) + '\n';
output += `Generated: ${new Date().toISOString()}\n`;
output += `Total Files: ${files.length}\n`;
output += '='.repeat(80) + '\n\n';

output += 'Instructions: Play each local file and verify it matches the title.\n';
output += 'Mark [OK] or [MISMATCH] next to each entry.\n\n';
output += '-'.repeat(80) + '\n\n';

files.forEach((file, idx) => {
  const num = String(idx + 1).padStart(3, '0');
  const filename = file.dbFilename || file.filename;
  const title = file.title || 'N/A';
  const localPath = file.localPath || file.candidates?.[0]?.localPath || 'N/A';
  const localFile = file.candidates?.[0]?.localFile || path.basename(localPath);
  const size = file.localSize || file.candidates?.[0]?.localSize || 0;
  const sizeKB = (size / 1024).toFixed(1);

  output += `[   ] #${num}\n`;
  output += `      Title:      ${title}\n`;
  output += `      DB File:    ${filename}\n`;
  output += `      Local File: ${localFile}\n`;
  output += `      Size:       ${sizeKB} KB\n`;
  output += `      Path:       ${localPath}\n`;
  output += '\n';
});

output += '-'.repeat(80) + '\n';
output += 'END OF LIST\n';

// Save
const outputFile = 'verification-list.txt';
fs.writeFileSync(outputFile, output);

// Also create a simple CSV for spreadsheet review
let csv = 'No,Title,DB Filename,Local File,Size KB,Path,Status\n';
files.forEach((file, idx) => {
  const filename = file.dbFilename || file.filename;
  const title = (file.title || 'N/A').replace(/,/g, ';');
  const localPath = file.localPath || file.candidates?.[0]?.localPath || 'N/A';
  const localFile = file.candidates?.[0]?.localFile || path.basename(localPath);
  const size = file.localSize || file.candidates?.[0]?.localSize || 0;
  const sizeKB = (size / 1024).toFixed(1);

  csv += `${idx + 1},"${title}","${filename}","${localFile}",${sizeKB},"${localPath}",\n`;
});

fs.writeFileSync('verification-list.csv', csv);

console.log(`✅ Created:`);
console.log(`   verification-list.txt (${files.length} entries)`);
console.log(`   verification-list.csv (for spreadsheet review)\n`);
