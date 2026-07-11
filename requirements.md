# Islamic Audio Lectures Platform - Requirements Document

## Project Overview

**Name**: Duroos (دروس) - Islamic Audio Lectures Platform

**Purpose**: A web platform for hosting and streaming ~160 Arabic Islamic lecture audio files with bilingual support (Arabic primary, English secondary). Admin can manage uploads via Google OAuth, and users can browse, stream, and download lectures.

**Target Audience**: Students of Islamic knowledge worldwide, particularly non-Arabic speakers seeking authentic Islamic education.

**Content Scale**: ~160 audio lectures, ~3.4GB total storage, organized by sheikh and series.

---

## Technical Architecture Plan

### Backend Stack
- **Node.js 20+ with Express.js** - Server framework
- **MongoDB Atlas** - Database (Free Tier - 512MB for metadata only)
- **Mongoose** - ODM for MongoDB
- **Passport.js with Google OAuth 2.0** - Admin authentication
- **Multer** - File upload handling
- **Custom middleware** - HTTP range requests for streaming
- **EJS** - Server-side templating

### Storage Strategy
Oracle Cloud Always Free tier:
- **Block Volume**: 200GB available (sufficient for 3.4GB + growth)
- Audio files stored at `/mnt/audio` on attached block volume
- Database stores only metadata (filenames, sheikh info, series data, play counts)
- Separation of concerns: Files on block storage, metadata in MongoDB

### Frontend Design
- **EJS Templates** - Server-side rendering with bilingual support
- **Tailwind CSS 3.4+** - Modern, responsive styling with RTL support
- **Vanilla JavaScript** - Custom audio player, language toggle, search/filter
- **No heavy frameworks** - Keep it lightweight and fast

**Two Main Interfaces**:
1. **Public Interface**: Browse lectures, stream audio, download files (Arabic by default)
2. **Admin Panel**: Upload management, metadata editing (Google OAuth protected)

---

## Key Features to Implement

### Public Interface (Arabic by Default, English Toggle)

#### Homepage
- **Featured lectures carousel** - Highlighted/important lectures
- **Recent uploads grid** - Latest 12 lectures
- **Browse by categories** - Sheikh, Series, Category (Aqeedah, Fiqh, Tafsir, etc.)
- **Language toggle** - Arabic ⇄ English (top-right corner)
- **Search bar** - Full-text search across titles, sheikh names

#### Browse/Archive Page
- **Filterable grid of lecture cards**:
  - Filter by: Sheikh, Series, Category, Date range
  - Sort by: Newest, Oldest, Most played, Alphabetical
  - Pagination (20 lectures per page)
- **Responsive grid**: 1 column (mobile), 2 columns (tablet), 3 columns (desktop)

#### Individual Lecture Page
- **Large custom audio player** (sticky on mobile):
  - Play/pause, seek bar with timestamp
  - Volume control, playback speed (0.75x - 2x)
  - Skip forward/backward 15 seconds
  - Current time / total duration display
  - Resume from last position (localStorage)
- **Lecture metadata display**:
  - Title (Arabic + English)
  - Sheikh name with honorific (حفظه الله)
  - Series name (if applicable)
  - Date (Hijri + Gregorian)
  - Location
  - Duration
  - Play count
- **Action buttons**:
  - Download audio file
  - Share (WhatsApp, Telegram, Copy link)
- **Related lectures** - Same sheikh or series

#### Sheikh Profile Page
- **Sheikh bio** (Arabic + English with toggle)
- **Photo** (optional)
- **All lectures by this sheikh** (paginated list)
- **Series taught by this sheikh**

#### Series Page
- **Series information** (title, description, book details)
- **Sequential list of all lectures** in order
- **Play entire series** option
- **Progress tracking** (optional - localStorage)

### Admin Panel (Google OAuth Protected)

#### Login Page
- **"Sign in with Google" button** (branded)
- **Email whitelist validation** (only allowed admins can access)
- **Redirect to dashboard** after successful auth

#### Dashboard
- **Statistics cards**:
  - Total lectures uploaded
  - Total storage used (GB / 200GB available)
  - Total plays this month
  - Total downloads this month
  - Recent activity log
