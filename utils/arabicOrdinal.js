/**
 * Arabic ordinal numbers (masculine form) for auto-generated lecture titles.
 *
 * Used for lesson titles like "<series> - الخامس عشر" (lesson 15). Masculine
 * because the implied noun is "الدرس" (masculine). Supported range is 1..300;
 * outside that range the caller should fall back to a plain numeral (the range
 * was an owner decision — ordinals past ~300 get unwieldy in a title).
 *
 * NOTE: a compact copy of this logic is inlined in
 * views/admin/quick-add-lecture.ejs for the live title preview. If you change
 * the wording here, update that copy too.
 */

'use strict';

// Standalone ones (1-9): "الأول" for 1.
const ONES_STANDALONE = [
  '', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس',
  'السادس', 'السابع', 'الثامن', 'التاسع'
];

// Ones used inside compounds (teens, tens+units, hundreds+remainder): "الحادي" for 1.
const ONES_COMPOUND = [
  '', 'الحادي', 'الثاني', 'الثالث', 'الرابع', 'الخامس',
  'السادس', 'السابع', 'الثامن', 'التاسع'
];

// Tens (index 2..9 → 20..90).
const TENS = [
  '', '', 'العشرون', 'الثلاثون', 'الأربعون', 'الخمسون',
  'الستون', 'السبعون', 'الثمانون', 'التسعون'
];

/**
 * Ordinal for 1..99.
 * @param {number} n
 * @param {boolean} compoundOnes - when true, a bare 1 renders as "الحادي"
 *   (used when this value is itself part of a larger compound, e.g. "... بعد المائة").
 * @returns {string}
 */
function ordinalUnder100(n, compoundOnes) {
  if (n <= 9) {
    return compoundOnes ? ONES_COMPOUND[n] : ONES_STANDALONE[n];
  }
  if (n === 10) return 'العاشر';
  if (n <= 19) {
    return ONES_COMPOUND[n - 10] + ' عشر';
  }
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  if (unit === 0) return TENS[tens];
  // e.g. 21 → "الحادي والعشرون"
  return ONES_COMPOUND[unit] + ' و' + TENS[tens];
}

/**
 * Masculine ordinal word for 1..300, or null if out of range.
 * @param {number} n
 * @returns {string|null}
 */
function arabicOrdinalMasculine(n) {
  if (!Number.isInteger(n) || n < 1 || n > 300) return null;

  if (n < 100) return ordinalUnder100(n, false);
  if (n === 100) return 'المائة';
  if (n < 200) return ordinalUnder100(n - 100, true) + ' بعد المائة';
  if (n === 200) return 'المائتان';
  if (n < 300) return ordinalUnder100(n - 200, true) + ' بعد المائتين';
  return 'الثلاثمائة'; // n === 300
}

module.exports = { arabicOrdinalMasculine };
