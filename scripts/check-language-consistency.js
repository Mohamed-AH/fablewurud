const fs = require('fs');
const path = require('path');

// Common English words/phrases that shouldn't be in Arabic pages
const englishPatterns = [
  /\bSeries\b/g,
  /\bLecture\b/g,
  /\bSheikh\b/g,
  /\bPlay\b/g,
  /\bDuration\b/g,
  /\bCategory\b/g,
  /\bBrowse\b/g,
  /\bSearch\b/g,
  /\bHome\b/g,
  /\bAbout\b/g,
  /\bLoading\b/g,
  /\bError\b/g,
  /\bminutes?\b/g,
  /\bhours?\b/g,
  /\bDownload\b/g,
  /\bShare\b/g,
  /\bViews?\b/g,
  /\bListen\b/g,
  /\bRecent\b/g,
  /\bFeatured\b/g,
  /\bAll\b/g,
  /\bPublished\b/g,
  /\bUnpublished\b/g,
  /\bPage not found\b/g,
  /\bSomething went wrong\b/g
];

const viewsDir = path.join(__dirname, '../views/public');
const files = fs.readdirSync(viewsDir).filter(f => f.endsWith('.ejs'));

console.log('='.repeat(70));
console.log('CHECKING LANGUAGE CONSISTENCY IN PUBLIC PAGES');
console.log('='.repeat(70));
console.log('');

let totalIssues = 0;

files.forEach(file => {
  const filePath = path.join(viewsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  const issues = [];

  lines.forEach((line, index) => {
    // Skip HTML comments
    if (line.trim().startsWith('<!--')) return;

    // Skip script tags
    if (line.includes('<script>') || line.includes('</script>')) return;

    // Check for English patterns
    englishPatterns.forEach(pattern => {
      if (pattern.test(line)) {
        issues.push({
          line: index + 1,
          text: line.trim().substring(0, 100),
          pattern: pattern.source
        });
      }
    });
  });

  if (issues.length > 0) {
    console.log(`\n📄 ${file}`);
    console.log(`   Found ${issues.length} potential English text:\n`);

    issues.forEach(issue => {
      console.log(`   Line ${issue.line}: ${issue.text}`);
      console.log(`   Pattern: ${issue.pattern}\n`);
    });

    totalIssues += issues.length;
  }
});

console.log('='.repeat(70));
console.log(`\nTotal issues found: ${totalIssues}`);

if (totalIssues === 0) {
  console.log('✅ No English text found in Arabic pages!');
} else {
  console.log('⚠️  Found English text that should be translated to Arabic');
}
console.log('');
