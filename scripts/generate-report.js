#!/usr/bin/env node
/**
 * Generate a print-ready HTML report of all content — series, lectures,
 * homepage sections, articles, and the PDF library (books) — with Hijri dates
 * shown wherever a date is available.
 *
 * The HTML is built by the shared, DB-free utils/contentReport.js (also used by
 * the admin panel's report buttons); this script only handles the DB fetch and
 * writing the file.
 *
 * Usage:
 *   node scripts/generate-report.js [options]
 *
 * Options:
 *   --env FILE        Path to .env file (default: .env)
 *   --output FILE     Output HTML file (default: report.html, or report-<realm>.html with --realm)
 *   --realm NAME      Scope the whole report to one scholar: "najmi" or "hasan"
 *                     (default: both realms in one report)
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const fs = require('fs');
const mongoose = require('mongoose');
const { buildReportHtml } = require('../utils/contentReport');

const args = process.argv.slice(2);
const realmIndex = args.indexOf('--realm');
const realmFilterArg = realmIndex !== -1 ? String(args[realmIndex + 1] || '').toLowerCase() : null;
if (realmFilterArg && !['najmi', 'hasan'].includes(realmFilterArg)) {
  console.error('Error: --realm must be "najmi" or "hasan"');
  process.exit(1);
}
const outputIndex = args.indexOf('--output');
const OUTPUT = outputIndex !== -1
  ? args[outputIndex + 1]
  : (realmFilterArg ? `report-${realmFilterArg}.html` : 'report.html');

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  console.log('Connecting to database...');
  await mongoose.connect(process.env.MONGODB_URI);

  const Series = mongoose.model('Series', new mongoose.Schema({}, { collection: 'series', strict: false }));
  const Lecture = mongoose.model('Lecture', new mongoose.Schema({}, { collection: 'lectures', strict: false }));
  const Section = mongoose.model('Section', new mongoose.Schema({}, { collection: 'sections', strict: false }));
  const Sheikh = mongoose.model('Sheikh', new mongoose.Schema({}, { collection: 'sheikhs', strict: false }));
  const Article = mongoose.model('Article', new mongoose.Schema({}, { collection: 'articles', strict: false }));
  const Publication = mongoose.model('Publication', new mongoose.Schema({}, { collection: 'publications', strict: false }));

  console.log('Fetching data...');

  const [series, lectures, sections, sheikhs, articles, publications] = await Promise.all([
    Series.find({}).sort({ titleArabic: 1 }).lean(),
    Lecture.find({}).sort({ seriesId: 1, sortOrder: 1, lectureNumber: 1, createdAt: 1 }).lean(),
    Section.find({}).sort({ displayOrder: 1 }).lean(),
    Sheikh.find({}).lean(),
    Article.find({}).sort({ publishedAt: -1 }).lean(),
    Publication.find({}).sort({ category: 1, title: 1 }).lean()
  ]);

  await mongoose.disconnect();
  console.log(`Fetched: ${series.length} series, ${lectures.length} lectures, ${sections.length} sections, ${articles.length} articles, ${publications.length} publications`);

  const html = buildReportHtml({ series, lectures, sections, sheikhs, articles, publications, realm: realmFilterArg });

  fs.writeFileSync(OUTPUT, html, 'utf-8');
  console.log(`\nReport saved: ${OUTPUT}`);
  console.log(`Open in browser and print to PDF (Ctrl+P)`);
}

main().catch(err => {
  console.error('Error:', err.message);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
