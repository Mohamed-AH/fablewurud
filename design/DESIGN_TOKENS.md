# Design Tokens - Audio Library PWA

Quick reference for developers implementing the design.

## Color Palette

```css
/* Primary Colors */
--primary-dark: #2C1810;      /* Dark brown - headers, text */
--primary-brown: #5C4033;     /* Medium brown - secondary elements */
--accent-gold: #C19A6B;       /* Gold - CTAs, highlights, author names */
--accent-amber: #D4A574;      /* Light gold - borders, hover states */

/* Backgrounds */
--cream: #F5EBE0;             /* Card backgrounds */
--paper: #FAF7F2;             /* Page background */

/* Text Colors */
--text-primary: #2C1810;      /* Main text */
--text-secondary: #5C4033;    /* Secondary text, labels */
--text-muted: #8B7355;        /* Metadata, timestamps */

/* Borders */
--border-light: #E8DCC8;      /* Card borders, dividers */

/* Additional */
--sage: #8B9D83;              /* Green accent for hero */
--shadow-warm: rgba(92, 64, 51, 0.15);  /* Box shadows */
```

## Typography

### Fonts
```css
/* Arabic */
--font-arabic-display: 'Scheherazade New', serif;  /* Titles, headings */
--font-arabic-body: 'Noto Naskh Arabic', serif;    /* Body text */

/* English */
--font-english: 'Georgia', serif;  /* Fallback for English */
```

### Font Sizes
```css
/* Headings */
--text-h1: 36px;   /* Hero title */
--text-h2: 28px;   /* Logo */
--text-h3: 24px;   /* Series title */
--text-h4: 20px;   /* Section headers */

/* Body */
--text-body-lg: 18px;  /* Author names, search input */
--text-body: 16px;     /* Episode titles */
--text-body-sm: 15px;  /* Series details */
--text-caption: 14px;  /* Episode metadata */
--text-xs: 13px;       /* Badges */
```

### Line Heights
```css
--line-height-heading: 1.5;
--line-height-body: 1.9;      /* Higher for Arabic readability */
```

## Spacing Scale

```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 32px;
--space-2xl: 48px;
```

## Component Specifications

### Series Card
```
Structure:
├─ Container (border: 3px solid accent-amber, border-radius: 16px)
├─ Header (padding: 24px, background: gradient)
│  ├─ Accent Bar (6px width, gold gradient, height: 80px)
│  └─ Info Section
│     ├─ Title (24px, bold, primary-dark)
│     ├─ Author (18px, semibold, accent-gold) ← IMPORTANT
│     ├─ Badge (13px, bordered)
│     └─ Details (15px, muted)
└─ Episodes List (expandable)
```

### Author Display (Critical)
```
Format: "المؤلف: الشيخ [Name] [Honorific]"
English: "Author: Sheikh [Name] [honorific in italics]"

Styling:
- Font: Scheherazade New (Arabic) / Georgia (English)
- Size: 18px
- Weight: 600
- Color: var(--accent-gold)
- Margin-bottom: 16px
- Line-height: 1.6

Label Prefix:
- Arabic: "المؤلف: الشيخ "
- English: "Author: Sheikh "
- Color: var(--text-secondary)
- Weight: 500
```

### Buttons

**Primary (Play)**
```css
background: var(--accent-gold);
color: var(--primary-dark);
padding: 10px 20px;
border-radius: 6px;
font-weight: 600;
box-shadow: 0 4px 12px var(--shadow-warm);

:hover {
  background: var(--accent-amber);
  transform: translateY(-2px);
}
```

**Secondary (Download)**
```css
background: transparent;
color: var(--accent-gold);
border: 2px solid var(--accent-gold);
padding: 10px 20px;
border-radius: 6px;

:hover {
  background: var(--accent-gold);
  color: var(--primary-dark);
}
```

### Category Badges

```css
.badge {
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  border: 2px solid;
  background: var(--paper);
}

/* Category Colors */
.badge-fiqh { border-color: #8B9D83; color: #5C6B54; }
.badge-aqeedah { border-color: #A67C52; color: #7A5C3E; }
.badge-tafseer { border-color: #8B7BA8; color: #6B5C84; }
.badge-hadeeth { border-color: #C19A6B; color: #8B7355; }
.badge-seerah { border-color: #D4756B; color: #A65C54; }
.badge-khutba { border-color: #5C4033; color: #2C1810; }
```

