#!/usr/bin/env node
/**
 * Failed Tests Collector
 *
 * This script collects failed tests from Jest/Playwright and generates
 * a structured report for fixing them.
 *
 * Usage:
 *   node scripts/collect-failed-tests.js [--jest|--playwright|--all]
 *   npm run test:failed
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'test-results');
const FAILED_TESTS_FILE = path.join(RESULTS_DIR, 'failed-tests.json');
const FAILED_TESTS_REPORT = path.join(RESULTS_DIR, 'failed-tests-report.md');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

/**
 * Run Jest tests and collect results
 */
async function collectJestFailures() {
  console.log('\n🧪 Running Jest tests...\n');

  const jestResultsFile = path.join(RESULTS_DIR, 'jest-results.json');
  let jsonOutput = '';

  try {
    // Run Jest with JSON output to file (cross-platform)
    execSync(
      `npx jest --json --outputFile="${jestResultsFile}" --runInBand`,
      {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf-8',
        timeout: 300000, // 5 minutes
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
        stdio: 'inherit' // Show test output in console
      }
    );
  } catch (error) {
    // Jest exits with non-zero if tests fail, which is expected
    console.log('Jest finished (some tests may have failed)');
  }

  // Read the JSON results file
  let results = null;

  if (fs.existsSync(jestResultsFile)) {
    try {
      const content = fs.readFileSync(jestResultsFile, 'utf-8');
      results = JSON.parse(content);
    } catch (e) {
      console.log('⚠️  Could not parse Jest JSON output file');
    }
  } else {
    // Fallback: try running with stdout capture
    try {
      jsonOutput = execSync(
        `npx jest --json --runInBand`,
        {
          cwd: path.join(__dirname, '..'),
          encoding: 'utf-8',
          timeout: 300000,
          maxBuffer: 50 * 1024 * 1024
        }
      );
    } catch (error) {
      jsonOutput = error.stdout || '';
    }

    // Try to find JSON in the output (it's at the end after test results)
    if (jsonOutput) {
      // Find the last occurrence of a JSON object with testResults
      const jsonStart = jsonOutput.lastIndexOf('{"numFailedTestSuites"');
      if (jsonStart !== -1) {
        try {
          results = JSON.parse(jsonOutput.substring(jsonStart));
          fs.writeFileSync(jestResultsFile, JSON.stringify(results, null, 2));
        } catch (e) {
          console.log('⚠️  Could not parse Jest JSON from stdout');
        }
      }
    }
  }

  if (!results) {
    console.log('⚠️  No Jest results found');
    return { failed: [], passed: [], total: 0 };
  }

  const failedTests = [];
  const passedTests = [];

  for (const testResult of results.testResults || []) {
    const testFile = path.relative(path.join(__dirname, '..'), testResult.name);

    for (const assertionResult of testResult.assertionResults || []) {
      const testInfo = {
        file: testFile,
        testName: assertionResult.fullName || assertionResult.title,
        ancestorTitles: assertionResult.ancestorTitles || [],
        duration: assertionResult.duration,
        status: assertionResult.status
      };

      if (assertionResult.status === 'failed') {
        testInfo.errorMessage = assertionResult.failureMessages?.join('\n') || '';
        testInfo.errorType = extractErrorType(testInfo.errorMessage);
        failedTests.push(testInfo);
      } else if (assertionResult.status === 'passed') {
        passedTests.push(testInfo);
      }
    }
  }

  return {
    failed: failedTests,
    passed: passedTests,
    total: failedTests.length + passedTests.length,
    numFailedTests: results.numFailedTests || failedTests.length,
    numPassedTests: results.numPassedTests || passedTests.length,
    numTotalTests: results.numTotalTests || failedTests.length + passedTests.length,
    startTime: results.startTime,
    success: results.success
  };
}

/**
 * Run Playwright tests and collect results
 */