- **Quick actions**:
  - Upload new lecture
  - Manage lectures
  - Manage sheikhs/series
- **Storage usage graph** (visual indicator)

#### Upload Interface
- **Drag & drop zone** (multi-file support)
- **File picker fallback**
- **Real-time upload progress bars** (per file)
- **File validation** (audio types only, 60MB max per file)
- **Metadata form** for each upload:
  - Title (Arabic - required, English - optional)
  - Description (Arabic - required, English - optional)
  - Sheikh (dropdown from database)
  - Series (dropdown, optional - can create new)
  - Lecture number (if part of series)
  - Date (Hijri + Gregorian pickers)
  - Location (text input or "Online")
  - Category (dropdown: Aqeedah, Fiqh, Tafsir, Hadith, General)
  - Tags (comma-separated)
  - Published status (checkbox)
  - Featured status (checkbox)
- **Bulk upload support** with CSV metadata import

#### Manage Lectures
- **Searchable table** of all lectures:
  - Columns: Title (Arabic), Sheikh, Series, Date, Duration, Plays, Downloads, Status
  - Sortable columns
  - Search/filter bar
- **Actions per row**:
  - Edit metadata
  - Delete (with confirmation)
  - Toggle published status
  - Preview/Play
- **Bulk actions**:
  - Select multiple lectures
  - Bulk publish/unpublish
  - Bulk delete
- **Filter options**:
  - By publication status
  - By sheikh
  - By series
  - By category

#### Manage Sheikhs & Series
- **CRUD interfaces** for:
  - Sheikhs (name Arabic/English, bio, honorific, photo)
  - Series (title Arabic/English, description, category, book info)
- **Simple forms** with validation
- **List views** with search

#### Settings
- **Site configuration**:
  - Site name (Arabic + English)
  - About page content
  - Contact information
- **Admin management**:
  - View list of allowed admin emails
  - Add/remove admin access (if super admin)
- **Upload limits configuration**

---

## Streaming Implementation

### HTTP Range Requests Support
- **Endpoint**: `GET /stream/:lectureId`
- **Range header parsing**: Support `Range: bytes=START-END`
- **Response codes**:
  - `200 OK` - Full file (no range)
  - `206 Partial Content` - Range request
  - `416 Range Not Satisfiable` - Invalid range
- **Headers**:
  - `Accept-Ranges: bytes`
  - `Content-Range: bytes START-END/TOTAL`
  - `Content-Length: SIZE`
  - `Content-Type: audio/mpeg` (or appropriate MIME)
  - `Cache-Control: public, max-age=604800` (7 days)
- **Features enabled**:
  - Seeking to any timestamp in player
  - Resume playback after pause
  - Bandwidth-efficient streaming (only requested bytes)
  - Mobile-friendly (progressive loading)

---

## Database Schema (MongoDB)

### Collections

