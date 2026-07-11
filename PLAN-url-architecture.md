# URL Architecture & Slug Management - Implementation Plan

## Current State Analysis

### Existing Infrastructure
- **Lecture Model** (`models/Lecture.js`): Has a `slug` field (unique, sparse indexed)
- **Series Model** (`models/Series.js`): Has a `slug` field (unique, sparse indexed)
- **No shortId field exists** in any model
- **Only single slug** field exists (no `slug_en`/`slug_ar` separation)
- **Existing slugify utility** (`utils/slugify.js`): Transliterates Arabic to Latin
- **Current URL Pattern**: `/lectures/:idOrSlug` - accepts either ObjectId or slug
- **Existing redirect logic**: `utils/findByIdOrSlug.js` handles 301 redirects from ID to slug

### Current URL Examples
```
/lectures/679c1234abc...   (ObjectId - ugly)
/lectures/sharh-altawhid-adars-5  (transliterated Arabic - no Arabic slug)
```

### Problem
- No `shortId` for clean, permanent identifiers
- Raw Arabic in URLs causes social media encoding issues
- Missing dual-language slug structure

---

## Proposed URL Pattern

```
/lectures/:shortId/:slug_en/:slug_ar
```

**Example:**
```
/lectures/102/explanation-of-tawhid-lesson-5/شرح-التوحيد-الدرس-5
```

**Benefits:**
- `102` is permanent, human-readable, shareable
- English slug is SEO-friendly and social-media safe
- Arabic slug provides native readability
- Controller queries by `shortId` only (fast, indexed)

---

## Implementation Phases

### Phase 1: Database Schema Updates

#### 1.1 Add `shortId` to Lecture Model
```javascript
// models/Lecture.js
shortId: {
  type: Number,
  unique: true,
  index: true,
  required: true
}
```

#### 1.2 Add Dual Slug Fields to Lecture Model
```javascript
slug_en: {
  type: String,
  trim: true,
  index: true
},
slug_ar: {
  type: String,
  trim: true,
  index: true
}
```

#### 1.3 Add Counter Collection for Auto-Incrementing shortId
```javascript
// models/Counter.js
const counterSchema = new mongoose.Schema({
  _id: String,  // e.g., 'lecture'
  seq: { type: Number, default: 0 }
});
```

> ⚠️ **CRITICAL: Atomic Counter Updates**
> Since MongoDB doesn't have native auto-increment, always use `findOneAndUpdate` (Mongoose) or `findAndModify` (native driver) with `$inc` to prevent race conditions. This ensures two lectures uploaded simultaneously never receive the same shortId.

#### 1.4 Updates for Series & Sheikh Models

**Series Model (`models/Series.js`):**
```javascript
shortId: { type: Number, unique: true, index: true, required: true },
slug_en: { type: String, trim: true, index: true },
slug_ar: { type: String, trim: true, index: true }
```
URL: `/series/:shortId/:slug_en/:slug_ar`
Example: `/series/15/tajweed-rules/قواعد-التجويد`

**Sheikh Model (`models/Sheikh.js`):**
```javascript
shortId: { type: Number, unique: true, index: true, required: true },
slug_en: { type: String, trim: true, index: true },
slug_ar: { type: String, trim: true, index: true }
```
URL: `/sheikhs/:shortId/:slug_en/:slug_ar`
Example: `/sheikhs/3/hassan-al-daghriri/حسن-الدغريري`

---

### Phase 2: Slug Generation Logic

#### 2.1 Update `utils/slugify.js`

**Add New Functions:**
```javascript
// Generate English slug (transliterated from Arabic)
function generateSlugEn(text) {
  return transliterateArabic(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Generate Arabic slug (kebab-case Arabic)
function generateSlugAr(text) {
  return text
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\u0600-\u06FF\u0750-\u077F0-9-]/g, '') // Keep Arabic + numbers + hyphens
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
```

#### 2.2 Auto-Generate shortId and Slugs (Pre-Save Middleware)

> ⚠️ **CRITICAL: Use Atomic Operations for shortId**
> Always use `findOneAndUpdate` with `$inc` for the counter—never fetch then increment. This prevents race conditions during simultaneous uploads.

