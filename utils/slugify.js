/**
 * Arabic-friendly slug generation utility
 *
 * Creates URL-safe slugs by transliterating Arabic to Latin characters.
 * This ensures URLs remain human-readable when shared/copied.
 */

/**
 * Arabic to Latin transliteration map
 * Based on simplified practical romanization for URLs
 */
const ARABIC_TO_LATIN = {
  // Letters
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a',
  'ب': 'b',
  'ت': 't',
  'ث': 'th',
  'ج': 'j',
  'ح': 'h',
  'خ': 'kh',
  'د': 'd',
  'ذ': 'dh',
  'ر': 'r',
  'ز': 'z',
  'س': 's',
  'ش': 'sh',
  'ص': 's',
  'ض': 'd',
  'ط': 't',
  'ظ': 'z',
  'ع': 'a',
  'غ': 'gh',
  'ف': 'f',
  'ق': 'q',
  'ك': 'k',
  'ل': 'l',
  'م': 'm',
  'ن': 'n',
  'ه': 'h',
  'و': 'w',
  'ي': 'y',
  'ى': 'a',
  'ة': 'a',
  'ء': '',
  'ئ': 'y',
  'ؤ': 'w',
  // Diacritics (tashkeel) - remove them
  '\u064B': '', // fathatan
  '\u064C': '', // dammatan
  '\u064D': '', // kasratan
  '\u064E': '', // fatha
  '\u064F': '', // damma
  '\u0650': '', // kasra
  '\u0651': '', // shadda
  '\u0652': '', // sukun
  // Common Arabic punctuation
  '،': '',
  '؛': '',
  '؟': '',
};

/**
 * Transliterate Arabic text to Latin characters
 * @param {string} text - Arabic text
 * @returns {string} - Romanized text
 */
function transliterateArabic(text) {
  if (!text) return '';

  let result = '';
  const chars = [...text]; // Handle Unicode properly

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];

    // Handle "ال" (definite article) specially
    if (char === 'ا' && chars[i + 1] === 'ل') {
      // Check for sun letters that assimilate the "l"
      const nextLetter = chars[i + 2];
      const sunLetters = 'تثدذرزسشصضطظنل';
      if (nextLetter && sunLetters.includes(nextLetter)) {
        result += 'a';
        i++; // Skip the ل
        continue;
      }
      result += 'al';
      i++; // Skip the ل
      continue;
    }

    if (char in ARABIC_TO_LATIN) {
      result += ARABIC_TO_LATIN[char];
    } else {
      result += char;
    }
  }

  return result;
}

/**
 * Generate a slug from Arabic or English text
 * @param {string} text - The text to slugify
 * @returns {string} - URL-safe slug (Latin characters only)
 */
function generateSlug(text) {
  if (!text) return '';

  // First transliterate Arabic to Latin
  let slug = transliterateArabic(text.toString().trim());

  return slug
    // Normalize Unicode characters
    .normalize('NFKC')
    // Replace multiple spaces/underscores with single hyphen
    .replace(/[\s_]+/g, '-')
    // Keep only alphanumeric and hyphens
    .replace(/[^a-zA-Z0-9-]/g, '')
    // Remove multiple consecutive hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Lowercase
    .toLowerCase();
}

/**
 * Generate English slug (transliterated from Arabic or from English text)
 * Used for the slug_en field in the new URL architecture
 * @param {string} text - Arabic or English text
 * @returns {string} - URL-safe English slug
 */
function generateSlugEn(text) {
  if (!text) return '';

  // Transliterate Arabic to Latin first
  let slug = transliterateArabic(text.toString().trim());

  return slug
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate Arabic slug (kebab-case Arabic)
 * Used for the slug_ar field in the new URL architecture
 * Preserves Arabic characters, numbers, and hyphens
 * @param {string} text - Arabic text
 * @returns {string} - Arabic slug with hyphens instead of spaces
 */
function generateSlugAr(text) {
  if (!text) return '';

  return text
    .toString()
    .trim()
    // Replace spaces with hyphens
    .replace(/\s+/g, '-')
    // Keep only Arabic characters (main range + extended), numbers, and hyphens
    .replace(/[^\u0600-\u06FF\u0750-\u077F0-9-]/g, '')
    // Remove multiple consecutive hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-|-$/g, '');
}

/**
 * Generate a unique slug by checking against existing slugs
 * @param {string} baseSlug - The base slug to make unique
 * @param {Function} checkExists - Async function that returns true if slug exists
 * @returns {Promise<string>} - Unique slug
 */
async function generateUniqueSlug(baseSlug, checkExists) {
  let slug = baseSlug;
  let counter = 1;

  while (await checkExists(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;

    // Safety limit to prevent infinite loops
    if (counter > 100) {
      // Append timestamp for guaranteed uniqueness
      slug = `${baseSlug}-${Date.now()}`;
      break;
    }
  }

  return slug;
}

/**
 * Generate slug for a Lecture
 * Format: series-name-lecture-number or just title if no series
 * @param {Object} lecture - Lecture document
 * @param {Object} series - Series document (optional)
 * @returns {string} - Generated slug
 */
function generateLectureSlug(lecture, series) {
  if (series && lecture.lectureNumber) {
    // Format: series-slug-الدرس-N
    const seriesSlug = generateSlug(series.titleArabic);
    return `${seriesSlug}-الدرس-${lecture.lectureNumber}`;
  }

  // Fallback to lecture title
  return generateSlug(lecture.titleArabic);
}

/**
 * Generate slug for a Series
 * @param {Object} series - Series document
 * @returns {string} - Generated slug
 */
function generateSeriesSlug(series) {
  return generateSlug(series.titleArabic);
}

/**
 * Generate slug for a Sheikh
 * @param {Object} sheikh - Sheikh document
 * @returns {string} - Generated slug
 */
function generateSheikhSlug(sheikh) {
  // Remove honorifics for cleaner URLs
  const name = sheikh.nameArabic
    .replace(/الشيخ\s*/g, '')
    .replace(/حفظه الله/g, '')
    .replace(/رحمه الله/g, '')
    .trim();

  return generateSlug(name);
}

module.exports = {
  generateSlug,
  generateSlugEn,
  generateSlugAr,
  generateUniqueSlug,
  generateLectureSlug,
  generateSeriesSlug,
  generateSheikhSlug,
  transliterateArabic
};
