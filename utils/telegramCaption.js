/**
 * Telegram caption builder for lecture audio posts.
 *
 * Mirrors the channel's existing post format (see the owner's export): book
 * title, author, lesson ordinal + Hijri date, location, the fixed sheikh block,
 * audio duration, and the channel/WhatsApp footer. Used by /admin/manage so the
 * admin can one-click copy a ready caption while posting to Telegram.
 */

const { arabicOrdinalMasculine } = require('./arabicOrdinal');

/** Seconds → "mm:ss" (Telegram style, e.g. 7:43). Empty when unknown. */
function fmtDuration(sec) {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Fixed footer (from the owner's channel). The per-post self-link is omitted —
// its message id only exists after posting.
const FOOTER = [
  '📌 للاستماع عبر التلجرام:',
  'https://t.me/daririhasan',
  '',
  '📌 رابط القناة على الواتساب:',
  'https://chat.whatsapp.com/DUvpoPZFcBk22nVL1nIrVg',
  '',
  '↩️ أسهم في إعادة نشر هذه الرسالة',
  '✅ "فالدال على الخير كفاعله"'
].join('\n');

/**
 * Build the ready-to-paste Telegram caption for a lecture.
 * @param {Object} lecture - lean lecture (lectureNumber, dateRecordedHijri, location, duration, titleArabic)
 * @param {Object} [series] - populated series (bookTitle, bookAuthor, titleArabic)
 * @returns {string}
 */
function buildTelegramCaption(lecture, series) {
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
    FOOTER
  ].join('\n');
}

module.exports = { buildTelegramCaption, fmtDuration };
