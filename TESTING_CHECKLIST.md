# Testing Checklist for Duroos Platform

## Pre-Deployment Testing Guide

### 1. Authentication & Authorization Tests

#### Google OAuth Login
- [ ] Test Google OAuth login flow with admin email
- [ ] Test Google OAuth login with non-admin email (should create editor account)
- [ ] Test logout functionality
- [ ] Verify session persistence (refresh page while logged in)
- [ ] Test session expiration (7 days)

#### Admin Access Control
- [ ] Verify admin can access `/admin` dashboard
- [ ] Verify non-admin users cannot access admin routes
- [ ] Test editor role creation and permissions
- [ ] Verify admin email whitelist is working

### 2. Public Homepage Features

#### Tab Switching
- [ ] Click on "محاضرات" (Lectures) tab - verify content loads
- [ ] Click on "سلاسل" (Series) tab - verify content loads
- [ ] Click on "خطب" (Khutba) tab - verify content loads
- [ ] Switch between tabs multiple times - verify no errors

#### Category Filtering
- [ ] Click each category chip (عقيدة, فقه, حديث, تفسير, etc.)
- [ ] Verify cards filter correctly for each category
- [ ] Click "الكل" to show all categories
- [ ] Switch tabs while filter is active - verify filter resets correctly

#### Date Sorting
- [ ] On Lectures tab: Click "الأحدث أولاً" - verify newest lectures appear first
- [ ] On Lectures tab: Click "الأقدم أولاً" - verify oldest lectures appear first
- [ ] On Series tab: Click both sort buttons - verify series cards remain visible
- [ ] On Khutba tab: Click both sort buttons - verify khutba cards remain visible

#### Search Functionality
- [ ] Search for sheikh name in Lectures tab
- [ ] Search for lecture title
- [ ] Search in Series tab
- [ ] Search in Khutba tab
- [ ] Test search with Arabic text
- [ ] Test empty search (should show all)
- [ ] Switch tabs after search - verify search clears

### 3. Series & Khutba Expansion

#### Series Cards
- [ ] Click on a series card to expand lectures list
- [ ] Verify all lectures in series are displayed
- [ ] Click "حسب الرقم" (Sort by number) - verify lectures sort by lectureNumber
- [ ] Click "الأقدم أولاً" (Oldest first) - verify chronological sort
- [ ] Click "الأحدث أولاً" (Newest first) - verify reverse chronological sort
- [ ] Click series card again to collapse
- [ ] Test multiple series expansions simultaneously

#### Khutba Cards
- [ ] Click on a khutba card to expand lectures list
- [ ] Verify all khutbas in series are displayed
- [ ] Click "حسب الرقم" - verify khutbas sort correctly
- [ ] Click "الأقدم أولاً" - verify chronological sort ✅ **FIXED**
- [ ] Click "الأحدث أولاً" - verify reverse chronological sort ✅ **FIXED**
- [ ] Click khutba card again to collapse

### 4. Audio Player Features

#### Basic Playback
- [ ] Click play on a lecture card
- [ ] Verify audio loads and plays
- [ ] Click pause - verify audio pauses
- [ ] Click play on different lecture - verify previous stops and new one plays
- [ ] Test volume control
- [ ] Test seek/scrubbing through audio timeline

#### Player Controls
- [ ] Verify progress bar updates during playback
- [ ] Verify time displays (current time / total duration)
- [ ] Test playback speed control (if implemented)
- [ ] Test on mobile devices (if applicable)

### 5. Admin Dashboard Tests

#### Navigation
- [ ] Access admin dashboard at `/admin`
- [ ] Verify sidebar navigation works
- [ ] Test all admin menu links

#### Lecture Management
- [ ] View lectures list
- [ ] Create new lecture
- [ ] Edit existing lecture
- [ ] Delete lecture (test confirmation)
- [ ] Upload audio file
- [ ] Verify audio file metadata extraction
- [ ] Test lecture search/filter in admin

#### Sheikh Management
- [ ] View sheikhs list
- [ ] Add new sheikh
- [ ] Edit existing sheikh
- [ ] Delete sheikh
- [ ] Verify sheikh-lecture associations

