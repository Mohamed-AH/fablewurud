/**
 * Format a sheikh's display name with the correct honorific title prefix.
 *
 * Title storage is intentionally mixed for backward-compatibility:
 *   - Sheikh Hasan: the title is embedded in `nameArabic` ("الشيخ حسن …")
 *   - Sheikh Ahmed: `nameArabic` is the bare name, and the title lives in
 *     `titlePrefix` ("الشيخ العلامة")
 *
 * This helper prepends `titlePrefix` ONLY when the name doesn't already begin
 * with a title word, so neither convention ever double-titles.
 */
const AR_TITLE_START = /^(ال)?(شيخ|شيخة|علامة|إمام|حافظ)/;
const EN_TITLE_START = /^(sheikh|shaykh|imam|al-|the\s)/i;

function formatSheikhName(sheikh, locale = 'ar') {
  if (!sheikh) return '';

  if (locale === 'ar') {
    const name = String(sheikh.nameArabic || '').trim();
    const prefix = String(sheikh.titlePrefix || '').trim();
    if (!name) return '';
    if (!prefix || AR_TITLE_START.test(name)) return name;
    return `${prefix} ${name}`;
  }

  const name = String(sheikh.nameEnglish || sheikh.nameArabic || '').trim();
  const prefix = String(sheikh.titlePrefixEnglish || '').trim();
  if (!name) return '';
  if (!prefix || EN_TITLE_START.test(name)) return name;
  return `${prefix} ${name}`;
}

module.exports = { formatSheikhName };
