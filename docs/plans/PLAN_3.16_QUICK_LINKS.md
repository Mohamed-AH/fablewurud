# Task 3.16: Dynamic Series Section Management

## Overview

Reorganize the homepage to display series in **multiple manageable sections** (Active, Completed, Archive, Featured, etc.) instead of one long list. Each section uses the same table layout as the Weekly Schedule section.

**Problem**: ~27 active series make the current interface cluttered.
**Solution**: Group series into admin-managed sections with table view.

---

## Requirements Summary

### Homepage Layout (Top to Bottom)
1. **Hero Section** (existing)
2. **Weekly Schedule** (existing, toggleable)
3. **New Sections** (Featured, Active, Completed, Archive, etc.)
4. **Existing Tabs** (Series, Standalone, Khutbas - toggleable)

### Homepage Sections
- Multiple sections: Active, Completed, Archive, Featured, Custom
- Each section uses the **Schedule Table UI** (works well on desktop/mobile)
- Sections are collapsible or have "Show more" functionality
- **Click behavior**: Series links to `/series/:slug` (no inline expansion)

### Admin: Section Management
| Capability | Description |
|------------|-------------|
| Create/Delete | Add new sections, remove unused ones |
| Rename | Edit section titles (AR/EN) |
| Reorder | Move entire sections up/down on the page |
| Toggle Visibility | Show/hide sections as needed |

### Admin: Content Management
| Capability | Description |
|------------|-------------|
| Assign Series | Move series into sections (dropdown or drag) |
| Reorder Series | Change order within each section |
| Quick Filter | Filter series list by current section |
| Bulk Operations | Move multiple series at once (optional) |

### Admin: Homepage Configuration
| Setting | Description |
|---------|-------------|
| Show Schedule | Toggle Weekly Schedule section visibility |
| Show Series Tab | Toggle existing "Series" tab visibility |
| Show Standalone Tab | Toggle existing "Standalone" tab visibility |
| Show Khutbas Tab | Toggle existing "Khutbas" tab visibility |

### Flexibility
- Seasonal adjustments (e.g., Ramadan section appears in Ramadan)
- Easy to recategorize series as they complete or become archived

### Content Workflow
- All content organized as: **Series → Lectures**
- No need for standalone lecture handling (user will create "Standalone" series)
- Consistent URL structure via `/series/:slug`

---

## Data Model

### New Model: `Section`
```javascript
// models/Section.js
{
  title: {
    ar: { type: String, required: true },  // "السلاسل المكتملة"
    en: { type: String, required: true }   // "Completed Series"
  },
  slug: { type: String, unique: true },     // "completed"
  description: {
    ar: String,
    en: String
  },
  icon: { type: String, default: '📚' },    // Emoji icon
  displayOrder: { type: Number, default: 0 },
  isVisible: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false }, // Can't delete default sections
  collapsedByDefault: { type: Boolean, default: false },
  maxVisible: { type: Number, default: 5 }, // Show X items, then "Show more"
  createdAt: Date,
  updatedAt: Date
}
```

**Modify: `Series` Model** (add fields)
```javascript
// Add to models/Series.js
{
  sectionId: { type: ObjectId, ref: 'Section', default: null },
  sectionOrder: { type: Number, default: 0 }  // Order within section
}
```

**Pros**: Simple, single query per section, easy to manage
**Cons**: Series can only be in one section at a time

### Option B: Junction Table (More Flexible)

**New Model: `SectionAssignment`**
```javascript
{
  sectionId: { type: ObjectId, ref: 'Section', required: true },
  seriesId: { type: ObjectId, ref: 'Series', required: true },
  displayOrder: { type: Number, default: 0 }
}
```

**Pros**: Series can appear in multiple sections
**Cons**: More complex queries, extra model

### Modify: `SiteSettings` Model (add homepage config)
```javascript
// Add to existing models/SiteSettings.js
{
  // ... existing fields ...

  // Homepage configuration
  homepage: {
    showSchedule: { type: Boolean, default: true },
    showSeriesTab: { type: Boolean, default: true },
    showStandaloneTab: { type: Boolean, default: true },
    showKhutbasTab: { type: Boolean, default: true }
  }
}
```

This uses the existing `SiteSettings` model (singleton pattern) rather than creating a new model.

---

## Default Sections (Pre-created)

