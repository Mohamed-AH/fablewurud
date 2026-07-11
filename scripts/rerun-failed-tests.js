#!/usr/bin/env node
/**
 * Rerun Failed Tests
 *
 * This script reads the failed tests from the last run and re-runs only those tests.
 *
 * Usage:
 *   node scripts/rerun-failed-tests.js [--jest|--playwright|--all]
 *   npm run test:rerun-failed
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'test-results');
const FAILED_TESTS_FILE = path.join(RESULTS_DIR, 'failed-tests.json');

/**
 * Read the last failed tests results
 */
function readFailedTests() {
  if (!fs.existsSync(FAILED_TESTS_FILE)) {
    console.log('❌ No failed tests file found. Run "npm run test:collect-failed" first.');
    process.exit(1);
  }

  const content = fs.readFileSync(FAILED_TESTS_FILE, 'utf-8');
  return JSON.parse(content);
}

/**
 * Rerun failed Jest tests
 */
function rerunJestTests(failedTests) {
  if (!failedTests || failedTests.length === 0) {
    console.log('✅ No failed Jest tests to rerun');
    return true;
  }

  // Get unique test files
  const failedFiles = [...new Set(failedTests.map(t => t.file))];

  console.log(`\n🧪 Rerunning ${failedTests.length} failed Jest tests in ${failedFiles.length} file(s)...\n`);

  // Build test name patterns for --testNamePattern
  const testNames = failedTests.map(t => t.testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const testPattern = testNames.join('|');

  try {
    const cmd = `npx jest ${failedFiles.join(' ')} --testNamePattern="${testPattern}" --verbose`;
    console.log(`Running: ${cmd}\n`);

    execSync(cmd, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Rerun failed Playwright tests
 */
function rerunPlaywrightTests(failedTests) {
  if (!failedTests || failedTests.length === 0) {
    console.log('✅ No failed Playwright tests to rerun');
    return true;
  }

  // Get unique test files
  const failedFiles = [...new Set(failedTests.map(t => t.file).filter(Boolean))];

  console.log(`\n🎭 Rerunning ${failedTests.length} failed Playwright tests in ${failedFiles.length} file(s)...\n`);

  // Build grep pattern for specific tests
  const testNames = failedTests.map(t => t.testName);

  try {
    let cmd;
    if (failedFiles.length > 0) {
      cmd = `npx playwright test ${failedFiles.join(' ')}`;
    } else {
      // If no specific files, run with grep
      const grepPattern = testNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      cmd = `npx playwright test --grep "${grepPattern}"`;
    }

    console.log(`Running: ${cmd}\n`);

    execSync(cmd, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const runJest = args.includes('--jest') || args.includes('--all') || args.length === 0;
  const runPlaywright = args.includes('--playwright') || args.includes('--all');

  console.log('╔════════════════════════════════════════════╗');
  console.log('║     Rerun Failed Tests                     ║');
  console.log('╚════════════════════════════════════════════╝');

  const results = readFailedTests();

  console.log(`\nLast run: ${results.timestamp}`);
  console.log(`Total failed tests: ${results.summary.totalFailed}`);

  if (results.summary.totalFailed === 0) {
    console.log('\n✅ No failed tests to rerun!');
    process.exit(0);
  }

  let jestSuccess = true;
  let playwrightSuccess = true;

  if (runJest && results.jest?.failed?.length > 0) {
    jestSuccess = rerunJestTests(results.jest.failed);
  }

  if (runPlaywright && results.playwright?.failed?.length > 0) {
    playwrightSuccess = rerunPlaywrightTests(results.playwright.failed);
  }

  console.log('\n' + '═'.repeat(50));
  console.log('RERUN RESULTS');
  console.log('═'.repeat(50));

  if (jestSuccess && playwrightSuccess) {
    console.log('✅ All previously failed tests now pass!');
    process.exit(0);
  } else {
    console.log('❌ Some tests still failing');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
