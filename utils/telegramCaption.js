/**
 * Telegram caption builder for lecture/khutba audio posts.
 *
 * Mirrors the channel's existing post formats (see the owner's export). Two
 * templates:
 *   - Lesson (default): book title, author, lesson ordinal + Hijri, location,
 *     sheikh block, duration, footer.
 *   - Khutba (Friday sermon series): #خطبة_الجمعة header, sermon title + number,
 *     preacher line, dated Friday, duration, framed footer. No author / no الدرس.
 *
 * Used by /admin/manage so the admin can one-click copy a ready caption while
 * posting to Telegram.
 */

const { arabicOrdinalMasculine } = require('./arabicOrdinal');

/** Western digits → Arabic-indic (١٢٣…). */
const toArabicDigits = (n) => String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

/** Seconds → "mm:ss" (Telegram style, e.g. 7:43). Empty when unknown. */
function fmtDuration(sec) {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Friday-sermon series? (mirrors routes/api/homepage.js isKhutbaSeries + category). */
function isKhutba(series) {
  if (!series) return false;
  const tags = series.tags || [];
  if (tags.includes('khutba')) return true;
  if (series.category === 'Khutbah') return true;
  const title = series.titleArabic || '';
  return title.includes('خطب') || title.includes('خطبة');
}

// Fixed footer for lesson posts (self-link omitted — only exists post-publish).
const LESSON_FOOTER = [
  '📌 للاستماع عبر التلجرام:',
  'https://t.me/daririhasan',
  '',
  '📌 رابط القناة على الواتساب:',
  'https://chat.whatsapp.com/DUvpoPZFcBk22nVL1nIrVg',
  '',
  '↩️ أسهم في إعادة نشر هذه الرسالة',
  '✅ "فالدال على الخير كفاعله"'
].join('\n');

// Framed footer for khutba posts (self-link id omitted).
const KHUTBA_FOOTER = [
  '🔗 للاستماع عبر تيليجرام:',
  '╭─═━─━─━─━─━─━═─╮',
  '📥 https://t.me/daririhasan',
  '╰─═━─━─━─━─━─━═─╯',
  '',
  '🔗 رابط القناة على واتساب:',
  '╭─═━─━─━─━─━─━═─╮',
  '📲 https://chat.whatsapp.com/DUvpoPZFcBk22nVL1nIrVg',
  '╰─═━─━─━─━─━─━═─╯',
  '',
  '📤 ساهم في نشر الخير، فالدال على الخير كفاعله ✅'
].join('\n');

/** Strip a leading "خطب[ة] [الجمعة] -/:" from a series title to get the sermon title. */
function khutbaTitle(series, lecture) {
  const raw = (series && series.titleArabic) || (lecture && lecture.titleArabic) || '';
  const stripped = raw.replace(/^\s*خطب(?:ة)?\s*(?:الجمعة)?\s*[-–—:]*\s*/, '').trim();
  return stripped || raw;
}

function buildKhutbaCaption(lecture, series) {
  const title = khutbaTitle(series, lecture);
  const num = lecture.lectureNumber ? ` (${toArabicDigits(lecture.lectureNumber)})` : '';
  const hijri = lecture.dateRecordedHijri || '{التاريخ}';
  const dur = fmtDuration(lecture.duration) || '{المدة}';

  return [
    '🔹 #خطبة_الجمعة 🔹',
    '',
    '🎙 عنوان الخطبة: ',
    `          ${title}${num}`,
    '',
    'لفضيلة الشيخ: حسن بن محمد منصور الدغريري - حفظه الله -',
    '',
    `🗓 التاريخ: الجمعة ${hijri}هـ`,
    '',
    `⏱️ مدة الصوتية: ${dur} دقيقة`,
    '',
    KHUTBA_FOOTER
  ].join('\n');
}

function buildLessonCaption(lecture, series) {
  const title = (series && (series.bookTitle || series.titleArabic)) || lecture.titleArabic || '';
  const author = (series && series.bookAuthor) ? series.bookAuthor : '{المؤلف}';
  const ordinal = arabicOrdinalMasculine(lecture.lectureNumber)
    || (lecture.lectureNumber != null ? String(lecture.lectureNumber) : '');
  const lesson = ordinal ? `الدرس ${ordinal}` : '';
  const hijri = lecture.dateRecordedHijri || '';
  const location = (lecture.location && lecture.location !== 'غير محدد') ? lecture.location : 'جامع الورود';
  const dur = fmtDuration(lecture.duration) || '{المدة}';

  return [
    `🔸 ${title}`,
    `🔸 ${author}`,
    '',
    `🔹 ${lesson}${hijri ? ' - ' + hijri : ''}`,
    `ب${location}`,
    'بحي الورود بجدة',
    '',
    '       مع فضيلة الشيخ',
    '       حسن بن محمد منصور الدغريري',
    '       حفظه الله ورعاه',
    '',
    `🎙 مدة الصوتية: ${dur} دقيقة`,
    '',
    LESSON_FOOTER
  ].join('\n');
}

/**
 * Build the ready-to-paste Telegram caption for a lecture, choosing the khutba
 * or lesson template by the series.
 */
function buildTelegramCaption(lecture, series) {
  return isKhutba(series) ? buildKhutbaCaption(lecture, series) : buildLessonCaption(lecture, series);
}

module.exports = { buildTelegramCaption, fmtDuration, isKhutba };
