const XLSX = require('xlsx');

// Read the Excel file
const workbook = XLSX.readFile('./updatedData.xlsx');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];

// Convert to JSON
const data = XLSX.utils.sheet_to_json(sheet);

// Output as formatted JSON for easy reading
console.log(JSON.stringify(data, null, 2));
