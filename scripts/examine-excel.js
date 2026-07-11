const XLSX = require('xlsx');
const path = require('path');

// Read the Excel file
const filePath = path.join(__dirname, '../updatedData.xlsx');
console.log('📖 Reading Excel file:', filePath);

try {
  const workbook = XLSX.readFile(filePath);

  console.log('\n📊 Workbook Info:');
  console.log('Sheet Names:', workbook.SheetNames);

  // Process each sheet
  workbook.SheetNames.forEach((sheetName, index) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📄 Sheet ${index + 1}: ${sheetName}`);
    console.log('='.repeat(60));

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    console.log(`Total rows: ${data.length}`);

    if (data.length > 0) {
      console.log('\n📋 Column Names:');
      const columns = Object.keys(data[0]);
      columns.forEach((col, i) => {
        console.log(`  ${i + 1}. ${col}`);
      });

      console.log('\n📝 First 3 rows (sample data):');
      data.slice(0, 3).forEach((row, i) => {
        console.log(`\n  Row ${i + 1}:`);
        Object.entries(row).forEach(([key, value]) => {
          const displayValue = String(value).length > 50
            ? String(value).substring(0, 50) + '...'
            : value;
          console.log(`    ${key}: ${displayValue}`);
        });
      });
    }
  });

  console.log('\n✅ Excel file examined successfully!');
} catch (error) {
  console.error('❌ Error reading Excel file:', error.message);
  process.exit(1);
}