async function collectPlaywrightFailures() {
  console.log('\n🎭 Running Playwright tests...\n');

  const playwrightResultsFile = path.join(RESULTS_DIR, 'playwright-results.json');

  // Remove old results file if it exists
  if (fs.existsSync(playwrightResultsFile)) {
    fs.unlinkSync(playwrightResultsFile);
  }

  try {
    // Run Playwright with JSON reporter, outputting to file via env var
    // This avoids issues with global setup console output mixing with JSON
    execSync(
      `npx playwright test --reporter=json`,
      {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf-8',
        timeout: 600000, // 10 minutes
        maxBuffer: 50 * 1024 * 1024,
        stdio: 'inherit', // Show test output in console
        env: {
          ...process.env,
          PLAYWRIGHT_JSON_OUTPUT_NAME: playwrightResultsFile
        }
      }
    );
  } catch (error) {
    // Playwright exits with non-zero if tests fail
    console.log('Playwright finished (some tests may have failed)');
  }

  // Read the JSON results from file
  if (!fs.existsSync(playwrightResultsFile)) {
    console.log('⚠️  No Playwright results generated');
    return { failed: [], passed: [], total: 0 };
  }

  let results;
  try {
    const jsonOutput = fs.readFileSync(playwrightResultsFile, 'utf-8');
    results = JSON.parse(jsonOutput);

    const failedTests = [];
    const passedTests = [];

    for (const suite of results.suites || []) {
      processPlaywrightSuite(suite, failedTests, passedTests);
    }

    return {
      failed: failedTests,
      passed: passedTests,
      total: failedTests.length + passedTests.length
    };
  } catch (parseError) {
    console.log('⚠️  Could not parse Playwright results:', parseError.message);
    return { failed: [], passed: [], total: 0 };
  }
}

/**
 * Process Playwright test suite recursively
 */
function processPlaywrightSuite(suite, failedTests, passedTests, ancestors = []) {
  const currentAncestors = suite.title ? [...ancestors, suite.title] : ancestors;

  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      const testInfo = {
        file: suite.file || '',
        testName: spec.title,
        ancestorTitles: currentAncestors,
        duration: test.results?.[0]?.duration,
        status: test.status,
        projectName: test.projectName
      };

      if (test.status === 'unexpected' || test.status === 'failed') {
        testInfo.errorMessage = test.results?.[0]?.error?.message || '';
        testInfo.errorType = extractErrorType(testInfo.errorMessage);
        failedTests.push(testInfo);
      } else if (test.status === 'expected' || test.status === 'passed') {
        passedTests.push(testInfo);
      }
    }
  }

  for (const childSuite of suite.suites || []) {
    processPlaywrightSuite(childSuite, failedTests, passedTests, currentAncestors);
  }
}

/**
 * Extract error type from error message
 */
