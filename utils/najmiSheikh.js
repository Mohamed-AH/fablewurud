/**
 * Resolve the Sheikh Ahmed Al-Najmi record and cache it.
 *
 * The Najmi realm is data-driven — rather than hardcode an ObjectId, we look the
 * sheikh up by his Arabic name (containing "النجمي") once and cache the result.
 * The cache holds only lightweight identity fields; callers re-query lectures /
 * series / publications by the returned _id.
 */
const { Sheikh } = require('../models');

let cached = null;
let cachedAt = 0;
const TTL_MS = 60 * 60 * 1000; // 1 hour

async function getNajmiSheikh() {
  const now = Date.now();
  if (cached && (now - cachedAt) < TTL_MS) return cached;

  const sheikh = await Sheikh.findOne({ nameArabic: /النجمي/ })
    .select('_id shortId nameArabic nameEnglish honorific titlePrefix titlePrefixEnglish bioArabic bioEnglish slug_en slug_ar photoUrl')
    .lean();

  if (sheikh) {
    cached = sheikh;
    cachedAt = now;
  }
  return sheikh;
}

// Allow tests / admin edits to force a refresh
function clearNajmiSheikhCache() {
  cached = null;
  cachedAt = 0;
}

module.exports = { getNajmiSheikh, clearNajmiSheikhCache };