#### Lectures
```javascript
{
  _id: ObjectId,
  audioFileName: String,         // Stored filename on disk
  originalFileName: String,      // Original upload name
  fileSize: Number,              // Bytes
  mimeType: String,              // "audio/mpeg", "audio/mp4"
  duration: Number,              // Seconds
  bitrate: String,               // "128kbps"
  
  titleArabic: String,           // Required
  titleEnglish: String,          // Optional
  descriptionArabic: String,     // Optional
  descriptionEnglish: String,    // Optional
  
  sheikhId: ObjectId,            // Reference
  seriesId: ObjectId,            // Reference (optional)
  lectureNumber: Number,         // Position in series
  
  postDate: String,              // From CSV
  hijriDate: String,             // "٢٥ رمضان ١٤٤٧"
  gregorianDate: Date,           // JS Date object
  
  location: String,              // "مسجد الورود، جدة"
  isOnline: Boolean,
  
  category: String,              // "Aqeedah", "Fiqh", etc.
  tags: [String],                // ["توحيد", "عقيدة"]
  
  published: Boolean,
  featured: Boolean,
  
  playCount: Number,
  downloadCount: Number,
  lastPlayed: Date,
  
  uploadedBy: String,            // Admin email
  uploadedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
- `{ published: 1, createdAt: -1 }`
- `{ sheikhId: 1, lectureNumber: 1 }`
- `{ seriesId: 1, lectureNumber: 1 }`
- `{ category: 1 }`
- `{ featured: 1 }`
- Text index on `titleArabic` and `titleEnglish`

#### Sheikhs
```javascript
{
  _id: ObjectId,
  nameArabic: String,
  nameEnglish: String,
  honorific: String,             // "حفظه الله"
  bioArabic: String,
  bioEnglish: String,
  photoUrl: String,              // Optional
  active: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

#### Series
```javascript
{
  _id: ObjectId,
  titleArabic: String,
  titleEnglish: String,
  descriptionArabic: String,
  descriptionEnglish: String,
  sheikhId: ObjectId,
  bookTitleArabic: String,       // If explaining a book
  bookAuthor: String,
  category: String,
  lectureCount: Number,          // Updated automatically
  active: Boolean,
  featured: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

#### Admin Users
```javascript
{
  _id: ObjectId,
  googleId: String,              // Unique
  email: String,                 // Unique, validated
  name: String,
  profilePicture: String,
  role: String,                  // "admin", "editor"
  isActive: Boolean,
  lastLogin: Date,
  uploadCount: Number,
  createdAt: Date,
  updatedAt: Date
}
```

---

## File Structure

```
duroos/
├── server.js                    # Main Express application
├── package.json
├── .env                         # Environment variables (gitignored)
├── .gitignore
├── ecosystem.config.js          # PM2 configuration
│
├── config/
│   ├── database.js              # MongoDB connection
│   ├── passport.js              # Google OAuth strategy
│   ├── storage.js               # File storage configuration
│   └── constants.js             # App constants
│
├── models/
│   ├── Lecture.js
│   ├── Sheikh.js
│   ├── Series.js
│   ├── Admin.js
│   └── index.js                 # Export all models
│
├── routes/
│   ├── index.js                 # Public pages (home, browse, about)
│   ├── lectures.js              # Lecture detail pages
│   ├── sheikhs.js               # Sheikh profiles
│   ├── series.js                # Series pages
│   ├── admin/
│   │   ├── index.js             # Dashboard
│   │   ├── upload.js            # Upload interface
│   │   ├── manage.js            # Manage content
│   │   └── settings.js          # Settings
│   ├── api/
│   │   ├── lectures.js          # CRUD API
│   │   ├── sheikhs.js
│   │   ├── series.js
│   │   └── search.js            # Search endpoint
│   ├── auth.js                  # Google OAuth routes
│   └── stream.js                # Audio streaming
│
├── middleware/
│   ├── auth.js                  # Authentication check
│   ├── adminAuth.js             # Admin-only protection
│   ├── rateLimiter.js           # Rate limiting
│   ├── fileValidation.js        # Upload validation
│   ├── streamHandler.js         # Range request handler
│   └── errorHandler.js          # Global error handling
│
├── controllers/
│   ├── lectureController.js     # Business logic
│   ├── sheikhController.js
│   ├── seriesController.js
│   ├── adminController.js
│   └── streamController.js
│
├── utils/
│   ├── fileManager.js           # File operations
│   ├── validators.js            # Input validation
│   ├── helpers.js               # General utilities
│   ├── audioMetadata.js         # Extract duration/bitrate
│   └── dateConverter.js         # Hijri/Gregorian conversion
│
├── public/                      # Static assets
│   ├── css/
│   │   └── styles.css           # Tailwind + custom CSS
│   ├── js/
│   │   ├── player.js            # Custom audio player
│   │   ├── admin.js             # Admin interactions
│   │   ├── search.js            # Search functionality
│   │   ├── language.js          # AR/EN toggle
│   │   └── main.js              # Global utilities
│   ├── images/
│   │   ├── logo-ar.svg
│   │   ├── logo-en.svg
│   │   └── pattern-bg.svg       # Islamic pattern
│   └── fonts/                   # Local font files (fallback)
│
├── views/                       # EJS templates
│   ├── layout.ejs               # Main layout wrapper
│   ├── partials/
│   │   ├── header.ejs           # Site header with nav
│   │   ├── footer.ejs           # Site footer
│   │   ├── player.ejs           # Audio player component
│   │   ├── lectureCard.ejs      # Reusable card
│   │   └── pagination.ejs       # Pagination component
│   │
│   ├── public/                  # Public pages
│   │   ├── index.ejs            # Homepage
│   │   ├── browse.ejs           # Browse all lectures
│   │   ├── lecture.ejs          # Single lecture page
│   │   ├── sheikh.ejs           # Sheikh profile
│   │   ├── series.ejs           # Series page
│   │   ├── search.ejs           # Search results
│   │   └── about.ejs            # About page
│   │
│   └── admin/                   # Admin panel
│       ├── login.ejs            # OAuth login
│       ├── dashboard.ejs        # Dashboard
│       ├── upload.ejs           # Upload interface
│       ├── manage.ejs           # Manage lectures
│       ├── edit.ejs             # Edit metadata
│       ├── sheikhs.ejs          # Manage sheikhs
│       ├── series.ejs           # Manage series
│       └── settings.ejs         # Settings
│
└── scripts/                     # Utility scripts
    ├── seed.js                  # Seed initial data
    ├── import-csv.js            # Import from CSV
    └── cleanup.js               # Remove orphaned files
```

---

## Oracle Cloud Deployment Strategy

### Instance Configuration
- **Compute**: VM.Standard.E2.1.Micro
  - 1 OCPU (ARM or AMD)
  - 1GB RAM
  - Always Free tier eligible
- **Block Storage**: 50GB block volume (expandable to 200GB)
- **OS**: Ubuntu 22.04 LTS
- **Network**: Public subnet with Internet Gateway

### Setup Steps

1. **Firewall Configuration**:
   - Oracle Cloud Security List: Allow TCP ports 22, 80, 443
   - Ubuntu UFW: Allow same ports
   
2. **Software Installation**:
   - Node.js 20.x (LTS)
   - MongoDB command-line tools (for backups)
   - Nginx (reverse proxy)
   - Certbot (Let's Encrypt SSL)
   - PM2 (process manager)

3. **Block Volume Setup**:
   - Attach 50GB block volume
   - Format as ext4
   - Mount to `/mnt/audio`
   - Add to `/etc/fstab` for auto-mount
   - Set ownership to application user

4. **Application Deployment**:
   - Clone repository to `/home/duroos`
   - Install dependencies (`npm install --production`)
   - Configure `.env` file with production values
   - Start with PM2 (`pm2 start ecosystem.config.js`)
   - Enable PM2 startup script

5. **Nginx Configuration**:
   - Reverse proxy to Node.js (port 3000)
   - Static file serving with long cache headers
   - Special handling for `/stream/` endpoints (no buffering)
   - Gzip compression
   - Client max body size: 65MB (for uploads)

6. **SSL Setup**:
   - Certbot with Nginx plugin
   - Auto-renewal via cron
   - Force HTTPS redirect

---

## Security Considerations

### Authentication & Authorization
- **Google OAuth 2.0** for admin login only
- **Email whitelist** (environment variable `ADMIN_EMAILS`)
- **Session-based auth** with secure cookies (HttpOnly, Secure, SameSite)
- **CSRF protection** for admin forms

### File Upload Security
- **File type validation**: Only audio MIME types (audio/mpeg, audio/mp4, audio/wav, audio/ogg, audio/flac)
- **File size limit**: 60MB per file (enforced at middleware level)
- **Filename sanitization**: Remove special characters, prevent directory traversal
- **Virus scanning** (optional): ClamAV integration
- **Rate limiting**: Max 10 uploads per hour per admin

### API Security
- **Rate limiting** on all endpoints:
  - General API: 100 requests/15min per IP
  - Upload: 10 requests/hour per admin
  - Auth: 5 login attempts/15min per IP
- **Helmet.js**: Security HTTP headers
- **CORS**: Restrict origins in production
- **Input validation**: express-validator for all inputs
- **NoSQL injection prevention**: Mongoose sanitization

### General Security
- **Environment variables**: Never commit `.env` to git
- **Strong session secret**: Generated with `openssl rand -base64 32`
- **HTTPS only** in production
- **Regular updates**: Keep dependencies updated

---

## Performance Optimizations

### Backend
- **Database indexing**: On frequently queried fields (sheikh, series, published, dates)
- **Mongoose `.lean()`**: For read-only queries (returns plain objects, faster)
- **Streaming with chunks**: Memory-efficient for large audio files
- **Gzip compression**: For text responses (HTML, JSON, CSS, JS)
- **Static file caching**: Long cache headers (1 year for immutable assets)

### Frontend
- **Lazy loading**: Load lecture cards as user scrolls
- **Pagination**: Limit results to 20 per page
- **Image optimization**: WebP format with fallbacks
- **Minification**: CSS and JS in production
- **CDN for fonts**: Google Fonts CDN

### Audio Files
- **Bitrate normalization**: Standardize to 96-128kbps MP3
- **Format**: MP3 or M4A (best compatibility and compression)
- **HTTP caching**: 7-day cache for audio files
- **Range requests**: Only stream requested bytes

---

## UI/UX Design Principles

### Color Palette (Warm Islamic Aesthetic)
```css
--primary-dark: #1A5F5A;        /* Deep Islamic green */
--primary: #2C7A7B;             /* Teal green */
--accent-gold: #D4AF37;         /* Gold accent */
--bg-cream: #F7F5F0;            /* Warm cream background */
--bg-white: #FDFDF8;            /* Off-white */
--text-primary: #2C3E35;        /* Dark green-gray */
--text-secondary: #6B7F75;      /* Medium gray */
```

**Avoid**: Purple gradients, stark white backgrounds, generic blue/gray schemes

### Typography
- **Arabic Headings**: Amiri (distinctive, traditional)
- **Arabic Body**: Noto Naskh Arabic (readable, clear)
- **English Headings**: Cormorant Garamond (elegant serif)
- **English Body**: Spectral (readable serif)
- **UI Elements**: IBM Plex Sans Arabic (modern, bilingual)

**Never use**: Inter, Roboto, Arial, Helvetica, or generic system fonts

### Layout
- **Mobile-first**: Design for 320px+, scale up
- **RTL by default**: Arabic is primary language
- **Max-width content**: 1280px for optimal readability
- **Generous spacing**: 24px mobile, 48px desktop padding
- **Card-based design**: Clean cards for lecture listings
- **Sticky audio player**: Bottom of screen on mobile

### Visual Elements
- **Subtle Islamic patterns**: Geometric backgrounds (low opacity)
- **Smooth transitions**: 200-300ms for hovers, 500ms for page transitions
- **Rounded corners**: 0.5rem to 1rem border radius
- **Shadows**: Subtle elevation (0 4px 6px rgba)
- **Icons**: Lucide icons or custom SVG

### Responsive Breakpoints
- Mobile: 320px - 767px (1 column)
- Tablet: 768px - 1023px (2 columns)
- Desktop: 1024px+ (3 columns)

---

## Development Phases

### Phase 1: Backend Foundation (Days 1-2)
- [ ] Express server setup with basic routing
- [ ] MongoDB connection and Mongoose models
- [ ] Google OAuth integration with Passport.js
- [ ] Session management
- [ ] Basic middleware (auth, error handling)

### Phase 2: File Management (Days 3-4)
- [ ] Multer configuration for file uploads
- [ ] File validation middleware
- [ ] Audio metadata extraction (duration, bitrate)
- [ ] Upload API endpoint
- [ ] File storage on `/mnt/audio`
- [ ] CRUD operations for lectures

### Phase 3: Streaming (Day 5)
- [ ] HTTP range request middleware
- [ ] Streaming endpoint with partial content support
- [ ] Play count tracking
- [ ] Download endpoint

### Phase 4: Admin Panel (Days 6-7)
- [ ] Admin dashboard page (EJS)
- [ ] Upload interface with drag-drop
- [ ] Manage lectures page (table view)
- [ ] Edit/delete functionality
- [ ] Sheikh and series management
- [ ] Statistics display

### Phase 5: Public Interface (Days 8-10)
- [ ] Homepage with featured + recent lectures
- [ ] Browse page with filters and pagination
- [ ] Individual lecture page
- [ ] Custom audio player component (JS)
- [ ] Sheikh profile pages
- [ ] Series pages
- [ ] Search functionality

### Phase 6: Bilingual Support (Days 11-12)
- [ ] Language toggle mechanism (AR ⇄ EN)
- [ ] RTL/LTR CSS switching
- [ ] Translation object for UI text
- [ ] localStorage for language preference
- [ ] Test all pages in both languages

### Phase 7: Deployment (Days 13-14)
- [ ] Oracle Cloud instance setup
- [ ] Block volume attachment and mounting
- [ ] Nginx configuration
- [ ] SSL certificate with Let's Encrypt
- [ ] PM2 process management
- [ ] Environment variables configuration
- [ ] Database seeding from CSV
- [ ] End-to-end testing
- [ ] Performance optimization

### Phase 8: Polish & Launch (Day 15)
- [ ] Final UI/UX refinements
- [ ] Mobile responsiveness testing
- [ ] Cross-browser testing
- [ ] Security audit
- [ ] Documentation
- [ ] Soft launch
- [ ] Monitor and fix issues

---

## Data Migration Strategy

The project includes ~160 lectures in `lectures_with_series2.csv`:

**CSV Columns**:
- `post_date` - Date of lecture (e.g., "2023-05-15")
- `sheikh` - Sheikh name (Arabic)
- `series_name` - Series/course name
- `khutbah_title` - Individual lecture title
- `audio_length` - Duration (e.g., "45:32")
- `location_or_online` - Physical location or "Online"
- `series_part` - Lecture number in series

**Import Process**:
1. Run `npm run db:import` with CSV file
2. Script creates:
   - Sheikh entries (deduplicated)
   - Series entries (deduplicated by sheikh + title)
   - Lecture metadata entries with `published: false`
3. Admin uploads actual audio files via admin panel
4. Admin links uploaded files to lecture entries
5. Admin publishes lectures when ready

**Alternatively** (if audio files already exist):
1. Place audio files in `/mnt/audio` with predictable naming
2. Modify import script to link files automatically
3. Bulk publish after verification

---

## Testing Strategy

### Manual Testing
- [ ] Upload flow (single + bulk)
- [ ] Audio playback (desktop + mobile browsers)
- [ ] Seeking in audio player
- [ ] Download functionality
- [ ] Language toggle
- [ ] Search and filters
- [ ] Responsive design on real devices
- [ ] Admin authentication

### Performance Testing
- [ ] Concurrent streaming (10+ users)
- [ ] Large file uploads (60MB)
- [ ] Database query performance
- [ ] Page load times
- [ ] Mobile data usage

### Security Testing
- [ ] OAuth bypass attempts
- [ ] SQL/NoSQL injection attempts
- [ ] XSS vulnerabilities
- [ ] CSRF protection
- [ ] File upload exploits
- [ ] Rate limit effectiveness

---

## Maintenance & Monitoring

### Ongoing Tasks
- **Regular backups**: MongoDB database daily
- **Log rotation**: PM2 logs weekly
- **SSL renewal**: Automatic via Certbot
- **Dependency updates**: Monthly security patches
- **Storage monitoring**: Check disk usage weekly

### Monitoring
- **PM2 monitoring**: Process health, memory usage, restarts
- **Nginx logs**: Access patterns, errors
- **MongoDB Atlas**: Query performance, connection count
- **Uptime monitoring**: External service (UptimeRobot, Pingdom)

---

## Success Metrics

### User Engagement
- Total lectures played per month
- Average session duration
- Download count
- Search queries
- Mobile vs. desktop usage ratio

### Content Metrics
- Total lectures published
- Views per lecture
- Most popular sheikhs
- Most popular series
- Featured lecture performance

### Technical Metrics
- Average page load time
- Audio streaming latency
- Server uptime %
- Error rate
- Storage usage trend