function extractErrorType(errorMessage) {
  if (!errorMessage) return 'Unknown';

  const errorPatterns = [
    { pattern: /MongooseError|MongoError|MongoDB/i, type: 'Database Error' },
    { pattern: /DownloadError|ECONNREFUSED|ENOTFOUND|network/i, type: 'Network/Infrastructure Error' },
    { pattern: /Timeout|timed out/i, type: 'Timeout Error' },
    { pattern: /AssertionError|expect\(/i, type: 'Assertion Error' },
    { pattern: /ReferenceError/i, type: 'Reference Error' },
    { pattern: /TypeError/i, type: 'Type Error' },
    { pattern: /SyntaxError/i, type: 'Syntax Error' },
    { pattern: /ValidationError/i, type: 'Validation Error' },
    { pattern: /Authentication|Unauthorized|401/i, type: 'Authentication Error' },
    { pattern: /Not Found|404/i, type: 'Not Found Error' },
    { pattern: /Permission|Forbidden|403/i, type: 'Permission Error' }
  ];

  for (const { pattern, type } of errorPatterns) {
    if (pattern.test(errorMessage)) {
      return type;
    }
  }

  return 'Runtime Error';
}

/**
 * Group failed tests by error type
 */
function groupByErrorType(failedTests) {
  const grouped = {};

  for (const test of failedTests) {
    const errorType = test.errorType || 'Unknown';
    if (!grouped[errorType]) {
      grouped[errorType] = [];
    }
    grouped[errorType].push(test);
  }

  return grouped;
}

/**
 * Group failed tests by file
 */
function groupByFile(failedTests) {
  const grouped = {};

  for (const test of failedTests) {
    const file = test.file || 'Unknown';
    if (!grouped[file]) {
      grouped[file] = [];
    }
    grouped[file].push(test);
  }

  return grouped;
}

/**
 * Generate markdown report
 */
function generateReport(jestResults, playwrightResults) {
  const allFailedTests = [
    ...jestResults.failed.map(t => ({ ...t, runner: 'Jest' })),
    ...playwrightResults.failed.map(t => ({ ...t, runner: 'Playwright' }))
  ];

  const byErrorType = groupByErrorType(allFailedTests);
  const byFile = groupByFile(allFailedTests);

  let report = `# Failed Tests Report
Generated: ${new Date().toISOString()}

## Summary

| Metric | Jest | Playwright | Total |
|--------|------|------------|-------|
| Failed | ${jestResults.failed.length} | ${playwrightResults.failed.length} | ${allFailedTests.length} |
| Passed | ${jestResults.passed.length} | ${playwrightResults.passed.length} | ${jestResults.passed.length + playwrightResults.passed.length} |
| Total  | ${jestResults.total} | ${playwrightResults.total} | ${jestResults.total + playwrightResults.total} |

`;

  if (allFailedTests.length === 0) {
    report += `\n## ✅ All tests passed!\n`;
    return report;
  }

  // Group by Error Type
  report += `## Failed Tests by Error Type\n\n`;

  for (const [errorType, tests] of Object.entries(byErrorType).sort((a, b) => b[1].length - a[1].length)) {
    report += `### ${errorType} (${tests.length} tests)\n\n`;

    for (const test of tests) {
      report += `- **[${test.runner}]** \`${test.file}\`\n`;
      report += `  - Test: ${test.testName}\n`;
      if (test.errorMessage) {
        const shortError = test.errorMessage.split('\n')[0].substring(0, 200);
        report += `  - Error: \`${shortError}\`\n`;
      }
    }
    report += '\n';
  }

  // Group by File
  report += `## Failed Tests by File\n\n`;

  for (const [file, tests] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) {
    report += `### ${file} (${tests.length} failures)\n\n`;

    for (const test of tests) {
      report += `- ${test.testName}\n`;
      report += `  - Error Type: ${test.errorType}\n`;
    }
    report += '\n';
  }

  // Quick fix commands
  report += `## Re-run Failed Tests\n\n`;

  const jestFiles = [...new Set(jestResults.failed.map(t => t.file))];
  const playwrightFiles = [...new Set(playwrightResults.failed.map(t => t.file))];

  if (jestFiles.length > 0) {
    report += `### Jest (run only failed test files):\n\n`;
    report += `\`\`\`bash\nnpx jest ${jestFiles.join(' ')}\n\`\`\`\n\n`;
  }

  if (playwrightFiles.length > 0) {
    report += `### Playwright (run only failed test files):\n\n`;
    report += `\`\`\`bash\nnpx playwright test ${playwrightFiles.join(' ')}\n\`\`\`\n\n`;
  }

  return report;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const runJest = args.includes('--jest') || args.includes('--all') || args.length === 0;
  const runPlaywright = args.includes('--playwright') || args.includes('--all');

  console.log('╔════════════════════════════════════════════╗');
  console.log('║     Failed Tests Collector                 ║');
  console.log('╚════════════════════════════════════════════╝');

  let jestResults = { failed: [], passed: [], total: 0 };
  let playwrightResults = { failed: [], passed: [], total: 0 };

  if (runJest) {
    jestResults = await collectJestFailures();
  }

  if (runPlaywright) {
    playwrightResults = await collectPlaywrightFailures();
  }

  // Save structured results
  const results = {
    timestamp: new Date().toISOString(),
    jest: jestResults,
    playwright: playwrightResults,
    summary: {
      totalFailed: jestResults.failed.length + playwrightResults.failed.length,
      totalPassed: jestResults.passed.length + playwrightResults.passed.length,
      failedByType: groupByErrorType([...jestResults.failed, ...playwrightResults.failed]),
      failedByFile: groupByFile([...jestResults.failed, ...playwrightResults.failed])
    }
  };

  fs.writeFileSync(FAILED_TESTS_FILE, JSON.stringify(results, null, 2));
  console.log(`\n📄 Results saved to: ${FAILED_TESTS_FILE}`);

  // Generate and save markdown report
  const report = generateReport(jestResults, playwrightResults);
  fs.writeFileSync(FAILED_TESTS_REPORT, report);
  console.log(`📋 Report saved to: ${FAILED_TESTS_REPORT}`);

  // Print summary
  console.log('\n' + '═'.repeat(50));
  console.log('SUMMARY');
  console.log('═'.repeat(50));
  console.log(`Jest:       ${jestResults.failed.length} failed / ${jestResults.total} total`);
  console.log(`Playwright: ${playwrightResults.failed.length} failed / ${playwrightResults.total} total`);
  console.log('═'.repeat(50));

  if (results.summary.totalFailed > 0) {
    console.log('\n❌ Failed tests by error type:');
    for (const [type, tests] of Object.entries(results.summary.failedByType)) {
      console.log(`   ${type}: ${tests.length}`);
    }

    console.log('\n📁 Failed tests by file:');
    for (const [file, tests] of Object.entries(results.summary.failedByFile)) {
      console.log(`   ${file}: ${tests.length}`);
    }
  } else {
    console.log('\n✅ All tests passed!');
  }

  // Exit with appropriate code
  process.exit(results.summary.totalFailed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