```javascript
// Before save middleware
lectureSchema.pre('save', async function(next) {
  // Auto-assign shortId using atomic counter increment
  if (this.isNew && !this.shortId) {
    const counter = await Counter.findOneAndUpdate(
      { _id: 'lecture' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.shortId = counter.seq;
  }

  // Auto-generate slug_en if missing
  if (!this.slug_en) {
    if (this.titleEnglish) {
      this.slug_en = generateSlugEn(this.titleEnglish);
    } else {
      // Fallback: transliterate Arabic title
      this.slug_en = generateSlugEn(this.titleArabic);
    }
    // Ultimate fallback: use shortId
    if (!this.slug_en) {
      this.slug_en = `lecture-${this.shortId}`;
    }
  }

  // Auto-generate slug_ar if missing
  if (!this.slug_ar && this.titleArabic) {
    this.slug_ar = generateSlugAr(this.titleArabic);
  }

  next();
});
```

---

### Phase 3: Routing Updates

#### 3.1 Update `routes/index.js`

**Add New Route Pattern:**
```javascript
// New route: /lectures/:shortId/:slug_en?/:slug_ar?
router.get('/lectures/:shortId/:slug_en?/:slug_ar?', async (req, res) => {
  const { shortId, slug_en, slug_ar } = req.params;

  // Query by shortId only (numeric, indexed)
  const lecture = await Lecture.findOne({ shortId: parseInt(shortId, 10) })
    .populate('sheikhId', 'nameArabic nameEnglish honorific slug shortId')
    .populate('seriesId', 'titleArabic titleEnglish slug shortId')
    .lean();

  if (!lecture || !lecture.published) {
    return res.status(404).send('Lecture not found');
  }

  // SEO Redirect: if slugs don't match current values, 301 redirect
  const correctSlugEn = lecture.slug_en;
  const correctSlugAr = lecture.slug_ar;

  if (slug_en !== correctSlugEn || slug_ar !== correctSlugAr) {
    const correctUrl = `/lectures/${shortId}/${correctSlugEn}/${encodeURIComponent(correctSlugAr)}`;
    return res.redirect(301, correctUrl);
  }

  res.render('public/lecture', {
    title: lecture.titleArabic,
    lecture,
    canonicalPath: `/lectures/${shortId}/${correctSlugEn}/${encodeURIComponent(correctSlugAr)}`
  });
});

// Keep legacy route for backwards compatibility
router.get('/lectures/:idOrSlug', async (req, res) => {
  // ... existing logic ...
  // If found, 301 redirect to new URL format
  if (lecture) {
    const newUrl = `/lectures/${lecture.shortId}/${lecture.slug_en}/${encodeURIComponent(lecture.slug_ar)}`;
    return res.redirect(301, newUrl);
  }
});
```

#### 3.2 Series Routes
```javascript
// /series/:shortId/:slug_en?/:slug_ar?
router.get('/series/:shortId/:slug_en?/:slug_ar?', async (req, res) => {
  const series = await Series.findOne({ shortId: parseInt(req.params.shortId, 10) });
  // ... same pattern as lectures
});

// Legacy redirect
router.get('/series/:idOrSlug', async (req, res) => {
  // Redirect to new format
});
```

#### 3.3 Sheikh Routes
```javascript
// /sheikhs/:shortId/:slug_en?/:slug_ar?
router.get('/sheikhs/:shortId/:slug_en?/:slug_ar?', async (req, res) => {
  const sheikh = await Sheikh.findOne({ shortId: parseInt(req.params.shortId, 10) });
  // ... same pattern as lectures
});

// Legacy redirect
router.get('/sheikhs/:idOrSlug', async (req, res) => {
  // Redirect to new format
});
```

---

### Phase 4: Open Graph & Metadata Updates

#### 4.1 Update `views/layout.ejs`

