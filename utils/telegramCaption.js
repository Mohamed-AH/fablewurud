/**
 * Telegram caption builder for lecture/khutba audio posts.
 *
 * Mirrors the channel's existing post formats (see the owner's export). Two
 * templates:
 *   - Lesson (default): book title, author, lesson ordinal + Hijri, location,
 *     sheikh block, duration, footer.
 *   - Khutba (Friday sermon): #خطبة_الجمعة header, the sermon title (taken from
 *     the LECTURE, not the catch-all series), location line, preacher line, dated
 *     Friday, duration, framed footer + "previous lectures" box. No author / no
 *     الدرس / no lesson number (each sermon is identified by its own title).
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

// Website box shown in every post (owner request). Dotted frame.
const SITE_BOX = [
  '📌 للاستماع إلى المحاضرات السابقة تفضل بزيارة الموقع:',
  '╭─═┅┅┅┅┅┅┅═─╮',
  'https://www.rasmihassan.com',
  '╰─═┅┅┅┅┅┅┅═─╯'
];

// Fixed footer for lesson posts (self-link omitted — only exists post-publish).
const LESSON_FOOTER = [
  '📌 للاستماع عبر التلجرام:',
  '╭─═┅┅┅┅┅┅┅═─╮',
  'https://t.me/daririhasan',
  '╰─═┅┅┅┅┅┅┅═─╯',
  '',
  '📌 رابط القناة على الواتساب:',
  '╭─═┅┅┅┅┅┅┅═─╮',
  'https://chat.whatsapp.com/DUvpoPZFcBk22nVL1nIrVg',
  '╰─═┅┅┅┅┅┅┅═─╯',
  '',
  ...SITE_BOX,
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
  ...SITE_BOX,
  '',
  '📤 ساهم في نشر الخير، فالدال على الخير كفاعله ✅'
].join('\n');

/**
 * Sermon title for a khutba post. Prefers the LECTURE title (each Friday sermon
 * has its own title, e.g. "خطب الجمعة - الدفاع عن بلادنا السعودية"), stripping a
 * leading "خطب[ة] [الجمعة] -/:" prefix. Falls back to the series title only when
 * the lecture has no distinct sermon title.
 */
function khutbaTitle(lecture, series) {
  const strip = (s) => (s || '').replace(/^\s*خطب(?:ة)?\s*(?:الجمعة)?\s*[-–—:]*\s*/, '').trim();
  const fromLecture = strip(lecture && lecture.titleArabic);
  if (fromLecture) return fromLecture;
  const fromSeries = strip(series && series.titleArabic);
  return fromSeries || (lecture && lecture.titleArabic) || (series && series.titleArabic) || '';
}

function buildKhutbaCaption(lecture, series) {
  const title = khutbaTitle(lecture, series);
  const hijri = lecture.dateRecordedHijri || '{التاريخ}';
  const dur = fmtDuration(lecture.duration) || '{المدة}';
  const location = (lecture.location && lecture.location !== 'غير محدد') ? lecture.location : 'جامع الورود';

  return [
    '🔹 #خطبة_الجمعة 🔹',
    '',
    '🎙 عنوان الخطبة:',
    ` ${title}`,
    `ب${location} حي الورود جدة`,
    '',
    'لفضيلة الشيخ: حسن بن محمد منصور الدغريري – حفظه الله –',
    '',
    `🗓 التاريخ: الجمعة ${hijri}`,
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
