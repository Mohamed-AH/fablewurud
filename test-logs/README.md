# Test Logs Directory

This directory stores test execution logs with timestamps.

## Quick Start

Run tests and save logs automatically:

```bash
# Run all tests and save log (shows output + saves to file)
npm run test:log

# Run all tests and save log (only saves to file, no console output)
npm run test:log:all

# Run unit tests and save log
npm run test:unit:log

# Run integration tests and save log
npm run test:integration:log

# Run E2E tests and save log
npm run test:e2e:log
```

## Log File Naming

Logs are automatically named with timestamps:

- `test-YYYYMMDD-HHMMSS.log` - Full test run
- `unit-YYYYMMDD-HHMMSS.log` - Unit tests only
- `integration-YYYYMMDD-HHMMSS.log` - Integration tests only
- `e2e-YYYYMMDD-HHMMSS.log` - E2E tests only

Example: `test-20240127-143052.log`

## Manual Logging

You can also redirect output manually:

```bash
# Save all output to file
npm test > test-logs/my-test.log 2>&1

# Show output AND save to file (using tee)
npm test 2>&1 | tee test-logs/my-test.log

# Append to existing log file
npm test 2>&1 | tee -a test-logs/my-test.log

# Save only errors
npm test 2> test-logs/errors.log

# Save with custom name
npm test 2>&1 | tee test-logs/test-$(date +%Y%m%d).log
```

## Viewing Logs

```bash
# View latest log
cat test-logs/test-*.log | tail -100

# List all logs
ls -lh test-logs/

# View specific log
cat test-logs/test-20240127-143052.log

# Follow log in real-time (if running in another terminal)
tail -f test-logs/test-20240127-143052.log

# Search logs for failures
grep -r "FAIL" test-logs/

# Search logs for specific test
grep -r "should maintain cards visibility" test-logs/
```

## Log Contents

Each log file contains:

- Test execution summary
- Individual test results (PASS/FAIL)
- Error messages and stack traces
- Coverage report (if applicable)
- Timing information
- Console output from tests

## Cleaning Up Old Logs

```bash
# Remove all logs
rm test-logs/*.log

# Remove logs older than 7 days
find test-logs/ -name "*.log" -mtime +7 -delete

# Remove logs older than 30 days
find test-logs/ -name "*.log" -mtime +30 -delete

# Keep only last 10 logs
ls -t test-logs/*.log | tail -n +11 | xargs rm -f
```

## Automated Cleanup Script

Create a cleanup script:

```bash
#!/bin/bash
# scripts/clean-test-logs.sh

# Remove logs older than 14 days
find test-logs/ -name "*.log" -mtime +14 -delete

# Keep only last 20 logs
ls -t test-logs/*.log 2>/dev/null | tail -n +21 | xargs rm -f 2>/dev/null

echo "✅ Test logs cleaned up"
```

Make it executable:
```bash
chmod +x scripts/clean-test-logs.sh
```

Run it:
```bash
./scripts/clean-test-logs.sh
```

## CI/CD Integration

### GitHub Actions

Logs are automatically saved as artifacts in GitHub Actions. You can also configure additional logging:

```yaml
- name: Run tests with logging
  run: npm run test:log:all

- name: Upload test logs
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: test-logs
    path: test-logs/
    retention-days: 30
```

### Local Development

For continuous testing with logs:

```bash
# Watch mode (no logging)
npm run test:watch

# Run tests on demand with logging
npm run test:log
```

## Comparing Test Runs

Compare two test runs:

```bash
# Show differences between two log files
diff test-logs/test-20240127-140000.log test-logs/test-20240127-150000.log

# Show only new failures
diff test-logs/old.log test-logs/new.log | grep "FAIL"
```

## Sharing Logs

When reporting issues, include relevant log snippets:

```bash
# Copy last test run to clipboard (macOS)
cat test-logs/test-*.log | tail -100 | pbcopy

# Or save specific section
grep -A 20 "FAIL" test-logs/test-latest.log > issue-report.txt
```

## Tips

1. **Use descriptive names** when saving manually:
   ```bash
   npm test 2>&1 | tee test-logs/bug-fix-verification.log
   ```

2. **Compress old logs** to save space:
   ```bash
   gzip test-logs/*.log
   ```

3. **Create aliases** for convenience:
   ```bash
   alias testlog='npm run test:log'
   alias testview='cat test-logs/test-*.log | tail -100'
   ```

4. **Automate cleanup** with cron:
   ```bash
   # Add to crontab: Run every Sunday at 2 AM
   0 2 * * 0 find /path/to/project/test-logs -name "*.log" -mtime +30 -delete
   ```

## Log File Structure

A typical log file contains:

```
PASS  tests/unit/models/lecture.test.js
PASS  tests/unit/models/sheikh.test.js
PASS  tests/unit/models/series.test.js
PASS  tests/integration/api/lectures.test.js
...

Test Suites: 8 passed, 8 total
Tests:       95 passed, 95 total
Snapshots:   0 total
Time:        45.231 s

Coverage Summary:
-----------------
Statements   : 65.23% ( 450/690 )
Branches     : 57.89% ( 110/190 )
Functions    : 62.50% ( 100/160 )
Lines        : 64.78% ( 445/687 )
```

## Troubleshooting

### Log file not created

**Problem:** Log file doesn't exist after running test:log

**Solution:**
```bash
# Ensure directory exists
mkdir -p test-logs

# Check if script works
npm run test:log

# Try manual redirect
npm test > test-logs/manual-test.log 2>&1
```

### Permission denied

**Problem:** Can't write to test-logs directory

**Solution:**
```bash
# Fix permissions
chmod 755 test-logs

# Or create new directory
rm -rf test-logs
mkdir test-logs
```

### Logs too large

**Problem:** Log files are very large

**Solution:**
```bash
# Run tests without verbose mode
jest --coverage > test-logs/test.log 2>&1

# Or compress logs
gzip test-logs/*.log
```

---

## Related Documentation

- **Running Tests:** See `AUTOMATED_TESTING_GUIDE.md`
- **Test Types:** See `tests/README.md`
- **Manual Testing:** See `TESTING_CHECKLIST.md`

---

**Note:** Log files in this directory are ignored by git (see `.gitignore`). Only the directory structure is tracked.
