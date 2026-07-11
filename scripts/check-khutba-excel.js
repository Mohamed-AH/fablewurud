const XLSX = require('xlsx');
const path = require('path');

const workbook = XLSX.readFile(path.join(__dirname, '../updatedData.xlsx'));
const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

// Find all Khutba-related series
const khutbaRows = data.filter(row =>
  row.SeriesName &&
  (row.SeriesName.includes('خطب') || row.SeriesName.includes('خطبة'))
);

console.log(`Found ${khutbaRows.length} Khutba lectures in Excel\n`);

// Group by series name
const seriesMap = {};
khutbaRows.forEach(row => {
  const name = row.SeriesName;
  if (!seriesMap[name]) {
    seriesMap[name] = [];
  }
  seriesMap[name].push(row);
});

console.log('Khutba series in Excel file:\n');
console.log('='.repeat(60));

Object.entries(seriesMap)
  .sort((a, b) => b[1].length - a[1].length) // Sort by lecture count descending
  .forEach(([name, rows]) => {
    console.log(`📚 ${name}`);
    console.log(`   Lectures: ${rows.length}`);

    // Show first few serials if available
    const serials = rows.slice(0, 3).map(r => r.Serial).filter(s => s && s !== 'Not Available');
    if (serials.length > 0) {
      console.log(`   Sample serials: ${serials.join(', ')}`);
    }
    console.log('');
  });

console.log('='.repeat(60));
console.log('\nAnalysis:');
console.log('- Series with > 1 lecture = multi-lecture Khutba series');
console.log('- Series with 1 lecture = standalone Khutba');
console.log('\nMulti-lecture series should appear in hierarchical view.');
