const XLSX = require('xlsx');
const path = require('path');

// Extract lecture number from Serial text (same logic as import script)
function extractLectureNumber(serialText) {
  if (!serialText || serialText === 'Not Available') return null;

  const arabicNumbers = {
    // 21-50
    'الحادي والعشرون': 21, 'الواحد والعشرون': 21,
    'الثاني والعشرون': 22, 'الثالث والعشرون': 23,
    'الرابع والعشرون': 24, 'الخامس والعشرون': 25, 'السادس والعشرون': 26,
    'السابع والعشرون': 27, 'الثامن والعشرون': 28, 'التاسع والعشرون': 29,
    'واحد و الثلاثون': 31, 'الواحد والثلاثون': 31,
    'الثاني والثلاثون': 32, 'الثالث والثلاثون': 33, 'الرابع والثلاثون': 34,
    'الخامس والثلاثون': 35, 'السادس والثلاثون': 36, 'السابع والثلاثون': 37,
    'الثامن والثلاثون': 38, 'التاسع والثلاثون': 39,
    'الحادي والأربعون': 41, 'الواحد والأربعون': 41,
    'الثاني والأربعون': 42, 'الثالث والأربعون': 43,
    'الرابع والأربعون': 44, 'الخامس والأربعون': 45, 'السادس والأربعون': 46,
    'السابع والأربعون': 47, 'الثامن والأربعون': 48, 'التاسع والأربعون': 49,
    // 11-20
    'الحادي عشر': 11, 'الثاني عشر': 12, 'الثالث عشر': 13, 'الرابع عشر': 14,
    'الخامس عشر': 15, 'السادس عشر': 16, 'السابع عشر': 17, 'الثامن عشر': 18,
    'التاسع عشر': 19,
    // Standalone decades
    'العشرون': 20, 'الثلاثون': 30, 'الأربعون': 40, 'الخمسون': 50,
    // 1-10
    'الأول': 1, 'الثاني': 2, 'الثالث': 3, 'الرابع': 4, 'الخامس': 5,
    'السادس': 6, 'السابع': 7, 'الثامن': 8, 'التاسع': 9, 'العاشر': 10
  };

  const text = String(serialText).trim();

  for (const [word, num] of Object.entries(arabicNumbers)) {
    if (text.includes(word)) {
      return num;
    }
  }

  const match = text.match(/\d+/);
  if (match) {
    return parseInt(match[0], 10);
  }

  return null;
}

async function checkExcelSeries() {
  console.log('📖 Reading Excel file...\n');

  const filePath = path.join(__dirname, '../updatedData.xlsx');
  const workbook = XLSX.readFile(filePath);
  const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

  console.log(`Found ${data.length} total rows in Excel\n`);

  const targetSeries = [
    'الملخص شرح كتاب التوحيد',
    'الملخص الفقهي'
  ];

  for (const seriesName of targetSeries) {
    console.log('='.repeat(70));
    console.log(`📚 ${seriesName}`);
    console.log('='.repeat(70));
    console.log('');

    const rows = data.filter(row =>
      row.SeriesName && row.SeriesName.trim() === seriesName
    );

    console.log(`Found ${rows.length} rows in Excel for this series\n`);

    // Extract and sort lectures
    const lectures = rows.map(row => ({
      sNo: row['S.No'],
      serial: row.Serial,
      number: extractLectureNumber(row.Serial),
      filename: row.TelegramFileName
    })).sort((a, b) => (a.number || 0) - (b.number || 0));

    console.log('All lectures in Excel:\n');
    lectures.forEach((lec, index) => {
      console.log(`${index + 1}. [#${lec.number || 'N/A'}] Serial: "${lec.serial}" | File: ${lec.filename}`);
    });
    console.log('');

    // Check for duplicate numbers
    const byNumber = {};
    lectures.forEach(lec => {
      const num = lec.number || 'N/A';
      if (!byNumber[num]) {
        byNumber[num] = [];
      }
      byNumber[num].push(lec);
    });

    const duplicates = Object.entries(byNumber).filter(([num, lecs]) => lecs.length > 1);

    if (duplicates.length > 0) {
      console.log('⚠️  DUPLICATE LECTURE NUMBERS IN EXCEL:\n');
      duplicates.forEach(([num, lecs]) => {
        console.log(`Number #${num} appears ${lecs.length} times:`);
        lecs.forEach(lec => {
          console.log(`  - Row ${lec.sNo}: "${lec.serial}" | ${lec.filename}`);
        });
        console.log('');
      });
    } else {
      console.log('✅ No duplicate lecture numbers in Excel\n');
    }

    // Check for missing numbers
    const numbers = lectures.map(l => l.number).filter(n => n !== null);
    if (numbers.length > 0) {
      const min = Math.min(...numbers);
      const max = Math.max(...numbers);
      const missing = [];

      for (let i = min; i <= max; i++) {
        if (!numbers.includes(i)) {
          missing.push(i);
        }
      }

      if (missing.length > 0) {
        console.log(`⚠️  MISSING NUMBERS IN EXCEL: ${missing.join(', ')}\n`);
      } else {
        console.log(`✅ Excel has sequential numbers from ${min} to ${max}\n`);
      }

      console.log(`Expected total: ${max - min + 1} lectures`);
      console.log(`Actual in Excel: ${lectures.length} lectures`);
      console.log(`Difference: ${lectures.length - (max - min + 1)}\n`);
    }

    console.log('\n');
  }
}

checkExcelSeries();
