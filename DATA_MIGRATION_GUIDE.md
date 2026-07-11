# Data Migration Guide

## Current Status

The platform has 162 lectures in MongoDB that were imported with incorrect data structure. The import script had several critical bugs that resulted in:

1. **Wrong Titles**: Used `Serial` instead of `SeriesName` as the primary title
2. **Incorrect audioFileName**: Set filename even though audio files don't exist on disk
3. **Missing Series**: Only created series for `Type === 'Series'` instead of all lectures with SeriesName
4. **No File Tracking**: No way to determine if audio file physically exists

## MongoDB Connectivity Issue

**IMPORTANT**: Currently unable to connect to MongoDB Atlas cluster due to network/DNS issue:

```
Error: querySrv ECONNREFUSED _mongodb._tcp.cluster0.abhqc.mongodb.net
```

This affects:
- Import scripts
- Cleanup scripts
- Server startup

**Required Action**: This needs to be resolved before proceeding with data migration. Possible causes:
- Network firewall blocking MongoDB Atlas
- DNS resolution not configured properly
- MongoDB Atlas cluster accessibility issue
- VPN or network configuration needed

## Prepared Scripts

### 1. cleanup-bad-data.js

Removes all incorrectly imported lectures and series from MongoDB.

**Usage:**
```bash
# Preview what will be deleted (safe, no changes)
node scripts/cleanup-bad-data.js

# Actually delete the data
CONFIRM_DELETE=yes node scripts/cleanup-bad-data.js
```

**What it does:**
- Shows current database statistics
- Displays sample of problematic data
- Deletes ALL lectures and series (preserves sheikhs)
- Verifies cleanup was successful

### 2. import-excel-fixed.js

Correctly imports lecture data from Excel with proper structure.

**Fixed Issues:**
- ✅ Uses SeriesName as primary title (not Serial)
- ✅ Only appends serial number for Type === 'Series' lectures
- ✅ Checks if audio file exists before setting audioFileName
- ✅ Creates series for ALL lectures with SeriesName
- ✅ Adds metadata field for file matching

**Usage:**
```bash
# Test mode - import only first 10 records
TEST_MODE=yes node scripts/import-excel-fixed.js

# Full import - all 162 lectures
node scripts/import-excel-fixed.js
```

## Migration Steps (When MongoDB is Accessible)

### Step 1: Backup Current Data (Optional)

If you want to keep the existing data as backup:

```bash
# Export current data
mongoexport --uri="$MONGODB_URI" --collection=lectures --out=backup_lectures.json
mongoexport --uri="$MONGODB_URI" --collection=series --out=backup_series.json
```

### Step 2: Run Cleanup Script

```bash
# Preview the data
node scripts/cleanup-bad-data.js

# If satisfied, run cleanup
CONFIRM_DELETE=yes node scripts/cleanup-bad-data.js
```

**Expected Output:**
```
📊 Current database state:
   Lectures: 162
   Series: X
   Sheikhs: Y

🗑️  Deleting all lectures...
✅ Deleted 162 lectures

🗑️  Deleting all series...
✅ Deleted X series

📊 Final database state:
   Lectures: 0
   Series: 0
   Sheikhs: Y (preserved)
```

### Step 3: Test Import with Small Sample

```bash
TEST_MODE=yes node scripts/import-excel-fixed.js
```

