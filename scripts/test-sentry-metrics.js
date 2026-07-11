/**
 * Test script to send metrics to Sentry
 * Run: node scripts/test-sentry-metrics.js
 */

require('dotenv').config();
const Sentry = require('@sentry/node');

const dsn = process.env.SENTRY_DSN;

if (!dsn) {
  console.error('Error: SENTRY_DSN not found in environment variables');
  process.exit(1);
}

console.log('Initializing Sentry...');

Sentry.init({
  dsn: dsn,
  environment: process.env.METRIC_TAG || 'development',
});

console.log('Sending test metrics to Sentry...');

// Send test metrics
Sentry.metrics.count('button_click', 1);
console.log('  - Sent: button_click (counter) = 1');

Sentry.metrics.gauge('page_load_time', 150);
console.log('  - Sent: page_load_time (gauge) = 150');

Sentry.metrics.distribution('response_time', 200);
console.log('  - Sent: response_time (distribution) = 200');

// Send a few more for good measure
Sentry.metrics.count('button_click', 1);
Sentry.metrics.gauge('page_load_time', 180);
Sentry.metrics.distribution('response_time', 250);

console.log('\nFlushing metrics...');

// Ensure metrics are sent before exiting
Sentry.close(5000).then(() => {
  console.log('Done! Check your Sentry dashboard for metrics.');
  process.exit(0);
}).catch((err) => {
  console.error('Error flushing Sentry:', err);
  process.exit(1);
});