## Key Design Rules

### ❌ DON'T
1. Use icons/emojis (gives "AI slop" look)
2. Use Inter, Roboto, Arial fonts
3. Use cool colors (blues, purples)
4. Skip honorifics (رحمه الله, حفظه الله)
5. Make author names small/secondary

### ✅ DO
1. Use vertical gold accent bars (6px wide)
2. Use warm browns and gold throughout
3. Prioritize author names (18px, gold color)
4. Include Islamic honorifics in Arabic
5. Use bullet separators (•) for metadata
6. Maintain high line-height (1.9) for Arabic
7. Use Eastern Arabic numerals in Arabic (٠١٢٣)
8. Use Western numerals in English (0123)

## Shadows & Effects

```css
/* Cards */
box-shadow: 0 6px 16px var(--shadow-warm);

/* Cards on hover */
box-shadow: 0 12px 32px var(--shadow-warm);
transform: translateY(-4px);

/* Buttons */
box-shadow: 0 4px 12px var(--shadow-warm);

/* Header */
box-shadow: 0 4px 12px var(--shadow-warm);
```

## Animations

```css
/* Card entrance */
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Stagger delays */
.series-card:nth-child(1) { animation-delay: 0s; }
.series-card:nth-child(2) { animation-delay: 0.1s; }
.series-card:nth-child(3) { animation-delay: 0.2s; }

/* Transitions */
transition: all 0.3s ease;  /* Most elements */
transition: all 0.4s ease;  /* Cards */
```

## Border Radius

```css
--radius-sm: 6px;    /* Buttons, badges */
--radius-md: 8px;    /* Episode numbers */
--radius-lg: 12px;   /* Inputs, accent bars */
--radius-xl: 16px;   /* Cards */
--radius-full: 20px; /* Chips */
```

## Responsive Breakpoints

```css
/* Mobile */
@media (max-width: 768px) {
  /* Reduce font sizes by ~20% */
  /* Stack buttons vertically */
  /* Hide volume controls in player */
}
```

## Background Pattern

```css
/* Subtle Islamic geometric pattern */
body::before {
  content: '';
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background-image: 
    repeating-linear-gradient(45deg, transparent, transparent 35px, var(--border-light) 35px, var(--border-light) 36px),
    repeating-linear-gradient(-45deg, transparent, transparent 35px, var(--border-light) 35px, var(--border-light) 36px);
  opacity: 0.3;
  pointer-events: none;
  z-index: -1;
}
```

## Arabic/English Toggle

### Text Changes (Key Elements)

| Element | Arabic | English |
|---------|--------|---------|
| Logo | المكتبة الصوتية | Audio Library |
| Hero | اطلب العلم من المهد إلى اللحد | Seek Knowledge from the Cradle to the Grave |
| Author Label | المؤلف: الشيخ | Author: Sheikh |
| Category | الفقه / العقيدة / التفسير | Fiqh / Aqeedah / Tafseer |
| Buttons | استماع / تحميل | Listen / Download |

### RTL/LTR Rules
```javascript
// Toggle direction
html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
html.setAttribute('lang', lang);

// Store preference
localStorage.setItem('language', lang);
```

## Google Fonts Import

```html
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Scheherazade+New:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
```

## Implementation Priority

1. ✅ Color palette (warm browns/gold)
2. ✅ Typography (Scheherazade New, Noto Naskh Arabic)
3. ✅ Author prominence (18px gold, with honorifics)
4. ✅ No icons policy
5. ✅ Vertical gold accent bars
6. ✅ Bilingual toggle
7. ✅ Background pattern
8. ✅ Animations and transitions
9. ✅ Responsive design

---

**Reference Files:**
- Full Design Doc: `AUDIO_RESOURCE_SITE_UI_DESIGN.md`
- Visual Mock: `audio-library-dhassan-style.html`

**Questions?** Refer to the HTML file - all styles are inline and production-ready.