| Order | Slug | Title (AR) | Title (EN) | Icon | Notes |
|-------|------|------------|------------|------|-------|
| 0 | `featured` | مميز | Featured | ⭐ | Optional highlight section |
| 1 | `active` | السلاسل الجارية | Active Series | 📖 | Currently ongoing |
| 2 | `completed` | السلاسل المكتملة | Completed Series | ✅ | Finished series |
| 3 | `archive` | الأرشيف | Archive | 📁 | Older content |
| 4 | `ramadan` | أرشيف رمضان | Ramadan Archive | 🌙 | Seasonal |

Series without a section assignment go to "Active" by default.

---

## Implementation Plan

### Phase 1: Data Model (~30 min)

1. **Create `models/Section.js`**
   - Schema as defined above
   - Pre/post hooks for slug generation
   - Static method: `getOrderedSections()`

2. **Update `models/Series.js`**
   - Add `sectionId` field (ObjectId, ref: 'Section')
   - Add `sectionOrder` field (Number, default: 0)
   - Update indexes

3. **Update `models/index.js`**
   - Export Section model

4. **Create seed script: `scripts/seed-sections.js`**
   - Create default sections
   - Optionally auto-assign existing series based on `seriesType` field

### Phase 2: Admin Routes (~1.5 hours)

**File: `routes/admin/index.js`**

**Section Management Routes:**
| Route | Method | Description |
|-------|--------|-------------|
| `/admin/sections` | GET | List all sections with series counts |
| `/admin/sections/new` | GET | Create section form |
| `/admin/sections/new` | POST | Create section |
| `/admin/sections/:id/edit` | GET | Edit section form |
| `/admin/sections/:id` | POST | Update section |
| `/admin/sections/:id/delete` | POST | Delete section (reassign series first) |
| `/admin/sections/reorder` | POST | Update section order (AJAX) |
| `/admin/sections/:id/series` | GET | Manage series in section |
| `/admin/sections/:id/series/reorder` | POST | Reorder series in section (AJAX) |

**Homepage Configuration Routes:**
| Route | Method | Description |
|-------|--------|-------------|
| `/admin/homepage-config` | GET | Homepage configuration page |
| `/admin/homepage-config` | POST | Update homepage settings |

**Series Routes (add to existing):**
| Route | Method | Description |
|-------|--------|-------------|
| `/admin/series/:id/assign-section` | POST | Assign series to section |

### Phase 3: Admin Views (~2 hours)

1. **`views/admin/sections.ejs`** - Section list page
   - Table: Icon, Title (AR), Title (EN), Series Count, Visible, Actions
   - Up/Down arrows for reordering
   - "Add Section" button
   - Click row to manage series in that section

2. **`views/admin/section-form.ejs`** - Create/Edit section
   - Title (AR/EN)
   - Slug (auto-generated, editable)
   - Icon (emoji picker or text)
   - Description (AR/EN) - optional
   - Visibility toggle
   - Collapsed by default toggle
   - Max visible items

3. **`views/admin/section-series.ejs`** - Manage series in section
   - Table of series in this section
   - Up/Down arrows for reordering
   - "Remove from section" button
   - "Add series" dropdown/modal
   - Filter/search for quick finding

4. **`views/admin/homepage-config.ejs`** - Homepage settings
   - Toggle: Show Schedule section
   - Toggle: Show Series tab
   - Toggle: Show Standalone tab
   - Toggle: Show Khutbas tab
   - Save button

5. **Update `views/admin/edit-series.ejs`**
   - Add "Section" dropdown to assign series to a section
   - Show current section assignment

6. **Update `views/admin/manage.ejs`**
   - Add quick action: "📑 Sections" → `/admin/sections`
   - Add quick action: "🏠 Homepage Config" → `/admin/homepage-config`

### Phase 4: Homepage Integration (~1.5 hours)

**File: `routes/index.js`**

Update `fetchHomepageData()`:
```javascript
// Fetch sections with their series
const sections = await Section.find({ isVisible: true })
  .sort({ displayOrder: 1 })
  .lean();

// For each section, fetch series
const sectionsWithSeries = await Promise.all(
  sections.map(async (section) => {
    const series = await Series.find({
      sectionId: section._id,
      isVisible: { $ne: false }
    })
      .populate('sheikhId')
      .sort({ sectionOrder: 1 })
      .lean();

    // Fetch lectures for each series...
    return { ...section, series: seriesWithLectures };
  })
);

// Also fetch "unsectioned" series (sectionId: null) → goes to Active
```

**File: `views/public/index.ejs`**

Replace current series display with section-based layout:

```html
<% sections.forEach(section => { %>
<section class="series-section" id="section-<%= section.slug %>">
  <div class="section-header">
    <h2 class="section-title">
      <span class="section-icon"><%= section.icon %></span>
      <%= locale === 'ar' ? section.title.ar : section.title.en %>
      <span class="section-count">(<%= section.series.length %>)</span>
    </h2>
    <button class="toggle-section" aria-expanded="true">
      <%= locale === 'ar' ? 'طي' : 'Collapse' %>
    </button>
  </div>

  <div class="section-content">
    <table class="series-table">
      <!-- Same table structure as Schedule -->
      <% section.series.slice(0, section.maxVisible).forEach(s => { %>
      <tr class="series-row">
        <td class="series-title"><%= locale === 'ar' ? s.titleArabic : s.titleEnglish %></td>
        <td class="series-sheikh"><%= s.sheikh?.nameArabic %></td>
        <td class="series-count"><%= s.lectureCount %> درس</td>
        <td class="series-actions">
          <a href="/series/<%= s.slug %>">عرض</a>
        </td>
      </tr>
      <% }) %>
    </table>

    <% if (section.series.length > section.maxVisible) { %>
    <button class="show-more" data-section="<%= section.slug %>">
      <%= locale === 'ar' ? 'عرض المزيد' : 'Show more' %>
      (<%= section.series.length - section.maxVisible %>)
    </button>
    <% } %>
  </div>
</section>
<% }) %>
```

**CSS**: Match the Schedule table styling (already exists)

### Phase 5: JavaScript Enhancements (~30 min)

**File: `public/js/sections.js`** (or inline in index.ejs)

- Toggle section collapse/expand
- "Show more" functionality
- Persist collapsed state in localStorage

**File: `views/admin/sections.ejs`** (inline JS)

- AJAX reordering for sections
- AJAX reordering for series within sections

### Phase 6: Translations & Polish (~30 min)

**File: `utils/i18n.js`**
```javascript
// Add keys
sections: 'Sections',
sections_ar: 'الأقسام',
manage_sections: 'Manage Sections',
add_section: 'Add Section',
edit_section: 'Edit Section',
section_title: 'Section Title',
series_in_section: 'Series in Section',
assign_to_section: 'Assign to Section',
no_section: 'No Section',
show_more: 'Show more',
collapse: 'Collapse',
expand: 'Expand',
// ... etc
```

**File: `middleware/adminI18n.js`**
- Add admin-specific section translation keys

---

## File Changes Summary

| File | Action | Estimated Lines |
|------|--------|-----------------|
| `models/Section.js` | CREATE | ~60 |
| `models/Series.js` | EDIT | ~10 |
| `models/SiteSettings.js` | EDIT | ~15 |
| `models/index.js` | EDIT | ~2 |
| `scripts/seed-sections.js` | CREATE | ~80 |
| `routes/admin/index.js` | EDIT | ~250 |
| `views/admin/sections.ejs` | CREATE | ~250 |
| `views/admin/section-form.ejs` | CREATE | ~200 |
| `views/admin/section-series.ejs` | CREATE | ~200 |
| `views/admin/homepage-config.ejs` | CREATE | ~150 |
| `views/admin/edit-series.ejs` | EDIT | ~30 |
| `views/admin/manage.ejs` | EDIT | ~10 |
| `routes/index.js` | EDIT | ~60 |
| `views/public/index.ejs` | EDIT | ~180 |
| `public/js/sections.js` | CREATE | ~50 |
| `utils/i18n.js` | EDIT | ~25 |

**Total**: ~1,550 lines across 16 files

---

## UI Mockups

