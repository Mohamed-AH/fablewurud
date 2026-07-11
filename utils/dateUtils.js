/**
 * Date Utilities
 * Handles Gregorian to Hijri date conversion
 */

const moment = require('moment-hijri');

/**
 * Convert a Gregorian date to Hijri format
 * @param {Date|string} gregorianDate - The Gregorian date to convert
 * @returns {string|null} Hijri date in format "YYYY/MM/DD" (e.g., "1445/06/15") or null if invalid
 */
function convertToHijri(gregorianDate) {
  if (!gregorianDate) return null;

  try {
    const hijriMoment = moment(gregorianDate);
    if (!hijriMoment.isValid()) return null;

    // Format: 1445/06/15
    return hijriMoment.format('iYYYY/iMM/iDD');
  } catch (error) {
    console.error('Hijri conversion error:', error.message);
    return null;
  }
}

/**
 * Ensure a lecture object has its Hijri date set
 * If dateRecorded exists but dateRecordedHijri is missing, auto-convert
 * @param {Object} lectureData - The lecture data object
 * @returns {Object} Updated lecture data with dateRecordedHijri set
 */
function ensureHijriDate(lectureData) {
  // If there's no Gregorian date, nothing to convert
  if (!lectureData.dateRecorded) {
    return lectureData;
  }

  // If Hijri date is already set and non-empty, keep it
  if (lectureData.dateRecordedHijri && lectureData.dateRecordedHijri.trim()) {
    return lectureData;
  }

  // Auto-convert Gregorian to Hijri
  const hijriDate = convertToHijri(lectureData.dateRecorded);
  if (hijriDate) {
    lectureData.dateRecordedHijri = hijriDate;
  }

  return lectureData;
}

module.exports = {
  convertToHijri,
  ensureHijriDate
};