**Enhanced OG Tags:**
```html
<!-- Open Graph / Facebook -->
<meta property="og:type" content="<%= typeof lecture !== 'undefined' ? 'article' : 'website' %>">
<meta property="og:url" content="https://rasmihassan.com<%= canonicalPath %>">
<meta property="og:title" content="<%= title %>">
<meta property="og:description" content="<%= typeof lecture !== 'undefined' && lecture.descriptionArabic ? lecture.descriptionArabic.substring(0, 200) : 'الموقع الرسمي للشيخ حسن بن محمد الدغريري' %>">
<meta property="og:locale" content="ar_SA">
<meta property="og:locale:alternate" content="en_US">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:url" content="https://rasmihassan.com<%= canonicalPath %>">
<meta name="twitter:title" content="<%= title %>">
```

#### 4.2 Add Lecture-Specific OG Tags in `views/public/lecture.ejs`
```html
<%# Override layout OG tags for lecture-specific metadata %>
<%
  const ogTitle = lecture.titleArabic;
  const ogDesc = lecture.descriptionArabic || lecture.seriesId?.titleArabic || '';
  const ogUrl = `https://rasmihassan.com/lectures/${lecture.shortId}/${lecture.slug_en}/${encodeURIComponent(lecture.slug_ar)}`;
%>
```

---

### Phase 5: Frontend Share/Copy Link Updates

#### 5.1 Update `views/public/lecture.ejs` Share Function

```javascript
function shareLecture() {
  // Construct clean URL using new format
  const shortId = '<%= lecture.shortId %>';
  const slugEn = '<%= lecture.slug_en %>';
  const slugAr = encodeURIComponent('<%= lecture.slug_ar %>');
  const url = `${window.location.origin}/lectures/${shortId}/${slugEn}/${slugAr}`;

  const title = '<%= lecture.titleArabic.replace(/'/g, "\\'") %>';

  if (navigator.share) {
    navigator.share({ title, url });
  } else {
    navigator.clipboard.writeText(url).then(() => {
      alert('<%= locale === "ar" ? "تم نسخ الرابط!" : "Link copied!" %>');
    });
  }
}
```

#### 5.2 Update `public/js/share.js`
Add utility function for constructing lecture URLs.

---

### Phase 6: Migration Script

#### 6.1 Create Migration Script: `scripts/migrate-url-architecture.js`

```javascript
/**
 * Migration Script for URL Architecture
 *
 * Tasks:
 * 1. Assign unique shortIds to all lectures
 * 2. Generate slug_en for all lectures
 * 3. Generate slug_ar for all lectures
 * 4. Same for Series
 */