### Homepage Section (Desktop)
```
┌──────────────────────────────────────────────────────────────────────┐
│ ⭐ مميز / Featured                                            [طي] │
├──────────────────────────────────────────────────────────────────────┤
│ شرح كتاب التوحيد        │ الشيخ حسن الدغريري │ 45 درس │  [عرض]    │
│ شرح الأصول الثلاثة       │ الشيخ حسن الدغريري │ 12 درس │  [عرض]    │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ 📖 السلاسل الجارية / Active Series (15)                       [طي] │
├──────────────────────────────────────────────────────────────────────┤
│ شرح العقيدة الواسطية     │ الشيخ حسن الدغريري │ 28 درس │  [عرض]    │
│ شرح كتاب الصيام          │ الشيخ حسن الدغريري │ 8 درس  │  [عرض]    │
│ ... 5 more rows ...                                                  │
├──────────────────────────────────────────────────────────────────────┤
│                    [عرض المزيد (10)]                                 │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ ✅ السلاسل المكتملة / Completed Series (8)                    [طي] │
├──────────────────────────────────────────────────────────────────────┤
│ ...                                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

### Admin: Section List
```
┌──────────────────────────────────────────────────────────────────────┐
│  📑 Sections Management                           [+ Add Section]   │
├──────────────────────────────────────────────────────────────────────┤
│ ↑↓ │ Icon │ Title (AR)      │ Title (EN)     │ Series │ Visible │ ⚙ │
├────┼──────┼─────────────────┼────────────────┼────────┼─────────┼───┤
│ ↑↓ │ ⭐   │ مميز            │ Featured       │ 3      │ ✅      │ ✏🗑│
│ ↑↓ │ 📖   │ السلاسل الجارية  │ Active Series  │ 15     │ ✅      │ ✏🗑│
│ ↑↓ │ ✅   │ السلاسل المكتملة │ Completed      │ 8      │ ✅      │ ✏🗑│
│ ↑↓ │ 📁   │ الأرشيف         │ Archive        │ 4      │ ❌      │ ✏🗑│
└──────────────────────────────────────────────────────────────────────┘
```

### Admin: Manage Series in Section
```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Back │ 📖 Active Series - Manage Content                         │
├──────────────────────────────────────────────────────────────────────┤
│ [Search series...]  [+ Add Series to Section]                        │
├──────────────────────────────────────────────────────────────────────┤
│ ↑↓ │ Series Title              │ Sheikh           │ Lectures │ ⚙    │
├────┼───────────────────────────┼──────────────────┼──────────┼──────┤
│ ↑↓ │ شرح العقيدة الواسطية      │ الشيخ حسن الدغريري│ 28       │ ✏ ❌ │
│ ↑↓ │ شرح كتاب الصيام           │ الشيخ حسن الدغريري│ 8        │ ✏ ❌ │
│ ...                                                                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Migration Plan

1. Run `scripts/seed-sections.js` to create default sections
2. Auto-assign existing series based on criteria:
   - Series with `seriesType: 'archive'` → Archive section
   - Series with `tags: ['ramadan']` → Ramadan Archive section
   - Series with `isCompleted: true` (if exists) → Completed section
   - Everything else → Active section
3. Admin manually adjusts as needed

---

## Testing Checklist

### Section Management
- [ ] Section CRUD works (create, read, update, delete)
- [ ] Section reordering works (up/down arrows)
- [ ] Default sections protected from deletion

### Series Management
- [ ] Series assignment to sections works
- [ ] Series reordering within sections works
- [ ] Unassigned series appear in "Active" section

### Homepage Display
- [ ] Sections display in correct order
- [ ] Collapse/expand works
- [ ] "Show more" button works
- [ ] Series links to `/series/:slug`
- [ ] RTL/LTR display correct
- [ ] Mobile responsive

### Homepage Configuration
- [ ] Schedule toggle works
- [ ] Series tab toggle works
- [ ] Standalone tab toggle works
- [ ] Khutbas tab toggle works
- [ ] Layout order correct (Schedule → Sections → Tabs)

### Cache & Performance
- [ ] Cache invalidation on section changes
- [ ] Cache invalidation on homepage config changes

---

## Confirmed Decisions

| Question | Decision |
|----------|----------|
| Keep existing tabs? | Yes, but toggleable via admin. Sections appear ABOVE tabs. |
| Series click behavior? | Links to `/series/:slug` (no inline expansion) |
| Standalone lectures? | No special handling. All content uses Series → Lectures workflow. |
| Default section? | "Active" for series without section assignment |
| Schedule visibility? | Toggleable via admin homepage config |

---

## Timeline Estimate

| Phase | Description | Time |
|-------|-------------|------|
| 1 | Data model (Section + SiteSettings + Series) | 30 min |
| 2 | Admin routes (sections + homepage config) | 1.5 hours |
| 3 | Admin views (4 new pages + 2 updates) | 2.5 hours |
| 4 | Homepage integration | 1.5 hours |
| 5 | JavaScript (collapse/expand, show more) | 30 min |
| 6 | Translations & polish | 30 min |
| 7 | Testing & fixes | 1 hour |
| **Total** | | **~8 hours** |

---

## Status: READY FOR APPROVAL

All requirements clarified. Ready to begin implementation when approved.
