# Islamic Audio Resource Platform - PWA UI/UX Design Document

**Version:** 2.0  
**Last Updated:** January 21, 2026  
**Status:** Planning Complete - Ready for Implementation

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Data Structure](#data-structure)
3. [User Journey & Information Architecture](#user-journey--information-architecture)
4. [Screen-by-Screen Design Specifications](#screen-by-screen-design-specifications)
5. [Component Library](#component-library)
6. [Design System](#design-system)
7. [PWA Requirements](#pwa-requirements)
8. [Technical Implementation Notes](#technical-implementation-notes)
9. [Accessibility & RTL Support](#accessibility--rtl-support)
10. [Future Enhancements](#future-enhancements)

---

## Project Overview

### Mission
A Progressive Web App (PWA) for hosting and streaming 162 Arabic Islamic lecture audio files. Users can browse series, stream audio lectures directly in the browser, and download files for offline listening.

### Core Features
- ✅ Browse by Series (expandable/collapsible)
- ✅ Search by Series Name
- ✅ Filter by Category (Fiqh, Aqeedah, Tafseer, Hadeeth, Seerah, Khutba, Other)
- ✅ Filter by Type (Series, Khutba, Lecture)
- ✅ Stream audio with in-app player
- ✅ Download audio files
- ✅ Bilingual interface (Arabic/English toggle)
- ✅ PWA features (installable, offline-capable)

### Key Principles
- **Simple & Focused:** Clean interface prioritizing content discovery and playback
- **Arabic-First:** RTL by default, honorifics preserved, Islamic aesthetic
- **Mobile-Optimized:** Touch-friendly, responsive, PWA-ready
- **Performance:** Fast loading, efficient streaming, minimal data usage
- **Accessible:** Keyboard navigation, screen reader support, proper ARIA labels

---

## Data Structure

### Excel Data Schema (162 records)

```javascript
{
  "S.No": Number,                    // Sequential ID
  "TelegramFileName": String,        // Original filename (mp3/m4a/opus)
  "Type": String,                    // "Series" | "Khutba" | "Lecture"
  "SeriesName": String,              // Arabic series/lecture title
  "Serial": String,                  // Episode number (Arabic: "الأول", "الثاني", etc.)
  "OriginalAuthor": String,          // Book/material author
  "Location/Online": String,         // Recording location
  "Sheikh": String,                  // Presenter/speaker name
  "DateInGreg": String,             // Recording date (DD.MM.YYYY)
  "ClipLength": String,             // Duration (HH:MM or MM:SS)
  "Category": String                 // Fiqh | Aqeedah | Tafseer | Hadeeth | Seerah | Khutba | Other
}
```

### Unique Series Count
**Total Series:** 16 unique series
**Total Episodes:** 162 lectures

**Series Breakdown:**
1. تأسيس الأحكام شرح عمدة الأحكام (22 episodes)
2. الملخص شرح كتاب التوحيد (32 episodes)
3. الملخص الفقهي (29 episodes)
4. التفسير الميسر (15 episodes)
5. إرشاد الساري شرح السنة للبربهاري (14 episodes)
6. صحيح البخاري (1 episode - ongoing)
7. المورد العذب الزلال (8 episodes)
8. التحفة النجمية بشرح الأربعين النووية (4 episodes)
9. خطبة_الجمعة - مختصر السيرة النبوية (9 episodes)
10. مختصر السيرة النبوية (4 episodes)
11. تنبيه الانام على ما في كتاب سبل السلام من الفوائد والأحكام (4 episodes)
12. غنية السائل بما في لامية شيخ الإسلام من مسائل (1 episode)
13. التعليقات البهية على الرسائل العقدية (9 episodes)
14. خطبة_الجمعة (8 standalone Khutba)
15. Single Lectures (4 standalone lectures)

---

## User Journey & Information Architecture

### Primary User Flow

```
App Launch
    ↓
┌─────────────────────┐
│   HOME SCREEN       │
│                     │
│  [Language Toggle]  │
│  [Search Bar]       │
│  [Category Filters] │
│  [Type Filters]     │
│  [Series List]      │
└─────────────────────┘
    ↓ (User clicks series)
┌─────────────────────┐
│ SERIES DETAIL VIEW  │
│                     │
│  [Series Header]    │
│  [Episodes List]    │
│  - Play buttons     │
│  - Download buttons │
└─────────────────────┘
    ↓ (User clicks play)
┌─────────────────────┐
│ STICKY AUDIO PLAYER │
│ (Bottom of screen)  │
│                     │
│  [Track Info]       │
│  [Play/Pause]       │
│  [Seek Bar]         │
│  [Volume]           │
│  [Speed Control]    │
└─────────────────────┘
```

### Navigation Structure

```
┌─────────────────────────────────────┐
│          APP HEADER                 │
│  Logo | Search | Lang | Install     │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│       FILTER CONTROLS               │
│  [Category Chips] [Type Chips]      │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│       SERIES LIST                   │
│  ┌─────────────────────────────┐   │
│  │ Series Card (Collapsed)     │   │
│  │ Title | Episodes | Category │   │
│  └─────────────────────────────┘   │
│         ↓ (Click to expand)         │
│  ┌─────────────────────────────┐   │
│  │ Series Card (Expanded)      │   │
│  │ ├─ Episode 1  [▶] [⬇]      │   │
│  │ ├─ Episode 2  [▶] [⬇]      │   │
│  │ └─ Episode 3  [▶] [⬇]      │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
         ↓ (If playing)
┌─────────────────────────────────────┐
│     STICKY AUDIO PLAYER             │
│  (Floating at bottom)               │
└─────────────────────────────────────┘
```

---

## Screen-by-Screen Design Specifications

### 1. Home Screen (Main View)

#### Layout Structure

```
┌───────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │
│ │        APP HEADER               │ │
│ │  [☪ Logo] [Search] [AR/EN] [+] │ │ ← 60px height
│ └─────────────────────────────────┘ │
├───────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │      SEARCH BAR                 │ │
│ │  [🔍 ابحث عن سلسلة...]         │ │ ← 48px height
│ └─────────────────────────────────┘ │
├───────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │   CATEGORY FILTERS              │ │
│ │  [All] [Fiqh] [Aqeedah] ...    │ │ ← Horizontal scroll
│ └─────────────────────────────────┘ │
├───────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │   TYPE FILTERS                  │ │
│ │  [All] [Series] [Khutba] ...   │ │
│ └─────────────────────────────────┘ │
├───────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │   SERIES LIST                   │ │
│ │                                 │ │
│ │  [Series Card 1]                │ │
│ │  [Series Card 2]                │ │
│ │  [Series Card 3]                │ │
│ │  ...                            │ │ ← Scrollable
│ │                                 │ │
│ └─────────────────────────────────┘ │
└───────────────────────────────────────┘
```

#### Header Component (60px)

**Elements:**
1. **Logo/Brand (Left/Right based on RTL)**
   - Islamic crescent moon icon ☪
   - App name: "المكتبة الصوتية" (AR) / "Audio Library" (EN)
   - Color: `--primary` (#1A5F5A)

2. **Search Icon (Center)**
   - Magnifying glass icon
   - On click: Focus search input below

3. **Language Toggle (Right/Left)**
   - Button: "AR" / "EN"
   - Toggle between Arabic RTL and English LTR
   - Stores preference in localStorage

4. **Install PWA Button (Far Right/Left)**
   - Plus icon "+"
   - Shows only when app is installable
   - Triggers PWA install prompt

**Design:**
- Background: White with subtle shadow
- Fixed position (sticky header)
- Border-bottom: 1px solid #E0E0E0
- Z-index: 1000

#### Search Bar (48px)

**Functionality:**
- Searches `SeriesName` field (Arabic/English)
- Real-time filtering as user types
- Debounced (300ms) to avoid excessive re-renders
- Shows result count: "3 نتائج" / "3 results"

**Design:**
- Full-width input with rounded corners (8px)
- Placeholder: "ابحث عن سلسلة..." (AR) / "Search for a series..." (EN)
- Icon: 🔍 (left/right based on RTL)
- Clear button (X) when text is entered
- Background: #F7F5F0 (cream)
- Border: 1px solid #D4AF37 on focus

#### Category Filter Chips (40px height)

**Chips:**
1. الكل / All (Shows all)
2. الفقه / Fiqh
3. العقيدة / Aqeedah
4. التفسير / Tafseer
5. الحديث / Hadeeth
6. السيرة / Seerah
7. الخطبة / Khutba
8. أخرى / Other

**Behavior:**
- Single selection (radio-style)
- Filters series list by category
- Scrollable horizontally on mobile
- Active chip: Solid background (#1A5F5A), white text
- Inactive: Border only (#1A5F5A), primary text

**Design:**
- Horizontal scroll container
- Padding: 8px 16px
- Border-radius: 20px (pill shape)
- Gap: 8px between chips
- Smooth scroll behavior

#### Type Filter Chips (40px height)

**Chips:**
1. الكل / All
2. السلاسل / Series
3. الخطبة / Khutba
4. المحاضرة / Lecture

**Same behavior and design as Category filters**

#### Series List (Scrollable)

**Layout:**
- Vertical stack of series cards
- Gap: 16px between cards
- Padding: 16px horizontal
- Infinite scroll (load more as user scrolls)

**Empty State:**
- Icon: 🔍
- Message: "لا توجد نتائج" / "No results found"
- Subtext: "جرب بحثاً آخر" / "Try another search"

---

### 2. Series Card Component

#### Collapsed State

```
┌─────────────────────────────────────┐
│  ┌───┐  تأسيس الأحكام شرح عمدة...  │ ← Title
│  │ 📖 │  الفقه                       │ ← Category badge
│  └───┘  22 درس • الشيخ حسن الدغريري  │ ← Metadata
│         [▼ عرض الدروس]               │ ← Expand button
└─────────────────────────────────────┘
```

**Elements:**
1. **Icon (Left/Right)**
   - Category-based icon:
     - 📖 Fiqh
     - 🕌 Aqeedah
     - 📜 Tafseer
     - 💬 Hadeeth
     - ⭐ Seerah
     - 🎤 Khutba
     - 📚 Other
   - Size: 48px × 48px
   - Circular background with category color

2. **Title**
   - Series name in Arabic
   - Font: Amiri (Bold), 18px
   - Color: --text-primary (#2C3E35)
   - Max 2 lines, ellipsis overflow

3. **Category Badge**
   - Small pill badge
   - Background: Category color (10% opacity)
   - Text: Category name
   - Font: 12px, medium weight

4. **Metadata Line**
   - Episodes count: "22 درس" / "22 lessons"
   - Sheikh name: "الشيخ حسن الدغريري"
   - Separator: "•"
   - Font: Noto Naskh Arabic, 14px
   - Color: #666

5. **Expand Button**
   - Text: "عرض الدروس" / "View Lessons"
   - Icon: Chevron down ▼
   - Full width button at bottom
   - Background: Transparent
   - Border-top: 1px solid #E0E0E0

**Design:**
- Background: White
- Border: 1px solid #E0E0E0
- Border-radius: 12px
- Padding: 16px
- Box-shadow: 0 2px 8px rgba(0,0,0,0.05)
- Hover: Slight shadow increase

#### Expanded State

```
┌─────────────────────────────────────┐
│  ┌───┐  تأسيس الأحكام شرح عمدة...  │
│  │ 📖 │  الفقه                       │
│  └───┘  22 درس • الشيخ حسن الدغريري  │
│         [▲ إخفاء الدروس]            │
├─────────────────────────────────────┤
│  EPISODE LIST:                      │
│  ┌───────────────────────────────┐  │
│  │ 1. الأول من الطهارة          │  │
│  │    46:46 • 13.10.2025        │  │
│  │    [▶ Play] [⬇ Download]    │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ 2. الثاني من الطهارة         │  │
│  │    36:30 • 14.10.2025        │  │
│  │    [▶ Play] [⬇ Download]    │  │
│  └───────────────────────────────┘  │
│  ...                                │
└─────────────────────────────────────┘
```

**Episode Item:**
1. **Episode Number & Title**
   - Format: "1. الأول من الطهارة"
   - Font: Noto Naskh Arabic, 16px, medium
   - Color: --text-primary

2. **Metadata**
   - Duration: "46:46"
   - Date: "13.10.2025"
   - Separator: "•"
   - Font: 14px, color: #666

3. **Action Buttons**
   - Play button: [▶ تشغيل / Play]
     - Primary action (more prominent)
     - Background: --primary (#1A5F5A)
     - Text: White
   - Download button: [⬇ تحميل / Download]
     - Secondary action
     - Background: Transparent
     - Border: 1px solid --primary
     - Text: --primary

**Design:**
- Episode items separated by 1px border
- Padding: 12px per item
- Hover state: Light background (#F7F5F0)
- Touch-friendly: 48px min height for buttons

---

### 3. Series Detail View (Alternative: Full Page)

**Option:** Instead of expanding in place, clicking a series could navigate to a dedicated page.

#### Layout

```
┌─────────────────────────────────────┐
│  ← Back  |  تأسيس الأحكام شرح عمدة  │ ← Header
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │   SERIES HEADER CARD        │   │
│  │                             │   │
│  │  📖 الفقه                    │   │
│  │  تأسيس الأحكام شرح عمدة...  │   │
│  │                             │   │
│  │  المؤلف: أحمد بن يحيى النجمي  │   │
│  │  الشيخ: حسن بن محمد الدغريري │   │
│  │  الموقع: جامع الورود         │   │
│  │  22 درس • 16 ساعة            │   │
│  └─────────────────────────────┘   │
├─────────────────────────────────────┤
│  EPISODES LIST (22 items)           │
│  [Episode 1]                        │
│  [Episode 2]                        │
│  ...                                │
└─────────────────────────────────────┘
```

**Benefits:**
- More space for metadata
- Cleaner navigation
- Better for long series
- Shareable URLs

**Implementation:** User preference - both approaches are valid.

---

### 4. Audio Player (Sticky/Floating)

#### Design: Bottom Sticky Player

```
┌───────────────────────────────────────┐
│        CURRENTLY PLAYING              │
│  ┌───────────────────────────────┐   │
│  │  الأول من الطهارة             │   │ ← Track title
│  │  تأسيس الأحكام شرح عمدة...    │   │ ← Series name
│  └───────────────────────────────┘   │
│  ┌───────────────────────────────┐   │
│  │  [◀◀] [▶/⏸] [▶▶]           │   │ ← Controls
│  │                               │   │
│  │  ━━━━━━━●━━━━━━━━━━━━━━━━━  │   │ ← Seek bar
│  │  12:34 / 46:46                │   │ ← Time
│  │                               │   │
│  │  [🔊] ━━●━━━  [1x▾]  [⬇]    │   │ ← Volume, Speed, Download
│  └───────────────────────────────┘   │
└───────────────────────────────────────┘
```

#### Components

**1. Track Info**
- Current episode title (scrolling marquee if long)
- Series name (smaller, secondary text)
- Sheikh name (optional, tertiary text)

**2. Playback Controls**
- **Skip Back 15s:** [◀◀] button
- **Play/Pause:** [▶] / [⏸] toggle button (large, primary)
- **Skip Forward 15s:** [▶▶] button
- Buttons: 44px × 44px (touch-friendly)

**3. Seek Bar**
- **Progress Bar:**
  - Total: Gray background
  - Buffered: Light gray fill
  - Played: Primary color (#1A5F5A) fill
  - Scrubber: Draggable circle handle
- **Time Display:**
  - Current: "12:34"
  - Total: "46:46"
  - Format: MM:SS or HH:MM:SS

**4. Additional Controls**
- **Volume Control:**
  - Icon: 🔊 (muted: 🔇)
  - Slider: Horizontal 0-100%
  - Click icon to mute/unmute
- **Playback Speed:**
  - Dropdown: [1x▾]
  - Options: 0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x
- **Download Button:**
  - Icon: ⬇
  - Downloads current track

**5. Minimize/Expand**
- Swipe down to minimize (shows small bar)
- Tap to expand (shows full player)
- Close button to stop playback

#### States

**Minimized State:**
```
┌──────────────────────────────────┐
│ [▶] الأول من الطهارة • 12:34   │ ← Small bar
└──────────────────────────────────┘
```

**Expanded State:** (Full player as shown above)

#### Behavior

**Streaming:**
- Uses HTML5 `<audio>` element
- HTTP Range requests for seeking
- Preload: metadata (not full file)
- Auto-play next episode in series (optional toggle)

**Download:**
- Downloads file with meaningful name:
  - Format: `{SeriesName}_{Serial}_{Sheikh}.mp3`
  - Example: `تأسيس_الأحكام_الأول_حسن_الدغريري.mp3`
- Shows download progress if large file

**Persistence:**
- Remembers playback position (localStorage)
- Restores on app reopen
- Clears after 24 hours of inactivity

---

## Component Library

### Reusable Components

#### 1. Button Component

**Variants:**
```javascript
// Primary Button
<button class="btn btn-primary">
  Play / تشغيل
</button>

// Secondary Button
<button class="btn btn-secondary">
  Download / تحميل
</button>

// Icon Button
<button class="btn btn-icon">
  <svg>...</svg>
</button>
```

**Styles:**
- **Primary:** Background --primary, white text, 8px border-radius
- **Secondary:** Transparent background, --primary border & text
- **Icon:** Square 44px × 44px, icon centered, no text
- **Disabled:** 50% opacity, no pointer events
- **Hover:** Slight shadow, scale 1.02
- **Active:** Scale 0.98

#### 2. Category Badge

```html
<span class="badge badge-fiqh">الفقه</span>
```

**Category Colors:**
- Fiqh: `#1A5F5A` (green)
- Aqeedah: `#8B4513` (brown)
- Tafseer: `#4B0082` (indigo)
- Hadeeth: `#D4AF37` (gold)
- Seerah: `#FF6B6B` (red)
- Khutba: `#2C3E35` (dark green-gray)
- Other: `#666666` (gray)

**Styles:**
- Background: Category color at 10% opacity
- Text: Category color (full opacity)
- Border-radius: 12px
- Padding: 4px 12px
- Font-size: 12px

#### 3. Loading Spinner

```html
<div class="spinner">
  <div class="spinner-circle"></div>
</div>
```

**Styles:**
- CSS animation: rotate 360deg in 1s
- Color: --primary
- Size: 24px × 24px

#### 4. Empty State

```html
<div class="empty-state">
  <div class="empty-icon">🔍</div>
  <h3>لا توجد نتائج</h3>
  <p>جرب بحثاً آخر</p>
</div>
```

**Styles:**
- Center-aligned
- Icon: 64px font-size
- Heading: 20px, bold
- Text: 16px, color #666
- Padding: 48px

---

## Design System

### Colors

```css
:root {
  /* Primary Colors */
  --primary: #1A5F5A;           /* Deep Islamic green */
  --primary-light: #2D8B7E;     /* Lighter green */
  --primary-dark: #0F3E3A;      /* Darker green */
  
  /* Accent Colors */
  --accent-gold: #D4AF37;       /* Gold accent */
  --accent-cream: #F7F5F0;      /* Warm cream */
  
  /* Text Colors */
  --text-primary: #2C3E35;      /* Dark green-gray */
  --text-secondary: #666666;    /* Medium gray */
  --text-tertiary: #999999;     /* Light gray */
  --text-white: #FFFFFF;        /* White */
  
  /* Background Colors */
  --bg-primary: #FFFFFF;        /* White */
  --bg-secondary: #F7F5F0;      /* Cream */
  --bg-tertiary: #E8E6E0;       /* Darker cream */
  
  /* Border Colors */
  --border-light: #E0E0E0;      /* Light gray */
  --border-medium: #CCCCCC;     /* Medium gray */
  
  /* Category Colors */
  --cat-fiqh: #1A5F5A;
  --cat-aqeedah: #8B4513;
  --cat-tafseer: #4B0082;
  --cat-hadeeth: #D4AF37;
  --cat-seerah: #FF6B6B;
  --cat-khutba: #2C3E35;
  --cat-other: #666666;
  
  /* State Colors */
  --success: #28A745;
  --error: #DC3545;
  --warning: #FFC107;
  --info: #17A2B8;
}
```

### Typography

**Font Families:**
```css
/* Arabic Fonts */
--font-arabic-heading: 'Amiri', serif;
--font-arabic-body: 'Noto Naskh Arabic', serif;

/* English Fonts */
--font-english-heading: 'Cormorant Garamond', serif;
--font-english-body: 'Spectral', serif;

/* Monospace (for metadata) */
--font-mono: 'Roboto Mono', monospace;
```

**Font Scales:**
```css
/* Headings */
--text-h1: 32px;      /* Main title */
--text-h2: 24px;      /* Section title */
--text-h3: 20px;      /* Card title */
--text-h4: 18px;      /* Subtitle */

/* Body */
--text-body-lg: 18px; /* Large body */
--text-body: 16px;    /* Default body */
--text-body-sm: 14px; /* Small body */
--text-caption: 12px; /* Caption */

/* Line Heights */
--line-height-heading: 1.4;
--line-height-body: 1.8;      /* Higher for Arabic */
--line-height-compact: 1.5;
```

### Spacing

```css
/* Spacing Scale (8px base) */
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 32px;
--space-2xl: 48px;
--space-3xl: 64px;
```

### Shadows

```css
/* Elevation */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 2px 8px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.15);
--shadow-xl: 0 8px 32px rgba(0, 0, 0, 0.2);
```

### Border Radius

```css
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
--radius-full: 9999px;  /* Pill shape */
```

### Transitions

```css
--transition-fast: 150ms ease;
--transition-base: 300ms ease;
--transition-slow: 500ms ease;
```

---

## PWA Requirements

### Manifest.json

```json
{
  "name": "المكتبة الصوتية - Islamic Audio Library",
  "short_name": "Audio Library",
  "description": "Browse and stream Islamic lectures in Arabic",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F7F5F0",
  "theme_color": "#1A5F5A",
  "orientation": "portrait",
  "dir": "rtl",
  "lang": "ar",
  "icons": [
    {
      "src": "/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-96x96.png",
      "sizes": "96x96",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-128x128.png",
      "sizes": "128x128",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-144x144.png",
      "sizes": "144x144",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-152x152.png",
      "sizes": "152x152",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-384x384.png",
      "sizes": "384x384",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### Service Worker Strategy

**Caching Strategy:**
1. **App Shell (Cache First)**
   - HTML, CSS, JS files
   - Fonts
   - Icons
   - Static images

2. **Audio Files (Network First, Cache Fallback)**
   - Cache streamed audio for offline playback
   - Limit cache size (100MB max)
   - LRU eviction policy

3. **API Data (Network First)**
   - Lecture metadata
   - Search results
   - Fallback to cached data if offline

**Implementation:**
```javascript
// Service Worker Lifecycle
self.addEventListener('install', (event) => {
  // Cache app shell
});

self.addEventListener('activate', (event) => {
  // Clean old caches
});

self.addEventListener('fetch', (event) => {
  // Route requests based on strategy
});
```

### Offline Functionality

**Offline Capabilities:**
- ✅ View cached series list
- ✅ Play previously cached audio
- ✅ Browse cached metadata
- ❌ Search (requires network)
- ❌ Stream new audio (requires network)

**Offline UI:**
- Show offline banner at top
- Disable network-dependent features
- Show "Available offline" badge on cached content

### Install Prompt

**Trigger:**
- Show after user has visited 3+ times
- Show when PWA is not installed
- "Add to Home Screen" button in header

**Design:**
- Modal/toast notification
- Clear benefits: "Install for faster access and offline listening"
- Dismiss option (don't show again for 30 days)

---

## Technical Implementation Notes

### Frontend Framework

**Recommended:** React + Vite (for PWA, performance, and modern DX)

**Alternative:** Vanilla JS (simpler, no build step)

**File Structure:**
```
src/
├── components/
│   ├── Header.jsx
│   ├── SearchBar.jsx
│   ├── FilterChips.jsx
│   ├── SeriesCard.jsx
│   ├── EpisodeItem.jsx
│   ├── AudioPlayer.jsx
│   └── ...
├── pages/
│   ├── Home.jsx
│   └── SeriesDetail.jsx
├── hooks/
│   ├── useAudio.js
│   ├── useSearch.js
│   └── useFilter.js
├── utils/
│   ├── api.js
│   ├── storage.js
│   └── i18n.js
├── styles/
│   ├── global.css
│   └── variables.css
├── data/
│   └── lectures.json
└── App.jsx
```

### Audio Streaming Implementation

**HTML5 Audio:**
```javascript
const AudioPlayer = ({ src, onEnded }) => {
  const audioRef = useRef(null);
  
  const play = () => audioRef.current.play();
  const pause = () => audioRef.current.pause();
  const seek = (time) => audioRef.current.currentTime = time;
  
  return (
    <audio
      ref={audioRef}
      src={src}
      preload="metadata"
      onEnded={onEnded}
    />
  );
};
```

**HTTP Range Requests:**
- Server must support `Accept-Ranges: bytes` header
- Client sends `Range: bytes=0-1023` for partial content
- Server responds with `206 Partial Content`
- Enables seeking without downloading full file

**Server Endpoint:**
```
GET /api/audio/:filename
Headers:
  Range: bytes=0-1023
  
Response:
  206 Partial Content
  Content-Range: bytes 0-1023/45678901
  Content-Length: 1024
  Content-Type: audio/mpeg
```

### Search & Filter Logic

**Search Algorithm:**
```javascript
const searchLectures = (query, lectures) => {
  const lowerQuery = query.toLowerCase();
  
  return lectures.filter(lecture => {
    const seriesName = lecture.SeriesName.toLowerCase();
    return seriesName.includes(lowerQuery);
  });
};
```

**Filter Combination:**
```javascript
const filterLectures = (lectures, { category, type }) => {
  return lectures.filter(lecture => {
    const matchCategory = !category || category === 'all' || lecture.Category === category;
    const matchType = !type || type === 'all' || lecture.Type === type;
    return matchCategory && matchType;
  });
};
```

**Combined Search + Filter:**
```javascript
const filteredLectures = useMemo(() => {
  let results = lectures;
  
  // Apply search
  if (searchQuery) {
    results = searchLectures(searchQuery, results);
  }
  
  // Apply filters
  results = filterLectures(results, { category, type });
  
  return results;
}, [lectures, searchQuery, category, type]);
```

### Data Management

**Option 1: Static JSON (Simple)**
- Convert Excel to JSON at build time
- Embed in app bundle
- Fast, no API needed
- Limited to ~162 records (perfect for this use case)

**Option 2: API + Database (Scalable)**
- Backend API (Node.js/Express)
- Database (MongoDB/PostgreSQL)
- More complex, but scalable
- Enables admin panel for adding/editing

**Recommended:** Start with static JSON, migrate to API later if needed.

### State Management

**Recommended:** React Context (built-in, sufficient for this app)

**Context Providers:**
1. **LanguageContext:** Manages AR/EN toggle
2. **AudioContext:** Manages currently playing track
3. **FilterContext:** Manages search & filter state

**Alternative:** Zustand (lightweight, modern)

---

## Accessibility & RTL Support

### Accessibility (a11y)

**Keyboard Navigation:**
- All interactive elements focusable
- Logical tab order
- Visible focus indicators
- Keyboard shortcuts:
  - `Space`: Play/Pause
  - `←/→`: Seek -/+ 15s
  - `↑/↓`: Volume up/down
  - `/`: Focus search

**Screen Readers:**
- Proper ARIA labels on all controls
- Live regions for status updates
- Semantic HTML (header, nav, main, footer)
- Alt text on icons

**ARIA Labels Example:**
```html
<button aria-label="Play audio">
  <svg aria-hidden="true">...</svg>
</button>

<div role="region" aria-label="Audio player" aria-live="polite">
  <span>Now playing: {title}</span>
</div>
```

**Color Contrast:**
- Minimum 4.5:1 for body text
- Minimum 3:1 for large text (18px+)
- Test with tools: WAVE, axe DevTools

### RTL (Right-to-Left) Support

**Language Toggle Implementation:**
```javascript
const toggleLanguage = (lang) => {
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  localStorage.setItem('language', lang);
};
```

**CSS RTL Handling:**
```css
/* Logical Properties (auto-flip for RTL) */
.card {
  margin-inline-start: 16px;  /* margin-left in LTR, margin-right in RTL */
  padding-inline: 16px;       /* padding-left/right auto-flip */
}

/* Manual RTL Overrides */
[dir="rtl"] .icon-arrow {
  transform: scaleX(-1);  /* Flip arrow direction */
}
```

**Arabic Typography Best Practices:**
- Use proper Arabic fonts (Amiri, Noto Naskh Arabic)
- Higher line-height (1.8) for readability
- Preserve honorifics: صلى الله عليه وسلم, حفظه الله
- Use Arabic numerals (١٢٣) or Western (123) consistently

---

## Future Enhancements

### Phase 2 Features (Post-MVP)

1. **User Accounts & Sync**
   - Save playback position across devices
   - Track listening history
   - Bookmark favorite lectures

2. **Playlists**
   - Create custom playlists
   - Queue management
   - Shuffle mode

3. **Social Features**
   - Share lectures on social media
   - Embed player on external sites
   - WhatsApp/Telegram quick share

4. **Advanced Search**
   - Filter by sheikh
   - Filter by author
   - Filter by date range
   - Full-text search in descriptions

5. **Analytics**
   - Most played lectures
   - Trending series
   - Listen time statistics

6. **Offline Downloads**
   - Download entire series for offline
   - Download manager
   - Storage management

7. **Notifications**
   - New lecture alerts
   - Series completion reminders
   - Weekly listening digest

8. **Accessibility Enhancements**
   - Adjustable playback speed per-lecture
   - Sleep timer
   - Dark mode

### Technical Debt to Address

1. **Performance Optimization**
   - Lazy load images
   - Virtual scrolling for long lists
   - Code splitting
   - Image optimization (WebP)

2. **Testing**
   - Unit tests (Jest)
   - E2E tests (Playwright)
   - Accessibility tests (axe)

3. **Monitoring**
   - Error tracking (Sentry)
   - Analytics (Plausible/Umami)
   - Performance monitoring (Lighthouse CI)

---

## Development Checklist

### Phase 1: Foundation (Week 1)
- [ ] Set up React + Vite project
- [ ] Configure PWA plugin
- [ ] Set up design system (CSS variables)
- [ ] Implement layout structure
- [ ] Add Arabic fonts (Amiri, Noto Naskh Arabic)
- [ ] Create reusable components (Button, Badge, etc.)

### Phase 2: Core Features (Week 2)
- [ ] Convert Excel to JSON
- [ ] Implement series list view
- [ ] Implement search functionality
- [ ] Implement category/type filters
- [ ] Create series card component (collapsed/expanded)
- [ ] Create episode item component

### Phase 3: Audio Player (Week 3)
- [ ] Implement HTML5 audio player
- [ ] Add playback controls (play/pause/seek)
- [ ] Add volume control
- [ ] Add playback speed control
- [ ] Implement sticky player UI
- [ ] Test HTTP Range requests
- [ ] Implement download functionality

### Phase 4: PWA & Polish (Week 4)
- [ ] Configure service worker
- [ ] Implement caching strategies
- [ ] Add offline support
- [ ] Create install prompt
- [ ] Test on multiple devices (iOS/Android)
- [ ] Implement language toggle (AR/EN)
- [ ] Add RTL support
- [ ] Accessibility audit
- [ ] Performance optimization

### Phase 5: Deployment (Week 5)
- [ ] Set up hosting (Vercel/Netlify/Cloudflare Pages)
- [ ] Configure audio file CDN
- [ ] Set up domain & SSL
- [ ] Test PWA install on real devices
- [ ] Monitor analytics
- [ ] Gather user feedback

---

## Conclusion

This document provides a comprehensive blueprint for building the Islamic Audio Resource PWA. The design prioritizes:

1. **Simplicity:** Clean, focused interface without unnecessary complexity
2. **Performance:** Fast loading, efficient streaming, offline-capable
3. **Accessibility:** Keyboard navigation, screen reader support, RTL support
4. **Islamic Aesthetic:** Warm colors, elegant typography, cultural authenticity

**Next Steps:**
1. Review this document with stakeholders
2. Finalize technology stack (React vs. Vanilla JS)
3. Set up development environment
4. Begin Phase 1 implementation

**Questions? Clarifications?** Please provide feedback on any section that needs adjustment.

---

**Document Version:** 2.0  
**Author:** Claude  
**Date:** January 21, 2026  
**Status:** ✅ Ready for Implementation
