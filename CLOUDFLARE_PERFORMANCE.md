# Cloudflare Performance Configuration Guide

This document outlines the Cloudflare settings needed to eliminate the **3.1s redirect penalty** identified in GTmetrix and improve overall site performance.

## Problem: Multiple Redirects (3.1s delay)

The GTmetrix report shows multiple 301 redirects occurring:
- `http://` → `https://` (SSL redirect)
- `www.` → non-www (or vice versa)
- These redirects happen at the origin server, adding significant latency

## Solution: Handle Redirects at Cloudflare Edge

### 1. Enable "Always Use HTTPS"

**Location:** Cloudflare Dashboard → SSL/TLS → Edge Certificates

- Toggle **"Always Use HTTPS"** to ON
- This redirects all HTTP requests to HTTPS at the edge (before reaching your origin)
- Saves one round-trip to your server

### 2. Create Page Rule for WWW Redirect

**Location:** Cloudflare Dashboard → Rules → Page Rules

Create a new page rule:
- **URL Pattern:** `www.rasmihassan.com/*`
- **Setting:** Forwarding URL (301 Permanent Redirect)
- **Destination:** `https://rasmihassan.com/$1`

This handles www → non-www redirects at the edge.

### 3. Alternative: Use Redirect Rules (Newer Method)

**Location:** Cloudflare Dashboard → Rules → Redirect Rules

Create a new redirect rule:
- **When incoming requests match:** Hostname equals `www.rasmihassan.com`
- **Then:** Dynamic Redirect to `concat("https://rasmihassan.com", http.request.uri.path)`
- **Status code:** 301

### 4. Enable Auto Minify

**Location:** Cloudflare Dashboard → Speed → Optimization

Enable auto-minification for:
- [x] JavaScript
- [x] CSS
- [x] HTML

### 5. Enable Brotli Compression

**Location:** Cloudflare Dashboard → Speed → Optimization

- Toggle **"Brotli"** to ON
- This provides better compression than gzip for modern browsers

### 6. Configure Browser Cache TTL

**Location:** Cloudflare Dashboard → Caching → Configuration

- Set **Browser Cache TTL** to at least 4 hours for static assets
- Or use Page Rules for fine-grained control

### 7. Enable HTTP/2 and HTTP/3

**Location:** Cloudflare Dashboard → Network

- HTTP/2: Should be ON by default
- HTTP/3 (QUIC): Toggle to ON for better performance on mobile

## Cache Rules for Static Assets

Create a Cache Rule for static assets:

**Location:** Cloudflare Dashboard → Rules → Cache Rules

```
If: URI Path matches "*.js" OR "*.css" OR "*.woff2" OR "*.svg"
Then: Cache eligible, Edge TTL: 1 month, Browser TTL: 1 week
```

## Performance Checklist

After applying these settings, verify:

- [ ] No redirect chain in GTmetrix waterfall
- [ ] TTFB reduced (target: <800ms)
- [ ] Assets served with Brotli compression
- [ ] HTTP/2 or HTTP/3 in use
- [ ] Browser cache headers present on static assets

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Redirect Time | 3.1s | 0s |
| TTFB | 5.5s | <1s |
| Total Load Time | 6.1s | <3s |

## Additional Origin Server Optimizations

The following server-side changes were also made:

1. **Favicon added** - Eliminates 404 error
2. **Font optimization** - Reduced from 8 to 4 font weights
3. **CSS extraction** - Critical CSS inline, non-critical async loaded
4. **JS minification** - 40% file size reduction
5. **CLS fixes** - Layout shift prevention with min-height

## Testing

After applying Cloudflare changes, retest with:
- [GTmetrix](https://gtmetrix.com/)
- [PageSpeed Insights](https://pagespeed.web.dev/)
- [WebPageTest](https://www.webpagetest.org/)

Target scores:
- GTmetrix Performance: 85%+
- PageSpeed Mobile: 80%+
- PageSpeed Desktop: 90%+
