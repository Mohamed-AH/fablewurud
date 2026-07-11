/**
 * Arabic Search Utilities
 * Normalization, tokenization, and variant generation for Arabic text search
 */

// Arabic stopwords to filter out
const STOPWORDS = new Set([
  'بن', 'ابن', 'بنت', 'ال', 'و', 'في', 'على', 'من', 'عن',
  'الى', 'إلى', 'مع', 'ثم', 'او', 'أو', 'هذا', 'هذه', 'ذلك', 'تلك'
]);

// Common word fixes
const WORD_FIXES = {
  'اشيخ': 'الشيخ',
  'النجمين': 'النجمي',
  'يحياء': 'يحيى'
};

/**
 * Remove Arabic diacritics (tashkeel)
 */
function removeDiacritics(text) {
  // Arabic diacritics range: 0x064B - 0x065F
  return text.replace(/[\u064B-\u065F\u0670]/g, '');
}

/**
 * Normalize Hamza variants to base forms
 */
function normalizeHamza(text) {
  return text
    .replace(/[أإآ]/g, 'ا')  // Hamza on/under alif -> bare alif
    .replace(/ؤ/g, 'و')      // Hamza on waw -> waw
    .replace(/ئ/g, 'ي');     // Hamza on ya -> ya
}

/**
 * Normalize Ya variants (alif maqsura <-> ya)
 */
function normalizeYa(text) {
  return text.replace(/ى/g, 'ي');
}

/**
 * Normalize Ta marbuta to Ha
 */
function normalizeTaMarbuta(text) {
  return text.replace(/ة/g, 'ه');
}

/**
 * Full Arabic text normalization
 */
function normalizeArabic(text) {
  if (!text) return '';

  let normalized = text.trim();
  normalized = removeDiacritics(normalized);
  normalized = normalizeHamza(normalized);
  normalized = normalizeYa(normalized);
  // Note: Ta marbuta normalization is optional, not always desired

  return normalized;
}

/**
 * Apply common word fixes
 */
function applyWordFixes(text) {
  let result = text;
  for (const [wrong, correct] of Object.entries(WORD_FIXES)) {
    result = result.replace(new RegExp(wrong, 'g'), correct);
  }
  return result;
}

/**
 * Strip sheikh prefix from text
 */
function stripSheikhPrefix(text) {
  return text
    .replace(/^الشيخ\s+/g, '')
    .replace(/^شيخ\s+/g, '');
}

/**
 * Generate Hamza variants for a word
 */
function generateHamzaVariants(word) {
  const variants = new Set([word]);

  // Alif variants
  if (word.includes('ا')) {
    variants.add(word.replace(/ا/g, 'أ'));
    variants.add(word.replace(/ا/g, 'إ'));
    variants.add(word.replace(/ا/g, 'آ'));
  }
  if (word.includes('أ') || word.includes('إ') || word.includes('آ')) {
    variants.add(word.replace(/[أإآ]/g, 'ا'));
  }

  // Ya/Alif maqsura variants
  if (word.includes('ي')) {
    variants.add(word.replace(/ي/g, 'ى'));
  }
  if (word.includes('ى')) {
    variants.add(word.replace(/ى/g, 'ي'));
  }

  return Array.from(variants);
}

/**
 * Tokenize Arabic text, removing stopwords
 */
function tokenize(text) {
  if (!text) return [];

  // Split on whitespace and punctuation
  const words = text.split(/[\s\u060C\u061B\u061F.,;:!?()[\]{}'"]+/);

  // Filter out empty strings and stopwords
  return words.filter(word => {
    const trimmed = word.trim();
    return trimmed.length > 0 && !STOPWORDS.has(trimmed);
  });
}

/**
 * Build search query variants from user input
 * Returns: { normalized, tokens, variants, minShouldMatch }
 */
function buildSearchQuery(query) {
  if (!query || typeof query !== 'string') {
    return { normalized: '', tokens: [], variants: [], minShouldMatch: 0 };
  }

  // Step 1: Normalize
  let normalized = normalizeArabic(query);

  // Step 2: Apply word fixes
  normalized = applyWordFixes(normalized);

  // Step 3: Strip sheikh prefix
  const withoutSheikh = stripSheikhPrefix(normalized);

  // Step 4: Tokenize
  const tokens = tokenize(withoutSheikh);

  // Step 5: Generate variants for each token
  const allVariants = new Set();
  allVariants.add(normalized);
  allVariants.add(withoutSheikh);

  for (const token of tokens) {
    const tokenVariants = generateHamzaVariants(token);
    tokenVariants.forEach(v => allVariants.add(v));
  }

  // Add the original normalized query variants
  const queryVariants = generateHamzaVariants(normalized);
  queryVariants.forEach(v => allVariants.add(v));

  // Step 6: Calculate minShouldMatch
  const minShouldMatch = Math.min(2, tokens.length);

  return {
    normalized,
    tokens,
    variants: Array.from(allVariants).filter(v => v.length > 0),
    minShouldMatch
  };
}

/**
 * Check if text contains enough matching tokens
 */
function matchesMinTokens(text, tokens, minRequired) {
  if (!text || !tokens || tokens.length === 0) return false;

  const normalizedText = normalizeArabic(text).toLowerCase();
  let matchCount = 0;

  for (const token of tokens) {
    const normalizedToken = normalizeArabic(token).toLowerCase();
    if (normalizedText.includes(normalizedToken)) {
      matchCount++;
    }
  }

  return matchCount >= minRequired;
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Strip timestamp patterns from text (for context display)
 */
function stripTimestamps(text) {
  if (!text) return '';
  // Remove patterns like [00:00] or (00:00:00) or 00:00
  return text
    .replace(/\[?\d{1,2}:\d{2}(:\d{2})?\]?/g, '')
    .replace(/\(?\d{1,2}:\d{2}(:\d{2})?\)?/g, '')
    .trim();
}

module.exports = {
  STOPWORDS,
  WORD_FIXES,
  removeDiacritics,
  normalizeHamza,
  normalizeYa,
  normalizeTaMarbuta,
  normalizeArabic,
  applyWordFixes,
  stripSheikhPrefix,
  generateHamzaVariants,
  tokenize,
  buildSearchQuery,
  matchesMinTokens,
  formatTime,
  stripTimestamps
};