async function migrate() {
  // 1. Initialize counter
  await Counter.findByIdAndUpdate(
    'lecture',
    { $setOnInsert: { seq: 0 } },
    { upsert: true }
  );

  // 2. Get all lectures without shortId
  const lectures = await Lecture.find({ shortId: { $exists: false } })
    .populate('seriesId')
    .sort({ createdAt: 1 });

  console.log(`Found ${lectures.length} lectures to migrate`);

  for (const lecture of lectures) {
    // Get next shortId
    const counter = await Counter.findByIdAndUpdate(
      'lecture',
      { $inc: { seq: 1 } },
      { new: true }
    );

    // Generate slugs
    const slug_en = generateSlugEn(lecture.titleEnglish || lecture.titleArabic);
    const slug_ar = generateSlugAr(lecture.titleArabic);

    await Lecture.updateOne(
      { _id: lecture._id },
      {
        $set: {
          shortId: counter.seq,
          slug_en: slug_en || `lecture-${counter.seq}`,
          slug_ar: slug_ar
        }
      }
    );

    console.log(`Migrated: ${counter.seq} - ${lecture.titleArabic}`);
  }
}
```

---

## File Changes Summary

| File | Changes |
|------|---------|
| `models/Lecture.js` | Add `shortId`, `slug_en`, `slug_ar` fields + pre-save middleware |
| `models/Series.js` | Add `shortId`, `slug_en`, `slug_ar` fields + pre-save middleware |
| `models/Sheikh.js` | Add `shortId`, `slug_en`, `slug_ar` fields + pre-save middleware |
| `models/Counter.js` | New file for auto-increment counter (atomic operations) |
| `utils/slugify.js` | Add `generateSlugEn()`, `generateSlugAr()` functions |
| `utils/findByIdOrSlug.js` | Update to handle new shortId lookups |
| `routes/index.js` | Add new route patterns for lectures, series, sheikhs + legacy redirects |
| `views/layout.ejs` | Enhanced OG meta tags |
| `views/public/lecture.ejs` | Update share function + add lecture-specific OG tags |
| `views/public/series.ejs` | Update share function for series |
| `views/public/sheikh.ejs` | Update share function for sheikh |
| `public/js/share.js` | Add URL construction utilities |
| `scripts/migrate-url-architecture.js` | New migration script (lectures, series, sheikhs) |
| `scripts/cleanup-legacy-slugs.js` | Final cleanup script (Phase 4 - remove old `slug` field) |

---

## Testing Checklist

**Lectures:**
- [ ] shortId auto-increments correctly for new lectures
- [ ] slug_en is always present (never empty)
- [ ] slug_ar preserves Arabic characters correctly
- [ ] SEO redirects work (old URLs → new URLs with 301)
- [ ] Legacy ObjectId URLs redirect to new format
- [ ] No duplicate shortIds after migration

**Series:**
- [ ] shortId auto-increments correctly for new series
- [ ] Dual slugs generate correctly
- [ ] `/series/:shortId/:slug_en/:slug_ar` routes work
- [ ] Legacy series URLs redirect properly

**Sheikhs:**
- [ ] shortId auto-increments correctly for new sheikhs
- [ ] Dual slugs generate correctly
- [ ] `/sheikhs/:shortId/:slug_en/:slug_ar` routes work
- [ ] Legacy sheikh URLs redirect properly

**Race Condition Testing:**
- [ ] Concurrent lecture uploads get unique shortIds (no duplicates)
- [ ] Counter atomic increment works under load

**Frontend & SEO:**
- [ ] Open Graph previews show correctly on WhatsApp/Facebook/Twitter
- [ ] Share button copies clean URL (all entity types)
- [ ] Sitemap generates correct new URLs
- [ ] URLs truncated by social media still show readable English slug

---

## Migration Strategy for Existing `slug` Field

**Decision: Migrate and Delete (Option A)**

1. **Phase 1**: Copy existing `slug` values to `slug_en` field
2. **Phase 2**: Deploy new URL routing with legacy redirects
3. **Phase 3**: Monitor for 2-4 weeks to ensure all legacy links are being redirected
4. **Phase 4**: Remove `slug` field from schema and database

```javascript
// Final cleanup migration (after Phase 3 monitoring)
await Lecture.updateMany({}, { $unset: { slug: 1 } });
```

---

## Post-Migration Considerations

**Sitemap:**
- Update `sitemap.xml` to reflect new URL structure after migration
- Ensures Google indexes the "pretty" versions with shortId and dual slugs
- Remove old URL patterns from sitemap once legacy redirects are stable

**Analytics:**
- URL-based page view tracking will see a "split" between old and new URLs
- Create a filter/grouping that aggregates page views by `shortId` instead of full URL
- Consider adding `shortId` as a custom dimension for cleaner reporting

---

## Rollback Plan

1. Keep `slug` field during transition (don't delete until Phase 4)
2. Add feature flag to switch between old/new routing
3. Maintain legacy route handler for backwards compatibility
4. Database migration is additive (doesn't delete data initially)

---

## Decisions (Confirmed)

1. **shortId format**: ✅ **Numeric** (`102`)
   - Feels like a "Lesson Number" or "Reference ID" for an educational platform
   - Easier for users to dictate over phone or write down than alphanumeric strings

2. **Series/Sheikh URLs**: ✅ **Yes, apply same pattern**
   - Series: `/series/15/tajweed-rules/قواعد-التجويد`
   - Sheikhs: `/sheikhs/3/hassan-al-daghriri/حسن-الدغريري`
   - Consistency reinforces brand and makes "Copy Link" behavior predictable

3. **Existing slugs**: ✅ **Option A (Migrate and Delete)**
   - Migrate data to `slug_en` and eventually delete old `slug` field
   - Keeping both creates "split-brain" syndrome for developers
   - Phase 3.1 legacy redirect handler bridges the gap without cluttering the database

4. **URL Priority**: ✅ **English First**
   - Pattern: `/:shortId/:slug_en/:slug_ar`
   - If social media/messaging truncates the URL, the readable English slug stays intact
   - Avoids broken `%D8%` characters in truncated URLs
