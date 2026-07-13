#!/usr/bin/env node
/**
 * Generate a print-ready HTML report of all series, lectures, and sections
 *
 * Usage:
 *   node scripts/generate-report.js [options]
 *
 * Options:
 *   --env FILE        Path to .env file (default: .env)
 *   --output FILE     Output HTML file (default: report.html)
 */

const argsForEnv = process.argv.slice(2);
const envIndex = argsForEnv.indexOf('--env');
const envPath = envIndex !== -1 ? argsForEnv[envIndex + 1] : '.env';

require('dotenv').config({ path: envPath });

const fs = require('fs');
const mongoose = require('mongoose');

const args = process.argv.slice(2);
const outputIndex = args.indexOf('--output');
const OUTPUT = outputIndex !== -1 ? args[outputIndex + 1] : 'report.html';

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  console.log('Connecting to database...');
  await mongoose.connect(process.env.MONGODB_URI);

  const Series = mongoose.model('Series', new mongoose.Schema({
    titleArabic: String, titleEnglish: String, category: String,
    lectureCount: Number, isVisible: Boolean, tags: [String],
    sectionId: mongoose.Schema.Types.ObjectId, sectionOrder: Number,
    parentSeriesId: mongoose.Schema.Types.ObjectId,
    sheikhId: mongoose.Schema.Types.ObjectId
  }, { collection: 'series', strict: false }));

  const Lecture = mongoose.model('Lecture', new mongoose.Schema({
    titleArabic: String, titleEnglish: String, audioFileName: String,
    audioUrl: String, seriesId: mongoose.Schema.Types.ObjectId,
    published: Boolean, category: String, sortOrder: Number,
    lectureNumber: Number, duration: Number, dateRecorded: Date,
    sheikhId: mongoose.Schema.Types.ObjectId
  }, { collection: 'lectures', strict: false }));

  const Section = mongoose.model('Section', new mongoose.Schema({
    title: { ar: String, en: String }, slug: String,
    displayOrder: Number, isVisible: Boolean, icon: String,
    collapsedByDefault: Boolean, maxVisible: Number
  }, { collection: 'sections', strict: false }));

  const Sheikh = mongoose.model('Sheikh', new mongoose.Schema({
    nameArabic: String, nameEnglish: String
  }, { collection: 'sheikhs', strict: false }));

  console.log('Fetching data...');

  const [allSeries, allLectures, allSections, allSheikhs] = await Promise.all([
    Series.find({}).sort({ titleArabic: 1 }).lean(),
    Lecture.find({}).sort({ seriesId: 1, sortOrder: 1, lectureNumber: 1, createdAt: 1 }).lean(),
    Section.find({}).sort({ displayOrder: 1 }).lean(),
    Sheikh.find({}).lean()
  ]);

  await mongoose.disconnect();
  console.log(`Fetched: ${allSeries.length} series, ${allLectures.length} lectures, ${allSections.length} sections`);

  const sheikhMap = {};
  allSheikhs.forEach(s => { sheikhMap[s._id.toString()] = s.nameArabic || s.nameEnglish; });

  const sectionMap = {};
  allSections.forEach(s => { sectionMap[s._id.toString()] = s; });

  const seriesMap = {};
  allSeries.forEach(s => { seriesMap[s._id.toString()] = s; });

  const lecturesBySeries = {};
  const standaloneLectures = [];
  allLectures.forEach(l => {
    if (l.seriesId) {
      const key = l.seriesId.toString();
      if (!lecturesBySeries[key]) lecturesBySeries[key] = [];
      lecturesBySeries[key].push(l);
    } else {
      standaloneLectures.push(l);
    }
  });

  const publishedCount = allLectures.filter(l => l.published).length;
  const unpublishedCount = allLectures.length - publishedCount;
  const withAudio = allLectures.filter(l => l.audioUrl).length;
  const withoutAudio = allLectures.length - withAudio;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  function formatDuration(seconds) {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Build HTML
  let html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>تقرير المحتوى - ${dateStr}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Cairo', sans-serif; font-size: 14px; color: #222; background: #fff; padding: 20px; line-height: 1.6; }
  h1 { font-size: 26px; text-align: center; margin-bottom: 4px; color: #2C1508; }
  .subtitle { text-align: center; color: #666; font-size: 15px; margin-bottom: 20px; }
  h2 { font-size: 20px; color: #2C1508; border-bottom: 2px solid #C49A3C; padding-bottom: 4px; margin: 24px 0 12px; page-break-after: avoid; }
  h3 { font-size: 16px; color: #5A6944; margin: 16px 0 6px; page-break-after: avoid; }

  .stats-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-bottom: 20px; }
  .stat-box { background: #FDF8F2; border: 1px solid #DEC99A; border-radius: 8px; padding: 10px 18px; text-align: center; min-width: 100px; }
  .stat-num { font-size: 24px; font-weight: 700; color: #C49A3C; }
  .stat-label { font-size: 13px; color: #7A5C3A; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
  th { background: #2C1508; color: #fff; padding: 6px 8px; text-align: right; font-weight: 600; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr:nth-child(even) { background: #FDFAF5; }
  tr.series-header { background: #F5EDE0; font-weight: 600; }
  .mono { font-family: 'Courier New', monospace; font-size: 10px; direction: ltr; text-align: left; word-break: break-all; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 9px; }
  .badge-published { background: #d4edda; color: #155724; }
  .badge-draft { background: #fff3cd; color: #856404; }
  .badge-no-audio { background: #f8d7da; color: #721c24; }
  .section-box { background: #FDF8F2; border: 1px solid #DEC99A; border-radius: 8px; padding: 16px; margin-bottom: 14px; font-size: 16px; }
  .section-series { margin: 6px 0 0 16px; font-size: 14px; color: #555; line-height: 1.8; }
  .notes-box { border: 1px dashed #C49A3C; border-radius: 8px; padding: 16px; margin-top: 10px; min-height: 60px; }
  .notes-label { font-size: 13px; color: #999; }

  @media print {
    body { padding: 10px; font-size: 11px; }
    .no-print { display: none; }
    h2 { break-after: avoid; }
    table { break-inside: auto; }
    tr { break-inside: avoid; }
    .section-box { break-inside: avoid; }
  }
  @page { margin: 15mm 10mm; size: A4; }
</style>
</head>
<body>

<h1>تقرير محتوى موقع الشيخ حسن بن محمد منصور الدغريري</h1>
<p class="subtitle">تاريخ التقرير: ${dateStr}</p>

<div class="stats-row">
  <div class="stat-box"><div class="stat-num">${allSeries.length}</div><div class="stat-label">سلسلة</div></div>
  <div class="stat-box"><div class="stat-num">${allLectures.length}</div><div class="stat-label">محاضرة</div></div>
  <div class="stat-box"><div class="stat-num">${publishedCount}</div><div class="stat-label">منشورة</div></div>
  <div class="stat-box"><div class="stat-num">${unpublishedCount}</div><div class="stat-label">مسودة</div></div>
  <div class="stat-box"><div class="stat-num">${withAudio}</div><div class="stat-label">بصوت</div></div>
  <div class="stat-box"><div class="stat-num">${withoutAudio}</div><div class="stat-label">بدون صوت</div></div>
</div>
`;

  // --- Section 1: Sections ---
  html += `<h2>١. أقسام الصفحة الرئيسية (${allSections.length} أقسام)</h2>\n`;

  for (const section of allSections) {
    const seriesInSection = allSeries.filter(s => s.sectionId && s.sectionId.toString() === section._id.toString())
      .sort((a, b) => (a.sectionOrder || 0) - (b.sectionOrder || 0));

    html += `<div class="section-box">
  <strong>${esc(section.title.ar)}</strong> (${esc(section.title.en)})
  — ${section.isVisible ? 'ظاهر' : 'مخفي'} | ترتيب: ${section.displayOrder} | الحد الأقصى: ${section.maxVisible}
  ${section.collapsedByDefault ? '| مطوي افتراضياً' : ''}
  <div class="section-series">`;

    if (seriesInSection.length === 0) {
      html += `<em>لا توجد سلاسل مضافة</em>`;
    } else {
      for (const s of seriesInSection) {
        const count = (lecturesBySeries[s._id.toString()] || []).length;
        html += `${esc(s.titleArabic)} [${count}]<br>`;
      }
    }

    html += `</div>
  <div class="notes-box"><span class="notes-label">ملاحظات / تعديلات مطلوبة:</span></div>
</div>\n`;
  }

  // Unassigned series
  const unassigned = allSeries.filter(s => !s.sectionId);
  if (unassigned.length > 0) {
    html += `<div class="section-box" style="border-color: #f8d7da;">
  <strong>سلاسل بدون قسم (${unassigned.length})</strong>
  <div class="section-series">`;
    for (const s of unassigned) {
      const count = (lecturesBySeries[s._id.toString()] || []).length;
      html += `${esc(s.titleArabic)} [${count}]<br>`;
    }
    html += `</div>
  <div class="notes-box"><span class="notes-label">ملاحظات / تعديلات مطلوبة:</span></div>
</div>\n`;
  }

  // --- Section 2: Series Summary ---
  html += `<h2>٢. ملخص السلاسل (${allSeries.length} سلسلة)</h2>
<table>
<tr><th>#</th><th>اسم السلسلة</th><th>التصنيف</th><th>القسم</th><th>المحاضرات</th><th>الحالة</th></tr>\n`;

  allSeries.sort((a, b) => (a.titleArabic || '').localeCompare(b.titleArabic || '', 'ar'));
  allSeries.forEach((s, i) => {
    const count = (lecturesBySeries[s._id.toString()] || []).length;
    const section = s.sectionId ? sectionMap[s.sectionId.toString()] : null;
    const sectionName = section ? section.title.ar : '—';
    const visibility = s.isVisible === false ? 'مخفي' : 'ظاهر';

    html += `<tr>
  <td>${i + 1}</td>
  <td>${esc(s.titleArabic)}</td>
  <td>${esc(s.category || 'Other')}</td>
  <td>${esc(sectionName)}</td>
  <td style="text-align:center">${count}</td>
  <td>${visibility}</td>
</tr>\n`;
  });

  html += `</table>\n`;

  // --- Section 3: All Lectures by Series ---
  html += `<h2>٣. تفصيل المحاضرات حسب السلسلة</h2>\n`;

  const sortedSeries = [...allSeries].sort((a, b) => (a.titleArabic || '').localeCompare(b.titleArabic || '', 'ar'));

  for (const series of sortedSeries) {
    const lectures = lecturesBySeries[series._id.toString()] || [];
    if (lectures.length === 0) continue;

    html += `<h3>${esc(series.titleArabic)} [${lectures.length} محاضرة]</h3>
<table>
<tr><th>#</th><th>عنوان المحاضرة</th><th>اسم الملف</th><th>المدة</th><th>الحالة</th></tr>\n`;

    lectures.forEach((l, i) => {
      const status = [];
      if (l.published) status.push('<span class="badge badge-published">منشور</span>');
      else status.push('<span class="badge badge-draft">مسودة</span>');
      if (!l.audioUrl) status.push('<span class="badge badge-no-audio">بدون صوت</span>');

      html += `<tr>
  <td>${i + 1}</td>
  <td>${esc(l.titleArabic)}</td>
  <td class="mono">${esc(l.audioFileName || '—')}</td>
  <td>${formatDuration(l.duration)}</td>
  <td>${status.join(' ')}</td>
</tr>\n`;
    });

    html += `</table>\n`;
  }

  // Standalone lectures
  if (standaloneLectures.length > 0) {
    html += `<h3>محاضرات بدون سلسلة [${standaloneLectures.length} محاضرة]</h3>
<table>
<tr><th>#</th><th>عنوان المحاضرة</th><th>اسم الملف</th><th>المدة</th><th>الحالة</th></tr>\n`;

    standaloneLectures.forEach((l, i) => {
      const status = [];
      if (l.published) status.push('<span class="badge badge-published">منشور</span>');
      else status.push('<span class="badge badge-draft">مسودة</span>');
      if (!l.audioUrl) status.push('<span class="badge badge-no-audio">بدون صوت</span>');

      html += `<tr>
  <td>${i + 1}</td>
  <td>${esc(l.titleArabic)}</td>
  <td class="mono">${esc(l.audioFileName || '—')}</td>
  <td>${formatDuration(l.duration)}</td>
  <td>${status.join(' ')}</td>
</tr>\n`;
    });

    html += `</table>\n`;
  }

  html += `
<div style="text-align: center; margin-top: 30px; padding-top: 16px; border-top: 1px solid #ddd; color: #999; font-size: 10px;">
  تم إنشاء هذا التقرير تلقائياً بتاريخ ${dateStr} — موقع الشيخ حسن بن محمد منصور الدغريري
</div>
</body>
</html>`;

  fs.writeFileSync(OUTPUT, html, 'utf-8');
  console.log(`\nReport saved: ${OUTPUT}`);
  console.log(`Open in browser and print to PDF (Ctrl+P)`);
}

main().catch(err => {
  console.error('Error:', err.message);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