**Verify the output:**
- Check that titles use SeriesName correctly
- Verify serial numbers only appear for Type === 'Series'
- Confirm audioFileName is null (files don't exist yet)
- Check metadata field contains Excel data

### Step 4: Verify Test Import in MongoDB

Connect to MongoDB and check a few sample records:

```javascript
// Should see correct structure:
{
  titleArabic: "الرسالة المفيدة المهمة الجليلة",  // SeriesName
  titleEnglish: "The Beneficial Important Majestic Message",
  audioFileName: null,  // No file yet
  duration: 0,
  seriesId: ObjectId("..."),
  metadata: {
    excelFilename: "original_telegram_name.m4a",
    type: "Series",
    serial: "Not Available"
  }
}
```

### Step 5: Clean Test Data and Run Full Import

```bash
# Clean test import
CONFIRM_DELETE=yes node scripts/cleanup-bad-data.js

# Run full import
node scripts/import-excel-fixed.js
```

**Expected Output:**
```
📊 Found 162 lectures in Excel file

✅ Import complete!
📊 Statistics:
   Sheikhs created: ~20
   Series created: ~50
   Lectures created: 162
   Lectures skipped: 0
   Errors: 0
```

### Step 6: Verify Bulk Upload Works

1. Start the server:
   ```bash
   npm start
   ```

2. Navigate to: http://localhost:3000/admin/bulk-upload

3. Verify statistics show:
   - Total Lectures: 162
   - With Audio: 0
   - Missing Audio: 162

4. The bulk upload page should now correctly identify all lectures as missing audio

### Step 7: Upload Audio Files

Use the bulk upload interface to upload audio files for the lectures:

1. Drag and drop multiple audio files
2. System will auto-match files to lectures based on filename
3. Manually select lecture for any files that don't auto-match
4. Click "Upload All" to process all files

## Data Structure Reference

### Correct MongoDB Schema

**Lecture Document:**
```javascript
{
  titleArabic: String,        // From SeriesName in Excel
  titleEnglish: String,       // English translation
  lectureNumber: Number,      // Extracted from Serial (if Type === 'Series')
  audioFileName: String|null, // Only set if file exists
  duration: Number,           // In seconds
  seriesId: ObjectId,         // Reference to Series
  sheikhId: ObjectId,         // Reference to Sheikh
  isPublished: Boolean,
  metadata: {
    excelFilename: String,    // Original TelegramFileName from Excel
    type: String,             // 'Series' or 'Lecture'
    serial: String            // Original Serial value from Excel
  }
}
```

### Display Logic

**For Type === 'Series':**
```
Display: "الرسالة المفيدة المهمة الجليلة - الدرس 1"
         (SeriesName + " - الدرس " + lectureNumber)
```

**For Type === 'Lecture':**
```
Display: "الرسالة المفيدة المهمة الجليلة"
         (SeriesName only, no serial number)
```

## Troubleshooting

### MongoDB Connection Issues

If you see `ECONNREFUSED` errors:

1. **Check network access:**
   ```bash
   curl -v https://cluster0.abhqc.mongodb.net
   ```

2. **Verify MongoDB Atlas whitelist:**
   - Login to MongoDB Atlas
   - Go to Network Access
   - Ensure your IP or 0.0.0.0/0 is whitelisted

3. **Check connection string:**
   ```bash
   echo $MONGODB_URI
   # Should be: mongodb+srv://user:pass@cluster0.abhqc.mongodb.net/durus
   ```

4. **Test with MongoDB Compass:**
   - Use the connection string in MongoDB Compass
   - If it connects, issue is with Node.js environment
   - If it doesn't connect, issue is with network/MongoDB Atlas

### Script Errors

**If import script fails:**

1. Check Excel file exists:
   ```bash
   ls -lh updatedData.xlsx
   ```

2. Verify Excel structure:
   - Required columns: Sheikh, SeriesName, TelegramFileName
   - Check for empty/missing values

3. Check error messages in console output

**If cleanup script fails:**

1. Verify MongoDB connection
2. Check if there's data to delete
3. Ensure you have write permissions

## Next Steps After Migration

1. ✅ Data correctly imported with proper structure
2. ✅ Bulk upload shows accurate counts
3. 📝 Upload audio files for the 162 lectures
4. 📝 Test sticky audio player with real files
5. 📝 Verify streaming and seeking work correctly
6. 📝 Test on mobile devices

## Files Modified/Created

- `scripts/cleanup-bad-data.js` - Cleanup script
- `scripts/import-excel-fixed.js` - Fixed import script with TEST_MODE
- `scripts/import-excel.js` - Original buggy script (for reference)
- `views/admin/bulk-upload.ejs` - Bulk upload interface
- `DATA_MIGRATION_GUIDE.md` - This guide

## Contact

If you encounter issues during migration, document:
1. The exact error message
2. Which step you were on
3. Output from the script
4. MongoDB Atlas connectivity status