#### Series Management
- [ ] View series list
- [ ] Create new series
- [ ] Add lectures to series
- [ ] Remove lectures from series
- [ ] Edit series details
- [ ] Delete series
- [ ] Test series type: Regular/Khutba
- [ ] Verify lectureNumber assignments

#### User Management
- [ ] View users list
- [ ] Add editor user
- [ ] View user roles
- [ ] Test editor permissions vs admin permissions

### 6. Data Integrity Tests

#### Date Handling
- [ ] Verify Gregorian dates display correctly
- [ ] Verify Hijri dates display correctly
- [ ] Test lectures with missing dates
- [ ] Verify date sorting with mixed date formats

#### File Handling
- [ ] Upload various audio formats (mp3, wav, m4a)
- [ ] Test large file uploads (near MAX_FILE_SIZE limit)
- [ ] Test invalid file types (should reject)
- [ ] Verify file storage in UPLOAD_DIR
- [ ] Test file streaming

#### Database Operations
- [ ] Create entries with all required fields
- [ ] Create entries with optional fields missing
- [ ] Test duplicate prevention (if implemented)
- [ ] Verify cascading deletes work correctly

### 7. Performance Tests

#### Page Load
- [ ] Measure homepage initial load time
- [ ] Test with 100+ lectures
- [ ] Test with 20+ series
- [ ] Monitor browser console for errors

#### API Response Times
- [ ] Test `/api/lectures` response time
- [ ] Test `/api/series` response time
- [ ] Test `/api/sheikhs` response time
- [ ] Test streaming endpoint performance

#### Browser Performance
- [ ] Check browser memory usage during playback
- [ ] Test multiple tab switches (memory leaks?)
- [ ] Monitor network tab for redundant requests

### 8. Mobile/Responsive Tests

- [ ] Test on mobile device (iOS/Android)
- [ ] Verify responsive layout on tablet
- [ ] Test touch gestures for audio player
- [ ] Verify Arabic RTL layout on mobile
- [ ] Test on different screen sizes (375px, 768px, 1024px, 1440px)

### 9. Browser Compatibility

- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

### 10. Error Handling

#### Network Errors
- [ ] Disconnect internet during audio playback
- [ ] Test slow network connection (throttle in DevTools)
- [ ] Test API timeout scenarios

#### User Errors
- [ ] Submit forms with missing required fields
- [ ] Upload invalid file types
- [ ] Enter invalid data in forms
- [ ] Test SQL injection attempts (should be prevented)
- [ ] Test XSS attempts (should be sanitized)

### 11. Security Tests

- [ ] Verify authentication required for admin routes
- [ ] Test CSRF protection
- [ ] Verify secure cookies in production
- [ ] Test rate limiting on API endpoints
- [ ] Verify file upload restrictions
- [ ] Test unauthorized access attempts
- [ ] Verify no sensitive data in client-side code
- [ ] Check Content Security Policy headers

---

## Testing Process

### Manual Testing Steps

1. **Start the application**:
   ```bash
   npm start
   ```

2. **Open browser console** (F12) to monitor for errors

3. **Go through each section** above systematically

4. **Document any issues** you find:
   - Screenshot the issue
   - Note the steps to reproduce
   - Record any error messages

5. **Test in different browsers**

6. **Test on mobile devices**

### Automated Testing (Future Improvement)

Consider adding:
- Unit tests (Jest/Mocha)
- Integration tests (Supertest)
- E2E tests (Playwright/Cypress)

---

## Known Issues Resolved

✅ Series/Khutba cards disappearing on date sort (FIXED)
✅ Redundant Hijri sort option (REMOVED)
✅ Khutba lecture sorting not working (FIXED)

---

## Post-Testing Checklist

Before deployment:
- [ ] All critical functionality tested and working
- [ ] No console errors on production build
- [ ] Environment variables properly configured
- [ ] Database backups created
- [ ] SSL certificate obtained (for HTTPS)
- [ ] Domain configured
- [ ] Monitoring setup (optional but recommended)
