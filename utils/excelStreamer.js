/**
 * Streaming Excel Reader Utility
 *
 * Memory-efficient Excel file parsing using xlsx-stream-reader.
 * Processes files row-by-row instead of loading entire file into memory.
 *
 * Memory savings: ~5MB vs ~100MB+ for large Excel files.
 *
 * Usage:
 *   const { streamExcel, readExcelStreaming } = require('./utils/excelStreamer');
 *
 *   // Option 1: Process rows as they stream
 *   await streamExcel('data.xlsx', (row, rowIndex) => {
 *     console.log(`Row ${rowIndex}:`, row);
 *   });
 *
 *   // Option 2: Get all rows (still memory-efficient during parsing)
 *   const rows = await readExcelStreaming('data.xlsx');
 */

const fs = require('fs');
const XlsxStreamReader = require('xlsx-stream-reader');

/**
 * Stream Excel file and process rows one at a time
 * @param {string} filePath - Path to Excel file
 * @param {Function} onRow - Callback for each row: (rowData, rowIndex) => void
 * @param {Object} options - Options
 * @param {number} options.sheetIndex - Sheet index to read (default: 0)
 * @param {boolean} options.hasHeader - First row is header (default: true)
 * @returns {Promise<{rowCount: number, headers: string[]}>}
 */
function streamExcel(filePath, onRow, options = {}) {
  const { sheetIndex = 0, hasHeader = true } = options;

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`File not found: ${filePath}`));
    }

    const workBookReader = new XlsxStreamReader();
    let headers = [];
    let rowCount = 0;
    let currentSheetIndex = -1;

    workBookReader.on('error', (error) => {
      reject(error);
    });

    workBookReader.on('worksheet', (workSheetReader) => {
      currentSheetIndex++;

      // Skip sheets we don't want
      if (currentSheetIndex !== sheetIndex) {
        workSheetReader.skip();
        return;
      }

      workSheetReader.on('row', (row) => {
        const values = row.values;
        // Row values is sparse array starting at index 1
        const rowData = values.slice(1);

        if (hasHeader && rowCount === 0) {
          // Store headers from first row
          headers = rowData.map(h => String(h || '').trim());
        } else {
          // Convert to object using headers
          if (hasHeader && headers.length > 0) {
            const rowObject = {};
            headers.forEach((header, idx) => {
              if (header) {
                rowObject[header] = rowData[idx];
              }
            });
            onRow(rowObject, rowCount);
          } else {
            onRow(rowData, rowCount);
          }
        }
        rowCount++;
      });

      workSheetReader.on('end', () => {
        // Sheet finished
      });

      workSheetReader.process();
    });

    workBookReader.on('end', () => {
      resolve({
        rowCount: hasHeader ? rowCount - 1 : rowCount,
        headers
      });
    });

    fs.createReadStream(filePath).pipe(workBookReader);
  });
}

/**
 * Read Excel file to array using streaming (memory-efficient parsing)
 * Note: Final array still uses memory, but parsing phase is streamed
 * @param {string} filePath - Path to Excel file
 * @param {Object} options - Options
 * @param {number} options.sheetIndex - Sheet index to read (default: 0)
 * @param {boolean} options.hasHeader - First row is header (default: true)
 * @returns {Promise<{rows: Object[], headers: string[]}>}
 */
async function readExcelStreaming(filePath, options = {}) {
  const rows = [];

  const result = await streamExcel(filePath, (row) => {
    rows.push(row);
  }, options);

  return {
    rows,
    headers: result.headers,
    rowCount: result.rowCount
  };
}

module.exports = {
  streamExcel,
  readExcelStreaming
};
